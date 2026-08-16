#!/usr/bin/env node
/**
 * generate-report-index.js
 * Reads workload.json files from all test runs in the S3 bucket
 * and generates a root index.html listing all benchmark reports.
 *
 * Usage: node scripts/generate-report-index.js <bucket> <region> <outfile>
 */
const { execSync } = require('child_process');
const fs = require('fs');

const bucket  = process.argv[2];
const region  = process.argv[3];
const outFile = process.argv[4];

if (!bucket || !region || !outFile) {
    console.error('Usage: node scripts/generate-report-index.js <bucket> <region> <outfile>');
    process.exit(1);
}

const baseUrl = `https://${bucket}.s3.${region}.amazonaws.com`;

// List all workload.json files in the bucket to get metadata per run
let keys = [];
try {
    const raw = execSync(
        `aws s3api list-objects-v2 --bucket "${bucket}" --query "Contents[?ends_with(Key, 'workload.json')].Key" --output json`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    keys = JSON.parse(raw || '[]');
} catch (e) {
    console.warn('Could not list bucket objects, generating empty index.');
}

// Fetch each workload.json and collect metadata
const runs = [];
for (const key of keys) {
    try {
        const raw = execSync(
            `aws s3 cp "s3://${bucket}/${key}" - 2>/dev/null`,
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        const d = JSON.parse(raw);
        const testId = key.split('/')[0];
        const total = (d.successful || 0) + (d.failed || 0);
        const successRate = total > 0 ? ((d.successful / total) * 100) : 0;
        runs.push({
            testId,
            targetRps: d.target_rps || 0,
            actualRps: d.actual_rps || 0,
            successful: d.successful || 0,
            failed: d.failed || 0,
            dropped: d.dropped || 0,
            total,
            successRate,
            duration: d.duration_seconds || 0,
            p95: d.p95_ms || 0,
            reportUrl: `${baseUrl}/${testId}/index.html`,
        });
    } catch { /* skip bad files */ }
}

// Sort newest first (test IDs are timestamp-based)
runs.sort((a, b) => b.testId.localeCompare(a.testId));

const fmt = (n, d = 2) => typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : 'N/A';

const healthColor  = (sr) => sr >= 95 ? '#10b981' : sr >= 80 ? '#f59e0b' : '#ef4444';
const healthLabel  = (sr) => sr >= 95 ? '✅ Healthy' : sr >= 80 ? '⚠️ Degraded' : '❌ Critical';
const p95Color     = (ms) => ms < 1000 ? '#10b981' : ms < 5000 ? '#f59e0b' : '#ef4444';

const rows = runs.length === 0
    ? `<tr><td colspan="9" style="text-align:center;color:#64748b;padding:3rem">No benchmark runs found yet.</td></tr>`
    : runs.map((r, i) => `
    <tr>
        <td><span style="color:#64748b;font-size:0.8rem">#${runs.length - i}</span></td>
        <td style="font-family:monospace;font-size:0.78rem;color:#94a3b8">${r.testId}</td>
        <td>${fmt(r.targetRps)}</td>
        <td style="color:#3b82f6;font-weight:600">${fmt(r.actualRps)}</td>
        <td style="color:#10b981">${fmt(r.successful)}</td>
        <td style="color:#ef4444">${fmt(r.failed)}</td>
        <td style="color:${healthColor(r.successRate)};font-weight:700">${r.successRate.toFixed(1)}%</td>
        <td style="color:${p95Color(r.p95)}">${fmt(r.p95)}ms</td>
        <td style="color:#64748b">${fmt(r.duration)}s</td>
        <td>
            <a href="${r.reportUrl}" target="_blank"
               style="display:inline-block;padding:0.3rem 0.8rem;border-radius:6px;
                      background:#1e3a5f;color:#60a5fa;font-size:0.8rem;text-decoration:none;
                      border:1px solid #2563eb40;transition:background 0.2s"
               onmouseover="this.style.background='#2563eb'"
               onmouseout="this.style.background='#1e3a5f'">View →</a>
        </td>
    </tr>`).join('');

const totalRuns     = runs.length;
const avgSuccess    = runs.length ? (runs.reduce((s, r) => s + r.successRate, 0) / runs.length).toFixed(1) : '—';
const bestActualRps = runs.length ? fmt(Math.max(...runs.map(r => r.actualRps))) : '—';
const lastRun       = runs.length ? runs[0].testId : '—';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MotionMesh — Benchmark Reports</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #070d1a; --surface: #0f1929; --card: #141f2e; --border: #1e3048;
  --text: #e2eaf4; --muted: #64748b; --primary: #3b82f6;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
.hero {
  background: linear-gradient(135deg, #0f1929 0%, #0d1f3c 50%, #0f1929 100%);
  border-bottom: 1px solid var(--border); padding: 3rem 2rem 2.5rem; text-align: center; position: relative;
}
.hero::before {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.12) 0%, transparent 70%);
}
.hero h1 {
  font-size: clamp(1.8rem,4vw,2.8rem); font-weight: 800; letter-spacing: -0.03em; position: relative;
  background: linear-gradient(135deg, #60a5fa, #a78bfa, #34d399);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.hero .sub { color: var(--muted); margin-top: 0.5rem; font-size: 0.9rem; position: relative; }
.container { max-width: 1300px; margin: 0 auto; padding: 2rem 1.5rem; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
.stat-card {
  background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem;
}
.stat-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.4rem; }
.stat-val { font-size: 1.8rem; font-weight: 800; }
.table-wrap { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.table-header {
  padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
}
.table-header h2 { font-size: 1rem; font-weight: 700; }
.badge { background: var(--primary)20; color: var(--primary); border-radius: 99px; padding: 0.2rem 0.7rem; font-size: 0.78rem; font-weight: 600; }
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
thead th {
  text-align: left; padding: 0.75rem 1rem; font-size: 0.72rem;
  text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted);
  border-bottom: 1px solid var(--border); white-space: nowrap;
}
tbody td { padding: 0.85rem 1rem; border-bottom: 1px solid #1e304820; vertical-align: middle; }
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover td { background: #1e304830; }
.footer { margin-top: 2rem; text-align: center; color: var(--muted); font-size: 0.78rem; padding-bottom: 2rem; }
</style>
</head>
<body>
<div class="hero">
  <h1>⚡ MotionMesh Benchmark Reports</h1>
  <div class="sub">All benchmark runs stored persistently · Bucket: <code>${bucket}</code></div>
</div>

<div class="container">
  <div class="stats">
    <div class="stat-card">
      <div class="stat-label">Total Runs</div>
      <div class="stat-val" style="color:var(--primary)">${totalRuns}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg Success Rate</div>
      <div class="stat-val" style="color:#10b981">${avgSuccess}%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Best Actual RPS</div>
      <div class="stat-val" style="color:#a78bfa">${bestActualRps}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Last Run</div>
      <div class="stat-val" style="font-size:0.9rem;color:#94a3b8;padding-top:0.3rem">${lastRun}</div>
    </div>
  </div>

  <div class="table-wrap">
    <div class="table-header">
      <h2>All Benchmark Runs</h2>
      <span class="badge">${totalRuns} run${totalRuns !== 1 ? 's' : ''}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Test ID</th>
          <th>Target RPS</th>
          <th>Actual RPS</th>
          <th>Successful</th>
          <th>Failed</th>
          <th>Success Rate</th>
          <th>P95 Latency</th>
          <th>Duration</th>
          <th>Report</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div class="footer">
    Updated: ${new Date().toUTCString()} · MotionMesh Benchmark Orchestrator
  </div>
</div>
</body>
</html>`;

fs.writeFileSync(outFile, html);
console.log(`Generated report index at ${outFile} (${runs.length} runs)`);
