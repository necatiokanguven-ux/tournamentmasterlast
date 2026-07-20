export type WsRpcResult = {
  ok: boolean;
  payload?: unknown;
  error?: string;
};

export type WsRpcHandler = (
  params: Record<string, unknown> | undefined,
) => WsRpcResult | Promise<WsRpcResult>;

const handlers = new Map<string, WsRpcHandler>();

export function isWsRpcWritesEnabled(): boolean {
  return process.env.WS_RPC_WRITES === "true";
}

export function registerWsRpc(method: string, handler: WsRpcHandler): void {
  handlers.set(method.trim(), handler);
}

export async function dispatchWsRpc(
  method: string,
  params?: Record<string, unknown>,
): Promise<WsRpcResult | null> {
  const handler = handlers.get(method.trim());
  if (!handler) {
    return null;
  }

  return handler(params);
}

export function getRegisteredWsRpcMethods(): string[] {
  return [...handlers.keys()];
}
