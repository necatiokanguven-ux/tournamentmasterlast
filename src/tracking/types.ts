export type TrackingHealthResponse = {
  status: "ok";
  service: "qr-live-tracking";
  phase: number;
  serverTime: string;
  port: number;
  localAddresses: string[];
  trackingUrl: string;
  trackingReady?: boolean;
};

export type TrackingPingResponse = {
  pong: true;
  serverTime: string;
};

import type { PlayerStatus } from "../types";

export type TrackingPlayerSearchItem = {
  id: string;
  displayName: string;
  tableNumber: number | null;
  seatNumber: number | null;
  status: PlayerStatus;
};

export type TrackingPlayersResponse = {
  tournamentName: string;
  players: TrackingPlayerSearchItem[];
};

export type { TrackingLiveState } from "./liveState";
