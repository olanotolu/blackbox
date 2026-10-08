"use client";

import { useMemo, useState } from "react";
import { buildEvidencePacket, diffSnapshots } from "blackbox-engine";
import {
  DATASETS,
  FACILITIES,
  JEV_DECISIONS,
  PRODUCTS,
} from "blackbox-fixtures";
import { copyText, downloadJson, fmt } from "../lib/format";
import { Badge, Disclaimer, SectionTitle } from "./chrome";
import type { SnapshotBundle } from "../lib/bundles";

interface EvidencePanelProps {
  bundles: SnapshotBundle[];
  activeKey: string;
  onBundle: (key: string) => void;
}

export function EvidencePanel(p: EvidencePanelProps) {
  const bundle = p.bundles.find((b) => b.key === p.activeKey) ?? p.bundles[p.bundles.length - 1];
  const product = PRODUCTS.find((x) => x.id === bundle.productId)!;
  const facility = FACILITIES.find((f) => f.id === product.facilityId)!;
  const [copied, setCopied] = useState(false);
  const [showTrace, setShowTrace] = useState(false);

  const diff = useMemo(() => {
    const idx = p.bundles.findIndex((b) => b.key === bundle.key);
    if (idx <= 0) return undefined;
    try {
      return diffSnapshots(p.bundles[idx - 1].snapshot, bundle.snapshot);
    } catch {
      return undefined;
    }
  }, [p.bundles, bundle]);

  const packet = useMemo(
    () =>
      buildEvidencePacket({
        snapshot: bundle.snapshot,
        trace: bundle.trace,
        diff,
        faults: [],
        jevDecisions: JEV_DECISIONS,
        datasets: DATASETS,
      }),
    [bundle, diff],
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <span className="note">PACKET SOURCE SNAPSHOT</span>
        {p.bundles.map((b) => (
          <button
            key={b.key}
            className={`btn btn-sm${b.key === bundle.key ? " btn-amber" : " btn-ghost"}`}
            onClick={() => p.onBundle(b.key)}
          >
            {b.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }} className="no-print">
          <button className="btn btn-sm" onClick={() => downloadJson(`${packet.packetId}.json`, packet)}>
            ⤓ DOWNLOAD PACKET (JSON)
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => window.print()}>
            ⎙ PRINT
          </button>
        </span>
      </div>

      <div id="packet-print">
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-hd">
            EVIDENCE PACKET · <span className="mono">{packet.packetId}</span>
            <Badge tone="green">INVESTIGATION ARTIFACT</Badge>
          </div>
          <div className="panel-bd">
            <dl className="kv">
              <dt>PRODUCT</dt><dd>{product.name}</dd>
              <dt>FACILITY</dt><dd>{facility.name}</dd>
              <dt>SNAPSHOT</dt><dd className="mono">{packet.snapshotId} · graph v{bundle.snapshot.graphVersion}</dd>
              <dt>RESULT</dt>
              <dd className="num" style={{ fontSize: 20, fontWeight: 800, color: "var(--amber)" }}>
                {fmt(bundle.snapshot.gwp, 2)} kgCO₂e / {bundle.trace.declaredUnit}
              </dd>
              <dt>GENERATED</dt><dd className="mono">{packet.generatedAt}</dd>
            </dl>
            <SectionTitle>Reproducibility hash (pinned)</SectionTitle>
            <div className="hashbox">
              <span>{packet.reproHash}</span>
              <button
                className="btn btn-sm btn-ghost no-print"
                onClick={async () => {
                  const ok = await copyText(packet.reproHash);
                  setCopied(ok);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "✓ COPIED" : "COPY"}
              </button>
            </div>
            <div className="note" style={{ marginTop: 6 }}>
              SHA-256 over the canonical graph + dataset references. Any party can recompute it
              from the same inputs — identical inputs reproduce this hash exactly.
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-hd">DATASET REFERENCES ({packet.datasets.length})</div>
          <div className="panel-bd">
            <table className="bb-table">
              <thead><tr><th>DATASET</th><th>NAME</th><th>VALID FROM</th><th>VALID TO</th></tr></thead>
              <tbody>
                {packet.datasets.map((d) => (
                  <tr key={`${d.id}@${d.version}`}>
                    <td className="mono" style={{ color: "var(--violet)" }}>{d.id}@{d.version}</td>
                    <td>{d.name}</td>
                    <td className="mono">{d.validFrom}</td>
                    <td className="mono">{d.validTo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {packet.diff && (
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-hd">BEFORE / AFTER DIFF</div>
            <div className="panel-bd">
              <div className="mono" style={{ fontSize: 12, marginBottom: 4 }}>
                {packet.diff.fromSnapshot} → {packet.diff.toSnapshot} · Δ{" "}
                <b style={{ color: packet.diff.gwpDelta >= 0 ? "var(--red)" : "var(--green)" }}>
                  {fmt(packet.diff.gwpDelta, 2)}
                </b> kgCO₂e
              </div>
              <ul className="narrative">
                {packet.diff.explanations.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-hd">
            CALCULATION TRACE ({packet.trace.steps.length} NODES)
            <button className="btn btn-sm btn-ghost no-print" onClick={() => setShowTrace((v) => !v)}>
              {showTrace ? "HIDE" : "SHOW"}
            </button>
          </div>
          {showTrace && (
            <div className="panel-bd">
              <table className="bb-table">
                <thead>
                  <tr><th>NODE</th><th>FORMULA</th><th style={{ textAlign: "right" }}>KGCO₂E</th></tr>
                </thead>
                <tbody>
                  {[...packet.trace.steps]
                    .sort((a, b) => (b.contributionKgco2e ?? 0) - (a.contributionKgco2e ?? 0))
                    .map((s) => (
                      <tr key={s.nodeId}>
                        <td>{s.label}<div className="note mono">{s.kind}</div></td>
                        <td className="mono" style={{ fontSize: 11, color: "var(--cyan)" }}>{s.formula}</td>
                        <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>
                          {s.contributionKgco2e !== null ? fmt(s.contributionKgco2e) : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {packet.jevDecisions.length > 0 && (
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-hd">
              BOUNDED-JUDGMENT RECORDS ({packet.jevDecisions.length}) · ILLUSTRATIVE
            </div>
            <div className="panel-bd">
              {packet.jevDecisions.map((j) => (
                <div key={j.id} className="issue info" style={{ marginBottom: 8 }}>
                  <div className="code">{j.id} · {j.workflow} · {j.fallback ? "DETERMINISTIC FALLBACK" : "JEV API"}</div>
                  <div className="msg">
                    {j.subject.faultType} on <span className="mono">{j.subject.nodeId}</span> →{" "}
                    <b>{j.selected.taxonomy}</b> · queue <b>{j.selected.queue}</b> · urgency <b>{j.selected.urgency}</b>
                  </div>
                  <div className="note" style={{ marginTop: 4 }}>{j.rationale}</div>
                </div>
              ))}
              <div className="note">
                Judgment routes and prioritizes human review only — it never alters numbers,
                evidence, or validator verdicts.
              </div>
            </div>
          </div>
        )}

        {bundle.snapshot.warnings.length > 0 && (
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-hd">WARNINGS ({bundle.snapshot.warnings.length})</div>
            <div className="panel-bd">
              {bundle.snapshot.warnings.map((w, i) => (
                <div key={i} className="issue warning"><div className="msg">{w}</div></div>
              ))}
            </div>
          </div>
        )}

        <div className="panel">
          <div className="panel-hd">DISCLAIMER — FIXED TEXT</div>
          <div className="panel-bd note">{packet.disclaimer}</div>
        </div>
        <div className="no-print"><Disclaimer /></div>
      </div>
    </div>
  );
}
