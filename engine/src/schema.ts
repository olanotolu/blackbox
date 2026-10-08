/**
 * BLACKBOX deterministic engine — typed data contracts.
 *
 * All interfaces are validated with Zod. These types mirror the provisional
 * cross-agent data contract (see parent task). Two documented extensions:
 *  1. `Dimension` gains `"emission"` so direct emission amounts (kgCO2e)
 *     have a first-class dimension instead of piggy-backing on "mass".
 *  2. `Snapshot` gains `resultNodeId`, `gwp`, `nodeLabels`, `asOf` so diffs
 *     and packets don't need the original graph. `Fault` gains
 *     `trustworthy` (whether the number may still be presented).
 *
 * ASSUMPTION (explicit, illustrative only): the arithmetic in this engine is
 * a simplified LCA-style aggregation. It is NOT ISO 14040/14044/14025
 * compliant and must never be presented as such.
 */
import { z } from "zod";

// ---------------------------------------------------------------- dimensions

export const dimensionSchema = z.enum([
  "mass",
  "length",
  "volume",
  "energy",
  "transport",
  "emission", // EXTENSION: direct emission amounts, base unit kgCO2e
  "emission_factor",
  "dimensionless",
]);
export type Dimension = z.infer<typeof dimensionSchema>;

export const unitDefSchema = z.object({
  symbol: z.string().min(1),
  dimension: dimensionSchema,
  toBase: z.number().positive(),
});
export type UnitDef = z.infer<typeof unitDefSchema>;

// ----------------------------------------------------------------- entities

export const facilitySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  location: z.string(),
});
export type Facility = z.infer<typeof facilitySchema>;

export const productSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  facilityId: z.string(),
  declaredUnit: z.string(),
});
export type Product = z.infer<typeof productSchema>;

export const datasetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  version: z.string(),
  validFrom: z.string(), // ISO date; lexicographic comparison is valid for ISO-8601
  validTo: z.string().nullable(),
  publisher: z.string(),
});
export type Dataset = z.infer<typeof datasetSchema>;

export const evidenceKindSchema = z.enum([
  "invoice",
  "weigh_ticket",
  "utility_bill",
  "lab_report",
  "epd_pdf",
  "carrier_manifest",
]);
export type EvidenceKind = z.infer<typeof evidenceKindSchema>;

export const evidenceSchema = z.object({
  kind: evidenceKindSchema,
  ref: z.string(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

// -------------------------------------------------------------------- graph

export const nodeKindSchema = z.enum([
  "material_input",
  "process",
  "transport",
  "energy",
  "emission_factor",
  "result",
]);
export type NodeKind = z.infer<typeof nodeKindSchema>;

export const nodeSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  kind: nodeKindSchema,
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  datasetId: z.string().nullable(),
  datasetVersion: z.string().nullable(),
  evidence: z.array(evidenceSchema),
  note: z.string().optional(),
});
export type Node = z.infer<typeof nodeSchema>;

export const edgeRoleSchema = z.enum([
  "consumes",
  "emits",
  "applies_factor",
  "converts_to",
]);
export type EdgeRole = z.infer<typeof edgeRoleSchema>;

export const edgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  quantity: z.number(),
  unit: z.string(),
  role: edgeRoleSchema,
});
export type Edge = z.infer<typeof edgeSchema>;

export const graphSchema = z.object({
  id: z.string().min(1),
  productId: z.string(),
  version: z.string(),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});
export type Graph = z.infer<typeof graphSchema>;

// --------------------------------------------------------------- evaluation

export const nodeValueSchema = z.object({
  value: z.number(), // expressed in the SI base unit named by `unit`
  unit: z.string(), // base unit symbol, e.g. "kg", "MJ", "tkm", "kgCO2e"
});
export type NodeValue = z.infer<typeof nodeValueSchema>;

export const traceStepSchema = z.object({
  nodeId: z.string(),
  label: z.string(),
  kind: nodeKindSchema,
  value: z.number(),
  unit: z.string(),
  formula: z.string(),
  dataset: z.string().nullable(), // "id@version"
  contributionKgco2e: z.number().nullable(),
});
export type TraceStep = z.infer<typeof traceStepSchema>;

export const traceSchema = z.object({
  snapshotId: z.string(),
  resultNodeId: z.string(),
  gwp: z.number(),
  declaredUnit: z.string(),
  steps: traceStepSchema.array(),
  warnings: z.array(z.string()),
});
export type Trace = z.infer<typeof traceSchema>;

/**
 * Structural/semantic validation finding. `code` is a STABLE rule id
 * (e.g. "DIM-002") so the UI and Jev can key off it.
 */
export interface ValidationIssue {
  code: string;
  severity: "error" | "warning";
  nodeId?: string;
  edgeId?: string;
  message: string;
}

export interface EvaluateOk {
  ok: true;
  values: Record<string, NodeValue>;
  trace: Trace;
  warnings: string[];
}

export interface EvaluateFail {
  ok: false;
  issues: ValidationIssue[];
}

export type EvaluateResult = EvaluateOk | EvaluateFail;

// ---------------------------------------------------------------- snapshots

export const snapshotSchema = z.object({
  id: z.string(),
  graphId: z.string(),
  graphVersion: z.string(),
  createdAt: z.string(),
  reproHash: z.string(),
  values: z.record(z.string(), nodeValueSchema),
  warnings: z.array(z.string()),
  // EXTENSIONS (documented): provenance needed by diff/packet without the graph.
  resultNodeId: z.string(),
  gwp: z.number(),
  nodeLabels: z.record(z.string(), z.string()),
  asOf: z.string().nullable(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

// --------------------------------------------------------------------- diff

export const diffChangedNodeSchema = z.object({
  nodeId: z.string(),
  label: z.string(),
  oldValue: z.number(),
  newValue: z.number(),
  unit: z.string(),
});
export type DiffChangedNode = z.infer<typeof diffChangedNodeSchema>;

export const diffSchema = z.object({
  fromSnapshot: z.string(),
  toSnapshot: z.string(),
  changedNodes: z.array(diffChangedNodeSchema),
  gwpOld: z.number(),
  gwpNew: z.number(),
  gwpDelta: z.number(),
  explanations: z.array(z.string()),
});
export type Diff = z.infer<typeof diffSchema>;

// -------------------------------------------------------------------- faults

export const faultTypeSchema = z.enum([
  "unit_mismatch",
  "bad_conversion",
  "missing_input",
  "duplicate_contribution",
  "expired_reference",
  "cycle",
  "suspicious_value",
]);
export type FaultType = z.infer<typeof faultTypeSchema>;

export const faultSchema = z.object({
  type: faultTypeSchema,
  nodeId: z.string(),
  edgeId: z.string().optional(),
  detail: z.string(),
  affectedPath: z.array(z.string()), // node ids, source -> fault site
  /** EXTENSION: false => the result is quarantined and must not be
   *  presented as trustworthy. Only `suspicious_value` stays presentable
   *  (flagged with a warning); every other fault quarantines. */
  trustworthy: z.boolean(),
});
export type Fault = z.infer<typeof faultSchema>;

// ------------------------------------------------------------- EPD / packet

export const epdRecordSchema = z.object({
  id: z.string().min(1),
  productId: z.string(),
  facilityId: z.string(),
  issueDate: z.string(),
  expiryDate: z.string(),
  programOperator: z.string(),
  verification: z.object({
    status: z.enum(["third_party_verified", "self_declared", "pending"]),
    body: z.string().nullable(),
  }),
  evidence: z.array(
    z.object({
      item: z.string(),
      status: z.enum(["ok", "missing", "stale"]),
    }),
  ),
});
export type EpdRecord = z.infer<typeof epdRecordSchema>;

export const jevDecisionSchema = z.object({
  id: z.string(),
  workflow: z.literal("anomaly_triage"),
  subject: z.object({
    faultType: faultTypeSchema,
    nodeId: z.string(),
  }),
  permitted: z.object({
    taxonomy: z.array(z.string()),
    queues: z.array(z.string()),
    urgencies: z.array(z.string()),
  }),
  selected: z.object({
    taxonomy: z.string(),
    queue: z.string(),
    urgency: z.string(),
  }),
  evidenceConsidered: z.array(z.string()),
  rationale: z.string(),
  fallback: z.boolean(),
  at: z.string(),
});
export type JevDecision = z.infer<typeof jevDecisionSchema>;

export const evidencePacketSchema = z.object({
  packetId: z.string(),
  snapshotId: z.string(),
  reproHash: z.string(),
  generatedAt: z.string(),
  trace: traceSchema,
  diff: diffSchema.optional(),
  faults: z.array(faultSchema),
  jevDecisions: z.array(jevDecisionSchema),
  datasets: z.array(datasetSchema),
  disclaimer: z.string(),
});
export type EvidencePacket = z.infer<typeof evidencePacketSchema>;
