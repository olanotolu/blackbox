/**
 * Explainable computational diff between two snapshots of the same graph.
 *
 * Compares per-node evaluated values (which already reflect quantity, unit,
 * factor and structural changes) and attributes the GWP delta to changed
 * nodes with cause lines. Throws when the snapshots come from different
 * graphs — diffing across graphs is meaningless.
 */
import type { Diff, Snapshot } from "./schema";

function fmt(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return "—";
  return String(Number(n.toFixed(digits)));
}

function pctChange(oldV: number, newV: number): string {
  if (oldV === 0) return newV === 0 ? "0%" : "n/a";
  const p = ((newV - oldV) / Math.abs(oldV)) * 100;
  return `${p >= 0 ? "+" : ""}${Number(p.toFixed(1))}%`;
}

export function diffSnapshots(a: Snapshot, b: Snapshot): Diff {
  if (a.graphId !== b.graphId) {
    throw new Error(
      `Cannot diff snapshots of different graphs: "${a.graphId}" vs "${b.graphId}"`,
    );
  }

  const changedNodes: Diff["changedNodes"] = [];
  const ids = new Set([...Object.keys(a.values), ...Object.keys(b.values)]);
  for (const id of [...ids].sort()) {
    const ov = a.values[id];
    const nv = b.values[id];
    const label = a.nodeLabels[id] ?? b.nodeLabels[id] ?? id;
    if (!ov && nv) {
      changedNodes.push({
        nodeId: id,
        label,
        oldValue: 0,
        newValue: nv.value,
        unit: nv.unit,
      });
    } else if (ov && !nv) {
      changedNodes.push({
        nodeId: id,
        label,
        oldValue: ov.value,
        newValue: 0,
        unit: ov.unit,
      });
    } else if (ov && nv && (ov.value !== nv.value || ov.unit !== nv.unit)) {
      changedNodes.push({
        nodeId: id,
        label,
        oldValue: ov.value,
        newValue: nv.value,
        unit: nv.unit,
      });
    }
  }

  const gwpOld = a.gwp;
  const gwpNew = b.gwp;
  const gwpDelta = gwpNew - gwpOld;

  const explanations: string[] = [];
  if (a.reproHash === b.reproHash) {
    explanations.push(
      "Identical reproducibility hash — no computational change between snapshots.",
    );
  } else {
    explanations.push(
      `GWP ${fmt(gwpOld, 2)} → ${fmt(gwpNew, 2)} kgCO2e per declared unit ` +
        `(Δ ${gwpDelta >= 0 ? "+" : ""}${fmt(gwpDelta, 2)}, ${pctChange(gwpOld, gwpNew)}).`,
    );
    // Attribute: for each changed non-result node, state the value move.
    for (const c of changedNodes) {
      if (c.nodeId === b.resultNodeId) continue;
      explanations.push(
        `${c.label}: ${fmt(c.oldValue)} → ${fmt(c.newValue)} ${c.unit} (${pctChange(c.oldValue, c.newValue)}).`,
      );
    }
    if (changedNodes.length === 0) {
      explanations.push(
        "Reproducibility hashes differ but no node values changed — " +
          "the difference is structural metadata (labels, edges, or dataset refs).",
      );
    }
  }

  return {
    fromSnapshot: a.id,
    toSnapshot: b.id,
    changedNodes,
    gwpOld,
    gwpNew,
    gwpDelta,
    explanations,
  };
}
