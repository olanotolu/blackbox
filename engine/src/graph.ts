/**
 * Graph structure: validation, cycle detection, topological order, lineage.
 *
 * EDGE SEMANTICS (explicit contract):
 *  - consumes:      flow/aggregation topology. from ∈ {material_input,
 *                   energy, transport, process} → to ∈ {process, result}.
 *                   Edge unit dimension must equal the FROM node's value
 *                   dimension (the flow being moved).
 *  - emits:         a direct emission amount. to ∈ {process, result};
 *                   edge unit dimension must be "emission" (kgCO2e…).
 *  - applies_factor: from must be an emission_factor node → to is the
 *                   result node. The EDGE's quantity/unit is the FLOW
 *                   AMOUNT the factor applies to; the FROM node's
 *                   quantity/unit is the factor (e.g. 0.85 kgCO2e/kg).
 *                   Dimensional rule: dim(edge.unit) must equal the
 *                   denominator dimension of the factor's unit.
 *  - converts_to:   "the value of `from` expressed in `to`'s unit".
 *                   dim(edge.unit) must equal dim(from.unit); the edge
 *                   quantity must equal from's converted value (CNV-001).
 *
 * Validation never throws: every problem becomes a ValidationIssue with a
 * STABLE rule code (e.g. "DIM-002") so UI and Jev layers can key off it.
 */
import type {
  Edge,
  Graph,
  Node,
  UnitDef,
  ValidationIssue,
} from "./schema";
import { BASE_UNIT, dimensionOf, parseFactorUnit, toBase } from "./units";

export type { ValidationIssue };

// Allowed value dimensions per node kind ("*" = structural factor unit).
const KIND_DIMS: Record<Node["kind"], string[]> = {
  material_input: ["mass", "volume"],
  energy: ["energy"],
  transport: ["transport"],
  emission_factor: ["*"],
  process: [],
  result: [],
};

const FLOW_KINDS = new Set(["material_input", "energy", "transport"]);

function nodeById(graph: Graph): Map<string, Node> {
  return new Map(graph.nodes.map((n) => [n.id, n]));
}

/** Cycle path as node ids, closed loop (first id repeated at end). */
export function findCyclePath(graph: Graph): string[] | null {
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) {
    if (adj.has(e.from) && adj.has(e.to)) adj.get(e.from)!.push(e.to);
  }
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    color.set(id, 1);
    stack.push(id);
    for (const next of adj.get(id) ?? []) {
      const c = color.get(next) ?? 0;
      if (c === 1) return [...stack.slice(stack.indexOf(next)), next];
      if (c === 0) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(id, 2);
    return null;
  };
  for (const n of graph.nodes) {
    if ((color.get(n.id) ?? 0) === 0) {
      const found = visit(n.id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Kahn's topological order (dependencies before dependents). Returns null
 * when the graph has a cycle — call findCyclePath() for the path.
 */
export function topoOrder(graph: Graph): string[] | null {
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) {
    indeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of graph.edges) {
    if (!adj.has(e.from) || !adj.has(e.to)) continue; // dangling; reported by validateGraph
    adj.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const queue = [...indeg.entries()]
    .filter(([, d]) => d === 0)
    .map(([id]) => id)
    .sort();
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of (adj.get(id) ?? []).sort()) {
      indeg.set(next, indeg.get(next)! - 1);
      if (indeg.get(next) === 0) queue.push(next);
    }
    queue.sort();
  }
  return order.length === graph.nodes.length ? order : null;
}

/**
 * Representative upstream path source → nodeId: at each step follow the
 * first (id-sorted) predecessor. Deterministic; used for fault attribution.
 */
export function upstreamLineage(graph: Graph, nodeId: string): string[] {
  const path = [nodeId];
  const seen = new Set([nodeId]);
  let cur = nodeId;
  for (;;) {
    const preds = graph.edges
      .filter((e) => e.to === cur && !seen.has(e.from))
      .map((e) => e.from)
      .sort();
    if (!preds.length || path.length > graph.nodes.length + 1) break;
    cur = preds[0];
    seen.add(cur);
    path.unshift(cur);
  }
  return path;
}

/** All nodes reachable downstream of nodeId (excluding nodeId). Sorted. */
export function downstreamNodes(graph: Graph, nodeId: string): string[] {
  const seen = new Set<string>();
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const walk = (id: string) => {
    for (const next of adj.get(id) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        walk(next);
      }
    }
  };
  walk(nodeId);
  seen.delete(nodeId);
  return [...seen].sort();
}

const REL_TOL = 1e-9;

function closeEnough(a: number, b: number): boolean {
  if (a === b) return true;
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  return Math.abs(a - b) / denom <= REL_TOL;
}

/** The result node labeled "GWP" (first by id if several). */
export function gwpResultNode(graph: Graph): Node | null {
  const cands = graph.nodes
    .filter((n) => n.kind === "result" && n.label === "GWP")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  return cands[0] ?? null;
}

export function validateGraph(
  graph: Graph,
  units: Record<string, UnitDef>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (
    code: string,
    message: string,
    nodeId?: string,
    edgeId?: string,
  ) => issues.push({ code, severity: "error", message, nodeId, edgeId });
  const warn = (code: string, message: string, nodeId?: string) =>
    issues.push({ code, severity: "warning", message, nodeId });

  const byId = nodeById(graph);

  // DUP-001: duplicate node ids
  const seen = new Set<string>();
  for (const n of graph.nodes) {
    if (seen.has(n.id)) err("DUP-001", `Duplicate node id "${n.id}".`, n.id);
    seen.add(n.id);
  }

  // EDG-001: dangling edges
  for (const e of graph.edges) {
    if (!byId.has(e.from))
      err("EDG-001", `Edge "${e.id}" starts at missing node "${e.from}".`, undefined, e.id);
    if (!byId.has(e.to))
      err("EDG-001", `Edge "${e.id}" ends at missing node "${e.to}".`, undefined, e.id);
  }

  // EDG-002: exact duplicate (from,to,role) — warning here; detectFaults
  // escalates applies_factor/emits duplicates to duplicate_contribution.
  const edgeKeys = new Map<string, Edge>();
  for (const e of graph.edges) {
    const key = `${e.from}|${e.to}|${e.role}`;
    if (edgeKeys.has(key))
      warn(
        "EDG-002",
        `Duplicate edge "${e.id}": same from/to/role as "${edgeKeys.get(key)!.id}".`,
        e.to,
      );
    else edgeKeys.set(key, e);
  }

  // Per-node checks
  for (const n of graph.nodes) {
    // units known?
    let nodeDim: string | null = null;
    if (n.unit !== null) {
      if (n.kind === "emission_factor") {
        try {
          parseFactorUnit(units, n.unit);
        } catch (e) {
          err(
            "UNT-002",
            `Node "${n.label}" (${n.id}): ${e instanceof Error ? e.message : String(e)}.`,
            n.id,
          );
        }
      } else if (!units[n.unit]) {
        err("UNT-001", `Node "${n.label}" (${n.id}) uses unknown unit "${n.unit}".`, n.id);
      } else {
        nodeDim = units[n.unit].dimension;
      }
    }

    // quantity presence rules
    if (FLOW_KINDS.has(n.kind) || n.kind === "emission_factor") {
      if (n.quantity === null)
        err(
          "QTY-001",
          `Node "${n.label}" (${n.id}, kind ${n.kind}) has no quantity — its input is missing.`,
          n.id,
        );
      else if (!Number.isFinite(n.quantity) || n.quantity < 0)
        err(
          "QTY-003",
          `Node "${n.label}" (${n.id}) has invalid quantity ${n.quantity} — quantities must be finite and non-negative.`,
          n.id,
        );
    } else if (n.quantity !== null) {
      err(
        "QTY-002",
        `Node "${n.label}" (${n.id}, kind ${n.kind}) must not carry a quantity (it is computed).`,
        n.id,
      );
    }

    // DIM-001: kind/dimension compatibility
    if (nodeDim !== null && n.kind !== "emission_factor" && n.kind !== "result" && n.kind !== "process") {
      const allowed = KIND_DIMS[n.kind];
      if (!allowed.includes(nodeDim)) {
        err(
          "DIM-001",
          `Node "${n.label}" (${n.id}, kind ${n.kind}) has unit "${n.unit}" of dimension ${nodeDim}; expected ${allowed.join(" or ")}.`,
          n.id,
        );
      }
    }
    if (n.kind === "process" && n.unit !== null) {
      err("DIM-001", `Process node "${n.label}" (${n.id}) must not declare a unit.`, n.id);
    }
  }

  // Per-edge checks (skip edges with missing endpoints or unknown units)
  for (const e of graph.edges) {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from || !to) continue;
    if (!units[e.unit]) {
      err("UNT-001", `Edge "${e.id}" uses unknown unit "${e.unit}".`, e.to, e.id);
      continue;
    }
    if (!Number.isFinite(e.quantity) || e.quantity < 0) {
      err(
        "QTY-004",
        `Edge "${e.id}" has invalid quantity ${e.quantity} — edge quantities must be finite and non-negative.`,
        e.to,
        e.id,
      );
    }
    const edgeDim = units[e.unit].dimension;

    const dimMismatch = (expected: string, what: string) =>
      err(
        "DIM-002",
        `Edge "${e.id}" (${e.role} ${e.from} → ${e.to}): ${what}; ` +
          `edge unit "${e.unit}" has dimension ${edgeDim}, expected ${expected}.`,
        e.to,
        e.id,
      );

    switch (e.role) {
      case "applies_factor": {
        if (from.kind !== "emission_factor") {
          err(
            "ROL-001",
            `Edge "${e.id}": role applies_factor requires an emission_factor source, got kind ${from.kind} ("${from.label}").`,
            e.to,
            e.id,
          );
          break;
        }
        if (from.unit === null || from.quantity === null) break; // QTY-001/UNT already reported
        try {
          const { denDim } = parseFactorUnit(units, from.unit);
          if (edgeDim !== denDim)
            dimMismatch(
              denDim,
              `the factor "${from.label}" is per ${denDim} but the applied amount is ${edgeDim}`,
            );
        } catch {
          /* UNT-002 already reported on the node */
        }
        break;
      }
      case "emits": {
        if (to.kind !== "result" && to.kind !== "process") {
          err(
            "ROL-001",
            `Edge "${e.id}": role emits must target a result or process node, got kind ${to.kind} ("${to.label}").`,
            e.to,
            e.id,
          );
          break;
        }
        if (edgeDim !== "emission")
          dimMismatch("emission", "direct emission amounts must use emission units (kgCO2e…)");
        break;
      }
      case "consumes": {
        if (from.kind === "emission_factor" || from.kind === "result") {
          err(
            "ROL-001",
            `Edge "${e.id}": role consumes cannot originate from kind ${from.kind} ("${from.label}").`,
            e.to,
            e.id,
          );
          break;
        }
        if (to.kind !== "process" && to.kind !== "result") {
          err(
            "ROL-001",
            `Edge "${e.id}": role consumes must target a process or result node, got kind ${to.kind} ("${to.label}").`,
            e.to,
            e.id,
          );
          break;
        }
        if (from.unit !== null && units[from.unit]) {
          const fromDim = units[from.unit].dimension;
          if (edgeDim !== fromDim)
            dimMismatch(fromDim, `the flow "${from.label}" is ${fromDim}`);
        }
        break;
      }
      case "converts_to": {
        if (from.kind === "emission_factor" || from.kind === "result") {
          err(
            "ROL-001",
            `Edge "${e.id}": role converts_to cannot originate from kind ${from.kind} ("${from.label}").`,
            e.to,
            e.id,
          );
          break;
        }
        if (from.unit === null || !units[from.unit] || from.quantity === null) break;
        const fromDim = units[from.unit].dimension;
        if (edgeDim !== fromDim) {
          dimMismatch(fromDim, "conversion must preserve dimension");
          break;
        }
        const fromBase = toBase(units, from.quantity, from.unit);
        const edgeBase = toBase(units, e.quantity, e.unit);
        if (!closeEnough(fromBase, edgeBase)) {
          err(
            "CNV-001",
            `Edge "${e.id}": bad conversion — "${from.label}" is ${from.quantity} ${from.unit} ` +
              `(= ${fromBase} ${BASE_UNIT[fromDim]} in base units) but the edge claims ${e.quantity} ${e.unit} ` +
              `(= ${edgeBase} ${BASE_UNIT[fromDim]}).`,
            e.to,
            e.id,
          );
        }
        if (to.quantity !== null && to.unit !== null && units[to.unit]) {
          const toBaseVal = toBase(units, to.quantity, to.unit);
          if (!closeEnough(fromBase, toBaseVal)) {
            err(
              "CNV-001",
              `Edge "${e.id}": target node "${to.label}" declares ${to.quantity} ${to.unit} ` +
                `but "${from.label}" converts to ${fromBase} ${BASE_UNIT[fromDim]} in base units.`,
              e.to,
              e.id,
            );
          }
        }
        break;
      }
    }
  }

  // CYC-001
  const cycle = findCyclePath(graph);
  if (cycle) {
    err(
      "CYC-001",
      `Dependency cycle detected: ${cycle.join(" → ")}. Evaluation cannot terminate; no result is computable.`,
      cycle[0],
    );
  }

  // RSL-001 / RSL-002: the GWP result node
  const results = graph.nodes.filter((n) => n.kind === "result" && n.label === "GWP");
  if (results.length === 0) {
    err("RSL-001", 'No result node labeled "GWP" — there is nothing to evaluate.');
  } else if (results.length > 1) {
    warn(
      "RSL-002",
      `Multiple result nodes labeled "GWP" (${results.map((n) => n.id).join(", ")}); using "${results.sort((a, b) => (a.id < b.id ? -1 : 1))[0].id}".`,
    );
  }

  // TOP-001: nodes that cannot reach the result (dead inputs)
  const result = gwpResultNode(graph);
  if (result) {
    const ancestors = new Set<string>();
    const rev = new Map<string, string[]>();
    for (const e of graph.edges) {
      if (!rev.has(e.to)) rev.set(e.to, []);
      rev.get(e.to)!.push(e.from);
    }
    const walk = (id: string) => {
      for (const p of rev.get(id) ?? []) {
        if (!ancestors.has(p)) {
          ancestors.add(p);
          walk(p);
        }
      }
    };
    walk(result.id);
    for (const n of graph.nodes) {
      if (n.id !== result.id && !ancestors.has(n.id)) {
        warn(
          "TOP-001",
          `Node "${n.label}" (${n.id}) is not connected to the GWP result — it cannot affect the number.`,
          n.id,
        );
      }
    }
  }

  return issues;
}
