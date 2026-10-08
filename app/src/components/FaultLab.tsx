"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_UNITS,
  detectFaults,
  downstreamNodes,
  evaluate,
  injectFault,
  isEvaluateOk,
  type Fault,
  type FaultType,
  type Graph,
} from "blackbox-engine";
import { AS_OF, DATASETS, FAULT_DOCS, FAULT_SPECS } from "blackbox-fixtures";
import { fmt } from "../lib/format";
import { GraphView, Inspector } from "./GraphView";
import { Badge, SectionTitle } from "./chrome";
import type { SnapshotBundle } from "../lib/bundles";

interface FaultLabProps {
  bundle: SnapshotBundle;
  activeType: FaultType | null;
  onInject: (t: FaultType | null) => void;
}

interface LabResult {
  faulted: Graph;
  faults: Fault[];
  evalOk: boolean;
  gwp: number | null;
  affected: Set<string>;
}

export function FaultLab({ bundle, activeType, onInject }: FaultLabProps) {
  const [inspectorNode, setInspectorNode] = useState<string | null>(null);
  const asOf = bundle.snapshot.asOf ?? AS_OF;

  const result: LabResult | null = useMemo(() => {
    if (!activeType) return null;
    const spec = FAULT_SPECS.find((s) => s.type === activeType)!;
    const faulted = injectFault(bundle.graph, spec);
    const faults = detectFaults(faulted, DEFAULT_UNITS, DATASETS, asOf);
    const ev = evaluate(faulted, DEFAULT_UNITS, DATASETS, asOf);
    const evalOk = isEvaluateOk(ev);
    const affected = new Set<string>();
    for (const f of faults) {
      affected.add(f.nodeId);
      for (const id of f.affectedPath) affected.add(id);
      for (const id of downstreamNodes(faulted, f.nodeId)) affected.add(id);
    }
    return {
      faulted,
      faults,
      evalOk,
      gwp: evalOk ? ev.trace.gwp : null,
      affected,
    };
  }, [bundle, activeType, asOf]);

  const labelOf = (id: string) =>
    bundle.graph.nodes.find((n) => n.id === id)?.label ?? id;

  const primaryFault = result?.faults.find((f) => f.type === activeType) ?? result?.faults[0];
  const blocked = result !== null && (!result.evalOk || result.faults.some((f) => !f.trustworthy));

  return (
    <div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-hd">
          FAULT INJECTION — PICK A FAILURE TO INTRODUCE INTO THE VALID CALCULATION
          {activeType && (
            <button className="btn btn-sm" onClick={() => { onInject(null); setInspectorNode(null); }}>
              ↺ RESET TO VALID
            </button>
          )}
        </div>
        <div className="panel-bd">
          <div className="fault-grid">
            {FAULT_SPECS.map((spec) => {
              const doc = FAULT_DOCS[spec.type];
              return (
                <button
                  key={spec.type}
                  className={`fault-card${activeType === spec.type ? " armed" : ""}`}
                  onClick={() => {
                    setInspectorNode(null);
                    onInject(activeType === spec.type ? null : spec.type);
                  }}
                >
                  <h4>
                    <span style={{ color: "var(--red)", marginRight: 6 }}>⚠</span>
                    {doc.title}
                  </h4>
                  <p>{doc.description}</p>
                  <p className="mono" style={{ marginTop: 6, fontSize: 10, color: "var(--faint)" }}>
                    → {doc.expected}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {!result && (
        <div className="panel">
          <div className="panel-bd note" style={{ textAlign: "center", padding: 32 }}>
            The baseline calculation is valid. Inject a fault to watch the deterministic
            validator catch it — a blocked result is marked{" "}
            <b style={{ color: "var(--red)" }}>UNTRUSTED</b> and never presented as verified.
          </div>
        </div>
      )}

      {result && primaryFault && (
        <>
          <div className="untrusted-banner" style={blocked ? undefined : { borderColor: "rgba(245,166,35,0.5)", background: "var(--amber-dim)" }}>
            <div>
              <div className="big" style={blocked ? undefined : { color: "var(--amber)" }}>
                {blocked ? "⛔ UNTRUSTED — RESULT QUARANTINED" : "⚠ FLAGGED — HEURISTIC WARNING"}
              </div>
              <div className="note" style={{ color: "var(--muted)", marginTop: 4 }}>
                {blocked
                  ? result.evalOk
                    ? "Evaluation completed, but blockers were found — this number must not be used."
                    : "Evaluation refused to produce a number — the fault blocks trust."
                  : "Heuristic flag only (not proof of error) — the number stays presentable with the warning attached."}
              </div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div className="note">COMPUTED GWP</div>
              <div className={`num${blocked ? " strike" : ""}`} style={{ fontSize: 30, fontWeight: 800 }}>
                {result.gwp === null ? "n/a" : fmt(result.gwp, 2)}
              </div>
              <div className="note mono">kgCO₂e / {bundle.trace.declaredUnit}</div>
            </div>
          </div>

          <div className="grid-2">
            <div>
              <div className="panel-hd" style={{ border: "1px solid var(--border)", borderBottom: "none", borderRadius: "10px 10px 0 0" }}>
                AFFECTED PATHS · <span style={{ color: "var(--red)" }}>{labelOf(primaryFault.nodeId).toUpperCase()}</span>
              </div>
              <GraphView
                graph={result.faulted}
                trace={null}
                highlights={{
                  faulted: primaryFault.nodeId,
                  affected: result.affected,
                  selected: inspectorNode,
                }}
                onNodeClick={setInspectorNode}
                height={520}
              />
              <div className="note" style={{ marginTop: 8 }}>
                <span style={{ color: "var(--red)" }}>■ fault site</span>
                {" · "}
                <span style={{ color: "var(--amber)" }}>■ affected path</span>
                {" · upstream lineage + all downstream dependents to GWP"}
              </div>
              <div style={{ marginTop: 8 }}>
                <SectionTitle>Affected nodes ({result.affected.size})</SectionTitle>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[...result.affected].map((id) => (
                    <button key={id} className="btn btn-sm btn-ghost mono" onClick={() => setInspectorNode(id)}>
                      {labelOf(id)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <SectionTitle>Detected faults ({result.faults.length})</SectionTitle>
              {result.faults.map((f, i) => (
                <div key={i} className={`issue ${f.trustworthy ? "warning" : "blocker"}`}>
                  <div className="code">
                    {f.type}
                    <span style={{ marginLeft: 8 }}>
                      <Badge tone={f.trustworthy ? "amber" : "red"}>
                        {f.trustworthy ? "WARNING" : "BLOCKS TRUST"}
                      </Badge>
                    </span>
                  </div>
                  <div className="msg">{f.detail}</div>
                  <div className="note mono" style={{ marginTop: 6 }}>
                    node: {f.nodeId}{f.edgeId ? ` · edge: ${f.edgeId}` : ""}
                    <br />
                    path: {f.affectedPath.join(" → ") || "—"}
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 16 }}>
                <Inspector
                  bundle={bundle}
                  nodeId={inspectorNode ?? primaryFault.nodeId}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
