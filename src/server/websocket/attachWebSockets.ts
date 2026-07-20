import type { Server as HttpServer } from "http";
import type { TournamentDatabase } from "../tournamentDatabase";
import { attachDealerTimerWebSocketUpgrade, registerDealerTimerHubBroadcast } from "../../dealer/dealerTimerWebSocket";
import { TournamentSocketHub } from "./TournamentSocketHub";

type DbAccessor = () => TournamentDatabase;

export function attachWebSockets(server: HttpServer, getDb: DbAccessor): TournamentSocketHub {
  const tournamentHub = new TournamentSocketHub(getDb);
  const tryDealerTimerUpgrade = attachDealerTimerWebSocketUpgrade(server);

  registerDealerTimerHubBroadcast((tableNumber, dealerTimer) => {
    tournamentHub.broadcastDealerTimer(tableNumber, dealerTimer);
  });

  server.on("upgrade", (request, socket, head) => {
    if (tournamentHub.tryHandleUpgrade(request, socket, head)) {
      return;
    }

    if (tryDealerTimerUpgrade(request, socket, head)) {
      return;
    }

    socket.destroy();
  });

  return tournamentHub;
}
