import { GoogleGenAI } from "@google/genai";

export type IdScanFields = {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  country: string | null;
  confidence: "high" | "medium" | "low";
};

const SCAN_PROMPT = `You are reading a government ID card or passport from a photo for tournament player registration.
Extract ONLY these fields when clearly visible:
- firstName
- lastName
- birthDate (YYYY-MM-DD)
- country (nationality in English, e.g. Turkey, Germany, United States)

Rules:
- Return ONLY valid JSON with keys: firstName, lastName, birthDate, country, confidence
- confidence must be "high", "medium", or "low"
- Do NOT return national ID numbers, passport numbers, TC numbers, serial numbers, or document photos
- If birthDate or country is unreadable, use null
- If Turkish national ID card (no explicit country text), use country "Turkey"
- Use Latin script for names when possible
- Do not invent data`;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function normalizeBirthDate(value: unknown): string | null {
  if (value == null || value === "") {
    return null;
  }

  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return raw;
  }

  const trMatch = raw.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (trMatch) {
    return `${trMatch[3]}-${trMatch[2]}-${trMatch[1]}`;
  }

  return null;
}

function normalizeCountry(value: unknown): string | null {
  if (value == null || value === "") {
    return null;
  }

  const raw = String(value).trim();
  return raw || null;
}

export function resolveGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key || null;
}

export function resolveGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite";
}

export async function scanIdCardFromImage(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
): Promise<IdScanFields> {
  const normalizedMime = mimeType.toLowerCase();
  if (!ALLOWED_MIME.has(normalizedMime)) {
    throw new Error("UNSUPPORTED_IMAGE_TYPE");
  }

  const raw = imageBase64.includes(",") ? imageBase64.split(",")[1]! : imageBase64;
  if (!raw || raw.length > 6_000_000) {
    throw new Error("IMAGE_TOO_LARGE");
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: resolveGeminiModel(),
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: normalizedMime, data: raw } },
          { text: SCAN_PROMPT },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error("EMPTY_GEMINI_RESPONSE");
  }

  let parsed: Partial<IdScanFields>;
  try {
    parsed = JSON.parse(text) as Partial<IdScanFields>;
  } catch {
    throw new Error("INVALID_GEMINI_JSON");
  }

  const firstName = String(parsed.firstName ?? "").trim();
  const lastName = String(parsed.lastName ?? "").trim();
  if (!firstName || !lastName) {
    throw new Error("INCOMPLETE_ID_READ");
  }

  return {
    firstName,
    lastName,
    birthDate: normalizeBirthDate(parsed.birthDate),
    country: normalizeCountry(parsed.country),
    confidence:
      parsed.confidence === "high" || parsed.confidence === "low"
        ? parsed.confidence
        : "medium",
  };
}

export async function probeGeminiConnection(apiKey: string): Promise<boolean> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: resolveGeminiModel(),
    contents: "Reply with exactly: ok",
    config: {
      temperature: 0,
      maxOutputTokens: 8,
    },
  });

  return Boolean(response.text?.trim());
}
