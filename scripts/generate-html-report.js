const fs = require('fs');
const path = require('path');

const resultsDir = process.argv[2];
if (!resultsDir) { console.error("Usage: node scripts/generate-html-report.js <results_dir>"); process.exit(1); }

const workloadFile = path.join(resultsDir, 'workload.json');
if (!fs.existsSync(workloadFile)) { console.error(`workload.json not found in ${resultsDir}`); process.exit(1); }

const data = JSON.parse(fs.readFileSync(workloadFile, 'utf8'));

// Collect per-instance data
const instanceFiles = fs.readdirSync(resultsDir).filter(f => f.endsWith('-result.json'));
const instances = instanceFiles.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8')); } catch { return null; }
}).filter(Boolean);

const fmt = (n, d = 2) => typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : (n || 'N/A');
const fmtBytes = (b) => { if (!b) return 'N/A'; const mb = b / 1024 / 1024; return mb >= 1024 ? (mb/1024).toFixed(1)+'GB' : mb.toFixed(1)+'MB'; };

const total = (data.successful || 0) + (data.failed || 0);
const successRate = total > 0 ? ((data.successful / total) * 100) : 0;
const failRate = 100 - successRate;
const rpsAchievement = data.target_rps > 0 ? ((data.actual_rps / data.target_rps) * 100) : 0;
const healthColor = successRate >= 95 ? '#10b981' : successRate >= 80 ? '#f59e0b' : '#ef4444';
const healthLabel = successRate >= 95 ? '✅ HEALTHY' : successRate >= 80 ? '⚠️ DEGRADED' : '❌ CRITICAL';
const p95Color = data.p95_ms < 1000 ? '#10b981' : data.p95_ms < 5000 ? '#f59e0b' : '#ef4444';

const firstInstance = instances[0] || {};
const memRSS = firstInstance.memory?.rss;
const memHeap = firstInstance.memory?.heapUsed;
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
    </tr>`;
}).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MotionMesh Benchmark Report — ${data.test_id || 'N/A'}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
:root {
  --bg: #070d1a; --surface: #0f1929; --card: #141f2e; --border: #1e3048;
  --text: #e2eaf4; --muted: #64748b; --primary: #3b82f6; --success: #10b981;
  --danger: #ef4444; --warning: #f59e0b; --purple: #8b5cf6;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
.hero {
  background: linear-gradient(135deg, #0f1929 0%, #0d1f3c 50%, #0f1929 100%);
  border-bottom: 1px solid var(--border); padding: 3rem 2rem 2.5rem; text-align: center;
  position: relative; overflow: hidden;
}
.hero::before {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.12) 0%, transparent 70%);
}
.hero h1 {
  font-size: clamp(1.8rem, 4vw, 3rem); font-weight: 800; letter-spacing: -0.03em;
  background: linear-gradient(135deg, #60a5fa, #a78bfa, #34d399);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text; position: relative;
}
.hero .sub { color: var(--muted); margin-top: 0.5rem; font-size: 0.95rem; position: relative; }
.health-badge {
  display: inline-flex; align-items: center; gap: 0.5rem; margin-top: 1.2rem;
  padding: 0.5rem 1.25rem; border-radius: 99px; font-weight: 700; font-size: 0.9rem;
  border: 1.5px solid; position: relative;
  background: ${healthColor}15; color: ${healthColor}; border-color: ${healthColor}40;
}
.container { max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem; }
.section-title {
  font-size: 1.1rem; font-weight: 700; color: var(--muted);
  text-transform: uppercase; letter-spacing: 0.08em;
  margin: 2.5rem 0 1rem; display: flex; align-items: center; gap: 0.75rem;
}
.section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }
.grid { display: grid; gap: 1rem; }
.grid-3 { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.grid-2 { grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
.card {
  background: var(--card); border: 1px solid var(--border);
  border-radius: 12px; padding: 1.5rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.card:hover { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary)20; }
.metric-label {
  font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.6rem;
}
.metric-value { font-size: 2.2rem; font-weight: 800; line-height: 1; }
.metric-sub { font-size: 0.8rem; color: var(--muted); margin-top: 0.4rem; }
.progress-bar { height: 6px; border-radius: 3px; background: var(--border); margin-top: 1rem; overflow: hidden; }
.progress-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
.chart-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }
.chart-card h3 { font-size: 0.9rem; font-weight: 600; color: var(--muted); margin-bottom: 1.2rem; text-transform: uppercase; letter-spacing: 0.06em; }
.chart-wrap { position: relative; height: 220px; }
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
thead th {
  text-align: left; padding: 0.75rem 1rem; font-size: 0.75rem;
  text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted);
  border-bottom: 1px solid var(--border);
}
tbody td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border)10; }
tbody tr:hover td { background: var(--border)20; }
.tag {
  display: inline-block; padding: 0.2rem 0.6rem; border-radius: 6px;
  font-size: 0.75rem; font-weight: 600; background: var(--primary)20; color: var(--primary);
}
.footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); text-align: center; color: var(--muted); font-size: 0.8rem; }
</style>
</head>
<body>
<div class="hero">
  <h1>⚡ MotionMesh Benchmark Report</h1>
  <div class="sub">Test ID: <strong>${data.test_id || 'N/A'}</strong> &nbsp;·&nbsp; Generated: ${new Date().toUTCString()}</div>
  <div class="health-badge">${healthLabel} &nbsp; ${successRate.toFixed(1)}% Success Rate</div>
</div>

<div class="container">

  <div class="section-title">Throughput</div>
  <div class="grid grid-3">
    <div class="card">
      <div class="metric-label">Target RPS</div>
      <div class="metric-value" style="color:var(--muted)">${fmt(data.target_rps)}</div>
      <div class="metric-sub">Configured target</div>
    </div>
    <div class="card">
      <div class="metric-label">Actual RPS</div>
      <div class="metric-value" style="color:var(--primary)">${fmt(data.actual_rps)}</div>
      <div class="metric-sub">${rpsAchievement.toFixed(1)}% of target achieved</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(rpsAchievement,100)}%;background:var(--primary)"></div></div>
    </div>
    <div class="card">
      <div class="metric-label">Test Duration</div>
      <div class="metric-value" style="color:var(--purple)">${fmt(data.duration_seconds)}s</div>
      <div class="metric-sub">Active dispatch window</div>
    </div>
    <div class="card">
      <div class="metric-label">Drain Time</div>
      <div class="metric-value" style="color:var(--muted);font-size:1.6rem">${data.drain_seconds != null ? fmt(data.drain_seconds)+'s' : '—'}</div>
      <div class="metric-sub">In-flight settle time after window</div>
    </div>
  </div>

  <div class="section-title">Request Outcomes</div>
  <div class="grid grid-3">
    <div class="card">
      <div class="metric-label">Successful</div>
      <div class="metric-value" style="color:var(--success)">${fmt(data.successful)}</div>
      <div class="metric-sub">${successRate.toFixed(2)}% success rate</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${successRate}%;background:var(--success)"></div></div>
    </div>
    <div class="card">
      <div class="metric-label">Failed</div>
      <div class="metric-value" style="color:var(--danger)">${fmt(data.failed)}</div>
      <div class="metric-sub">${failRate.toFixed(2)}% failure rate</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${failRate}%;background:var(--danger)"></div></div>
    </div>
    <div class="card">
      <div class="metric-label">Dropped / Total</div>
      <div class="metric-value" style="color:var(--warning)">${fmt(data.dropped)}</div>
      <div class="metric-sub">Total requests: ${fmt(total)}</div>
    </div>
  </div>

  <div class="section-title">Latency Distribution</div>
  <div class="grid grid-3">
    <div class="card">
      <div class="metric-label">P50 (Median)</div>
      <div class="metric-value" style="color:var(--success)">${fmt(data.p50_ms)}ms</div>
      <div class="metric-sub">${((data.p50_ms||0)/1000).toFixed(2)}s</div>
    </div>
    <div class="card">
      <div class="metric-label">P95</div>
      <div class="metric-value" style="color:${p95Color}">${fmt(data.p95_ms)}ms</div>
      <div class="metric-sub">${((data.p95_ms||0)/1000).toFixed(2)}s — 95% of requests</div>
    </div>
    <div class="card">
      <div class="metric-label">P99</div>
      <div class="metric-value" style="color:var(--danger)">${fmt(data.p99_ms)}ms</div>
      <div class="metric-sub">${((data.p99_ms||0)/1000).toFixed(2)}s — tail latency</div>
    </div>
  </div>

  <div class="section-title">Charts</div>
  <div class="grid grid-2">
    <div class="chart-card">
      <h3>Request Outcomes</h3>
      <div class="chart-wrap"><canvas id="donutChart"></canvas></div>
    </div>
    <div class="chart-card">
      <h3>Latency Percentiles (ms)</h3>
      <div class="chart-wrap"><canvas id="latencyChart"></canvas></div>
    </div>
  </div>

  ${memRSS || eventLoop || firstInstance.cpu ? `
  <div class="section-title">Resource Usage (Instance Sample)</div>
  <div class="grid grid-3">
    ${memRSS ? `<div class="card">
      <div class="metric-label">RSS Memory</div>
      <div class="metric-value" style="color:var(--purple)">${fmtBytes(memRSS)}</div>
      <div class="metric-sub">Resident Set Size</div>
    </div>` : ''}
    ${memHeap ? `<div class="card">
      <div class="metric-label">Heap Used</div>
      <div class="metric-value" style="color:var(--primary)">${fmtBytes(memHeap)}</div>
      <div class="metric-sub">of ${fmtBytes(firstInstance.memory?.heapTotal)} total heap</div>
    </div>` : ''}
    ${eventLoop != null ? `<div class="card">
      <div class="metric-label">Event Loop Delay</div>
      <div class="metric-value" style="color:${eventLoop < 5 ? 'var(--success)' : eventLoop < 20 ? 'var(--warning)' : 'var(--danger)'}">${fmt(eventLoop)}ms</div>
      <div class="metric-sub">${eventLoop < 5 ? 'Healthy' : eventLoop < 20 ? 'Moderate lag' : 'High lag — bottleneck likely'}</div>
    </div>` : ''}
    ${firstInstance.cpu ? `<div class="card">
      <div class="metric-label">CPU Usage (User / System)</div>
      <div class="metric-value" style="color:var(--text);font-size:1.6rem">${((firstInstance.cpu.user||0)/1000).toFixed(0)}ms / ${((firstInstance.cpu.system||0)/1000).toFixed(0)}ms</div>
      <div class="metric-sub">Total CPU time used during run</div>
    </div>` : ''}
  </div>` : ''}

  ${instances.length > 0 ? `
  <div class="section-title">Per-Instance Breakdown (${instances.length} generator${instances.length > 1 ? 's' : ''})</div>
  <div class="card" style="padding:0;overflow:hidden">
    <table>
      <thead><tr>
        <th>Instance ID</th><th>Target RPS</th><th>Actual RPS</th>
        <th>Successful</th><th>Failed</th><th>Success Rate</th>
        <th>P50</th><th>P95</th><th>Duration</th>
      </tr></thead>
      <tbody>${instanceRows}</tbody>
    </table>
  </div>` : ''}

  <div class="section-title">Diagnostic Summary</div>
  <div class="card">
    <table>
      <tbody>
        <tr><td style="color:var(--muted);width:220px">RPS Achievement</td><td><span class="tag" style="color:${rpsAchievement>=90?'var(--success)':rpsAchievement>=50?'var(--warning)':'var(--danger)'};background:${rpsAchievement>=90?'var(--success)':rpsAchievement>=50?'var(--warning)':'var(--danger)'}20">${rpsAchievement.toFixed(1)}%</span></td></tr>
        <tr><td style="color:var(--muted)">Success Rate</td><td><span class="tag" style="color:${healthColor};background:${healthColor}20">${successRate.toFixed(2)}%</span></td></tr>
        <tr><td style="color:var(--muted)">P95 Latency Status</td><td><span class="tag" style="color:${p95Color};background:${p95Color}20">${data.p95_ms < 1000 ? 'Good (<1s)' : data.p95_ms < 5000 ? 'Acceptable (<5s)' : 'Critical (>5s)'}</span></td></tr>
        <tr><td style="color:var(--muted)">Event Loop</td><td><span class="tag" style="color:${eventLoop<5?'var(--success)':eventLoop<20?'var(--warning)':'var(--danger)'};background:${eventLoop<5?'var(--success)':eventLoop<20?'var(--warning)':'var(--danger)'}20">${eventLoop != null ? (eventLoop < 5 ? 'Healthy' : eventLoop < 20 ? 'Moderate' : 'High Lag') : 'N/A'}</span></td></tr>
        <tr><td style="color:var(--muted)">Load Generators</td><td>${instances.length} instance(s)</td></tr>
        <tr><td style="color:var(--muted)">Total Requests Sent</td><td>${fmt(total)}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="footer">
    Generated by <strong>MotionMesh Benchmark Orchestrator</strong> · ${new Date().toUTCString()}<br>
    Test: <code>${data.test_id || 'N/A'}</code>
  </div>
</div>

<script>
Chart.defaults.color = '#64748b';
Chart.defaults.borderColor = '#1e3048';

// Donut chart
new Chart(document.getElementById('donutChart'), {
  type: 'doughnut',
  data: {
    labels: ['Successful', 'Failed', 'Dropped'],
    datasets: [{ data: [${data.successful||0}, ${data.failed||0}, ${data.dropped||0}], backgroundColor: ['#10b981','#ef4444','#f59e0b'], borderWidth: 0, hoverOffset: 6 }]
  },
  options: {
    responsive: true, maintainAspectRatio: false, cutout: '65%',
    plugins: { legend: { position: 'bottom', labels: { padding: 16, boxWidth: 12 } } }
  }
});

// Latency bar chart
new Chart(document.getElementById('latencyChart'), {
  type: 'bar',
  data: {
    labels: ['P50 (Median)', 'P95', 'P99'],
    datasets: [{
      label: 'Latency (ms)',
      data: [${data.p50_ms||0}, ${data.p95_ms||0}, ${data.p99_ms||0}],
      backgroundColor: ['#10b981aa','#f59e0baa','#ef4444aa'],
      borderColor: ['#10b981','#f59e0b','#ef4444'],
      borderWidth: 1.5, borderRadius: 6
    }]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString()+'ms' }, grid: { color: '#1e304850' } },
      x: { grid: { display: false } }
    }
  }
});
</script>
</body>
</html>`;

const outFile = path.join(resultsDir, 'report.html');
fs.writeFileSync(outFile, html);
console.log(`Generated HTML report at ${outFile}`);
