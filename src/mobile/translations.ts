import { detectTrackingLocale, type TrackingLocale } from "../tracking/translations";

export type MobileTranslations = {
  dealerTablet: string;
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
  confirmEliminate: (name: string) => string;
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
};

const en: MobileTranslations = {
  dealerTablet: "Dealer Tablet",
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
  confirmEliminate: (name) => `${name} — are you sure you want to eliminate this player?`,
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
};

const tr: MobileTranslations = {
  dealerTablet: "Dealer Tablet",
  floorMobile: "Floor Mobil",
  table: "Masa",
  seat: "Koltuk",
  seatOpen: "Boş Koltuk",
  tapToEliminate: "Elemek için dokun",
  callFloor: "Floor Çağır",
  floorCalled: "Floor çağrıldı.",
  playerEliminated: "Oyuncu elendi.",
  clock: "Saat",
  level: "Seviye",
  blinds: "Blind",
  nextLevel: "Sonraki Seviye",
  nextBreak: "Sonraki Mola",
  players: "Oyuncular",
  breakLabel: "MOLA",
  callTime: "Call Time",
  playerTime: "Player Time",
  ready: "Hazır",
  start: "Başlat",
  pause: "Duraklat",
  reset: "Sıfırla",
  eliminatePlayer: "Oyuncuyu Ele",
  confirmEliminate: (name) => `${name} — oyuncuyu silmek istediğinizden emin misiniz?`,
  cancel: "İptal",
  yesEliminate: "Evet, Ele",
  loading: "Yükleniyor...",
  yourName: "Adınız",
  missingTeam: "Floor ekibi bulunamadı. Tournament Master'dan floor QR kodunu okutun.",
  noFloorCalls: "Bu ekip için aktif floor çağrısı yok.",
  going: "Gidiyorum",
  responding: (name) => `${name} müdahale ediyor`,
  resolved: "Çözüldü",
  assignedTables: "Atanan Masalar",
  noAssignedTables: "Bu floor ekibine atanmış masa yok.",
  occupants: (count) => `${count} oyuncu`,
  enableAlerts: "Ses ve titreşim için ekrana dokunun",
  alertsEnabled: "Uyarılar açık",
  floorCallAt: "Floor çağrısı",
};

const catalog: Record<"en" | "tr", MobileTranslations> = { en, tr };

export function useMobileI18n(): { locale: TrackingLocale; t: MobileTranslations } {
  const locale = detectTrackingLocale();
  const lang = locale === "tr" ? "tr" : "en";
  return { locale, t: catalog[lang] };
}

export function formatDealerLevel(
  currentLevel: number,
  currentLevelIndex: number,
  isBreak: boolean,
  breakLabel: string,
): string {
  if (isBreak) {
    return breakLabel;
  }

  if (currentLevel > 0) {
    return String(currentLevel);
  }

  return String(Math.max(1, currentLevelIndex + 1));
}
