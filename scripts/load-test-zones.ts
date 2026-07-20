/**
 * Phase 6.5 — lightweight zone load smoke (dev/CI).
 * Usage: tsx scripts/load-test-zones.ts [baseUrl]
 */
import { loadProjectEnv } from "../src/server/loadEnv";

loadProjectEnv();

const baseUrl = process.argv[2] ?? "http://127.0.0.1:3000";

async function main() {
  const health = await fetch(`${baseUrl}/api/health`);
  if (!health.ok) {
    throw new Error(`Health check failed: ${health.status}`);
  }

  const zones = ["zone-1", "zone-2", "zone-3", "zone-4"];
  const results = await Promise.all(
    zones.map(async (zoneId) => {
      const started = performance.now();
      const response = await fetch(`${baseUrl}/api/dealer-control/state?zone=${zoneId}`);
      const elapsed = Math.round(performance.now() - started);
      return { zoneId, ok: response.ok, elapsed, status: response.status };
    }),
  );

  console.log("Zone load smoke (4 parallel reads):");
  for (const row of results) {
    console.log(`  ${row.zoneId}: ${row.ok ? "ok" : "fail"} ${row.status} ${row.elapsed}ms`);
  }

  const failed = results.filter(row => !row.ok);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
