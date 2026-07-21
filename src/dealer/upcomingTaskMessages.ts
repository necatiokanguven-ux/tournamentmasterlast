import type { DealerNotification, UpcomingTaskKind } from "../server/dealerRotation/types";

export function formatUpcomingTaskMessage(
  taskKind: UpcomingTaskKind,
  tableNumber: number | null,
): string {
  switch (taskKind) {
    case "table_deal":
      return tableNumber != null
        ? `In 2 minutes: Table ${tableNumber} deal`
        : "In 2 minutes: table deal assignment";
    case "return_to_table":
      return tableNumber != null
        ? `In 2 minutes: return to Table ${tableNumber}`
        : "In 2 minutes: return to your table";
    case "rotation_end":
      return tableNumber != null
        ? `In 2 minutes: Table ${tableNumber} rotation ends — break lounge`
        : "In 2 minutes: rotation ends — break lounge";
    default:
      return "In 2 minutes: upcoming task";
  }
}

export function formatUpcomingTaskBanner(
  note: Pick<DealerNotification, "message" | "tableNumber" | "taskKind">,
): string {
  if (note.taskKind) {
    return formatUpcomingTaskMessage(note.taskKind, note.tableNumber);
  }
  return note.message;
}
