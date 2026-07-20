import net from "node:net";
import { isRedisEnabled, resolveRedisUrl } from "./redisConfig";

let connected = false;
let lastCheckMs = 0;
const CHECK_TTL_MS = 10_000;

function parseRedisHostPort(): { host: string; port: number } | null {
  const url = resolveRedisUrl();
  if (!url) {
    return { host: "127.0.0.1", port: 6379 };
  }

  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "127.0.0.1",
      port: Number(parsed.port) || 6379,
    };
  } catch {
    return null;
  }
}

export async function probeRedisConnection(): Promise<boolean> {
  if (!isRedisEnabled()) {
    connected = false;
    return false;
  }

  const now = Date.now();
  if (now - lastCheckMs < CHECK_TTL_MS) {
    return connected;
  }
  lastCheckMs = now;

  const target = parseRedisHostPort();
  if (!target) {
    connected = false;
    return false;
  }

  connected = await new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: target.host, port: target.port, timeout: 1500 });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });

  return connected;
}

/** Phase 9.3 — pub/sub facade (no-op until Redis client wired). */
export async function publishTournamentEvent(channel: string, payload: unknown): Promise<void> {
  if (!isRedisEnabled()) return;
  if (!(await probeRedisConnection())) return;
  void channel;
  void payload;
}

export function isRedisConnected(): boolean {
  return connected;
}

function encodeResp(args: string[]): string {
  let payload = `*${args.length}\r\n`;
  for (const arg of args) {
    payload += `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`;
  }
  return payload;
}

function parseSimpleRespOk(response: string): boolean {
  return response.startsWith("+OK") || response.startsWith("$1\r\n1");
}

/** Minimal Redis SET key value NX PX ttl — returns true when lock acquired. */
export async function redisSetNxPx(key: string, value: string, ttlMs: number): Promise<boolean> {
  const target = parseRedisHostPort();
  if (!target) {
    return false;
  }

  const command = encodeResp(["SET", key, value, "NX", "PX", String(Math.max(100, ttlMs))]);

  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: target.host, port: target.port, timeout: 2000 });
    let response = "";

    const finish = (ok: boolean) => {
      socket.removeAllListeners();
      if (!socket.destroyed) {
        socket.destroy();
      }
      resolve(ok);
    };

    socket.setTimeout(2000);
    socket.once("connect", () => socket.write(command));
    socket.on("data", (chunk) => {
      response += chunk.toString();
    });
    socket.once("end", () => finish(parseSimpleRespOk(response)));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}
