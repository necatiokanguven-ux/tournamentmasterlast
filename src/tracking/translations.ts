export type TrackingLocale = "en" | "tr" | "de" | "fr" | "es" | "pt" | "it" | "ru";

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
};

const tr: TrackingTranslations = {
  appName: "Tournament Master",
  pageTitle: "QR Canlı Takip",
  phaseLabel: "Koltuğunuzu bulun ve canlı takip edin",
  connection: "Bağlantı",
  connectionChecking: "Kontrol ediliyor...",
  connectionConnected: "Bağlandı",
  connectionFailed: "Bağlantı Başarısız",
  connectionError: "Takip sunucusu yanıt vermedi.",
  tryAgain: "Tekrar Dene",
  tournament: "Turnuva",
  findYourName: "Adınızı Bulun",
  searchPlaceholder: "Adınızı yazmaya başlayın...",
  searchHint: "Yazdıkça sonuçlar anında güncellenir. Arama butonu gerekmez.",
  players: "Oyuncular",
  playersShown: (count) => `${count} gösteriliyor`,
  noPlayersFound: "Oyuncu bulunamadı",
  tryDifferentSpelling: "Farklı bir yazım deneyin.",
  selectedPlayer: "Koltuğunuz",
  playerName: "Oyuncu",
  table: "Masa",
  seat: "Koltuk",
  noSeatAssigned: "Henüz masa veya koltuk atanmadı.",
  goToYourTable: "Doğrudan masanıza gidin.",
  changePlayer: "Oyuncu Değiştir",
  liveTournament: "Canlı Turnuva",
  currentLevel: "Mevcut Level",
  blinds: "Blind",
  nextBlind: "Sonraki Blind",
  timeRemaining: "Kalan Süre",
  remainingPlayers: "Kalan Oyuncu",
  averageStack: "Ortalama Stack",
  prizePool: "Ödül Havuzu",
  nextBreak: "Sonraki Break",
  breakLabel: "ARA",
  liveUpdating: "Canlı güncelleniyor",
  paused: "Duraklatıldı",
  serviceName: "QR Live Tracking",
  tournamentFinished: "Turnuva Bitti",
  thanksForPlaying: "Oynadığınız için teşekkürler.",
  bubbleTime: "Bubble Time",
  bubblePlayersLeft: (count) => `${count} kişi kaldı.`,
  finalTableCongratulations: "Congratulations",
  finalTableReached: "You reached Final Table",
};

const de: TrackingTranslations = {
  ...en,
  pageTitle: "QR Live-Tracking",
  phaseLabel: "Finden Sie Ihren Platz und folgen Sie live",
  connection: "Verbindung",
  connectionChecking: "Prüfe...",
  connectionConnected: "Verbunden",
  connectionFailed: "Verbindung fehlgeschlagen",
  connectionError: "Tracking-Server hat nicht korrekt geantwortet.",
  tryAgain: "Erneut versuchen",
  tournament: "Turnier",
  findYourName: "Finden Sie Ihren Namen",
  searchPlaceholder: "Beginnen Sie mit der Eingabe Ihres Namens...",
  searchHint: "Ergebnisse werden sofort aktualisiert. Kein Suchbutton nötig.",
  players: "Spieler",
  playersShown: (count) => `${count} angezeigt`,
  noPlayersFound: "Keine Spieler gefunden",
  tryDifferentSpelling: "Versuchen Sie eine andere Schreibweise.",
  selectedPlayer: "Ihr Platz",
  playerName: "Spieler",
  table: "Tisch",
  seat: "Platz",
  noSeatAssigned: "Noch kein Tisch oder Platz zugewiesen.",
  goToYourTable: "Gehen Sie direkt zu Ihrem Tisch.",
  changePlayer: "Spieler wechseln",
  liveTournament: "Live-Turnier",
  currentLevel: "Aktuelles Level",
  blinds: "Blinds",
  nextBlind: "Nächste Blinds",
  timeRemaining: "Verbleibende Zeit",
  remainingPlayers: "Verbleibende Spieler",
  averageStack: "Durchschnittsstack",
  prizePool: "Preispool",
  nextBreak: "Nächste Pause",
  breakLabel: "PAUSE",
  liveUpdating: "Live-Aktualisierung",
  paused: "Pausiert",
};

const fr: TrackingTranslations = {
  ...en,
  pageTitle: "Suivi en direct QR",
  phaseLabel: "Trouvez votre place et suivez en direct",
  connection: "Connexion",
  connectionChecking: "Vérification...",
  connectionConnected: "Connecté",
  connectionFailed: "Échec de connexion",
  connectionError: "Le serveur de suivi n'a pas répondu correctement.",
  tryAgain: "Réessayer",
  tournament: "Tournoi",
  findYourName: "Trouvez votre nom",
  searchPlaceholder: "Commencez à saisir votre nom...",
  searchHint: "Les résultats se mettent à jour instantanément. Pas de bouton de recherche.",
  players: "Joueurs",
  playersShown: (count) => `${count} affichés`,
  noPlayersFound: "Aucun joueur trouvé",
  tryDifferentSpelling: "Essayez une autre orthographe.",
  selectedPlayer: "Votre siège",
  playerName: "Joueur",
  table: "Table",
  seat: "Siège",
  noSeatAssigned: "Aucune table ou siège attribué pour le moment.",
  goToYourTable: "Allez directement à votre table.",
  changePlayer: "Changer de joueur",
};

const es: TrackingTranslations = {
  ...en,
  pageTitle: "Seguimiento en vivo QR",
  phaseLabel: "Encuentra tu asiento y sigue en vivo",
  connection: "Conexión",
  connectionChecking: "Comprobando...",
  connectionConnected: "Conectado",
  connectionFailed: "Conexión fallida",
  connectionError: "El servidor de seguimiento no respondió correctamente.",
  tryAgain: "Intentar de nuevo",
  tournament: "Torneo",
  findYourName: "Encuentra tu nombre",
  searchPlaceholder: "Empieza a escribir tu nombre...",
  searchHint: "Los resultados se actualizan al instante. No se necesita botón de búsqueda.",
  players: "Jugadores",
  playersShown: (count) => `${count} mostrados`,
  noPlayersFound: "No se encontraron jugadores",
  tryDifferentSpelling: "Prueba otra ortografía.",
  selectedPlayer: "Tu asiento",
  playerName: "Jugador",
  table: "Mesa",
  seat: "Asiento",
  noSeatAssigned: "Aún no hay mesa o asiento asignado.",
  goToYourTable: "Ve directamente a tu mesa.",
  changePlayer: "Cambiar jugador",
};

const pt: TrackingTranslations = {
  ...es,
  pageTitle: "Rastreamento ao vivo QR",
  phaseLabel: "Encontre seu lugar e acompanhe ao vivo",
  connection: "Conexão",
  connectionChecking: "Verificando...",
  connectionConnected: "Conectado",
  connectionFailed: "Falha na conexão",
  connectionError: "O servidor de rastreamento não respondeu corretamente.",
  tryAgain: "Tentar novamente",
  tournament: "Torneio",
  findYourName: "Encontre seu nome",
  searchPlaceholder: "Comece a digitar seu nome...",
  searchHint: "Os resultados são atualizados instantaneamente. Não é necessário botão de busca.",
  players: "Jogadores",
  playersShown: (count) => `${count} exibidos`,
  noPlayersFound: "Nenhum jogador encontrado",
  tryDifferentSpelling: "Tente outra grafia.",
  selectedPlayer: "Seu assento",
  playerName: "Jogador",
  table: "Mesa",
  seat: "Assento",
  noSeatAssigned: "Nenhuma mesa ou assento atribuído ainda.",
  goToYourTable: "Vá diretamente para sua mesa.",
  changePlayer: "Trocar jogador",
};

const it: TrackingTranslations = {
  ...en,
  pageTitle: "Tracking live QR",
  phaseLabel: "Trova il tuo posto e segui live",
  connection: "Connessione",
  connectionChecking: "Controllo...",
  connectionConnected: "Connesso",
  connectionFailed: "Connessione fallita",
  connectionError: "Il server di tracking non ha risposto correttamente.",
  tryAgain: "Riprova",
  tournament: "Torneo",
  findYourName: "Trova il tuo nome",
  searchPlaceholder: "Inizia a digitare il tuo nome...",
  searchHint: "I risultati si aggiornano istantaneamente. Nessun pulsante di ricerca.",
  players: "Giocatori",
  playersShown: (count) => `${count} mostrati`,
  noPlayersFound: "Nessun giocatore trovato",
  tryDifferentSpelling: "Prova un'altra ortografia.",
  selectedPlayer: "Il tuo posto",
  playerName: "Giocatore",
  table: "Tavolo",
  seat: "Posto",
  noSeatAssigned: "Nessun tavolo o posto assegnato ancora.",
  goToYourTable: "Vai direttamente al tuo tavolo.",
  changePlayer: "Cambia giocatore",
};

const ru: TrackingTranslations = {
  ...en,
  pageTitle: "QR Live Tracking",
  phaseLabel: "Найдите место и следите в реальном времени",
  connection: "Подключение",
  connectionChecking: "Проверка...",
  connectionConnected: "Подключено",
  connectionFailed: "Ошибка подключения",
  connectionError: "Сервер отслеживания не ответил корректно.",
  tryAgain: "Повторить",
  tournament: "Турнир",
  findYourName: "Найдите своё имя",
  searchPlaceholder: "Начните вводить своё имя...",
  searchHint: "Результаты обновляются мгновенно. Кнопка поиска не нужна.",
  players: "Игроки",
  playersShown: (count) => `Показано: ${count}`,
  noPlayersFound: "Игроки не найдены",
  tryDifferentSpelling: "Попробуйте другое написание.",
  selectedPlayer: "Ваше место",
  playerName: "Игрок",
  table: "Стол",
  seat: "Место",
  noSeatAssigned: "Стол или место ещё не назначены.",
  goToYourTable: "Идите прямо к своему столу.",
  changePlayer: "Сменить игрока",
};

const catalog: Record<TrackingLocale, TrackingTranslations> = {
  en,
  tr,
  de,
  fr,
  es,
  pt,
  it,
  ru,
};

const supportedLocales = Object.keys(catalog) as TrackingLocale[];

export function detectTrackingLocale(): TrackingLocale {
  const browserLanguages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language || "en"];

  for (const language of browserLanguages) {
    const normalized = language.toLowerCase().split("-")[0] as TrackingLocale;
    if (supportedLocales.includes(normalized)) {
      return normalized;
    }
  }

  return "en";
}

export function getTrackingTranslations(locale: TrackingLocale): TrackingTranslations {
  return catalog[locale] ?? catalog.en;
}
