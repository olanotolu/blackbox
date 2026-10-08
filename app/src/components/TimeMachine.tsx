"use client";

import { useMemo } from "react";
import { diffSnapshots } from "blackbox-engine";
import { fmt, fmtSigned } from "../lib/format";
import { deltaMap } from "../lib/graphLayout";
import { GraphView, Inspector } from "./GraphView";
import { SectionTitle } from "./chrome";
import type { SnapshotBundle } from "../lib/bundles";

interface TimeMachineProps {
  bundles: SnapshotBundle[];
  beforeKey: string;
  afterKey: string;
  onBefore: (key: string) => void;
  onAfter: (key: string) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}

export function TimeMachine(p: TimeMachineProps) {
  const before = p.bundles.find((b) => b.key === p.beforeKey) ?? p.bundles[0];
  const after = p.bundles.find((b) => b.key === p.afterKey) ?? p.bundles[p.bundles.length - 1];
  const diff = useMemo(() => diffSnapshots(before.snapshot, after.snapshot), [before, after]);
  const deltas = useMemo(() => deltaMap(diff), [diff]);
  const changed = useMemo(() => new Set(diff.changedNodes.map((c) => c.nodeId)), [diff]);
  const up = diff.gwpDelta >= 0;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <span className="note">BEFORE</span>
        {p.bundles.map((b) => (
          <button
            key={b.key}
            className={`btn btn-sm${b.key === before.key ? " btn-amber" : " btn-ghost"}`}
            onClick={() => p.onBefore(b.key)}
          >
            {b.label}
          </button>
        ))}
        <span className="note" style={{ marginLeft: 8 }}>AFTER</span>
        {p.bundles.map((b) => (
          <button
            key={b.key}
            className={`btn btn-sm${b.key === after.key ? " btn-amber" : " btn-ghost"}`}
            onClick={() => p.onAfter(b.key)}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-bd" style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div className="note">BEFORE · {before.label}</div>
            <div className="num" style={{ fontSize: 34, fontWeight: 700 }}>{fmt(diff.gwpOld, 2)}</div>
            <div className="note mono">kgCO₂e / {before.trace.declaredUnit}</div>
          </div>
          <div className="num" style={{ fontSize: 28, color: "var(--faint)" }}>→</div>
          <div>
            <div className="note">AFTER · {after.label}</div>
            <div className="num" style={{ fontSize: 34, fontWeight: 700 }}>{fmt(diff.gwpNew, 2)}</div>
            <div className="note mono">kgCO₂e / {after.trace.declaredUnit}</div>
          </div>
          <div>
            <div className="note">DELTA</div>
            <div className="num" style={{ fontSize: 34, fontWeight: 800, color: up ? "var(--red)" : "var(--green)" }}>
              {fmtSigned(diff.gwpDelta, 2)}
            </div>
            <div className="note mono">
              {diff.gwpOld !== 0 ? `${fmtSigned((diff.gwpDelta / diff.gwpOld) * 100, 1)}%` : "—"}
            </div>
          </div>
          <div style={{ marginLeft: "auto", maxWidth: 460 }}>
            <SectionTitle>What changed, in plain language</SectionTitle>
            <ul className="narrative">
              {diff.explanations.map((line, i) => (
                <li key={i} className={i === 0 ? "mono" : ""} style={i === 0 ? { color: "var(--text)", fontWeight: 600 } : undefined}>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div>
          <div className="panel-hd" style={{ border: "1px solid var(--border)", borderBottom: "none", borderRadius: "10px 10px 0 0" }}>
            GRAPH — AFTER STATE · <span style={{ color: "var(--amber)" }}>{changed.size} CHANGED NODE{changed.size === 1 ? "" : "S"}</span>
          </div>
          <GraphView
            graph={after.graph}
            trace={after.trace}
            highlights={{ changed, selected: p.selectedNodeId, deltas }}
            onNodeClick={p.onSelectNode}
            height={520}
          />
          {diff.changedNodes.length > 0 && (
            <>
              <SectionTitle>Change ledger</SectionTitle>
              <div className="panel">
                <table className="bb-table">
                  <thead>
                    <tr><th>NODE</th><th style={{ textAlign: "right" }}>BEFORE</th><th style={{ textAlign: "right" }}>AFTER</th><th style={{ textAlign: "right" }}>Δ</th></tr>
                  </thead>
                  <tbody>
                    {[...diff.changedNodes]
                      .sort((a, b) => Math.abs(b.newValue - b.oldValue) - Math.abs(a.newValue - a.oldValue))
                      .map((c) => {
                        const d = c.newValue - c.oldValue;
                        return (
                          <tr key={c.nodeId} className="clickable" onClick={() => p.onSelectNode(c.nodeId)}>
                            <td>{c.label}<div className="note mono">{c.nodeId}</div></td>
                            <td className="mono" style={{ textAlign: "right", color: "var(--faint)" }}>
                              {fmt(c.oldValue)} {c.unit}
                            </td>
                            <td className="mono" style={{ textAlign: "right", color: "var(--amber)" }}>
                              {fmt(c.newValue)} {c.unit}
                            </td>
                            <td className="mono" style={{ textAlign: "right", fontWeight: 700, color: d >= 0 ? "var(--red)" : "var(--green)" }}>
                              {fmtSigned(d)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <Inspector bundle={after} nodeId={p.selectedNodeId ?? after.trace.resultNodeId} />
      </div>
    </div>
  );
}
