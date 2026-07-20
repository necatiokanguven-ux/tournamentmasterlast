import type { Request, Response } from "express";

export function buildTrackingPlayersEtag(metaVersion: number): string {
  return `W/"players-${metaVersion}"`;
}

/** ETag + 304 for tracking read endpoints (players only — live always returns a fresh body). */
export function sendTrackingJsonWithEtag(
  req: Request,
  res: Response,
  etag: string,
  body: unknown,
): void {
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "private, no-cache");

  const ifNoneMatch = req.headers["if-none-match"];
  if (typeof ifNoneMatch === "string" && ifNoneMatch === etag) {
    res.status(304).end();
    return;
  }

  res.json(body);
}
