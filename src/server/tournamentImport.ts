import { parseTournamentBackup } from "../tournament/tournamentBackup";
import { bumpDatabaseMeta, normalizeDatabase, type TournamentDatabase } from "./tournamentDatabase";

export function buildDatabaseFromTournamentBackup(raw: unknown): { ok: true; db: TournamentDatabase } | { ok: false; error: string } {
  const parsed = parseTournamentBackup(raw);
  if (parsed.ok === false) {
    return { ok: false as const, error: parsed.error };
  }

  const db = normalizeDatabase({
    ...parsed.data,
    meta: { lastModified: Date.now() },
  });
  bumpDatabaseMeta(db);

  return { ok: true as const, db };
}
