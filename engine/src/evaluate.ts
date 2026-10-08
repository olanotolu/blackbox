/**
 * Deterministic graph evaluation.
 *
 * EVALUATION SEMANTICS (explicit):
 *  - Nodes are evaluated in topological order; every intermediate value is
 *    recorded. Quantities are converted to SI base units via UnitDef.toBase.
 *  - material_input / energy / transport: value = quantity × toBase(unit),
 *    reported in the dimension's base unit (kg, MJ, tkm…).
 *  - emission_factor: value = quantity × toBase(num)/toBase(den), i.e. the
 *    factor expressed as kgCO2e per BASE unit of the flow dimension.
 *    E.g. 0.12 kgCO2e/kWh → 0.12/3.6 = 0.0333 kgCO2e/MJ.
 *  - process: value = Σ of consumes-predecessor base values (topology only;
 *    shown for inspection). Mixed input dimensions → unit "mixed".
 *  - result (label "GWP"): gwp = Σ over incoming applies_factor edges of
 *    (flow amount in base × factor in base) + Σ over incoming emits edges
 *    of (emission amount in base). Reported in kg CO2e per declared unit,
 *    where the declared unit is the result node's `unit` field.
 *
 * STRICTNESS: structural errors (validateGraph), or any detected fault
 * except suspicious_value, make evaluation fail — a quarantined number is
 * never presented as trustworthy. suspicious_value degrades to a warning.
 *
 * This is a simplified illustrative aggregation, NOT ISO 14040/44 LCA.
 */
import type {
  Dataset,
  Edge,
  EvaluateFail,
  EvaluateOk,
  EvaluateResult,
  Graph,
  Node,
  NodeValue,
  Trace,
  TraceStep,
  UnitDef,
  ValidationIssue,
} from "./schema";
import { BASE_UNIT, parseFactorUnit, toBase, toBaseFactor } from "./units";
import { gwpResultNode, topoOrder, validateGraph } from "./graph";
import { detectFaults, type Fault } from "./faults";

function fmt(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a !== 0 && (a >= 1e9 || a < 1e-4)) return n.toExponential(3);
  return String(Number(n.toFixed(digits)));
}

function faultToIssue(f: Fault): ValidationIssue {
  return {
    code: `FAULT_${f.type.toUpperCase()}`,
    severity: "error",
    nodeId: f.nodeId,
    edgeId: f.edgeId,
    message: `[${f.type}] ${f.detail} (affected path: ${f.affectedPath.join(" → ") || "—"})`,
  };
}

/** Days between two ISO dates (date-only or datetime). NaN-safe. */
function daysBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 86_400_000;
}

export function evaluate(
  graph: Graph,
  units: Record<string, UnitDef>,
  datasets: Dataset[],
  asOf?: string,
): EvaluateResult {
  // 1. Structural validation.
  const structural = validateGraph(graph, units);
  const structuralErrors = structural.filter((i) => i.severity === "error");
  if (structuralErrors.length) return { ok: false, issues: structuralErrors };

  // 2. Fault detection: quarantine everything but suspicious_value.
  const faults = detectFaults(graph, units, datasets, asOf ?? null);
  const warnings: string[] = structural
    .filter((i) => i.severity === "warning")
    .map((i) => `[${i.code}] ${i.message}`);
  const blockers = faults.filter((f) => f.type !== "suspicious_value");
  if (blockers.length) return { ok: false, issues: blockers.map(faultToIssue) };
  for (const f of faults)
    warnings.push(`[suspicious_value] ${f.detail} (node ${f.nodeId})`);

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const order = topoOrder(graph)!; // acyclic: validateGraph passed
  const result = gwpResultNode(graph)!; // present: validateGraph passed

  const values: Record<string, NodeValue> = {};
  const stepById = new Map<string, TraceStep>();

  // Dataset lookup for trace + expiry-soon warnings.
  const dsByKey = new Map(datasets.map((d) => [`${d.id}@${d.version}`, d]));

  for (const id of order) {
    const n = byId.get(id)!;
    if (n.kind === "result") continue; // computed after contributions

    let value = 0;
    let unit = BASE_UNIT.mass;
    let formula: string;

    if (n.kind === "emission_factor") {
      const { num, den, denDim } = parseFactorUnit(units, n.unit!);
      const factorBase = n.quantity! * (toBaseFactor(units, num) / toBaseFactor(units, den));
      value = factorBase;
      unit = `kgCO2e/${BASE_UNIT[denDim]}`;
      formula =
        `${fmt(n.quantity!)} ${n.unit} = ${fmt(factorBase)} kgCO2e per ${BASE_UNIT[denDim]} ` +
        `(÷ ${fmt(toBaseFactor(units, den))} ${den} per ${BASE_UNIT[denDim]})`;
    } else if (n.kind === "process") {
      const preds = graph.edges.filter(
        (e) => e.to === id && e.role === "consumes" && byId.has(e.from),
      );
      const dims = new Set(
        preds.map((e) => values[e.from]?.unit).filter(Boolean),
      );
      value = preds.reduce((s, e) => s + (values[e.from]?.value ?? 0), 0);
      unit = dims.size === 1 ? [...dims][0]! : "mixed";
      formula =
        preds.length === 0
          ? "no consumes inputs (value 0)"
          : `Σ consumes inputs = ${preds.map((e) => `${byId.get(e.from)!.label}: ${fmt(values[e.from]?.value ?? 0)}`).join(" + ")} = ${fmt(value)} ${unit}`;
      if (preds.length === 0)
        warnings.push(`Process node "${n.label}" (${n.id}) has no consumes inputs.`);
    } else {
      // material_input | energy | transport
      const dim = units[n.unit!]!.dimension;
      value = toBase(units, n.quantity!, n.unit!);
      unit = BASE_UNIT[dim];
      formula = `${fmt(n.quantity!)} ${n.unit} × ${fmt(toBaseFactor(units, n.unit!))} = ${fmt(value)} ${unit}`;
    }

    const dataset =
      n.datasetId !== null ? `${n.datasetId}@${n.datasetVersion ?? "?"}` : null;
    if (n.datasetId !== null && asOf) {
      const ds = dsByKey.get(`${n.datasetId}@${n.datasetVersion}`);
      if (ds?.validTo) {
        const daysLeft = daysBetween(asOf, ds.validTo);
        if (daysLeft >= 0 && daysLeft <= 90) {
          warnings.push(
            `Dataset ${n.datasetId}@${n.datasetVersion} (node "${n.label}") expires in ${Math.floor(daysLeft)}d (${ds.validTo}) — evidence refresh will be needed.`,
          );
        }
      }
    }

    values[id] = { value, unit };
    stepById.set(id, {
      nodeId: id,
      label: n.label,
      kind: n.kind,
      value,
      unit,
      formula,
      dataset,
      contributionKgco2e: null, // filled below for contributing nodes
    });
  }

  // Contributions into the GWP result.
  const contributions = new Map<string, number>(); // nodeId -> kgCO2e
  const contribLines: string[] = [];
  for (const e of graph.edges.filter((e) => e.to === result.id)) {
    const from = byId.get(e.from)!;
    if (e.role === "applies_factor") {
      const { num, den } = parseFactorUnit(units, from.unit!);
      const amountBase = toBase(units, e.quantity, e.unit);
      const factorBase =
        from.quantity! * (toBaseFactor(units, num) / toBaseFactor(units, den));
      const contrib = amountBase * factorBase;
      contributions.set(e.from, (contributions.get(e.from) ?? 0) + contrib);
      const denBaseUnit = BASE_UNIT[units[den].dimension];
      contribLines.push(
        `${from.label}: ${fmt(e.quantity)} ${e.unit} (= ${fmt(amountBase)} ${denBaseUnit}) × ` +
          `${fmt(from.quantity!)} ${from.unit} = ${fmt(contrib)} kgCO2e`,
      );
    } else if (e.role === "emits") {
      const contrib = toBase(units, e.quantity, e.unit);
      contributions.set(e.from, (contributions.get(e.from) ?? 0) + contrib);
      contribLines.push(
        `${from.label}: direct emission ${fmt(e.quantity)} ${e.unit} = ${fmt(contrib)} kgCO2e`,
      );
    }
    // consumes into result: topology only, no direct contribution.
  }

  const gwp = [...contributions.values()].reduce((s, v) => s + v, 0);
  values[result.id] = { value: gwp, unit: "kgCO2e" };
  const declaredUnit = result.unit ?? "unit";

  const steps: TraceStep[] = order.map((id) => {
    const n = byId.get(id)!;
    if (id === result.id) {
      return {
        nodeId: id,
        label: n.label,
        kind: n.kind,
        value: gwp,
        unit: "kgCO2e",
        formula:
          contribLines.length > 0
            ? `GWP = Σ contributions = ${contribLines.join(" + ")} = ${fmt(gwp)} kgCO2e per ${declaredUnit}`
            : `GWP = 0 kgCO2e per ${declaredUnit} (no contributing edges)`,
        dataset: null,
        contributionKgco2e: gwp,
      };
    }
    const step = stepById.get(id)!;
    const c = contributions.get(id);
    return { ...step, contributionKgco2e: c ?? null };
  });

  const trace: Trace = {
    snapshotId: "", // filled by takeSnapshot
    resultNodeId: result.id,
    gwp,
    declaredUnit,
    steps,
    warnings: [...warnings],
  };

  return { ok: true, values, trace, warnings };
}

/** Type guard for the evaluate() result union. */
export function isEvaluateOk(r: EvaluateResult): r is EvaluateOk {
  return r.ok === true;
}

export type { EvaluateFail, EvaluateOk };
