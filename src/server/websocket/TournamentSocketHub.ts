import type { IncomingMessage } from "http";
import type { Server as HttpServer } from "http";
import crypto from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import type { TournamentDatabase } from "../tournamentDatabase";
import { dispatchWsRpc } from "./wsRpcDispatcher";
import { publishTournamentEvent } from "../redis/redisClient";
import {
  buildClockChannelPayload,
  clockChannelVersion,
  type ClockChannelPayload,
} from "./clockChannel";
import {
  buildDealerControlStatePayload,
  parseDealerControlChannel,
} from "./dealerControlChannel";
import {
  buildDealerPhoneChannelPayload,
  parseDealerPhoneChannel,
} from "./dealerPhoneChannel";
import {
  buildFloorChannelPayload,
  floorTeamsWithSubscribers,
  parseFloorChannel,
} from "./floorChannel";
import {
  parseClientMessage,
  serializeServerMessage,
  TOURNAMENT_WS_PATH,
  type TournamentSocketServerMessage,
} from "./tournamentSocketProtocol";
import {
  buildDealerTimerChannelPayload,
  dealerTimerChannelForTable,
  parseDealerTimerChannel,
  type DealerTimerChannelPayload,
} from "./dealerTimerChannel";
import type { DealerTimerSnapshot } from "../../dealer/dealerTimerTypes";
import { getDealerTimerSnapshot } from "../../dealer/dealerRuntimeStore";
import { getVenueDeviceMode, isMobileWsChannel } from "../systemHealth/venueDeviceMode";

type DbAccessor = () => TournamentDatabase;

type SocketMeta = {
  channels: Set<string>;
  dealerPhoneId: string | null;
};

export class TournamentSocketHub {
  private readonly wss: WebSocketServer;
  private readonly socketMeta = new Map<WebSocket, SocketMeta>();
  private onDealerPhoneDisconnect: ((dealerId: string) => void) | null = null;

  constructor(private readonly getDb: DbAccessor) {
    this.wss = new WebSocketServer({ noServer: true });

    this.wss.on("connection", (socket: WebSocket) => {
      this.socketMeta.set(socket, { channels: new Set(), dealerPhoneId: null });

      socket.on("message", (data: WebSocket.RawData) => {
        this.handleClientMessage(socket, String(data));
      });

      socket.on("close", () => {
        const meta = this.socketMeta.get(socket);
        if (meta?.dealerPhoneId && this.onDealerPhoneDisconnect) {
          this.onDealerPhoneDisconnect(meta.dealerPhoneId);
        }
        this.socketMeta.delete(socket);
      });

      socket.on("error", () => {
        this.socketMeta.delete(socket);
      });
    });
  }

  setDealerPhoneDisconnectHandler(handler: (dealerId: string) => void): void {
    this.onDealerPhoneDisconnect = handler;
  }

  attach(server: HttpServer): void {
    void server;
  }

  tryHandleUpgrade(request: IncomingMessage, socket: import("stream").Duplex, head: Buffer): boolean {
    if (!this.isTournamentSocketPath(request.url)) {
      return false;
    }

    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit("connection", ws, request);
    });
    return true;
  }

  broadcastMeta(lastModified: number): void {
    this.broadcast("meta", {
      type: "delta",
      channel: "meta",
      payload: { lastModified },
      version: lastModified,
    });
    this.broadcastDirector(lastModified);
  }

  broadcastDirector(lastModified: number): void {
    this.broadcast("director", {
      type: "delta",
      channel: "director",
      payload: { lastModified, refresh: true },
      version: lastModified,
    });
  }

  broadcastClock(clock: ClockChannelPayload): void {
    const version = clockChannelVersion(clock);
    this.broadcast("clock", {
      type: "delta",
      channel: "clock",
      payload: clock,
      version,
    });
  }

  broadcastFloorTeam(teamId: string): void {
    const channel = `floor:${teamId}`;
    const payload = buildFloorChannelPayload(this.getDb(), teamId);
    if (!payload) return;

    this.broadcast(channel, {
      type: "delta",
      channel,
      payload,
      version: payload.version,
    });
  }

  broadcastFloorUpdates(): void {
    const channels = this.allSubscribedChannels();
    for (const teamId of floorTeamsWithSubscribers(this.getDb(), channels)) {
      this.broadcastFloorTeam(teamId);
    }
  }

  broadcastDealerPhone(dealerId: string): void {
    const channel = `dealer-phone:${dealerId}`;
    const payload = buildDealerPhoneChannelPayload(this.getDb(), dealerId);
    if (!payload) return;

    this.broadcast(channel, {
      type: "delta",
      channel,
      payload,
      version: payload.version,
    });
  }

  broadcastDealerPhonesForStaff(): void {
    const channels = this.allSubscribedChannels();
    for (const channel of channels) {
      const dealerId = parseDealerPhoneChannel(channel);
      if (dealerId) {
        this.broadcastDealerPhone(dealerId);
      }
    }
  }

  broadcastDealerControl(zoneId: string | null = null): void {
    const channel = zoneId ? `dealer-control:${zoneId}` : "dealer-control";
    const payload = buildDealerControlStatePayload(this.getDb(), zoneId);
    this.broadcast(channel, {
      type: "delta",
      channel,
      payload,
      version: payload.version,
    });
  }

  broadcastDealerControlUpdates(): void {
    const channels = this.allSubscribedChannels();
    const zones = new Set<string | null>();

    for (const channel of channels) {
      if (channel === "dealer-control") {
        zones.add(null);
        continue;
      }
      if (channel.startsWith("dealer-control:")) {
        zones.add(parseDealerControlChannel(channel));
      }
    }

    for (const zoneId of zones) {
      this.broadcastDealerControl(zoneId);
    }
  }

  broadcastDealerTimer(tableNumber: number, dealerTimer: DealerTimerSnapshot): void {
    const channel = dealerTimerChannelForTable(tableNumber);
    const payload = buildDealerTimerChannelPayload(tableNumber, dealerTimer);
    this.broadcast(channel, {
      type: "delta",
      channel,
      payload,
      version: dealerTimer.revision,
    });
  }

  touchDealerPhoneHeartbeat(dealerId: string): void {
    const db = this.getDb();
    const dealer = db.dealerRotation.staff.find(entry => entry.id === dealerId);
    if (!dealer) return;
    dealer.phoneLastSeenAt = new Date().toISOString();
  }

  getClientCount(): number {
    return this.wss.clients.size;
  }

  getChannelClientCounts(): {
    dealerPhone: number;
    floor: number;
    dealerControl: number;
    dealerTimer: number;
    total: number;
  } {
    let dealerPhone = 0;
    let floor = 0;
    let dealerControl = 0;
    let dealerTimer = 0;

    for (const meta of this.socketMeta.values()) {
      for (const channel of meta.channels) {
        if (channel.startsWith("dealer-phone:")) dealerPhone += 1;
        else if (channel.startsWith("floor:")) floor += 1;
        else if (channel.startsWith("dealer-control")) dealerControl += 1;
        else if (channel.startsWith("dealer-timer:")) dealerTimer += 1;
      }
    }

    return {
      dealerPhone,
      floor,
      dealerControl,
      dealerTimer,
      total: this.wss.clients.size,
    };
  }

  disconnectMobileClients(reason: string): void {
    for (const client of this.wss.clients) {
      const meta = this.socketMeta.get(client);
      const hasMobileChannel = meta
        ? [...meta.channels].some((channel) => isMobileWsChannel(channel))
        : false;
      if (hasMobileChannel) {
        client.close(1001, reason);
      }
    }
  }

  close(): void {
    for (const client of this.wss.clients) {
      client.close(1001, "Server shutting down");
    }
    this.wss.close();
  }

  private allSubscribedChannels(): Set<string> {
    const channels = new Set<string>();
    for (const meta of this.socketMeta.values()) {
      for (const channel of meta.channels) {
        channels.add(channel);
      }
    }
    return channels;
  }

  private isTournamentSocketPath(url: string | undefined): boolean {
    if (!url) return false;
    const path = url.split("?")[0];
    return path === TOURNAMENT_WS_PATH;
  }

  private handleClientMessage(socket: WebSocket, raw: string): void {
    const message = parseClientMessage(raw);
    if (!message) {
      this.send(socket, { type: "error", code: "INVALID_MESSAGE", message: "Unrecognized message." });
      return;
    }

    if (message.type === "ping") {
      this.send(socket, { type: "pong", serverTime: Date.now() });
      return;
    }

    if (message.type === "subscribe") {
      this.subscribe(socket, message.channel, message.params);
      return;
    }

    if (message.type === "unsubscribe") {
      this.unsubscribe(socket, message.channel);
      return;
    }

    if (message.type === "rpc") {
      this.handleRpc(socket, message.id, message.method, message.params);
    }
  }

  private handleRpc(
    socket: WebSocket,
    id: string,
    method: string,
    params?: Record<string, unknown>,
  ): void {
    void params;

    if (method === "health") {
      const db = this.getDb();
      this.send(socket, {
        type: "rpc_result",
        id,
        ok: true,
        payload: {
          lastModified: db.meta.lastModified,
          zoneVersions: db.meta.zoneVersions ?? {},
          serverTime: Date.now(),
        },
      });
      return;
    }

    if (method === "meta") {
      const db = this.getDb();
      this.send(socket, {
        type: "rpc_result",
        id,
        ok: true,
        payload: { lastModified: db.meta.lastModified },
      });
      return;
    }

    void this.dispatchRegisteredRpc(socket, id, method, params);
  }

  private async dispatchRegisteredRpc(
    socket: WebSocket,
    id: string,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<void> {
    const result = await dispatchWsRpc(method, params);
    if (result) {
      this.send(socket, {
        type: "rpc_result",
        id,
        ok: result.ok,
        payload: result.payload,
        error: result.error,
      });
      return;
    }

    this.send(socket, {
      type: "rpc_result",
      id,
      ok: false,
      error: `RPC method "${method}" is not supported.`,
    });
  }

  private subscribe(
    socket: WebSocket,
    channel: string,
    params?: Record<string, unknown>,
  ): void {
    const normalized = channel.trim();
    if (!normalized) {
      this.send(socket, { type: "error", code: "CHANNEL_REQUIRED", message: "Channel is required." });
      return;
    }

    if (!this.isSupportedChannel(normalized)) {
      this.send(socket, {
        type: "error",
        code: "CHANNEL_UNSUPPORTED",
        message: `Channel "${normalized}" is not available.`,
      });
      return;
    }

    if (getVenueDeviceMode() === "off" && isMobileWsChannel(normalized)) {
      this.send(socket, {
        type: "error",
        code: "VENUE_DEVICES_OFF",
        message: "Venue mobile channels are disabled by operator.",
      });
      socket.close(1001, "Venue mobile devices disabled");
      return;
    }

    const meta = this.socketMeta.get(socket) ?? { channels: new Set(), dealerPhoneId: null };
    meta.channels.add(normalized);

    const dealerId = parseDealerPhoneChannel(normalized);
    if (dealerId) {
      meta.dealerPhoneId = dealerId;
      this.touchDealerPhoneHeartbeat(dealerId);
      void params;
    }

    this.socketMeta.set(socket, meta);
    this.send(socket, { type: "subscribed", channel: normalized });
    this.sendChannelSnapshot(socket, normalized);
  }

  private unsubscribe(socket: WebSocket, channel: string): void {
    const meta = this.socketMeta.get(socket);
    meta?.channels.delete(channel);
    if (meta && parseDealerPhoneChannel(channel)) {
      meta.dealerPhoneId = null;
    }
    this.send(socket, { type: "unsubscribed", channel });
  }

  private isSupportedChannel(channel: string): boolean {
    return (
      channel === "meta"
      || channel === "director"
      || channel === "clock"
      || channel === "dealer-control"
      || Boolean(parseFloorChannel(channel))
      || Boolean(parseDealerPhoneChannel(channel))
      || channel.startsWith("dealer-control:")
      || Boolean(parseDealerTimerChannel(channel))
    );
  }

  private sendChannelSnapshot(socket: WebSocket, channel: string): void {
    const db = this.getDb();

    if (channel === "meta") {
      const lastModified = db.meta.lastModified;
      this.send(socket, {
        type: "snapshot",
        channel: "meta",
        payload: { lastModified },
        version: lastModified,
      });
      return;
    }

    if (channel === "director") {
      const lastModified = db.meta.lastModified;
      this.send(socket, {
        type: "snapshot",
        channel: "director",
        payload: { lastModified, refresh: true },
        version: lastModified,
      });
      return;
    }

    if (channel === "clock") {
      const payload = buildClockChannelPayload(db.clock);
      this.send(socket, {
        type: "snapshot",
        channel: "clock",
        payload,
        version: clockChannelVersion(payload),
      });
      return;
    }

    const floorTeamId = parseFloorChannel(channel);
    if (floorTeamId) {
      const payload = buildFloorChannelPayload(db, floorTeamId);
      if (!payload) {
        this.send(socket, { type: "error", code: "FLOOR_TEAM_NOT_FOUND", message: "Floor team not found." });
        return;
      }
      this.send(socket, {
        type: "snapshot",
        channel,
        payload,
        version: payload.version,
      });
      return;
    }

    const dealerId = parseDealerPhoneChannel(channel);
    if (dealerId) {
      const payload = buildDealerPhoneChannelPayload(db, dealerId);
      this.send(socket, {
        type: "snapshot",
        channel,
        payload,
        version: payload.version,
      });
      return;
    }

    if (channel === "dealer-control" || channel.startsWith("dealer-control:")) {
      const zoneId = parseDealerControlChannel(channel);
      const payload = buildDealerControlStatePayload(db, zoneId);
      this.send(socket, {
        type: "snapshot",
        channel,
        payload,
        version: payload.version,
      });
      return;
    }

    const timerTableNumber = parseDealerTimerChannel(channel);
    if (timerTableNumber) {
      const dealerTimer = getDealerTimerSnapshot(timerTableNumber);
      const payload = buildDealerTimerChannelPayload(timerTableNumber, dealerTimer);
      this.send(socket, {
        type: "snapshot",
        channel,
        payload,
        version: dealerTimer.revision,
      });
    }
  }

  private broadcast(channel: string, message: TournamentSocketServerMessage): void {
    const payload = serializeServerMessage(message);

    void publishTournamentEvent(`ws:${channel}`, message);

    for (const [socket, meta] of this.socketMeta.entries()) {
      if (!meta.channels.has(channel)) continue;
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }

  private send(socket: WebSocket, message: TournamentSocketServerMessage): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(serializeServerMessage(message));
  }
}

export function generatePhoneSessionToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export { buildClockChannelPayload } from "./clockChannel";
