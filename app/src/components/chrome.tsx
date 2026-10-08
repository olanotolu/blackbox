"use client";

import {
  FACILITIES,
  PRODUCTS,
  PRODUCT_VERSIONS,
  SYNTHETIC_LABEL,
} from "blackbox-fixtures";
import { fmt } from "../lib/format";
import { bundlesForProduct, type SnapshotBundle } from "../lib/bundles";

export type TabId = "explorer" | "time" | "fault" | "expiry" | "evidence";

export const TABS: { id: TabId; label: string }[] = [
  { id: "explorer", label: "EXPLORER" },
  { id: "time", label: "TIME MACHINE" },
  { id: "fault", label: "FAULT LAB" },
  { id: "expiry", label: "EXPIRY BOARD" },
  { id: "evidence", label: "EVIDENCE PACKET" },
];

export function Badge({
  tone,
  children,
}: {
  tone?: "amber" | "cyan" | "red" | "green" | "violet";
  children: React.ReactNode;
}) {
  return (
    <span className={`badge${tone ? ` badge-${tone}` : ""}`}>
      <span className="dot" />
      {children}
    </span>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="section-title">{children}</div>;
}

export function Disclaimer() {
  return (
    <div className="disclaimer">
      {SYNTHETIC_LABEL} No real manufacturer data is shown anywhere in this demo.
      Figures are illustrative outputs of a simplified model — not an ISO-compliant LCA,
      not a verified EPD, and not a claim of regulatory compliance.
    </div>
  );
}

interface HeaderProps {
  facilityId: string;
  productId: string;
  bundle: SnapshotBundle;
  tab: TabId;
  onTab: (t: TabId) => void;
  onFacility: (id: string) => void;
  onProduct: (id: string) => void;
  onExplain: () => void;
  explainPulse: number;
  faultActive: boolean;
}

export function Header(p: HeaderProps) {
  const facility = FACILITIES.find((f) => f.id === p.facilityId)!;
  const product = PRODUCTS.find((x) => x.id === p.productId)!;
  const products = PRODUCTS.filter((x) => x.facilityId === p.facilityId);
  const bundles = bundlesForProduct(p.productId);
  const currentVersion = PRODUCT_VERSIONS[p.productId]?.currentVersion;
  const warnings = p.bundle.snapshot.warnings.length;

  return (
    <>
      <div className="bb-topbar no-print">
        <div className="bb-brand">
          <div className="bb-logo">◈</div>
          <div>
            <h1>BLACKBOX</h1>
            <div className="sub">CALCULATION FORENSICS · SYNTHETIC DEMO</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginLeft: 12 }}>
          <select
            className="bb-select"
            value={p.facilityId}
            onChange={(e) => p.onFacility(e.target.value)}
            aria-label="Facility"
          >
            {FACILITIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} — {f.location}
              </option>
            ))}
          </select>
          <select
            className="bb-select"
            value={p.productId}
            onChange={(e) => p.onProduct(e.target.value)}
            aria-label="Product"
          >
            {products.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Badge tone="violet">SYNTHETIC</Badge>
        </div>
      </div>

      <div className={`hero no-print${p.explainPulse ? " flash" : ""}`} key={p.explainPulse || "h"}>
        <div className="hero-gwp">
          <div className="value num">{fmt(p.bundle.snapshot.gwp, 2)}</div>
          <div className="unit">
            kgCO₂e / {p.bundle.trace.declaredUnit} · {product.name}
            <br />
            {facility.name} · {p.bundle.label}
          </div>
        </div>
        <div className="hero-meta">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge tone="green">EVALUATED · {p.bundle.trace.steps.length} traced nodes</Badge>
            {currentVersion && <Badge tone="cyan">CURRENT: {currentVersion.toUpperCase()}</Badge>}
          </div>
          <div className="mono" style={{ fontSize: 11 }}>
            repro <span style={{ color: "var(--cyan)" }}>{p.bundle.snapshot.reproHash.slice(0, 16)}…</span>
            {" · "}{bundles.length} snapshot{bundles.length > 1 ? "s" : ""} on record
          </div>
          {warnings > 0 && (
            <div className="mono" style={{ fontSize: 11, color: "var(--amber)" }}>
              ⚠ {warnings} heuristic warning{warnings === 1 ? "" : "s"} (see explorer)
            </div>
          )}
        </div>
        <div className="hero-actions">
          <button className="btn btn-amber" onClick={p.onExplain}>
            ◉ EXPLAIN THIS RESULT
          </button>
          <div className="note">expands the full calculation trace</div>
        </div>
      </div>

      <nav className="bb-tabs no-print">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`bb-tab${p.tab === t.id ? " active" : ""}`}
            onClick={() => p.onTab(t.id)}
          >
            {t.label}
            {t.id === "fault" && p.faultActive && (
              <span className="count" style={{ color: "var(--red)" }}>1</span>
            )}
          </button>
        ))}
      </nav>
    </>
  );
}
