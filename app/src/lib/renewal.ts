/**
 * EPD renewal-priority semantics — DATA_CONTRACT.md §12, ported to the
 * canonical EpdRecord shape.
 *
 * score = expiry (40/30/20/0) + evidence (10/missing, 5/stale, cap 35)
 *       + drift (8/flag, cap 25). Always shown decomposed — a single opaque
 * number would be exactly the kind of unexplained figure BLACKBOX exists
 * to kill.
 */
import type { EpdRecord } from "blackbox-engine";

export type EpdStatus = "valid" | "expiring_soon" | "expired";

export interface EpdRisk {
  status: EpdStatus;
  daysLeft: number;
  label: string;
}

const DAY_MS = 86_400_000;

/** App-level drift annotations (demo): what changed since issuance. */
export const DRIFT_FLAGS: Record<string, string[]> = {
  "epd-hv-cx30-2021": ["cement supplier switch (A → B)", "grid factor update (egrid-ny v2023)"],
  "epd-rv-std40-2021": ["admixture reformulation"],
};

export function epdRisk(rec: EpdRecord, nowIso: string): EpdRisk {
  const daysLeft = Math.floor((Date.parse(rec.expiryDate) - Date.parse(nowIso)) / DAY_MS);
  if (daysLeft < 0) return { status: "expired", daysLeft, label: `Expired ${-daysLeft}d ago` };
  if (daysLeft <= 180) return { status: "expiring_soon", daysLeft, label: `Expires in ${daysLeft}d` };
  return { status: "valid", daysLeft, label: `Valid ${daysLeft}d` };
}

export interface RenewalScore {
  total: number;
  expiry: number;
  evidence: number;
  drift: number;
  reasons: string[];
}

export function renewalScore(rec: EpdRecord, nowIso: string): RenewalScore {
  const risk = epdRisk(rec, nowIso);
  const reasons: string[] = [];

  let expiry = 0;
  if (risk.status === "expired") { expiry = 40; reasons.push("expired (+40)"); }
  else if (risk.daysLeft <= 90) { expiry = 30; reasons.push(`expires in ${risk.daysLeft}d (+30)`); }
  else if (risk.daysLeft <= 180) { expiry = 20; reasons.push(`expires in ${risk.daysLeft}d (+20)`); }

  const missing = rec.evidence.filter((e) => e.status === "missing").length;
  const stale = rec.evidence.filter((e) => e.status === "stale").length;
  const evidence = Math.min(35, missing * 10 + stale * 5);
  if (missing) reasons.push(`${missing} missing evidence item(s) (+${missing * 10})`);
  if (stale) reasons.push(`${stale} stale evidence item(s) (+${stale * 5})`);

  const flags = DRIFT_FLAGS[rec.id] ?? [];
  const drift = Math.min(25, flags.length * 8);
  if (flags.length) reasons.push(`${flags.length} drift flag(s) since issuance (+${flags.length * 8})`);

  if (!reasons.length) reasons.push("no risk factors — record is healthy");
  return { total: expiry + evidence + drift, expiry, evidence, drift, reasons };
}

/** Sort records by renewal urgency: expired first, then score desc. */
export function sortByRenewal(records: EpdRecord[], nowIso: string): EpdRecord[] {
  const rank: Record<EpdStatus, number> = { expired: 0, expiring_soon: 1, valid: 2 };
  return [...records].sort((a, b) => {
    const ra = epdRisk(a, nowIso);
    const rb = epdRisk(b, nowIso);
    if (rank[ra.status] !== rank[rb.status]) return rank[ra.status] - rank[rb.status];
    return renewalScore(b, nowIso).total - renewalScore(a, nowIso).total;
  });
}
