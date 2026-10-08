"use client";

import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type NodeProps,
} from "reactflow";
import type { Graph, Trace, ValidationIssue } from "blackbox-engine";
import type { SnapshotBundle } from "../lib/bundles";
import { fmt } from "../lib/format";
import { layoutGraph, type BbNodeData, type HighlightSets } from "../lib/graphLayout";
import { Badge, SectionTitle } from "./chrome";

function BbNode({ data }: NodeProps<BbNodeData>) {
  return (
    <div className={`bb-node ${data.status}`}>
      <div className="kind">{data.kind}</div>
      <div className="label">{data.label}</div>
      <div className="total num">{data.total}</div>
      <div className="sub mono">{data.sub}</div>
      {data.delta && (
        <div className={`sub mono ${data.deltaDir === "up" ? "delta-up" : "delta-dn"}`}>
          Δ {data.delta}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { bb: BbNode };

interface GraphViewProps {
  graph: Graph;
  trace: Trace | null;
  highlights?: HighlightSets;
  onNodeClick?: (nodeId: string) => void;
  height?: number;
}

export function GraphView({ graph, trace, highlights, onNodeClick, height = 560 }: GraphViewProps) {
  const { nodes, edges } = useMemo(
    () => layoutGraph(graph, trace, highlights),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, trace, JSON.stringify({
      c: [...(highlights?.changed ?? [])],
      f: highlights?.faulted,
      a: [...(highlights?.affected ?? [])],
      s: highlights?.selected,
      dl: [...(highlights?.deltas?.keys() ?? [])],
    })],
  );

  return (
    <div className="rf-wrap" style={{ height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, n) => onNodeClick?.(n.id)}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.25}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background color="#141a21" gap={28} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => {
            const s = (n.data as BbNodeData)?.status;
            if (s === "faulted") return "#ff6161";
            if (s === "changed") return "#f5a623";
            if (s === "selected") return "#45d8e0";
            return "#2a323d";
          }}
        />
      </ReactFlow>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface InspectorProps {
  bundle: SnapshotBundle;
  nodeId: string | null;
  issues?: ValidationIssue[];
}

const KIND_TONE: Record<string, "amber" | "cyan" | "violet" | "green"> = {
  material_input: "amber",
  emission_factor: "violet",
  process: "cyan",
  transport: "amber",
  energy: "green",
  result: "cyan",
};

export function Inspector({ bundle, nodeId, issues }: InspectorProps) {
  const node = bundle.graph.nodes.find((n) => n.id === nodeId);
  const step = bundle.trace.steps.find((s) => s.nodeId === nodeId);
  const nodeIssues = (issues ?? []).filter((i) => i.nodeId === nodeId);

  if (!node) {
    return (
      <div className="panel">
        <div className="panel-hd">NODE INSPECTOR</div>
        <div className="panel-bd note">Select a node in the graph to inspect its calculation.</div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-hd">
        NODE INSPECTOR
        <Badge tone={KIND_TONE[node.kind] ?? "cyan"}>{node.kind}</Badge>
      </div>
      <div className="panel-bd">
        <div style={{ fontSize: 15, fontWeight: 700 }}>{node.label}</div>
        {node.note && <div className="note" style={{ marginTop: 4 }}>{node.note}</div>}

        <SectionTitle>Contribution</SectionTitle>
        <div className="num" style={{ fontSize: 30, fontWeight: 700, color: "var(--amber)" }}>
          {step?.contributionKgco2e !== null && step?.contributionKgco2e !== undefined
            ? fmt(step.contributionKgco2e)
            : step ? fmt(step.value) : "—"}{" "}
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            {step?.contributionKgco2e !== null && step?.contributionKgco2e !== undefined ? "kgCO₂e" : step?.unit ?? ""}
          </span>
        </div>

        <SectionTitle>Calculation</SectionTitle>
        <div className="formula">{step?.formula ?? "not evaluated"}</div>

        <dl className="kv">
          <dt>VALUE</dt>
          <dd className="mono">{step ? `${fmt(step.value)} ${step.unit}` : "—"}</dd>
          <dt>DATASET</dt>
          <dd className="mono" style={{ color: "var(--violet)" }}>{step?.dataset ?? "—"}</dd>
          <dt>QUANTITY</dt>
          <dd className="mono">
            {node.quantity !== null ? `${fmt(node.quantity, 4)} ${node.unit ?? ""}` : "computed node — no direct quantity"}
          </dd>
        </dl>

        <SectionTitle>Source evidence</SectionTitle>
        {node.evidence.length === 0 ? (
          <div className="note">No evidence references attached.</div>
        ) : (
          <ul className="evidence-list">
            {node.evidence.map((e, i) => (
              <li key={i}>{e.kind}: {e.ref}</li>
            ))}
          </ul>
        )}

        {nodeIssues.length > 0 && (
          <>
            <SectionTitle>Validation findings</SectionTitle>
            {nodeIssues.map((iss, i) => (
              <div key={i} className={`issue ${iss.severity === "error" ? "blocker" : "warning"}`}>
                <div className="code">{iss.code}</div>
                <div className="msg">{iss.message}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
