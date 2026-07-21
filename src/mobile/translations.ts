export type MobileTranslations = {
  dealerTablet: string;
  dealerPhone: string;
  tableTablet: string;
  floorMobile: string;
  table: string;
  seat: string;
  seatOpen: string;
  tapToEliminate: string;
  callFloor: string;
  floorCalled: string;
  playerEliminated: string;
  clock: string;
  level: string;
  blinds: string;
  nextLevel: string;
  nextBreak: string;
  players: string;
  breakLabel: string;
  callTime: string;
  playerTime: string;
  ready: string;
  start: string;
  pause: string;
  reset: string;
  eliminatePlayer: string;
  confirmEliminatePrompt: string;
  cancel: string;
  yesEliminate: string;
  loading: string;
  yourName: string;
  missingTeam: string;
  noFloorCalls: string;
  going: string;
  responding: (name: string) => string;
  resolved: string;
  assignedTables: string;
  noAssignedTables: string;
  occupants: (count: number) => string;
  enableAlerts: string;
  alertsEnabled: string;
  floorCallAt: string;
  floorPlayerEliminated: string;
  dismissAlert: string;
  connect: string;
  disconnect: string;
  move: string;
  selectTable: string;
  selectSeat: string;
  movePlayer: string;
  noEmptySeats: string;
  playerMoved: string;
  moveFailed: string;
};

const mobileTranslations: MobileTranslations = {
  dealerTablet: "Dealer Tablet",
  dealerPhone: "Dealer Phone",
  tableTablet: "Table Tablet",
  floorMobile: "Floor Mobile",
  table: "Table",
  seat: "Seat",
  seatOpen: "Seat Open",
  tapToEliminate: "Tap to eliminate",
  callFloor: "Call Floor",
  floorCalled: "Floor called.",
  playerEliminated: "Player eliminated.",
  clock: "Clock",
  level: "Level",
  blinds: "Blinds",
  nextLevel: "Next Level",
  nextBreak: "Next Break",
  players: "Players",
  breakLabel: "BREAK",
  callTime: "Call Time",
  playerTime: "Player Time",
  ready: "Ready",
  start: "Start",
  pause: "Pause",
  reset: "Reset",
  eliminatePlayer: "Eliminate Player",
  confirmEliminatePrompt: "Are you sure you want to eliminate this player?",
  cancel: "Cancel",
  yesEliminate: "Yes, Eliminate",
  loading: "Loading...",
  yourName: "Your Name",
  missingTeam: "Missing floor team. Scan the floor QR from Tournament Master.",
  noFloorCalls: "No active floor calls for this team.",
  going: "On My Way",
  responding: (name) => `${name} is responding`,
  resolved: "Resolved",
  assignedTables: "Assigned Tables",
  noAssignedTables: "No tables assigned to this floor team.",
  occupants: (count) => `${count} seated`,
  enableAlerts: "Tap anywhere to enable sound and vibration alerts",
  alertsEnabled: "Alerts enabled",
  floorCallAt: "Floor call",
  floorPlayerEliminated: "Player eliminated",
  dismissAlert: "OK",
  connect: "Connect",
  disconnect: "Disconnect",
  move: "Move",
  selectTable: "Select Table",
  selectSeat: "Select Empty Seat",
  movePlayer: "Move Player",
  noEmptySeats: "No empty seats on this table.",
  playerMoved: "Player moved.",
  moveFailed: "Could not move player.",
};

/** Dealer and floor operator screens are always English. */
export function useMobileI18n(): { t: MobileTranslations } {
  return { t: mobileTranslations };
}

export function formatDealerLevel(
  currentLevel: number,
  isBreak: boolean,
  breakLabel: string,
): string {
  if (isBreak) {
    return breakLabel;
  }

  return String(Math.max(1, currentLevel));
}

export const MOBILE_LOCALE = "en-US";

export function formatMobileTime(value: string | number | Date): string {
  return new Date(value).toLocaleTimeString(MOBILE_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
