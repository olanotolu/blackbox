/**
 * BLACKBOX synthetic fixtures — canonical fixture library.
 *
 * EVERYTHING in this file is invented for demonstration (2026-10-07).
 * No real manufacturer data, no real company names, no real EPD numbers.
 *
 * Targets the canonical engine (engine/src, schema.ts = ground truth):
 *   Node kinds: material_input | process | transport | energy | emission_factor | result
 *   Edge roles: consumes | emits | applies_factor | converts_to
 *   Fault types: unit_mismatch | bad_conversion | missing_input |
 *                duplicate_contribution | expired_reference | cycle | suspicious_value
 *
 * Anchor story: CX-30 low-carbon ready-mix, GWP = 167 kgCO2e/m³ ("why is GWP 167?").
 *   v1 — Supplier A cement (factor 0.985, 230 km haul)      → GWP ≈ 188.2
 *   v2 — Supplier B cement (factor 0.842, 135 km haul)      → GWP = 167.00 (solved)
 *   v3 — v2 + green-tariff electricity (0.398 → 0.041)      → GWP ≈ 164.86
 */
import type {
  Dataset,
  Edge,
  EpdRecord,
  Evidence,
  Facility,
  FaultSpec,
  Graph,
  JevDecision,
  Node,
  Product,
} from "../../engine/src/index.js";
import { DEFAULT_UNITS, toBase } from "../../engine/src/index.js";

export const SYNTHETIC_LABEL =
  "SYNTHETIC — invented for demonstration (2026-10-07). Not real manufacturer data.";

/** Demo clock: expiry checks and packet timestamps anchor here. */
export const AS_OF = "2026-10-07";
export const AS_OF_V1 = "2024-06-01";
export const CREATED_AT = "2026-10-07T19:30:00Z";

// ---------------------------------------------------------------------------
// Facilities & products (canonical shapes)
// ---------------------------------------------------------------------------

export const FACILITIES: Facility[] = [
  { id: "fac-harborview", name: "Harborview RMX — Brooklyn NY", location: "Brooklyn, NY" },
  { id: "fac-riverside", name: "Riverside Concrete Works — Queens NY", location: "Long Island City, Queens, NY" },
  { id: "fac-meadowbrook", name: "Meadowbrook Batching — Edison NJ", location: "Edison, NJ" },
];

export const PRODUCTS: Product[] = [
  { id: "prod-cx30", name: "CX-30 low-carbon ready-mix", facilityId: "fac-harborview", declaredUnit: "1 m³" },
  { id: "prod-std40", name: "STD-40 standard ready-mix", facilityId: "fac-riverside", declaredUnit: "1 m³" },
  { id: "prod-he50", name: "HE-50 high-early-strength ready-mix", facilityId: "fac-meadowbrook", declaredUnit: "1 m³" },
  { id: "prod-eco25", name: "ECO-25 flowable fill", facilityId: "fac-harborview", declaredUnit: "1 m³" },
];

/** Fixture-level version catalog (not part of the engine Product shape). */
export const PRODUCT_VERSIONS: Record<string, { versions: string[]; currentVersion: string }> = {
  "prod-cx30": { versions: ["v1", "v2", "v3"], currentVersion: "v2" },
  "prod-std40": { versions: ["v1"], currentVersion: "v1" },
  "prod-he50": { versions: ["v1"], currentVersion: "v1" },
  "prod-eco25": { versions: ["v1"], currentVersion: "v1" },
};

// ---------------------------------------------------------------------------
// Datasets (canonical shape). All clean-graph references are valid at the
// snapshot asOf dates; v2019.4 / v2021 exist for the expired-reference story.
// ---------------------------------------------------------------------------

export const DATASETS: Dataset[] = [
  { id: "cement-lca", name: "Cement LCA — legacy release (superseded)", version: "v2019.4", validFrom: "2019-04-01", validTo: "2022-01-10", publisher: "SYNTHETIC" },
  { id: "cement-lca", name: "Harbor Cement Works — Portland cement EPD (Supplier A)", version: "v2023.1", validFrom: "2023-02-01", validTo: "2028-01-31", publisher: "SYNTHETIC" },
  { id: "cement-lca", name: "Blue Harbor Cement — Type IL EPD (Supplier B)", version: "v2024.1", validFrom: "2024-01-15", validTo: "2029-01-14", publisher: "SYNTHETIC" },
  { id: "cement-lca-rv", name: "Riverside Cement Terminal — Portland cement EPD", version: "v1.3", validFrom: "2023-06-01", validTo: "2028-05-31", publisher: "SYNTHETIC" },
  { id: "cement-lca-mb", name: "Meadowbrook Cement Co. — Portland cement EPD", version: "v2.0", validFrom: "2022-09-01", validTo: "2027-08-31", publisher: "SYNTHETIC" },
  { id: "scm-lci", name: "Regional SCM LCI — GGBS, fly ash, silica fume", version: "v3.0", validFrom: "2022-06-01", validTo: "2027-05-31", publisher: "SYNTHETIC" },
  { id: "agg-lci", name: "NY Metro aggregates LCI — sand & gravel", version: "v2.0", validFrom: "2024-03-01", validTo: "2029-02-28", publisher: "SYNTHETIC" },
  { id: "water-lci", name: "Municipal water supply LCI", version: "v1.0", validFrom: "2021-01-01", validTo: "2031-01-01", publisher: "SYNTHETIC" },
  { id: "admix-lci", name: "Admixture industry-average LCI", version: "v2.2", validFrom: "2023-09-01", validTo: "2028-08-31", publisher: "SYNTHETIC" },
  { id: "egrid-ny", name: "eGRID NY subregion factors (2021 data year)", version: "v2021", validFrom: "2022-01-01", validTo: "2024-12-31", publisher: "SYNTHETIC" },
  { id: "egrid-ny", name: "eGRID NY subregion factors (2023 data year)", version: "v2023", validFrom: "2024-01-01", validTo: "2027-12-31", publisher: "SYNTHETIC" },
  { id: "green-tariff", name: "Harborview Green Tariff — residual-mix disclosure", version: "v1.0", validFrom: "2026-01-01", validTo: "2027-12-31", publisher: "SYNTHETIC" },
  { id: "fuel-lci", name: "Fuel combustion factors — diesel (tailpipe + upstream)", version: "v2024", validFrom: "2024-01-01", validTo: "2029-12-31", publisher: "SYNTHETIC" },
  { id: "freight-lci", name: "Road freight factors — bulk & mixer trucks", version: "v2023", validFrom: "2023-01-01", validTo: "2028-12-31", publisher: "SYNTHETIC" },
];

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

export interface FlowSpec {
  id: string;
  label: string;
  kind: "material_input" | "energy" | "transport";
  quantity: number;
  unit: string;
  factorValue: number;
  factorUnit: string; // e.g. "kgCO2e/kg"
  datasetId: string;
  datasetVersion: string;
  evidence: Evidence[];
  note?: string;
  /** Aggregation parent; defaults to plant_energy for energy, batching otherwise. */
  parent?: string;
}

export interface LegSpec {
  id: string;
  label: string;
  tkm: number;
  ref: string;
}

export type FlowTweaks = Record<
  string,
  Partial<Pick<FlowSpec, "quantity" | "unit" | "factorValue" | "factorUnit" | "datasetId" | "datasetVersion" | "label">>
>;
export type LegTweaks = Record<string, Partial<Pick<LegSpec, "tkm" | "label">>>;

const FREIGHT = { value: 0.089, unit: "kgCO2e/tkm", datasetId: "freight-lci", datasetVersion: "v2023" };
const FREIGHT_MIXER = { value: 0.112, unit: "kgCO2e/tkm", datasetId: "freight-lci", datasetVersion: "v2023" };

const ev = (kind: Evidence["kind"], ref: string): Evidence => ({ kind, ref });

function denUnitOf(factorUnit: string): string {
  return factorUnit.split("/")[1];
}

/** Flow amount expressed in the factor's denominator unit (exact float). */
function flowInDenUnit(quantity: number, unit: string, denUnit: string): number {
  return toBase(DEFAULT_UNITS, quantity, unit) / toBase(DEFAULT_UNITS, 1, denUnit);
}

export function buildGraph(
  productId: string,
  version: string,
  flows: FlowSpec[],
  legs: LegSpec[],
  outboundTkm: number,
  outboundRef: string,
  flowTweaks: FlowTweaks = {},
  legTweaks: LegTweaks = {},
): Graph {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const addNode = (n: Node) => nodes.push(n);
  const addEdge = (e: Edge) => edges.push(e);

  addNode({
    id: "gwp", label: "GWP", kind: "result", quantity: null, unit: "m3",
    datasetId: null, datasetVersion: null,
    evidence: [ev("lab_report", `calc-${productId}-${version}`)],
    note: "GWP (A1–A3) incl. A4 delivery, per 1 m³. Sums all applies_factor contributions.",
  });
  for (const [pid, plabel, pnote] of [
    ["batching", "A1/A3 — batching & materials", "Aggregates material-input flows."],
    ["inbound", "A2 — inbound transport", "Aggregates inbound transport legs."],
    ["plant_energy", "A3 — plant energy & fuel", "Aggregates electricity and on-site fuel use."],
  ] as const) {
    addNode({
      id: pid, label: plabel, kind: "process", quantity: null, unit: null,
      datasetId: null, datasetVersion: null,
      evidence: [ev("weigh_ticket", `WB-${productId}-${version}`)], note: pnote,
    });
  }

  const wireFlow = (
    fid: string, label: string, kind: FlowSpec["kind"],
    quantity: number, unit: string,
    factorValue: number, factorUnit: string,
    datasetId: string, datasetVersion: string,
    evidence: Evidence[], note: string | undefined,
    parent: string,
  ) => {
    addNode({
      id: fid, label, kind, quantity, unit, datasetId, datasetVersion,
      evidence, ...(note ? { note } : {}),
    });
    const fnid = `f_${fid}`;
    addNode({
      id: fnid, label: `EF — ${label}`, kind: "emission_factor",
      quantity: factorValue, unit: factorUnit, datasetId, datasetVersion,
      evidence: [ev("epd_pdf", `dataset:${datasetId}@${datasetVersion}`)],
      note: `Emission factor ${factorValue} ${factorUnit} from ${datasetId}@${datasetVersion}.`,
    });
    addEdge({ id: `e-${fid}-cons`, from: fid, to: parent, quantity, unit, role: "consumes" });
    const den = denUnitOf(factorUnit);
    const appQty = flowInDenUnit(quantity, unit, den);
    if (unit !== den) {
      // Conversion audit edge: the flow's value expressed in the factor's denominator unit.
      addEdge({ id: `e-${fid}-conv`, from: fid, to: fnid, quantity: appQty, unit: den, role: "converts_to" });
    }
    // The edge carries the flow amount the factor applies to.
    addEdge({ id: `e-${fid}-app`, from: fnid, to: "gwp", quantity: appQty, unit: den, role: "applies_factor" });
  };

  for (const f of flows) {
    const t = flowTweaks[f.id] ?? {};
    wireFlow(
      f.id, t.label ?? f.label, f.kind,
      t.quantity ?? f.quantity, t.unit ?? f.unit,
      t.factorValue ?? f.factorValue, t.factorUnit ?? f.factorUnit,
      t.datasetId ?? f.datasetId, t.datasetVersion ?? f.datasetVersion,
      f.evidence, f.note,
      f.parent ?? (f.kind === "energy" ? "plant_energy" : "batching"),
    );
  }

  for (const l of legs) {
    const t = legTweaks[l.id] ?? {};
    const tkm = t.tkm ?? l.tkm;
    wireFlow(
      l.id, t.label ?? l.label, "transport", tkm, "tkm",
      FREIGHT.value, FREIGHT.unit, FREIGHT.datasetId, FREIGHT.datasetVersion,
      [ev("carrier_manifest", l.ref)], undefined, "inbound",
    );
  }

  wireFlow(
    "outbound_transport", "A4 — ready-mix delivery to site (mixer truck)", "transport",
    outboundTkm, "tkm",
    FREIGHT_MIXER.value, FREIGHT_MIXER.unit, FREIGHT_MIXER.datasetId, FREIGHT_MIXER.datasetVersion,
    [ev("carrier_manifest", outboundRef)],
    "Mixer-truck factor (higher than bulk freight): stop-start urban duty cycle.",
    "gwp", // transport leg reports straight into the result
  );

  for (const pid of ["batching", "inbound", "plant_energy"]) {
    addEdge({ id: `e-${pid}-res`, from: pid, to: "gwp", quantity: 1, unit: "1", role: "consumes" });
  }

  return { id: `graph-${productId}`, productId, version, nodes, edges };
}

// ---------------------------------------------------------------------------
// Mix specifications — quantities per 1 m³. All numbers invented.
// ---------------------------------------------------------------------------

const F = (
  id: string, label: string, kind: FlowSpec["kind"], quantity: number, unit: string,
  factorValue: number, factorUnit: string, datasetId: string, datasetVersion: string,
  ekind: Evidence["kind"], eref: string, note?: string, parent?: string,
): FlowSpec => ({
  id, label, kind, quantity, unit, factorValue, factorUnit, datasetId, datasetVersion,
  evidence: [ev(ekind, eref)], ...(note ? { note } : {}), ...(parent ? { parent } : {}),
});

export const CX30_V2_FLOWS: FlowSpec[] = [
  F("cement", "Cement — Type IL Portland (Supplier B: Blue Harbor Cement)", "material_input",
    0.14, "t", 0.842, "kgCO2e/kg", "cement-lca", "v2024.1",
    "weigh_ticket", "WB-HV-2026-1003", "Weighed in tonnes; factor per kg (t → kg on the converts_to edge)."),
  F("slag", "GGBS (ground granulated blast-furnace slag)", "material_input",
    120, "kg", 0.083, "kgCO2e/kg", "scm-lci", "v3.0", "weigh_ticket", "WB-HV-2026-1004"),
  F("flyash", "Fly ash — Class F", "material_input",
    40, "kg", 0.011, "kgCO2e/kg", "scm-lci", "v3.0", "weigh_ticket", "WB-HV-2026-1005"),
  F("fine_agg", "Fine aggregate — manufactured sand", "material_input",
    790, "kg", 0.0042, "kgCO2e/kg", "agg-lci", "v2.0", "weigh_ticket", "WB-HV-2026-1006"),
  F("coarse_agg", "Coarse aggregate — #57 stone", "material_input",
    1040, "kg", 0.0049, "kgCO2e/kg", "agg-lci", "v2.0", "weigh_ticket", "WB-HV-2026-1007"),
  F("water", "Batch water — municipal supply", "material_input",
    165, "kg", 0.0004, "kgCO2e/kg", "water-lci", "v1.0", "utility_bill", "NYCDEP-2026-09"),
  F("admixture", "Admixture — polycarboxylate superplasticizer", "material_input",
    4.8502, "lb", 2.6, "kgCO2e/kg", "admix-lci", "v2.2",
    "invoice", "ADM-2026-2204", "Batch ticket records pounds; factor per kg (lb → kg on the converts_to edge)."),
  F("electricity", "Plant electricity — grid (NY subregion)", "energy",
    6.0, "kWh", 0.398, "kgCO2e/kWh", "egrid-ny", "v2023", "utility_bill", "CONED-2026-09"),
  F("diesel", "Diesel — wheel loader & yard equipment", "material_input",
    1.7034, "L", 3.17, "kgCO2e/L", "fuel-lci", "v2024", "invoice", "FUEL-HV-2026-09", "plant_energy"),
];

export const CX30_V2_LEGS: LegSpec[] = [
  { id: "t_cement", label: "Cement delivery — Supplier B terminal → plant (135 km)", tkm: 18.9, ref: "FR-2026-9910" },
  { id: "t_slag", label: "GGBS delivery — 240 km", tkm: 28.8, ref: "FR-2026-9911" },
  { id: "t_flyash", label: "Fly ash delivery — 260 km", tkm: 10.4, ref: "FR-2026-9912" },
  { id: "t_agg", label: "Aggregates delivery — quarry → plant (45 km)", tkm: 82.35, ref: "FR-2026-9913" },
];

export const CX30_V1_FLOW_TWEAKS: FlowTweaks = {
  cement: {
    factorValue: 0.985, datasetVersion: "v2023.1",
    label: "Cement — Type I/II Portland (Supplier A: Harbor Cement Works)",
  },
};
export const CX30_V1_LEG_TWEAKS: LegTweaks = {
  t_cement: { tkm: 32.2, label: "Cement delivery — Supplier A terminal → plant (230 km)" },
};

export const CX30_V3_FLOW_TWEAKS: FlowTweaks = {
  electricity: {
    factorValue: 0.041, datasetId: "green-tariff", datasetVersion: "v1.0",
    label: "Plant electricity — green tariff (residual-mix disclosure)",
  },
};

export const STD40_FLOWS: FlowSpec[] = [
  F("cement", "Cement — Type I/II Portland (Riverside Cement Terminal)", "material_input",
    0.265, "t", 0.905, "kgCO2e/kg", "cement-lca-rv", "v1.3",
    "weigh_ticket", "WB-RV-2026-1001", "Weighed in tonnes; factor per kg."),
  F("flyash", "Fly ash — Class F", "material_input",
    40, "kg", 0.011, "kgCO2e/kg", "scm-lci", "v3.0", "weigh_ticket", "WB-RV-2026-1002"),
  F("fine_agg", "Fine aggregate — concrete sand", "material_input",
    740, "kg", 0.0042, "kgCO2e/kg", "agg-lci", "v2.0", "weigh_ticket", "WB-RV-2026-1003"),
  F("coarse_agg", "Coarse aggregate — #57 stone", "material_input",
    1080, "kg", 0.0049, "kgCO2e/kg", "agg-lci", "v2.0", "weigh_ticket", "WB-RV-2026-1004"),
  F("water", "Batch water — municipal supply", "material_input",
    170, "kg", 0.0004, "kgCO2e/kg", "water-lci", "v1.0", "utility_bill", "NYCDEP-2026-09"),
  F("admixture", "Admixture — mid-range water reducer", "material_input",
    3.2, "kg", 2.6, "kgCO2e/kg", "admix-lci", "v2.2", "invoice", "ADM-2026-2210"),
  F("electricity", "Plant electricity — grid (NY subregion)", "energy",
    7.0, "kWh", 0.398, "kgCO2e/kWh", "egrid-ny", "v2023", "utility_bill", "CONED-2026-09"),
  F("diesel", "Diesel — wheel loader & yard equipment", "material_input",
    2.2712, "L", 3.17, "kgCO2e/L", "fuel-lci", "v2024", "invoice", "FUEL-RV-2026-09", "plant_energy"),
];
export const STD40_LEGS: LegSpec[] = [
  { id: "t_cement", label: "Cement delivery — terminal → plant (120 km)", tkm: 31.8, ref: "FR-2026-8814" },
  { id: "t_agg", label: "Aggregates delivery — quarry → plant (50 km)", tkm: 91.0, ref: "FR-2026-8815" },
  { id: "t_flyash", label: "Fly ash delivery — 200 km", tkm: 8.0, ref: "FR-2026-8816" },
];

export const HE50_FLOWS: FlowSpec[] = [
  F("cement", "Cement — Type III Portland (Meadowbrook Cement Co.)", "material_input",
    0.30, "t", 0.888, "kgCO2e/kg", "cement-lca-mb", "v2.0",
    "weigh_ticket", "WB-MB-2026-1001", "Weighed in tonnes; factor per kg."),
  F("silica_fume", "Silica fume — densified", "material_input",
    20, "kg", 0.15, "kgCO2e/kg", "scm-lci", "v3.0", "weigh_ticket", "WB-MB-2026-1002"),
  F("fine_agg", "Fine aggregate — concrete sand", "material_input",
    700, "kg", 0.0042, "kgCO2e/kg", "agg-lci", "v2.0", "weigh_ticket", "WB-MB-2026-1003"),
  F("coarse_agg", "Coarse aggregate — #57 stone", "material_input",
    1050, "kg", 0.0049, "kgCO2e/kg", "agg-lci", "v2.0", "weigh_ticket", "WB-MB-2026-1004"),
  F("water", "Batch water — municipal supply", "material_input",
    150, "kg", 0.0004, "kgCO2e/kg", "water-lci", "v1.0", "utility_bill", "NJAW-2026-09"),
  F("admixture", "Admixture — accelerating + high-range water reducer", "material_input",
    4.0, "kg", 3.1, "kgCO2e/kg", "admix-lci", "v2.2", "invoice", "ADM-2026-2231"),
  F("electricity", "Plant electricity — grid (NJ subregion)", "energy",
    8.5, "kWh", 0.415, "kgCO2e/kWh", "egrid-ny", "v2023",
    "utility_bill", "PSEG-2026-09", "NJ subregion factor carried in the same dataset release."),
  F("diesel", "Diesel — wheel loader & yard equipment", "material_input",
    3.0283, "L", 3.17, "kgCO2e/L", "fuel-lci", "v2024", "invoice", "FUEL-MB-2026-09", "plant_energy"),
];
export const HE50_LEGS: LegSpec[] = [
  { id: "t_cement", label: "Cement delivery — plant → batching (160 km)", tkm: 48.0, ref: "FR-2026-7718" },
  { id: "t_agg", label: "Aggregates delivery — quarry → plant (60 km)", tkm: 105.0, ref: "FR-2026-7719" },
];

export const ECO25_FLOWS: FlowSpec[] = [
  F("cement", "Cement — Type IL Portland (Supplier B: Blue Harbor Cement)", "material_input",
    0.09, "t", 0.842, "kgCO2e/kg", "cement-lca", "v2024.1",
    "weigh_ticket", "WB-HV-2026-1010", "Weighed in tonnes; factor per kg."),
  F("flyash", "Fly ash — Class F", "material_input",
    60, "kg", 0.011, "kgCO2e/kg", "scm-lci", "v3.0", "weigh_ticket", "WB-HV-2026-1011"),
  F("fine_agg", "Fine aggregate — manufactured sand", "material_input",
    900, "kg", 0.0042, "kgCO2e/kg", "agg-lci", "v2.0", "weigh_ticket", "WB-HV-2026-1012"),
  F("coarse_agg", "Coarse aggregate — #8 stone", "material_input",
    800, "kg", 0.0049, "kgCO2e/kg", "agg-lci", "v2.0", "weigh_ticket", "WB-HV-2026-1013"),
  F("water", "Batch water — municipal supply", "material_input",
    200, "kg", 0.0004, "kgCO2e/kg", "water-lci", "v1.0", "utility_bill", "NYCDEP-2026-09"),
  F("admixture", "Admixture — flow stabilizer", "material_input",
    0.8, "kg", 2.6, "kgCO2e/kg", "admix-lci", "v2.2", "invoice", "ADM-2026-2240"),
  F("electricity", "Plant electricity — grid (NY subregion)", "energy",
    4.0, "kWh", 0.398, "kgCO2e/kWh", "egrid-ny", "v2023", "utility_bill", "CONED-2026-09"),
  F("diesel", "Diesel — wheel loader & yard equipment", "material_input",
    1.2, "L", 3.17, "kgCO2e/L", "fuel-lci", "v2024", "invoice", "FUEL-HV-2026-09", "plant_energy"),
];
export const ECO25_LEGS: LegSpec[] = [
  { id: "t_cement", label: "Cement delivery — Supplier B terminal → plant (135 km)", tkm: 12.15, ref: "FR-2026-9914" },
  { id: "t_agg", label: "Aggregates delivery — quarry → plant (45 km)", tkm: 76.5, ref: "FR-2026-9915" },
  { id: "t_flyash", label: "Fly ash delivery — 260 km", tkm: 15.6, ref: "FR-2026-9916" },
];

// ---------------------------------------------------------------------------
// Fault specs — one injectable spec per fault type, referencing real node ids
// of the CX-30 v2 graph. Injected live via injectFault(); detected via
// detectFaults(). Graphs ship CLEAN.
// ---------------------------------------------------------------------------

export const FAULT_SPECS: FaultSpec[] = [
  { type: "unit_mismatch", nodeId: "cement" },
  { type: "bad_conversion", nodeId: "admixture" },
  { type: "missing_input", nodeId: "admixture" },
  { type: "duplicate_contribution", nodeId: "f_admixture" },
  { type: "expired_reference", nodeId: "f_cement" },
  { type: "cycle", nodeId: "gwp" },
  { type: "suspicious_value", nodeId: "f_cement" },
];

/** Human-readable documentation for each fault spec (not sent to the engine). */
export const FAULT_DOCS: Record<string, { title: string; description: string; expected: string }> = {
  unit_mismatch: {
    title: "Incompatible unit",
    description: "The first edge touching the cement node gets a unit of a different dimension (mass → dimensionless).",
    expected: "validateGraph raises DIM-002 → detectFaults reports unit_mismatch (trustworthy: false).",
  },
  bad_conversion: {
    title: "Incorrect conversion",
    description: "The admixture lb→kg converts_to edge quantity is corrupted (×10+1), so the audit edge disagrees with the unit table.",
    expected: "validateGraph raises CNV-001 → detectFaults reports bad_conversion (trustworthy: false).",
  },
  missing_input: {
    title: "Missing input source",
    description: "The admixture node's quantity is deleted — its input data vanishes while the factor remains.",
    expected: "validateGraph raises QTY-001 → detectFaults reports missing_input (trustworthy: false).",
  },
  duplicate_contribution: {
    title: "Duplicated contribution",
    description: "The first applies_factor edge (admixture) is wired a second time — its contribution is double-counted.",
    expected: "detectFaults reports duplicate_contribution (trustworthy: false); GWP rises by one admixture contribution.",
  },
  expired_reference: {
    title: "Expired data reference",
    description: "The cement factor node's dataset version is suffixed '-bogus', making it unresolvable (treated as expired).",
    expected: "detectFaults reports expired_reference (trustworthy: false).",
  },
  cycle: {
    title: "Dependency cycle",
    description: "A converts_to back-edge is added from the batching process to the admixture flow — a physical impossibility.",
    expected: "validateGraph raises CYC-001 → detectFaults reports cycle (trustworthy: false); evaluation refuses.",
  },
  suspicious_value: {
    title: "Suspicious silent change",
    description: "The cement factor is scaled ×100 with no dataset change — trips the dominance heuristic.",
    expected: "detectFaults reports suspicious_value (trustworthy: true — flagged with a warning, still presentable).",
  },
};

// ---------------------------------------------------------------------------
// EPD records — October 2026 expiration wave (all synthetic, never verified)
// ---------------------------------------------------------------------------

export const EPD_RECORDS: EpdRecord[] = [
  {
    id: "epd-hv-cx30-2021", productId: "prod-cx30", facilityId: "fac-harborview",
    programOperator: "SYNTHETIC-PO",
    verification: { status: "self_declared", body: "SYNTHETIC-VERIFIER" },
    issueDate: "2021-10-19", expiryDate: "2026-10-19",
    evidence: [
      { item: "Cement supplier EPD (current revision) — Cites cement-lca@v2019.4, validity ended 2022-01-10 — refresh to v2024.1 required.", status: "stale" },
      { item: "Plant electricity bills — trailing 12 months — CONED bills 2025-10 → 2026-09 on file.", status: "ok" },
      { item: "Transport distance logs — Freight manifests FR-2026-99xx on file.", status: "ok" },
      { item: "Admixture LCI / SDS — No supplier LCI on file; industry-average placeholder in use.", status: "missing" },
      { item: "SCM sourcing documentation — GGBS + fly ash mill certs on file.", status: "ok" },
      { item: "Batch records — representative production — Latest batch record 2024-06 (mix v1); refresh with current v2 mix.", status: "stale" },
    ],
  },
  {
    id: "epd-hv-cx30-2016", productId: "prod-cx30", facilityId: "fac-harborview",
    programOperator: "SYNTHETIC-PO",
    verification: { status: "self_declared", body: "SYNTHETIC-VERIFIER" },
    issueDate: "2016-10-19", expiryDate: "2021-10-19",
    evidence: [
      { item: "Cement supplier EPD (current revision) — Superseded by the 2021 declaration.", status: "stale" },
      { item: "Plant electricity bills — trailing 12 months — 2016 billing period; superseded.", status: "stale" },
      { item: "Batch records — representative production — Superseded by the 2021 declaration.", status: "stale" },
    ],
  },
  {
    id: "epd-rv-std40-2021", productId: "prod-std40", facilityId: "fac-riverside",
    programOperator: "SYNTHETIC-PO",
    verification: { status: "self_declared", body: "SYNTHETIC-VERIFIER" },
    issueDate: "2021-10-04", expiryDate: "2026-10-04",
    evidence: [
      { item: "Cement supplier EPD (current revision) — Cites a 2021 supplier EPD; refresh to cement-lca-rv@v1.3 required.", status: "stale" },
      { item: "Plant electricity bills — trailing 12 months — CONED bills 2025-10 → 2026-09 on file.", status: "ok" },
      { item: "Transport distance logs — No 2026 freight manifests attached.", status: "missing" },
      { item: "Batch records — representative production — Latest batch record 2023-11.", status: "stale" },
    ],
  },
  {
    id: "epd-rv-std40-2016", productId: "prod-std40", facilityId: "fac-riverside",
    programOperator: "SYNTHETIC-PO",
    verification: { status: "self_declared", body: "SYNTHETIC-VERIFIER" },
    issueDate: "2016-10-04", expiryDate: "2021-10-04",
    evidence: [
      { item: "Cement supplier EPD (current revision) — Superseded by the 2021 declaration.", status: "stale" },
      { item: "Batch records — representative production — Superseded by the 2021 declaration.", status: "stale" },
    ],
  },
  {
    id: "epd-mb-he50-2022", productId: "prod-he50", facilityId: "fac-meadowbrook",
    programOperator: "SYNTHETIC-PO",
    verification: { status: "self_declared", body: "SYNTHETIC-VERIFIER" },
    issueDate: "2022-03-15", expiryDate: "2027-03-15",
    evidence: [
      { item: "Cement supplier EPD (current revision) — cement-lca-mb@v2.0 on file, valid to 2027-08-31.", status: "ok" },
      { item: "Plant electricity bills — trailing 12 months — PSE&G bills 2025-10 → 2026-09 on file.", status: "ok" },
      { item: "Transport distance logs — Freight manifests FR-2026-77xx on file.", status: "ok" },
      { item: "Batch records — representative production — Latest batch record 2025-08; refresh before the 2027 renewal.", status: "stale" },
    ],
  },
  {
    id: "epd-hv-eco25-2024", productId: "prod-eco25", facilityId: "fac-harborview",
    programOperator: "SYNTHETIC-PO",
    verification: { status: "self_declared", body: "SYNTHETIC-VERIFIER" },
    issueDate: "2024-05-01", expiryDate: "2029-04-30",
    evidence: [
      { item: "Cement supplier EPD (current revision) — cement-lca@v2024.1 on file.", status: "ok" },
      { item: "Plant electricity bills — trailing 12 months — CONED bills 2025-10 → 2026-09 on file.", status: "ok" },
      { item: "Transport distance logs — Freight manifests FR-2026-99xx on file.", status: "ok" },
      { item: "Batch records — representative production — Batch record 2026-09 on file.", status: "ok" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Jev decisions — illustrative bounded-judgment records for the Jev agent.
// Produced by the deterministic fallback, clearly labeled — not model output.
// ---------------------------------------------------------------------------

export const JEV_DECISIONS: JevDecision[] = [
  {
    id: "jevdec-001", workflow: "anomaly_triage",
    subject: { faultType: "suspicious_value", nodeId: "f_cement" },
    permitted: {
      taxonomy: ["data_entry_slip", "unattributed_edit", "real_process_change", "dataset_error"],
      queues: ["data_steward", "engineering_review", "supplier_followup"],
      urgencies: ["urgent", "routine", "low"],
    },
    selected: { taxonomy: "data_entry_slip", queue: "data_steward", urgency: "urgent" },
    evidenceConsidered: [
      "detected fault suspicious_value on node 'f_cement' (snapshot of CX-30 v2)",
      "emission factor moved 0.842 → 84.2 (exactly 100x): classic decimal-slip signature",
      "dataset still cement-lca@v2024.1 with no version bump and no change record",
      "no supporting evidence of a real process change (same supplier, same mill cert)",
    ],
    rationale: "Illustrative deterministic-fallback decision: an exact 100x move with no dataset version bump matches 'data_entry_slip' better than a real process change (no supporting evidence) or dataset error (the cited release is valid). Routed to the data steward urgently because downstream EPD evidence cites this factor. The deterministic detector already flagged the value; this judgment only prioritizes the human review.",
    fallback: true, at: "2026-10-07T19:35:00Z",
  },
  {
    id: "jevdec-002", workflow: "anomaly_triage",
    subject: { faultType: "expired_reference", nodeId: "f_cement" },
    permitted: {
      taxonomy: ["data_entry_slip", "unattributed_edit", "real_process_change", "dataset_error"],
      queues: ["data_steward", "engineering_review", "supplier_followup"],
      urgencies: ["urgent", "routine", "low"],
    },
    selected: { taxonomy: "dataset_error", queue: "data_steward", urgency: "routine" },
    evidenceConsidered: [
      "detected fault expired_reference on node 'f_cement' (snapshot of CX-30 v2)",
      "cement-lca@v2019.4 validTo 2022-01-10 is before snapshot asOf 2026-10-07",
      "current release cement-lca@v2024.1 is valid until 2029-01-14",
      "no EPD in the October 2026 expiration wave cites this node revision",
    ],
    rationale: "Illustrative deterministic-fallback decision: the reference pins a superseded dataset release, so 'dataset_error' is the right taxonomy and the deterministic fix is re-pinning to the current release. Routine urgency: nothing in the October expiration wave depends on this node revision.",
    fallback: true, at: "2026-10-07T19:36:00Z",
  },
];
