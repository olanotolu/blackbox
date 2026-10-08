"use client";

import { useMemo } from "react";
import { validateGraph, DEFAULT_UNITS, type ValidationIssue } from "blackbox-engine";
import { fmt } from "../lib/format";
import { GraphView, Inspector } from "./GraphView";
import { Badge, SectionTitle } from "./chrome";
import type { SnapshotBundle } from "../lib/bundles";

interface ExplorerProps {
  bundle: SnapshotBundle;
  bundles: SnapshotBundle[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  onBundle: (key: string) => void;
}

export function Explorer(p: ExplorerProps) {
  const issues: ValidationIssue[] = useMemo(
    () => validateGraph(p.bundle.graph, DEFAULT_UNITS),
    [p.bundle],
  );
  const errors = issues.filter((i) => i.severity === "error").length;
  const resultId = p.bundle.trace.resultNodeId;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <span className="note">SNAPSHOT</span>
        {p.bundles.map((b) => (
          <button
            key={b.key}
            className={`btn btn-sm${b.key === p.bundle.key ? " btn-amber" : " btn-ghost"}`}
            onClick={() => p.onBundle(b.key)}
          >
            {b.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {errors === 0 ? (
            <Badge tone="green">✓ STRUCTURE VALID — {issues.length} warning{issues.length === 1 ? "" : "s"}</Badge>
          ) : (
            <Badge tone="red">✕ {errors} ERROR{errors === 1 ? "" : "S"}</Badge>
          )}
          <span className="mono note">repro {p.bundle.snapshot.reproHash.slice(0, 12)}</span>
        </span>
      </div>

      <div className="grid-2">
        <div>
          <GraphView
            graph={p.bundle.graph}
            trace={p.bundle.trace}
            highlights={{ selected: p.selectedNodeId ?? resultId }}
            onNodeClick={p.onSelectNode}
          />
          <div className="note" style={{ marginTop: 8 }}>
            Upstream → downstream flow · <span style={{ color: "var(--amber)" }}>solid amber</span> = applies_factor (flow × factor into GWP) ·
            dashed = consumes topology · click any node to inspect.
          </div>
          {p.bundle.trace.warnings.length > 0 && (
            <>
              <SectionTitle>Heuristic warnings ({p.bundle.trace.warnings.length})</SectionTitle>
              {p.bundle.trace.warnings.map((w, i) => (
                <div key={i} className="issue warning">
                  <div className="msg">{w}</div>
                </div>
              ))}
            </>
          )}
          {issues.length > 0 && (
            <>
              <SectionTitle>Structural validation ({issues.length})</SectionTitle>
              {issues.map((iss, i) => (
                <div key={i} className={`issue ${iss.severity === "error" ? "blocker" : "warning"}`}>
                  <div className="code">{iss.code}{iss.nodeId ? ` · ${iss.nodeId}` : ""}{iss.edgeId ? ` · ${iss.edgeId}` : ""}</div>
                  <div className="msg">{iss.message}</div>
                </div>
              ))}
            </>
          )}
        </div>
        <Inspector bundle={p.bundle} nodeId={p.selectedNodeId ?? resultId} issues={issues} />
      </div>

      <SectionTitle>Full calculation trace — every node, machine-verified</SectionTitle>
      <div className="panel">
        <div style={{ overflowX: "auto" }}>
          <table className="bb-table">
            <thead>
              <tr>
                <th>NODE</th><th>KIND</th><th>DATASET</th>
                <th style={{ textAlign: "right" }}>VALUE</th>
                <th style={{ textAlign: "right" }}>KGCO₂E</th>
              </tr>
            </thead>
            <tbody>
              {[...p.bundle.trace.steps]
                .sort((a, b) => (b.contributionKgco2e ?? b.value) - (a.contributionKgco2e ?? a.value))
                .map((s) => (
                  <tr
                    key={s.nodeId}
                    className="clickable"
                    onClick={() => p.onSelectNode(s.nodeId)}
                    style={s.nodeId === (p.selectedNodeId ?? resultId) ? { background: "var(--cyan-dim)" } : undefined}
                  >
                    <td>{s.label}</td>
                    <td><span className="note mono">{s.kind}</span></td>
                    <td className="mono" style={{ color: "var(--violet)", fontSize: 11 }}>{s.dataset ?? "—"}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{fmt(s.value)} {s.unit}</td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 700, color: "var(--amber)" }}>
                      {s.contributionKgco2e !== null ? fmt(s.contributionKgco2e) : "—"}
                    </td>
                  </tr>
                ))}
              <tr>
                <td colSpan={4} style={{ textAlign: "right", fontWeight: 700 }}>TOTAL GWP</td>
                <td className="mono" style={{ textAlign: "right", fontWeight: 800, color: "var(--amber)", fontSize: 14 }}>
                  {fmt(p.bundle.snapshot.gwp, 2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="note" style={{ marginTop: 8 }}>
        Trace computed deterministically by the engine — no language model involved in any number on this page.
      </div>
    </div>
  );
}
