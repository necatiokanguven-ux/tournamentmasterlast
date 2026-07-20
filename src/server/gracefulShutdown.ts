import type { Server } from "http";
import type { TournamentRepository } from "./repository/TournamentRepository";

type ShutdownOptions = {
  httpServer: Server;
  repository: TournamentRepository;
  onShutdown?: () => void;
};

let shuttingDown = false;

export function registerGracefulShutdown(options: ShutdownOptions): void {
  const handleSignal = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    console.log(`[shutdown] Received ${signal}, closing server...`);

    options.httpServer.close(async () => {
      try {
        if ("flushPendingWrites" in options.repository && typeof options.repository.flushPendingWrites === "function") {
          await options.repository.flushPendingWrites();
        }
        if ("close" in options.repository && typeof options.repository.close === "function") {
          await options.repository.close();
        }
      } catch (error) {
        console.error("[shutdown] Error during repository cleanup", error);
      }

      options.onShutdown?.();
      console.log("[shutdown] Complete");
      process.exit(0);
    });

    setTimeout(() => {
      console.error("[shutdown] Forced exit after timeout");
      process.exit(1);
    }, 12_000).unref();
  };

  process.on("SIGTERM", handleSignal);
  process.on("SIGINT", handleSignal);
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}
