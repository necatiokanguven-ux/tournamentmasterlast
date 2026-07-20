/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type IdScanFields = {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  country: string | null;
  confidence: "high" | "medium" | "low";
};

export type GeminiStatusResponse = {
  configured: boolean;
  connected: boolean;
  message: string;
};
