/**
 * Phase 7.3 — dealer control read load smoke (dev/CI).
 * Usage: tsx scripts/load-test-dealers.ts [baseUrl] [dealerCount]
 */
import { loadProjectEnv } from "../src/server/loadEnv";

loadProjectEnv();

const baseUrl = process.argv[2] ?? "http://127.0.0.1:3000";
const dealerCount = Math.min(120, Math.max(1, Number(process.argv[3]) || 80));

async function fetchState(dealerIndex: number) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/dealer-control/state`);
  const elapsed = Math.round(performance.now() - started);
  return { dealerIndex, ok: response.ok, status: response.status, elapsed };
}

async function main() {
  const health = await fetch(`${baseUrl}/api/health`);
  if (!health.ok) {
    throw new Error(`Health check failed: ${health.status}`);
  }

  const healthJson = (await health.json()) as { wsClients?: number };
  console.log(`Health ok — simulating ${dealerCount} parallel dealer-control reads`);

  const batchStarted = performance.now();
  const results = await Promise.all(
    Array.from({ length: dealerCount }, (_, index) => fetchState(index + 1)),
  );
  const batchElapsed = Math.round(performance.now() - batchStarted);

  const okCount = results.filter(row => row.ok).length;
  const elapsedValues = results.map(row => row.elapsed);
  const p95 = elapsedValues.sort((a, b) => a - b)[Math.floor(elapsedValues.length * 0.95)] ?? 0;
  const max = Math.max(...elapsedValues, 0);

  console.log(`  ok: ${okCount}/${dealerCount}`);
  console.log(`  batch: ${batchElapsed}ms, p95: ${p95}ms, max: ${max}ms`);
  console.log(`  wsClients (server): ${healthJson.wsClients ?? "?"}`);

  if (okCount !== dealerCount) {
    process.exit(1);
  }

  if (p95 > 3000) {
    console.warn("  WARN: p95 above 3000ms — investigate before venue scale-out.");
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
