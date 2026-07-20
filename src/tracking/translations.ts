export type TrackingLocale = "en";

export type TrackingTranslations = {
  appName: string;
  pageTitle: string;
  phaseLabel: string;
  connection: string;
  connectionChecking: string;
  connectionConnected: string;
  connectionFailed: string;
  connectionError: string;
  tryAgain: string;
  tournament: string;
  findYourName: string;
  searchPlaceholder: string;
  searchHint: string;
  players: string;
  playersShown: (count: number) => string;
  noPlayersFound: string;
  tryDifferentSpelling: string;
  selectedPlayer: string;
  playerName: string;
  table: string;
  seat: string;
  noSeatAssigned: string;
  goToYourTable: string;
  changePlayer: string;
  liveTournament: string;
  currentLevel: string;
  blinds: string;
  nextBlind: string;
  timeRemaining: string;
  remainingPlayers: string;
  averageStack: string;
  prizePool: string;
  nextBreak: string;
  breakLabel: string;
  liveUpdating: string;
  paused: string;
  serviceName: string;
  tournamentFinished: string;
  thanksForPlaying: string;
  bubbleTime: string;
  bubblePlayersLeft: (count: number) => string;
  finalTableCongratulations: string;
  finalTableReached: string;
  totalPrizePool: string;
  tapForFullPrizePool: string;
  viewPayoutDistribution: string;
  payoutPlace: string;
  payoutPercent: string;
  payoutAmount: string;
  noPayoutStructure: string;
  close: string;
};

const en: TrackingTranslations = {
  appName: "Tournament Master",
  pageTitle: "QR Live Tracking",
  phaseLabel: "Find your seat and follow live",
  connection: "Connection",
  connectionChecking: "Checking...",
  connectionConnected: "Connected",
  connectionFailed: "Connection Failed",
  connectionError: "Tracking server did not respond correctly.",
  tryAgain: "Try Again",
  tournament: "Tournament",
  findYourName: "Find Your Name",
  searchPlaceholder: "Start typing your name...",
  searchHint: "Results update instantly as you type. No search button needed.",
  players: "Players",
  playersShown: (count) => `${count} shown`,
  noPlayersFound: "No players found",
  tryDifferentSpelling: "Try a different spelling.",
  selectedPlayer: "Your Seat",
  playerName: "Player",
  table: "Table",
  seat: "Seat",
  noSeatAssigned: "No table or seat assigned yet.",
  goToYourTable: "Go directly to your table.",
  changePlayer: "Change Player",
  liveTournament: "Live Tournament",
  currentLevel: "Current Level",
  blinds: "Blinds",
  nextBlind: "Next Blind",
  timeRemaining: "Time Remaining",
  remainingPlayers: "Players Left",
  averageStack: "Average Stack",
  prizePool: "Prize Pool",
  nextBreak: "Next Break",
  breakLabel: "BREAK",
  liveUpdating: "Updating live",
  paused: "Paused",
  serviceName: "QR Live Tracking",
  tournamentFinished: "Tournament Finished",
  thanksForPlaying: "Thanks for playing.",
  bubbleTime: "Bubble Time",
  bubblePlayersLeft: (count) => `${count} player${count === 1 ? "" : "s"} left.`,
  finalTableCongratulations: "Congratulations",
  finalTableReached: "You reached Final Table",
  totalPrizePool: "Total Prize Pool",
  tapForFullPrizePool: "Tap for full prize pool",
  viewPayoutDistribution: "Payout Distribution",
  payoutPlace: "Place",
  payoutPercent: "Share",
  payoutAmount: "Amount",
  noPayoutStructure: "Payout structure is not configured yet.",
  close: "Close",
};

export function detectTrackingLocale(): TrackingLocale {
  return "en";
}

export function getTrackingTranslations(_locale: TrackingLocale = "en"): TrackingTranslations {
  return en;
}
