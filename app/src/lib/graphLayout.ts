import type { Edge as RFEdge, Node as RFNode } from "reactflow";
import type { Graph, Trace, TraceStep } from "blackbox-engine";
import type { Diff } from "blackbox-engine";
import { fmt, fmtSigned } from "./format";

export interface BbNodeData {
  label: string;
  kind: string;
  total: string;
  sub: string;
  delta?: string;
  deltaDir?: "up" | "dn";
  status: "default" | "selected" | "changed" | "faulted" | "affected";
}

export interface HighlightSets {
  changed?: Set<string>;
  faulted?: string | null;
  affected?: Set<string>;
  selected?: string | null;
  /** nodeId -> contribution delta (time machine). */
  deltas?: Map<string, number>;
}

const COL_X = 300;
const ROW_Y = 118;

/** Depth = longest upstream→downstream path from a source node. */
function computeDepths(graph: Graph): Map<string, number> {
  const depth = new Map<string, number>();
  const preds = new Map<string, string[]>();
  for (const n of graph.nodes) preds.set(n.id, []);
  for (const e of graph.edges) preds.get(e.to)?.push(e.from);
  const visiting = new Set<string>();
  const visit = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0; // cycle: break (validator reports it)
    visiting.add(id);
    const d = (preds.get(id) ?? []).reduce((m, p) => Math.max(m, visit(p) + 1), 0);
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const n of graph.nodes) visit(n.id);
  return depth;
}

function statusFor(id: string, h: HighlightSets): BbNodeData["status"] {
  if (h.faulted === id) return "faulted";
  if (h.selected === id) return "selected";
  if (h.changed?.has(id)) return "changed";
  if (h.affected?.has(id)) return "affected";
  return "default";
}

export function layoutGraph(
  graph: Graph,
  trace: Trace | null,
  h: HighlightSets = {},
): { nodes: RFNode<BbNodeData>[]; edges: RFEdge[] } {
  const depths = computeDepths(graph);
  const stepById = new Map<string, TraceStep>((trace?.steps ?? []).map((s) => [s.nodeId, s]));

  const byDepth = new Map<number, string[]>();
  for (const n of graph.nodes) {
    const d = depths.get(n.id) ?? 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(n.id);
  }
  // Hotspots float to the top of each column.
  const heat = (id: string) => stepById.get(id)?.contributionKgco2e ?? stepById.get(id)?.value ?? 0;
  for (const ids of byDepth.values()) ids.sort((a, b) => heat(b) - heat(a));

  const nodes: RFNode<BbNodeData>[] = graph.nodes.map((n) => {
    const d = depths.get(n.id) ?? 0;
    const col = byDepth.get(d) ?? [];
    const row = col.indexOf(n.id);
    const step = stepById.get(n.id);
    const shown = step?.contributionKgco2e ?? step?.value;
    const delta = h.deltas?.get(n.id);
    return {
      id: n.id,
      type: "bb",
      position: { x: d * COL_X, y: row * ROW_Y - (col.length * ROW_Y) / 2 },
      data: {
        label: n.label,
        kind: n.kind,
        total: shown !== undefined && shown !== null ? `${fmt(shown)} kgCO₂e` : "—",
        sub: step
          ? step.dataset ?? step.formula.slice(0, 42)
          : (n.note ?? n.kind),
        delta: delta !== undefined ? `${fmtSigned(delta)} kgCO₂e` : undefined,
        deltaDir: delta !== undefined ? (delta >= 0 ? "up" : "dn") : undefined,
        status: statusFor(n.id, h),
      },
    };
  });

  const edges: RFEdge[] = graph.edges.map((e) => {
    const isFaulted = h.faulted === e.from || h.faulted === e.to;
    const isAffected = h.affected?.has(e.from) || h.affected?.has(e.to);
    const isChanged = h.changed?.has(e.from) || h.changed?.has(e.to);
    const roleColor =
      e.role === "applies_factor" ? "#f5a623" : e.role === "emits" ? "#ff6161" : "#2a323d";
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      label: e.role === "applies_factor" ? `${fmt(e.quantity)} ${e.unit}` : e.role,
      labelStyle: { fill: "#8f99a6", fontSize: 9, fontFamily: "ui-monospace, monospace" },
      labelBgStyle: { fill: "#090b0d" },
      labelBgPadding: [3, 4] as [number, number],
      style: {
        stroke: isFaulted ? "#ff6161" : isChanged ? "#f5a623" : isAffected ? "rgba(245,166,35,0.6)" : roleColor,
        strokeWidth: isFaulted || isChanged ? 2.5 : 1.5,
        strokeDasharray: e.role === "consumes" ? "5 4" : undefined,
      },
      animated: isFaulted,
    };
  });

  return { nodes, edges };
}

/** nodeId -> (newValue - oldValue) from a Diff. */
export function deltaMap(diff: Diff | null): Map<string, number> {
  const map = new Map<string, number>();
  if (!diff) return map;
  for (const c of diff.changedNodes) map.set(c.nodeId, c.newValue - c.oldValue);
  return map;
}
