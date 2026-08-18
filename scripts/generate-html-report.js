const fs = require('fs');
const path = require('path');

const resultsDir = process.argv[2];
if (!resultsDir) { console.error("Usage: node scripts/generate-html-report.js <results_dir>"); process.exit(1); }

const workloadFile = path.join(resultsDir, 'workload.json');
if (!fs.existsSync(workloadFile)) { console.error(`workload.json not found in ${resultsDir}`); process.exit(1); }

const data = JSON.parse(fs.readFileSync(workloadFile, 'utf8'));

// Try loading diagnostic snapshots
const loadJson = (filename) => {
    try {
        const p = path.join(resultsDir, filename);
        return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
    } catch { return null; }
};

const ec2Data = loadJson('ec2-resources.json') || {};
const dbData = loadJson('database-resources.json') || {};
const k8sData = loadJson('kubernetes.json') || {};

// Collect per-instance data
const instanceFiles = fs.readdirSync(resultsDir).filter(f => f.endsWith('-result.json'));
const instances = instanceFiles.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8')); } catch { return null; }
}).filter(Boolean);

const fmt = (n, d = 2) => typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : (n || 'N/A');
const fmtBytes = (b) => { if (b == null) return 'N/A'; const mb = b / 1024 / 1024; return mb >= 1024 ? (mb/1024).toFixed(1)+'GB' : mb.toFixed(1)+'MB'; };
const fmtPercent = (p) => p != null ? p.toFixed(1) + '%' : 'N/A';

const total = (data.successful || 0) + (data.failed || 0);
const successRate = total > 0 ? ((data.successful / total) * 100) : 0;
const failRate = 100 - successRate;
const rpsAchievement = data.target_rps > 0 ? ((data.actual_rps / data.target_rps) * 100) : 0;
const healthColor = successRate >= 95 ? '#10b981' : successRate >= 80 ? '#f59e0b' : '#ef4444';
const healthLabel = successRate >= 95 ? '✅ HEALTHY' : successRate >= 80 ? '⚠️ DEGRADED' : '❌ CRITICAL';
const p95Color = data.p95_ms < 1000 ? '#10b981' : data.p95_ms < 5000 ? '#f59e0b' : '#ef4444';

const firstInstance = instances[0] || {};
const eventLoop = firstInstance.event_loop_delay;

const instanceRows = instances.map(inst => {
    const t = (inst.successful || 0) + (inst.failed || 0);
    const sr = t > 0 ? ((inst.successful / t) * 100).toFixed(1) : '0.0';
    const srColor = parseFloat(sr) >= 95 ? '#10b981' : parseFloat(sr) >= 80 ? '#f59e0b' : '#ef4444';
    return `<tr>
        <td style="font-family:monospace;font-size:0.8rem">${inst.instance_id || 'N/A'}</td>
        <td>${fmt(inst.target_rps)}</td>
        <td>${fmt(inst.actual_rps)}</td>
        <td style="color:#10b981">${fmt(inst.successful)}</td>
        <td style="color:#ef4444">${fmt(inst.failed)}</td>
        <td style="color:${srColor};font-weight:700">${sr}%</td>
        <td>${fmt(inst.p50_ms)}ms</td>
        <td style="color:${p95Color}">${fmt(inst.p95_ms)}ms</td>
        <td>${fmt(inst.duration_seconds)}s</td>
        <td><a href="https://motionmesh-benchmark-reports-425456324653.s3.ap-south-1.amazonaws.com/report/${data.test_id}/${inst.instance_id}-api-calls.log" target="_blank" style="color:var(--primary);text-decoration:none">📥 API</a> | <a href="https://motionmesh-benchmark-reports-425456324653.s3.ap-south-1.amazonaws.com/report/${data.test_id}/${inst.instance_id}-system.log" target="_blank" style="color:var(--primary);text-decoration:none">📥 Sys</a></td>
    </tr>`;
}).join('');

let ec2Rows = Object.keys(ec2Data.load_generators || ec2Data).filter(id => id !== 'load_generators' && id !== 'eks_nodes').map(id => {
    const d = (ec2Data.load_generators && ec2Data.load_generators[id]) || ec2Data[id];
    if (!d) return '';
    return `<tr>
        <td style="font-family:monospace;font-size:0.8rem">${id}</td>
        <td>${d.type || 'N/A'}</td>
        <td>${fmtPercent(d.cpu_percent)}</td>
        <td>${fmtBytes(d.network_in_bytes)}/s</td>
        <td>${fmtBytes(d.network_out_bytes)}/s</td>
    </tr>`;
}).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MotionMesh Benchmark Report — ${data.test_id || 'N/A'}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
:root {
  --bg: #070d1a; --surface: #0f1929; --card: #141f2e; --border: #1e3048;
  --text: #e2eaf4; --muted: #94a3b8; --primary: #3b82f6; --success: #10b981;
  --danger: #ef4444; --warning: #f59e0b; --purple: #8b5cf6;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; line-height: 1.5; }
.hero {
  background: linear-gradient(135deg, #0f1929 0%, #0d1f3c 50%, #0f1929 100%);
  border-bottom: 1px solid var(--border); padding: 4rem 2rem 3rem; text-align: center;
  position: relative; overflow: hidden;
}
.hero::before {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.15) 0%, transparent 60%);
}
.hero h1 {
  font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 800; letter-spacing: -0.03em;
  background: linear-gradient(135deg, #e2eaf4, #94a3b8);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text; position: relative; margin-bottom: 1rem;
}
.hero .sub { color: var(--muted); font-size: 1.1rem; position: relative; max-width: 600px; margin: 0 auto; }
.health-badge {
  display: inline-flex; align-items: center; gap: 0.5rem; margin-top: 1.5rem;
  padding: 0.6rem 1.5rem; border-radius: 99px; font-weight: 700; font-size: 0.95rem;
  border: 1.5px solid; position: relative;
  background: ${healthColor}15; color: ${healthColor}; border-color: ${healthColor}40;
}

nav.tabs {
  display: flex; justify-content: center; gap: 1rem; padding: 1rem 2rem; border-bottom: 1px solid var(--border);
  background: var(--surface); position: sticky; top: 0; z-index: 10;
}
nav.tabs button {
  background: transparent; border: none; color: var(--muted); font-family: inherit; font-size: 0.95rem; font-weight: 600;
  padding: 0.5rem 1rem; cursor: pointer; border-radius: 6px; transition: all 0.2s;
}
nav.tabs button:hover { color: var(--text); background: var(--card); }
nav.tabs button.active { color: var(--primary); background: var(--primary)20; }

.container { max-width: 1400px; margin: 0 auto; padding: 2rem; display: none; }
.container.active { display: block; animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

.section-title {
  font-size: 1.25rem; font-weight: 700; color: #e2eaf4;
  margin: 3rem 0 1.5rem; display: flex; align-items: center; gap: 1rem;
}
.section-title::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, var(--border), transparent); }

.grid { display: grid; gap: 1.5rem; }
.grid-4 { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.grid-3 { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
.grid-2 { grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); }

.card {
  background: var(--card); border: 1px solid var(--border);
  border-radius: 16px; padding: 1.75rem;
  position: relative; overflow: hidden;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
}
.card.highlight { border-color: var(--primary)50; }
.card.highlight::before {
  content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: var(--primary);
}

.metric-label { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 0.75rem; }
.metric-value { font-size: 2.5rem; font-weight: 800; line-height: 1.1; letter-spacing: -0.02em; }
.metric-sub { font-size: 0.85rem; color: var(--muted); margin-top: 0.75rem; }

.progress-bar { height: 8px; border-radius: 4px; background: var(--border); margin-top: 1.25rem; overflow: hidden; }
.progress-fill { height: 100%; border-radius: 4px; transition: width 1s cubic-bezier(0.4, 0, 0.2, 1); }

.chart-wrap { position: relative; height: 280px; margin-top: 1rem; }

table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.9rem; }
thead th { text-align: left; padding: 1rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); border-bottom: 2px solid var(--border); background: var(--surface); }
tbody td { padding: 1rem; border-bottom: 1px solid var(--border)50; }
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover td { background: var(--surface); }

.tag { display: inline-flex; align-items: center; padding: 0.25rem 0.75rem; border-radius: 99px; font-size: 0.8rem; font-weight: 600; }
.tag.verified { background: #10b98120; color: #10b981; border: 1px solid #10b98150; }

.alert { padding: 1rem 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; display: flex; gap: 1rem; align-items: flex-start; }
.alert-info { background: var(--primary)15; border: 1px solid var(--primary)30; color: #e2eaf4; }

.footer { margin-top: 4rem; padding: 2rem; border-top: 1px solid var(--border); text-align: center; color: var(--muted); font-size: 0.85rem; }
</style>
</head>
<body>

<div class="hero">
  <h1>MotionMesh Institutional Benchmark Report</h1>
  <div class="sub">Test ID: <strong>${data.test_id || 'N/A'}</strong> &nbsp;|&nbsp; Target: ${fmt(data.target_rps)} RPS</div>
  <div class="health-badge">${healthLabel} &nbsp; ${successRate.toFixed(1)}% Success Rate</div>
</div>

<nav class="tabs">
  <button class="active" onclick="showTab('exec')">Executive Summary</button>
  <button onclick="showTab('perf')">Performance Metrics</button>
  <button onclick="showTab('infra')">Infrastructure & Resources</button>
  <button onclick="showTab('raw')">Raw Generators</button>
</nav>

<!-- EXECUTIVE TAB -->
<div id="exec" class="container active">
  <div class="alert alert-info">
    <div><strong>Note:</strong> This report strictly distinguishes between TARGET workload configuration and VERIFIED infrastructure performance based on CloudWatch and K6 measurements.</div>
  </div>

  <div class="grid grid-3">
    <div class="card highlight">
      <div class="metric-label">Verified Throughput</div>
      <div class="metric-value" style="color:var(--primary)">${fmt(data.actual_rps)} <span style="font-size:1rem;color:var(--muted);font-weight:600">RPS</span></div>
      <div class="metric-sub">${rpsAchievement.toFixed(1)}% of Target (${fmt(data.target_rps)} RPS)</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(rpsAchievement,100)}%;background:var(--primary)"></div></div>
    </div>
    
    <div class="card">
      <div class="metric-label">Reliability</div>
      <div class="metric-value" style="color:${healthColor}">${successRate.toFixed(2)}%</div>
      <div class="metric-sub">${fmt(data.successful)} successful / ${fmt(total)} total</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${successRate}%;background:${healthColor}"></div></div>
    </div>

    <div class="card">
      <div class="metric-label">P95 Latency</div>
      <div class="metric-value" style="color:${p95Color}">${fmt(data.p95_ms)} <span style="font-size:1rem;color:var(--muted);font-weight:600">ms</span></div>
      <div class="metric-sub">P50: ${fmt(data.p50_ms)}ms | P99: ${fmt(data.p99_ms)}ms</div>
    </div>
  </div>

  <div class="section-title">Bottleneck Analysis Engine</div>
  <div class="card">
    <p style="color:var(--muted);margin-bottom:1rem">Based on diagnostic heuristics from load generators and AWS CloudWatch.</p>
    <table>
      <thead><tr><th>Component</th><th>Status</th><th>Evidence</th></tr></thead>
      <tbody>
        <tr>
          <td><strong>Client Saturation (Generators)</strong></td>
          <td>${eventLoop > 50 ? '<span style="color:var(--danger)">SATURATED</span>' : '<span style="color:var(--success)">HEALTHY</span>'}</td>
          <td>Event loop delay: ${fmt(eventLoop)}ms</td>
        </tr>
        <tr>
          <td><strong>Database (Aurora)</strong></td>
          <td>${dbData.primary?.cpu_percent > 80 ? '<span style="color:var(--danger)">HIGH LOAD</span>' : '<span style="color:var(--success)">HEALTHY</span>'}</td>
          <td>CPU: ${fmtPercent(dbData.primary?.cpu_percent)} | Conns: ${fmt(dbData.primary?.database_connections)}</td>
        </tr>
        <tr>
          <td><strong>Cache (Redis)</strong></td>
          <td>${k8sData.redis?.cpu_percent > 80 ? '<span style="color:var(--danger)">HIGH LOAD</span>' : '<span style="color:var(--success)">HEALTHY</span>'}</td>
          <td>CPU: ${fmtPercent(k8sData.redis?.cpu_percent)}</td>
        </tr>
        <tr>
          <td><strong>Network Drop Rate</strong></td>
          <td>${(data.dropped/total) > 0.01 ? '<span style="color:var(--danger)">HIGH DROPS</span>' : '<span style="color:var(--success)">HEALTHY</span>'}</td>
          <td>${fmt(data.dropped)} requests dropped at client side</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>

<!-- PERFORMANCE TAB -->
<div id="perf" class="container">
  <div class="grid grid-2">
    <div class="card">
      <div class="metric-label">Request Outcomes</div>
      <div class="chart-wrap"><canvas id="outcomesChart"></canvas></div>
    </div>
    <div class="card">
      <div class="metric-label">Latency Distribution</div>
      <div class="chart-wrap"><canvas id="latencyChart"></canvas></div>
    </div>
  </div>
  
  <div class="section-title">Detailed Metrics</div>
  <div class="grid grid-4">
    <div class="card">
      <div class="metric-label">Test Duration</div>
      <div class="metric-value">${fmt(data.duration_seconds)}s</div>
      <div class="metric-sub">Concurrent wall-clock</div>
    </div>
    <div class="card">
      <div class="metric-label">Drain Time</div>
      <div class="metric-value">${fmt(data.drain_seconds)}s</div>
      <div class="metric-sub">In-flight settlement</div>
    </div>
    <div class="card">
      <div class="metric-label">Failed Requests</div>
      <div class="metric-value" style="color:var(--danger)">${fmt(data.failed)}</div>
      <div class="metric-sub">Application-level errors</div>
    </div>
    <div class="card">
      <div class="metric-label">Dropped Requests</div>
      <div class="metric-value" style="color:var(--warning)">${fmt(data.dropped)}</div>
      <div class="metric-sub">Client concurrency limits hit</div>
    </div>
  </div>
</div>

<!-- INFRASTRUCTURE TAB -->
<div id="infra" class="container">
  
  ${Object.keys(ec2Data).length > 0 ? `
  <div class="section-title">EC2 Load Generators</div>
  <div class="card" style="padding:0">
    <table>
      <thead><tr><th>Instance ID</th><th>Type</th><th>CPU Usage</th><th>Net In</th><th>Net Out</th></tr></thead>
      <tbody>${ec2Rows}</tbody>
    </table>
  </div>
  ` : '<div class="alert alert-info">EC2 Resource telemetry not available for this run.</div>'}

  ${dbData.primary ? `
  <div class="section-title">Aurora PostgreSQL (Primary)</div>
  <div class="grid grid-3">
    <div class="card">
      <div class="metric-label">CPU Utilization</div>
      <div class="metric-value">${fmtPercent(dbData.primary.cpu_percent)}</div>
    </div>
    <div class="card">
      <div class="metric-label">Active Connections</div>
      <div class="metric-value">${fmt(dbData.primary.database_connections)}</div>
    </div>
    <div class="card">
      <div class="metric-label">Freeable Memory</div>
      <div class="metric-value">${fmtBytes(dbData.primary.freeable_memory_bytes)}</div>
    </div>
  </div>
  ` : ''}

  ${k8sData.redis ? `
  <div class="section-title">ElastiCache Redis</div>
  <div class="grid grid-3">
    <div class="card">
      <div class="metric-label">Engine CPU</div>
      <div class="metric-value">${fmtPercent(k8sData.redis.cpu_percent)}</div>
    </div>
  </div>
  ` : ''}
</div>

<!-- RAW GENERATORS TAB -->
<div id="raw" class="container">
  <div class="section-title">Generator Shards (${instances.length})</div>
  <div class="card" style="padding:0; overflow-x: auto;">
    <table>
      <thead><tr>
        <th>Instance ID</th><th>Target RPS</th><th>Actual RPS</th>
        <th>Successful</th><th>Failed</th><th>Success Rate</th>
        <th>P50</th><th>P95</th><th>Duration</th><th>Diagnostics</th>
      </tr></thead>
      <tbody>${instanceRows}</tbody>
    </table>
  </div>
</div>

<div class="footer">
  Generated by <strong>MotionMesh Benchmark Orchestrator</strong> · ${new Date().toUTCString()}
</div>

<script>
function showTab(id) {
  document.querySelectorAll('.container').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('nav.tabs button').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  event.currentTarget.classList.add('active');
}

Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = '#1e3048';
Chart.defaults.font.family = 'Inter';

new Chart(document.getElementById('outcomesChart'), {
  type: 'doughnut',
  data: {
    labels: ['Successful', 'Failed', 'Dropped'],
    datasets: [{ data: [${data.successful||0}, ${data.failed||0}, ${data.dropped||0}], backgroundColor: ['#10b981','#ef4444','#f59e0b'], borderWidth: 0, hoverOffset: 4 }]
  },
  options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'right' } } }
});

new Chart(document.getElementById('latencyChart'), {
  type: 'bar',
  data: {
    labels: ['P50 (Median)', 'P95', 'P99'],
    datasets: [{
      label: 'Latency (ms)',
      data: [${data.p50_ms||0}, ${data.p95_ms||0}, ${data.p99_ms||0}],
      backgroundColor: ['#10b981aa','#f59e0baa','#ef4444aa'],
      borderColor: ['#10b981','#f59e0b','#ef4444'],
      borderWidth: 1.5, borderRadius: 4
    }]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, grid: { color: '#1e3048' } }, x: { grid: { display: false } } }
  }
});
</script>
</body>
</html>`;

const outFile = path.join(resultsDir, 'report.html');
fs.writeFileSync(outFile, html);
console.log(`Generated Institutional HTML report at ${outFile}`);

