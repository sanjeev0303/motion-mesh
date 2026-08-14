/**
 * Worker Completion Throughput Benchmark
 * Measures the actual rate at which workers complete jobs
 * by subscribing to `jobs.transcode.done`.
 */
const { connect, StringCodec } = require('nats');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const DURATION_SEC = parseInt(process.env.DURATION_SEC || '15');
const sc = StringCodec();

async function runBenchmark() {
  console.log(`Connecting to NATS at ${NATS_URL}...`);
  const nc = await connect({ servers: NATS_URL });
  const js = nc.jetstream();

  console.log(`Subscribing to jobs.transcode.done for ${DURATION_SEC} seconds...`);
  
  let completions = 0;
  
  // Create ephemeral consumer for tracking
  const sub = await js.subscribe('jobs.transcode.done', {
    config: {
      deliver_subject: "completion_benchmark",
      deliver_policy: "new"
    }
  });

  const startTime = performance.now();
  const endTime = startTime + (DURATION_SEC * 1000);

  // Consume in the background
  const drainPromise = (async () => {
    for await (const m of sub) {
      completions++;
      m.ack();
      if (performance.now() >= endTime) {
        break;
      }
    }
  })();

  // Main loop waits for time
  while (performance.now() < endTime) {
    await new Promise(r => setTimeout(r, 100));
  }

  sub.unsubscribe();
  
  const totalTimeSec = (performance.now() - startTime) / 1000;
  const actualTps = completions / totalTimeSec;

  console.log(`\n--- WORKER COMPLETION RESULTS ---`);
  console.log(`Total Completed: ${completions}`);
  console.log(`Time Elapsed:    ${totalTimeSec.toFixed(2)}s`);
  console.log(`Throughput:      ${actualTps.toFixed(2)} completions/sec`);

  const outDir = path.join(__dirname, '../../../docs/benchmarks');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const report = {
    timestamp: new Date().toISOString(),
    benchmark_type: "worker_completion",
    duration_s: totalTimeSec,
    total_completed: completions,
    actual_tps: actualTps
  };

  const outFile = path.join(outDir, `worker-completion-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`\nArtifact saved to: ${outFile}`);

  await nc.close();
}

runBenchmark().catch(console.error);
