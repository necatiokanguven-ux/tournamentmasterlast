import type { IncomingMessage } from "http";
import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { DealerTimerSnapshot } from "./dealerTimerTypes";

type TimerMessage = {
  type: "dealer_timer";
  tableNumber: number;
  dealerTimer: DealerTimerSnapshot;
};

const rooms = new Map<number, Set<WebSocket>>();
let timerWss: WebSocketServer | null = null;
let hubTimerBroadcast: ((tableNumber: number, dealerTimer: DealerTimerSnapshot) => void) | null = null;

export function registerDealerTimerHubBroadcast(
  broadcaster: (tableNumber: number, dealerTimer: DealerTimerSnapshot) => void,
): void {
  hubTimerBroadcast = broadcaster;
}

function parseTableNumber(url: string | undefined): number | null {
  if (!url) return null;
  const match = url.match(/\/ws\/dealer\/table\/(\d+)\/timer/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function removeClient(tableNumber: number, socket: WebSocket) {
  const room = rooms.get(tableNumber);
  if (!room) return;
  room.delete(socket);
  if (room.size === 0) {
    rooms.delete(tableNumber);
  }
}

function ensureTimerWss(): WebSocketServer {
  if (!timerWss) {
    timerWss = new WebSocketServer({ noServer: true });
    timerWss.on("connection", (socket: WebSocket, _request: IncomingMessage, tableNumber: number) => {
      let room = rooms.get(tableNumber);
      if (!room) {
        room = new Set();
        rooms.set(tableNumber, room);
      }
      room.add(socket);

      socket.on("close", () => {
        removeClient(tableNumber, socket);
      });

      socket.on("error", () => {
        removeClient(tableNumber, socket);
      });
    });
  }
  return timerWss;
}

/** Returns true when the upgrade was handled. */
export function attachDealerTimerWebSocketUpgrade(_server: HttpServer) {
  const wss = ensureTimerWss();

  return (request: IncomingMessage, socket: import("stream").Duplex, head: Buffer): boolean => {
    const tableNumber = parseTableNumber(request.url);
    if (!tableNumber) {
      return false;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, tableNumber);
    });
    return true;
  };
}

/** @deprecated Use attachWebSockets() — kept for compatibility. */
export function attachDealerTimerWebSocket(server: HttpServer) {
  const tryUpgrade = attachDealerTimerWebSocketUpgrade(server);
  server.on("upgrade", (request, socket, head) => {
    if (!tryUpgrade(request, socket, head)) {
      socket.destroy();
    }
  });
}

export function broadcastDealerTimer(tableNumber: number, dealerTimer: DealerTimerSnapshot) {
  hubTimerBroadcast?.(tableNumber, dealerTimer);

  const room = rooms.get(tableNumber);
  if (!room || room.size === 0) return;

  const payload: TimerMessage = {
    type: "dealer_timer",
    tableNumber,
    dealerTimer,
  };
  const message = JSON.stringify(payload);

  for (const client of room) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

export function closeDealerTimerWebSockets(): void {
  if (!timerWss) return;
  for (const client of timerWss.clients) {
    client.close(1001, "Server shutting down");
  }
  timerWss.close();
  timerWss = null;
  rooms.clear();
}
