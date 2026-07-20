import type { Table } from "../types";
import type { DealerTableState } from "./useDealerControl";

/** Live dealer-control rows follow Tables menu — only opened tournament tables appear. */
export function syncDealerControlTablesWithTournament(
  tournamentTables: Table[],
  dealerTables: DealerTableState[],
  rotationEnabled: boolean,
): DealerTableState[] {
  const dealerById = new Map(dealerTables.map(row => [row.id, row]));

  return tournamentTables.map(table => {
    const row = dealerById.get(table.id);
    if (row) return row;

    return {
      id: table.id,
      number: table.number,
      dealerId: null,
      dealerName: null,
      dealerState: null,
      currentTableDealSeconds: 0,
      rotationRemainingSeconds: null,
      needsDealer: rotationEnabled,
    };
  });
}
