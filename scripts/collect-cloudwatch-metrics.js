const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const resultsDir = process.argv[2];
const startTime = process.argv[3]; // ISO8601
const endTime = process.argv[4];   // ISO8601
const region = process.env.AWS_REGION || 'ap-south-1';

if (!resultsDir || !startTime || !endTime) {
    console.error("Usage: node scripts/collect-cloudwatch-metrics.js <results_dir> <start_time_iso> <end_time_iso>");
    process.exit(1);
}

function runAWS(command) {
    try {
        const out = execSync(`${command} --region ${region}`, { stdio: 'pipe' }).toString();
        return JSON.parse(out);
    } catch (e) {
        console.warn(`[WARN] AWS CLI command failed: ${command} -> ${e.message}`);
        return null;
    }
}

function getMetricStat(namespace, metric, dimensions, stat = 'Average') {
    const dimsStr = dimensions.map(d => `Name=${d.Name},Value=${d.Value}`).join(',');
    const cmd = `aws cloudwatch get-metric-statistics --namespace "${namespace}" --metric-name "${metric}" --dimensions "${dimsStr}" --start-time "${startTime}" --end-time "${endTime}" --period 60 --statistics ${stat}`;
    const res = runAWS(cmd);
    if (!res || !res.Datapoints || res.Datapoints.length === 0) return null;
    
    // Sort by timestamp
    res.Datapoints.sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));
    // Calculate aggregate
    const vals = res.Datapoints.map(d => d[stat]);
    return vals.reduce((a, b) => a + b, 0) / vals.length; // roughly average it over the window
}

console.log("Collecting diagnostic snapshots from AWS CloudWatch...");

// 1. EC2 Resources
const ec2Data = {};
try {
    const instances = runAWS(`aws ec2 describe-instances --filters "Name=instance-state-name,Values=running" --query "Reservations[*].Instances[*].{Id:InstanceId,Type:InstanceType,Tags:Tags}"`);
    if (instances) {
        const flatList = instances.flat();
        ec2Data.load_generators = {};
        ec2Data.eks_nodes = {};
        for (const inst of flatList) {
            const cpu = getMetricStat('AWS/EC2', 'CPUUtilization', [{Name: 'InstanceId', Value: inst.Id}]);
            const netIn = getMetricStat('AWS/EC2', 'NetworkIn', [{Name: 'InstanceId', Value: inst.Id}]);
            const netOut = getMetricStat('AWS/EC2', 'NetworkOut', [{Name: 'InstanceId', Value: inst.Id}]);
            
            let role = 'unknown';
            if (inst.Tags) {
                const roleTag = inst.Tags.find(t => t.Key === 'Role' || t.Key === 'eks:nodegroup-name');
                if (roleTag) role = roleTag.Value;
            }
            
            const data = { type: inst.Type, cpu_percent: cpu, network_in_bytes: netIn, network_out_bytes: netOut };
            
            if (role === 'LoadGenerator') {
                ec2Data.load_generators[inst.Id] = data;
            } else if (role.includes('api') || role.includes('workers') || role.includes('system')) {
                ec2Data.eks_nodes[inst.Id] = Object.assign(data, { group: role });
            } else {
                ec2Data[inst.Id] = data;
            }
        }
    }
    fs.writeFileSync(path.join(resultsDir, 'ec2-resources.json'), JSON.stringify(ec2Data, null, 2));
    console.log("Saved ec2-resources.json");
} catch (e) {
    console.warn("Failed to collect EC2 resources", e);
}

// 2. Database Resources
const dbData = {};
try {
    const cpu = getMetricStat('AWS/RDS', 'CPUUtilization', [{Name: 'DBClusterIdentifier', Value: 'motionmesh-aurora'}]) || getMetricStat('AWS/RDS', 'CPUUtilization', [{Name: 'DBInstanceIdentifier', Value: 'motionmesh-db'}]);
    const mem = getMetricStat('AWS/RDS', 'FreeableMemory', [{Name: 'DBClusterIdentifier', Value: 'motionmesh-aurora'}]) || getMetricStat('AWS/RDS', 'FreeableMemory', [{Name: 'DBInstanceIdentifier', Value: 'motionmesh-db'}]);
    const conns = getMetricStat('AWS/RDS', 'DatabaseConnections', [{Name: 'DBClusterIdentifier', Value: 'motionmesh-aurora'}]) || getMetricStat('AWS/RDS', 'DatabaseConnections', [{Name: 'DBInstanceIdentifier', Value: 'motionmesh-db'}]);
    
    dbData['primary'] = {
        cpu_percent: cpu,
        freeable_memory_bytes: mem,
        database_connections: conns
    };
    
    fs.writeFileSync(path.join(resultsDir, 'database-resources.json'), JSON.stringify(dbData, null, 2));
    console.log("Saved database-resources.json");
} catch(e) {
    console.warn("Failed to collect DB resources", e);
}

// 3. Kubernetes / Redis Resources (Container Insights / ElastiCache)
const k8sData = {};
try {
    const redisCpu = getMetricStat('AWS/ElastiCache', 'EngineCPUUtilization', [{Name: 'CacheClusterId', Value: 'motionmesh-redis'}]);
    k8sData['redis'] = { cpu_percent: redisCpu };
    
    const natsCpu = getMetricStat('ContainerInsights', 'pod_cpu_utilization', [{Name: 'ClusterName', Value: 'motionmesh-benchmark'}, {Name: 'Namespace', Value: 'motionmesh'}]); // Note: exact PodName is dynamic, so this might be tricky, or we can use Service or just cluster-wide if possible. Wait, NATS pod name is something like nats-0. Let's just hardcode nats-0 if it's a StatefulSet.
    const natsMem = getMetricStat('ContainerInsights', 'pod_memory_utilization', [{Name: 'ClusterName', Value: 'motionmesh-benchmark'}, {Name: 'Namespace', Value: 'motionmesh'}]);
    k8sData['nats'] = { cpu_percent: natsCpu, memory_percent: natsMem };

    fs.writeFileSync(path.join(resultsDir, 'kubernetes.json'), JSON.stringify(k8sData, null, 2));
    console.log("Saved kubernetes.json");
} catch(e) {
    console.warn("Failed to collect K8s resources", e);
}

console.log("Finished collecting CloudWatch telemetry.");
