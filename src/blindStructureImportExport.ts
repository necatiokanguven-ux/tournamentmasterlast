/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from "xlsx";
import { BlindLevel } from "./types";

const HEADER_ALIASES: Record<string, keyof BlindLevel | "type"> = {
  level: "level",
  "level no": "level",
  "level #": "level",
  sb: "smallBlind",
  "small blind": "smallBlind",
  "small": "smallBlind",
  bb: "bigBlind",
  "big blind": "bigBlind",
  "big": "bigBlind",
  ante: "ante",
  duration: "duration",
  time: "duration",
  minutes: "duration",
  min: "duration",
  "duration (min)": "duration",
  type: "type",
  break: "type",
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isBreakRow(row: Record<string, unknown>, mapped: Partial<Record<keyof BlindLevel | "type", unknown>>): boolean {
  const typeValue = String(mapped.type ?? row.type ?? "").trim().toLowerCase();
  if (["break", "pause"].includes(typeValue)) return true;
  if (typeValue === "level") return false;

  const sb = parseNumber(mapped.smallBlind);
  const bb = parseNumber(mapped.bigBlind);
  if (sb === 0 && bb === 0) return true;

  return false;
}

function mapRow(headers: string[], row: unknown[]): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  headers.forEach((header, index) => {
    const field = HEADER_ALIASES[normalizeHeader(header)];
    if (field) {
      mapped[field] = row[index];
    }
  });
  return mapped;
}

export function parseBlindStructureRows(rows: unknown[][]): BlindLevel[] {
  if (!rows.length) {
    throw new Error("The file is empty.");
  }

  let headerIndex = rows.findIndex((row) =>
    Array.isArray(row) &&
    row.some((cell) => HEADER_ALIASES[normalizeHeader(cell)] !== undefined),
  );

  if (headerIndex === -1) {
    throw new Error(
      "Could not find a header row. Expected columns such as Level, Small Blind, Big Blind, Ante, Duration, Type.",
    );
  }

  const headers = (rows[headerIndex] as unknown[]).map((cell) => String(cell ?? ""));
  const dataRows = rows.slice(headerIndex + 1).filter((row) =>
    Array.isArray(row) && row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""),
  );

  if (dataRows.length === 0) {
    throw new Error("No blind levels found below the header row.");
  }

  const structure: BlindLevel[] = [];
  let levelCounter = 0;

  for (const row of dataRows) {
    const mapped = mapRow(headers, row as unknown[]);
    const duration = parseNumber(mapped.duration, 20);
    const isBreak = isBreakRow(mapped, mapped);

    if (isBreak) {
      structure.push({
        level: levelCounter,
        smallBlind: 0,
        bigBlind: 0,
        ante: 0,
        duration: duration > 0 ? duration : 15,
        isBreak: true,
      });
      continue;
    }

    levelCounter += 1;
    structure.push({
      level: parseNumber(mapped.level, levelCounter),
      smallBlind: parseNumber(mapped.smallBlind),
      bigBlind: parseNumber(mapped.bigBlind),
      ante: parseNumber(mapped.ante),
      duration: duration > 0 ? duration : 20,
      isBreak: false,
    });
  }

  if (structure.length === 0) {
    throw new Error("No valid blind levels could be parsed.");
  }

  return structure;
}

export async function importBlindStructureFromFile(file: File): Promise<BlindLevel[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) {
    throw new Error("No worksheet found in the file.");
  }

  const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" }) as unknown[][];
  return parseBlindStructureRows(rows);
}

export function exportBlindStructureToExcel(structure: BlindLevel[], tournamentName: string) {
  const rows: (string | number)[][] = [
    ["Level", "Small Blind", "Big Blind", "Ante", "Duration (min)", "Type"],
  ];

  for (const level of structure) {
    if (level.isBreak) {
      rows.push(["", "", "", "", level.duration, "Break"]);
    } else {
      rows.push([
        level.level,
        level.smallBlind,
        level.bigBlind,
        level.ante,
        level.duration,
        "Level",
      ]);
    }
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [{ wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Blind Structure");

  const safeName = (tournamentName || "blind-structure").replace(/[^\w\-]+/g, "_");
  XLSX.writeFile(workbook, `${safeName}_blind_structure.xlsx`);
}
