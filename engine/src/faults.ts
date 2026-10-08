/**
 * Fault detection and fault injection — the adversarial instrument.
 *
 * detectFaults(graph, units, datasets, asOf) scans a graph for all 7 fault
 * types and attributes each to an affected node path. It never throws on
 * malformed input: every problem becomes a Fault.
 *
 * injectFault(graph, spec) deterministically corrupts a COPY of a graph so
 * the demo can show the validator catching it. It throws only when the
 * requested injection is inapplicable (unknown node, no eligible edge) —
 * a programming error, not a data condition.
 *
 * SUSPICIOUS_VALUE heuristic (explicit, documented): a single GWP
 * contribution exceeding SUSPICIOUS_VALUE_RATIO × the median contribution
 * is flagged. This is an illustrative demo threshold, not a statistical
 * outlier test — it exists to show the triage path, not to assert fraud.
 */
import type {
  Dataset,
  Edge,
  Fault,
  FaultType,
  Graph,
  Node,
  UnitDef,
} from "./schema.js";
import { dimensionOf, parseFactorUnit, toBase, toBaseFactor, BASE_UNIT, DEFAULT_UNITS } from "./units.js";
import { findCyclePath, upstreamLineage, validateGraph } from "./graph.js";

export type { Fault, FaultType } from "./schema.js";

export const SUSPICIOUS_VALUE_RATIO = 10;

export interface Contribution {
  edgeId: string;
  nodeId: string; // contributing node (factor source or emitter)
  label: string;
  value: number; // kgCO2e
}

/**
 * Compute per-edge GWP contributions without full evaluation, so fault
 * detection works even on graphs that cannot be evaluated. Edges whose
 * units/nodes are invalid are skipped (their structural faults are
 * reported separately).
 */
export function computeContributions(
  graph: Graph,
  units: Record<string, UnitDef>,
): Contribution[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const resultIds = new Set(
    graph.nodes.filter((n) => n.kind === "result").map((n) => n.id),
  );
  const out: Contribution[] = [];
  for (const e of graph.edges) {
    try {
      if (!resultIds.has(e.to)) continue;
      const from = byId.get(e.from);
      if (!from) continue;
      if (e.role === "applies_factor") {
        if (from.kind !== "emission_factor" || from.unit === null || from.quantity === null)
          continue;
        const { num, den } = parseFactorUnit(units, from.unit);
        const amountBase = toBase(units, e.quantity, e.unit);
        const factorBase =
          from.quantity * (toBaseFactor(units, num) / toBaseFactor(units, den));
        // Dimensional guard: skip here; DIM-002 reports it.
        if (dimensionOf(units, e.unit) !== dimensionOf(units, den)) continue;
        out.push({ edgeId: e.id, nodeId: e.from, label: from.label, value: amountBase * factorBase });
      } else if (e.role === "emits") {
        if (dimensionOf(units, e.unit) !== "emission") continue;
        out.push({
          edgeId: e.id,
          nodeId: e.from,
          label: from.label,
          value: toBase(units, e.quantity, e.unit),
        });
      }
    } catch {
      // Unknown units etc. — structural validation reports those.
    }
  }
  return out;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function detectFaults(
  graph: Graph,
  units: Record<string, UnitDef>,
  datasets: Dataset[],
  asOf: string | null,
): Fault[] {
  const faults: Fault[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const dsByKey = new Map(datasets.map((d) => [`${d.id}@${d.version}`, d]));

  // 1. Structural validation findings → faults.
  for (const issue of validateGraph(graph, units)) {
    if (issue.severity !== "error") continue;
    switch (issue.code) {
      case "DIM-002": {
        const e = graph.edges.find((x) => x.id === issue.edgeId);
        faults.push({
          type: "unit_mismatch",
          nodeId: issue.nodeId ?? e?.to ?? "",
          edgeId: issue.edgeId,
          detail: issue.message,
          affectedPath: e ? upstreamLineage(graph, e.from) : [],
          trustworthy: false,
        });
        break;
      }
      case "CNV-001": {
        const e = graph.edges.find((x) => x.id === issue.edgeId);
        faults.push({
          type: "bad_conversion",
          nodeId: issue.nodeId ?? e?.to ?? "",
          edgeId: issue.edgeId,
          detail: issue.message,
          affectedPath: e ? [e.from, e.to] : [],
          trustworthy: false,
        });
        break;
      }
      case "QTY-001": {
        const n = issue.nodeId ? byId.get(issue.nodeId) : undefined;
        if (n && (n.kind === "material_input" || n.kind === "energy" || n.kind === "transport" || n.kind === "emission_factor")) {
          faults.push({
            type: "missing_input",
            nodeId: n.id,
            detail: issue.message,
            affectedPath: upstreamLineage(graph, n.id),
            trustworthy: false,
          });
        }
        break;
      }
      case "CYC-001": {
        const path = findCyclePath(graph) ?? [];
        faults.push({
          type: "cycle",
          nodeId: path[0] ?? "",
          detail: issue.message,
          affectedPath: path,
          trustworthy: false,
        });
        break;
      }
    }
  }

  // 2. Processes with no inputs (a process that consumes nothing but is
  //    expected to transform something).
  for (const n of graph.nodes) {
    if (n.kind !== "process") continue;
    const hasConsumes = graph.edges.some(
      (e) => e.to === n.id && e.role === "consumes" && byId.has(e.from),
    );
    if (!hasConsumes) {
      faults.push({
        type: "missing_input",
        nodeId: n.id,
        detail: `Process node "${n.label}" (${n.id}) has no consumes inputs — nothing feeds it.`,
        affectedPath: upstreamLineage(graph, n.id),
        trustworthy: false,
      });
    }
  }

  // 3. Result node with no contributing edges.
  for (const n of graph.nodes) {
    if (n.kind !== "result") continue;
    const contributing = graph.edges.some(
      (e) =>
        e.to === n.id &&
        (e.role === "applies_factor" || e.role === "emits") &&
        byId.has(e.from),
    );
    if (!contributing) {
      faults.push({
        type: "missing_input",
        nodeId: n.id,
        detail: `Result node "${n.label}" (${n.id}) has no incoming applies_factor/emits edges — the GWP has no inputs.`,
        affectedPath: [n.id],
        trustworthy: false,
      });
    }
  }

  // 4. Duplicate contributions: same factor/emitter wired twice into a result.
  const seen = new Map<string, Edge>();
  for (const e of [...graph.edges].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (e.role !== "applies_factor" && e.role !== "emits") continue;
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    const key = `${e.from}|${e.to}|${e.role}`;
    const first = seen.get(key);
    if (first) {
      faults.push({
        type: "duplicate_contribution",
        nodeId: e.to,
        edgeId: e.id,
        detail:
          `Duplicate contribution: "${byId.get(e.from)!.label}" is wired into ` +
          `"${byId.get(e.to)!.label}" twice (edges "${first.id}", "${e.id}") — its contribution is double-counted.`,
        affectedPath: upstreamLineage(graph, e.from),
        trustworthy: false,
      });
    } else {
      seen.set(key, e);
    }
  }

  // 5. Expired / unresolvable dataset references.
  for (const n of graph.nodes) {
    if (n.datasetId === null) continue;
    const key = `${n.datasetId}@${n.datasetVersion}`;
    const ds = dsByKey.get(key);
    if (!ds) {
      faults.push({
        type: "expired_reference",
        nodeId: n.id,
        detail: `Node "${n.label}" (${n.id}) references unknown dataset "${key}" — the factor cannot be verified and is treated as expired.`,
        affectedPath: upstreamLineage(graph, n.id),
        trustworthy: false,
      });
      continue;
    }
    if (asOf !== null) {
      if (ds.validTo !== null && ds.validTo < asOf) {
        faults.push({
          type: "expired_reference",
          nodeId: n.id,
          detail: `Node "${n.label}" (${n.id}) uses dataset "${key}" whose validity ended ${ds.validTo} (as of ${asOf}).`,
          affectedPath: upstreamLineage(graph, n.id),
          trustworthy: false,
        });
      } else if (ds.validFrom > asOf) {
        faults.push({
          type: "expired_reference",
          nodeId: n.id,
          detail: `Node "${n.label}" (${n.id}) uses dataset "${key}" not yet valid at ${asOf} (valid from ${ds.validFrom}).`,
          affectedPath: upstreamLineage(graph, n.id),
          trustworthy: false,
        });
      }
    }
  }

  // 6. Suspicious values: one contribution dominating the total.
  const contribs = computeContributions(graph, units).filter((c) => c.value > 0);
  if (contribs.length >= 2) {
    const med = median(contribs.map((c) => c.value));
    if (med > 0) {
      for (const c of contribs) {
        if (c.value > SUSPICIOUS_VALUE_RATIO * med) {
          faults.push({
            type: "suspicious_value",
            nodeId: c.nodeId,
            edgeId: c.edgeId,
            detail:
              `Suspicious value: "${c.label}" contributes ${c.value.toFixed(2)} kgCO2e, ` +
              `more than ${SUSPICIOUS_VALUE_RATIO}× the median contribution (${med.toFixed(2)} kgCO2e). ` +
              `Flagged for human review (heuristic threshold, not proof of error).`,
            affectedPath: upstreamLineage(graph, c.nodeId),
            trustworthy: true, // flagged, still presentable with the warning
          });
        }
      }
    }
  }

  return faults;
}

// ---------------------------------------------------------------------------
// Fault injection
// ---------------------------------------------------------------------------

export interface FaultSpec {
  type: FaultType;
  nodeId: string;
}

function deepCopy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function requireNode(graph: Graph, nodeId: string): Node {
  const n = graph.nodes.find((x) => x.id === nodeId);
  if (!n) throw new Error(`injectFault: unknown node "${nodeId}"`);
  return n;
}

function sortedEdges(graph: Graph, pred: (e: Edge) => boolean): Edge[] {
  return graph.edges.filter(pred).sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Deterministically corrupt a COPY of the graph with one fault.
 * The input graph is never mutated.
 */
export function injectFault(
  graph: Graph,
  spec: FaultSpec,
  units: Record<string, UnitDef> = DEFAULT_UNITS,
): Graph {
  const g = deepCopy(graph);
  const node = requireNode(g, spec.nodeId);

  switch (spec.type) {
    case "unit_mismatch": {
      const touching = sortedEdges(g, (e) => e.from === node.id || e.to === node.id);
      const target = touching[0] ?? [...g.edges].sort((a, b) => (a.id < b.id ? -1 : 1))[0];
      if (!target) throw new Error("injectFault(unit_mismatch): graph has no edges");
      let currentDim: string | null = null;
      try {
        currentDim = dimensionOf(units, target.unit);
      } catch {
        currentDim = null;
      }
      const wrong = Object.keys(units)
        .sort()
        .find((s) => units[s].dimension !== currentDim);
      if (!wrong) throw new Error("injectFault(unit_mismatch): no differing-dimension unit available");
      target.unit = wrong;
      return g;
    }

    case "bad_conversion": {
      const cvt = sortedEdges(g, (e) => e.role === "converts_to");
      if (cvt.length) {
        // ×10 shifts any nonzero value out of tolerance; +1 guarantees a
        // zero quantity also becomes wrong. (Precondition: the graph was
        // valid before injection, so the edge was correct.)
        cvt[0].quantity = cvt[0].quantity * 10 + 1;
        return g;
      }
      // No converts_to edge exists: add a deliberately wrong one between
      // two same-dimension flow nodes.
      const flows = g.nodes
        .filter(
          (n) =>
            (n.kind === "material_input" || n.kind === "energy" || n.kind === "transport") &&
            n.quantity !== null &&
            n.unit !== null &&
            units[n.unit] !== undefined,
        )
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      for (const a of flows) {
        const b = flows.find(
          (x) => x.id !== a.id && units[x.unit!].dimension === units[a.unit!].dimension,
        );
        if (!b) continue;
        const correct = (a.quantity! * units[a.unit!].toBase) / units[b.unit!].toBase;
        g.edges.push({
          id: `fault__cvt_${a.id}_${b.id}`,
          from: a.id,
          to: b.id,
          quantity: correct * 10, // wrong by exactly 10×
          unit: b.unit!,
          role: "converts_to",
        });
        return g;
      }
      throw new Error("injectFault(bad_conversion): no convertible node pair found");
    }

    case "missing_input": {
      if (
        node.kind === "material_input" ||
        node.kind === "energy" ||
        node.kind === "transport" ||
        node.kind === "emission_factor"
      ) {
        node.quantity = null;
        return g;
      }
      if (node.kind === "process") {
        const incoming = sortedEdges(g, (e) => e.to === node.id && e.role === "consumes");
        if (!incoming.length)
          throw new Error(`injectFault(missing_input): process "${node.id}" already has no inputs`);
        g.edges = g.edges.filter((e) => e.id !== incoming[0].id);
        return g;
      }
      // result node: remove a contributing edge
      const incoming = sortedEdges(
        g,
        (e) => e.to === node.id && (e.role === "applies_factor" || e.role === "emits"),
      );
      if (!incoming.length)
        throw new Error(`injectFault(missing_input): result "${node.id}" already has no contributing edges`);
      g.edges = g.edges.filter((e) => e.id !== incoming[0].id);
      return g;
    }

    case "duplicate_contribution": {
      const cands = sortedEdges(
        g,
        (e) => e.role === "applies_factor" || e.role === "emits",
      );
      if (!cands.length)
        throw new Error("injectFault(duplicate_contribution): no applies_factor/emits edge found");
      const dup = deepCopy(cands[0]);
      dup.id = `${dup.id}__dup`;
      g.edges.push(dup);
      return g;
    }

    case "expired_reference": {
      if (node.datasetId === null) {
        node.datasetId = "bogus-dataset";
        node.datasetVersion = "v0-bogus";
      } else {
        node.datasetVersion = `${node.datasetVersion ?? "v0"}-bogus`;
      }
      return g;
    }

    case "cycle": {
      // Back edge downstream → upstream. Preferred shape: converts_to from
      // a process node (which never carries a unit, so no conversion rule
      // can misfire) to an upstream flow node. The ONLY new finding this
      // introduces is CYC-001.
      const proc = g.nodes
        .filter((n) => n.kind === "process")
        .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
      const flow = g.nodes
        .filter(
          (n) =>
            (n.kind === "material_input" ||
              n.kind === "energy" ||
              n.kind === "transport") &&
            n.id !== proc?.id,
        )
        .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
      if (!proc || !flow)
        throw new Error(
          "injectFault(cycle): need a process node and a flow node to anchor the back edge",
        );
      g.edges.push({
        id: "fault__cycle",
        from: proc.id,
        to: flow.id,
        quantity: 1,
        unit: "kg",
        role: "converts_to",
      });
      return g;
    }

    case "suspicious_value": {
      if (
        (node.kind === "emission_factor" ||
          node.kind === "material_input" ||
          node.kind === "energy" ||
          node.kind === "transport") &&
        node.quantity !== null
      ) {
        node.quantity *= 100;
        return g;
      }
      const cands = sortedEdges(
        g,
        (e) => e.role === "applies_factor" || e.role === "emits",
      );
      if (!cands.length)
        throw new Error("injectFault(suspicious_value): no scalable node or edge found");
      cands[0].quantity *= 100;
      return g;
    }
  }
}

export { BASE_UNIT };
