/** Client-side tournament WebSocket protocol (mirrors server Phase 4). */

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

export function parseServerMessage(raw: string): TournamentSocketServerMessage | null {
  try {
    return JSON.parse(raw) as TournamentSocketServerMessage;
  } catch {
    return null;
  }
}

export function isChannelPayloadMessage(
  message: TournamentSocketServerMessage,
): message is Extract<TournamentSocketServerMessage, { type: "snapshot" | "delta" }> {
  return message.type === "snapshot" || message.type === "delta";
}
