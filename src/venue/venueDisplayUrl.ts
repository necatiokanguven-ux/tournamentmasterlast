/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type VenueDisplayUrlInfo = {
  url: string;
  host: string;
  port: number;
  path: string;
  addresses: string[];
};

export const VENUE_DISPLAY_PATH = "/display";

export async function fetchVenueDisplayUrl(): Promise<VenueDisplayUrlInfo | null> {
  try {
    const res = await fetch("/api/network/venue-display-url");
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as VenueDisplayUrlInfo;
  } catch {
    return null;
  }
}
