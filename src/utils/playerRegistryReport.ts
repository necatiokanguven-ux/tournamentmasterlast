/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HistoryEvent, Player, Table } from "../types";
import { normalizeCountryValue, parseCountryValue } from "./countryFlags";

export function resolveTableNumber(
  tableId: string | null | undefined,
  tables: Pick<Table, "id" | "number">[],
): number | null {
  if (!tableId) return null;
  return tables.find((table) => table.id === tableId)?.number ?? null;
}

export function formatPlayerTableSeat(
  player: Pick<Player, "tableId" | "seatIndex">,
  tables: Pick<Table, "id" | "number">[],
  style: "compact" | "slash" = "compact",
): string {
  if (!player.tableId) return "Unseated";

  const tableNumber = resolveTableNumber(player.tableId, tables);
  if (tableNumber === null) return "Unseated";

  const seat = player.seatIndex !== null ? player.seatIndex + 1 : "—";
  if (style === "slash") {
    return `Table ${tableNumber} / Seat ${seat}`;
  }
  return `Table ${tableNumber} (Seat ${seat})`;
}

export function formatPlayerStatusDisplay(status: string): string {
  return status.toUpperCase();
}

export function formatPlayerNameDisplay(name: string): string {
  return name.trim().toLocaleUpperCase("tr-TR");
}

export function playerFullNameRaw(player: Player): string {
  return `${player.firstName} ${player.lastName}`;
}

export function playerFullName(player: Player): string {
  return formatPlayerNameDisplay(playerFullNameRaw(player));
}

export function getEventsForPlayer(history: HistoryEvent[], player: Player): HistoryEvent[] {
  const name = playerFullNameRaw(player);
  const nameUpper = name.toUpperCase();
  return history.filter(
    (event) =>
      event.playerId === player.id ||
      (event.playerName != null &&
        (event.playerName === name || event.playerName.toUpperCase() === nameUpper)),
  );
}

export function formatEventLine(event: HistoryEvent): string {
  const timestamp = new Date(event.timestamp).toLocaleString();
  return `[${timestamp}] ${event.type.toUpperCase()}: ${event.description}`;
}

export function sortPlayersForReport(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
    const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function exportPlayerRegistryCsv(
  players: Player[],
  history: HistoryEvent[],
  tournamentName: string,
  tables: Pick<Table, "id" | "number">[],
): void {
  const sorted = sortPlayersForReport(players);
  let csv = "\uFEFF";
  csv += `${csvEscape("Tournament")},${csvEscape(tournamentName)}\n`;
  csv += `${csvEscape("Generated")},${csvEscape(new Date().toLocaleString())}\n\n`;

  csv += "PLAYER REGISTRY\n";
  csv +=
    "Name,Nickname,Country,Phone,Birth Date,Status,Rebuys,Re-entries,Addons,Table,Seat,Registered At,Notes\n";

  for (const player of sorted) {
    const tableNumber = resolveTableNumber(player.tableId, tables);
    const table = tableNumber !== null ? String(tableNumber) : "";
    const seat = player.seatIndex !== null ? String(player.seatIndex + 1) : "";
    csv += [
      csvEscape(playerFullName(player)),
      csvEscape(formatPlayerNameDisplay(player.nickname || "")),
      csvEscape(normalizeCountryValue(player.country)),
      csvEscape(player.phone || ""),
      csvEscape(player.birthDate || ""),
      csvEscape(formatPlayerStatusDisplay(player.status)),
      player.rebuys,
      player.reentries,
      player.addons,
      csvEscape(table),
      csvEscape(seat),
      csvEscape(new Date(player.registeredAt).toLocaleString()),
      csvEscape(player.notes || ""),
    ].join(",") + "\n";
  }

  csv += "\nTOURNAMENT ACTIVITY BY PLAYER\n";
  csv += "Player,Timestamp,Type,Description\n";

  for (const player of sorted) {
    const events = getEventsForPlayer(history, player).slice().reverse();
    for (const event of events) {
      csv += [
        csvEscape(playerFullName(player)),
        csvEscape(new Date(event.timestamp).toLocaleString()),
        csvEscape(event.type),
        csvEscape(event.description),
      ].join(",") + "\n";
    }
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `player_registry_${Date.now()}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCountryHtml(country: string): string {
  if (!country?.trim()) {
    return "—";
  }

  const { code, displayName } = parseCountryValue(country);
  if (!code) {
    return htmlEscape(displayName || country);
  }

  const flagUrl = `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
  return `<span style="display:inline-flex;align-items:center;gap:6px;"><img src="${flagUrl}" width="20" height="15" alt="" style="vertical-align:middle;" />${htmlEscape(displayName)}</span>`;
}

function buildPlayerRegistryPrintHtml(
  players: Player[],
  history: HistoryEvent[],
  tournamentName: string,
  generatedAt: string,
  tables: Pick<Table, "id" | "number">[],
): string {
  const playerRows = players
    .map((player, index) => {
      const tableSeat = formatPlayerTableSeat(player, tables, "slash");

      return `<tr>
        <td>${index + 1}</td>
        <td><strong>${htmlEscape(playerFullName(player))}</strong></td>
        <td>${player.nickname ? htmlEscape(formatPlayerNameDisplay(player.nickname)) : "—"}</td>
        <td>${formatCountryHtml(player.country)}</td>
        <td>${htmlEscape(player.phone || "—")}</td>
        <td>${htmlEscape(player.birthDate || "—")}</td>
        <td><strong>${htmlEscape(formatPlayerStatusDisplay(player.status))}</strong></td>
        <td style="text-align:center;">${player.rebuys}</td>
        <td style="text-align:center;">${player.reentries}</td>
        <td style="text-align:center;">${player.addons}</td>
        <td>${htmlEscape(tableSeat)}</td>
        <td style="white-space:nowrap;">${htmlEscape(new Date(player.registeredAt).toLocaleString())}</td>
        <td>${htmlEscape(player.notes || "—")}</td>
      </tr>`;
    })
    .join("");

  const activityBlocks = players
    .map((player) => {
      const events = getEventsForPlayer(history, player);
      if (events.length === 0) {
        return "";
      }

      const eventItems = events
        .map((event) => `<li>${htmlEscape(formatEventLine(event))}</li>`)
        .join("");

      return `<div class="activity-block">
        <p class="activity-title">${htmlEscape(playerFullName(player))}
          <span class="activity-count">(${events.length} event${events.length !== 1 ? "s" : ""})</span>
        </p>
        <ul class="activity-list">${eventItems}</ul>
      </div>`;
    })
    .filter(Boolean)
    .join("");

  const activitySection =
    activityBlocks ||
    '<p class="empty-note">No tournament activity recorded yet.</p>';

  const emptyPlayersRow =
    players.length === 0
      ? '<tr><td colspan="13" class="empty-note">No players registered.</td></tr>'
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${htmlEscape(tournamentName)} — Player Registry</title>
  <style>
    @page { margin: 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px 32px;
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report-header {
      text-align: center;
      border-bottom: 2px solid #000;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .report-header h1 {
      margin: 0 0 8px;
      font-size: 22px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .report-header p {
      margin: 4px 0;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .report-header .generated {
      font-size: 10px;
      text-transform: none;
      letter-spacing: normal;
      color: #444;
    }
    section { margin-bottom: 28px; }
    h2 {
      margin: 0 0 12px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      border-bottom: 1px solid #000;
      padding-bottom: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    th, td {
      border-bottom: 1px solid #ddd;
      padding: 6px 8px 6px 0;
      text-align: left;
      vertical-align: top;
    }
    th {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border-bottom: 1px solid #000;
    }
    tr { page-break-inside: avoid; }
    .activity-block {
      border: 1px solid #ccc;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 12px;
      page-break-inside: avoid;
    }
    .activity-title {
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .activity-count {
      font-size: 10px;
      font-weight: 400;
      font-family: monospace;
    }
    .activity-list {
      margin: 0;
      padding-left: 18px;
      font-family: monospace;
      font-size: 10px;
    }
    .activity-list li { margin-bottom: 4px; }
    .empty-note {
      text-align: center;
      padding: 24px 0;
      font-weight: 700;
      text-transform: uppercase;
      color: #555;
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>${htmlEscape(tournamentName)}</h1>
    <p><strong>Player Registry &amp; Tournament Activity Report</strong></p>
    <p class="generated">Generated ${htmlEscape(generatedAt)}</p>
  </div>

  <section>
    <h2>Player Registry (${players.length})</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th>Nickname</th>
          <th>Country</th>
          <th>Phone</th>
          <th>Birth Date</th>
          <th>Status</th>
          <th style="text-align:center;">Rebuys</th>
          <th style="text-align:center;">Re-entries</th>
          <th style="text-align:center;">Add-ons</th>
          <th>Table / Seat</th>
          <th>Registered</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${playerRows}
        ${emptyPlayersRow}
      </tbody>
    </table>
  </section>

  <section>
    <h2>Tournament Activity Log</h2>
    ${activitySection}
  </section>
</body>
</html>`;
}

export function openPlayerRegistryPrintWindow(
  players: Player[],
  history: HistoryEvent[],
  tournamentName: string,
  tables: Pick<Table, "id" | "number">[],
): void {
  const sorted = sortPlayersForReport(players);
  const generatedAt = new Date().toLocaleString();
  const html = buildPlayerRegistryPrintHtml(sorted, history, tournamentName, generatedAt, tables);

  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1200,height=900");
  if (!printWindow) {
    window.alert("Pop-up blocked. Please allow pop-ups for this site to export PDF.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  const triggerPrint = () => {
    printWindow.focus();
    printWindow.print();
    printWindow.addEventListener(
      "afterprint",
      () => {
        printWindow.close();
      },
      { once: true },
    );
  };

  if (printWindow.document.readyState === "complete") {
    window.setTimeout(triggerPrint, 300);
  } else {
    printWindow.onload = () => window.setTimeout(triggerPrint, 300);
  }
}
