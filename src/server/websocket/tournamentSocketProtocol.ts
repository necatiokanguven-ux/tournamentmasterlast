/** Tournament WebSocket hub — client/server message protocol (Phase 4). */

export type TournamentSocketClientMessage =
  | { type: "subscribe"; channel: string; params?: Record<string, unknown> }
  | { type: "unsubscribe"; channel: string }
  | { type: "ping" }
  | { type: "rpc"; id: string; method: string; params?: Record<string, unknown> };

export type TournamentSocketServerMessage =
  | { type: "subscribed"; channel: string }
  | { type: "unsubscribed"; channel: string }
  | { type: "snapshot"; channel: string; payload: unknown; version?: number }
  | { type: "delta"; channel: string; payload: unknown; version?: number }
  | { type: "error"; code: string; message: string }
  | { type: "pong"; serverTime: number }
  | { type: "rpc_result"; id: string; ok: boolean; payload?: unknown; error?: string };

export const TOURNAMENT_WS_PATH = "/ws/tournament";

export const KNOWN_CHANNELS = ["meta", "clock"] as const;

export type KnownChannel = (typeof KNOWN_CHANNELS)[number];

export function parseClientMessage(raw: string): TournamentSocketClientMessage | null {
  try {
    const parsed = JSON.parse(raw) as Partial<TournamentSocketClientMessage>;
    if (parsed.type === "subscribe" && typeof parsed.channel === "string") {
      return { type: "subscribe", channel: parsed.channel, params: parsed.params };
    }
    if (parsed.type === "unsubscribe" && typeof parsed.channel === "string") {
      return { type: "unsubscribe", channel: parsed.channel };
    }
    if (parsed.type === "ping") {
      return { type: "ping" };
    }
    if (parsed.type === "rpc" && typeof parsed.id === "string" && typeof parsed.method === "string") {
      return {
        type: "rpc",
        id: parsed.id,
        method: parsed.method,
        params: parsed.params as Record<string, unknown> | undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function serializeServerMessage(message: TournamentSocketServerMessage): string {
  return JSON.stringify(message);
}
