/**
 * BLACKBOX fixture generator (canonical engine).
 *
 * Builds every graph version, runs the REAL canonical evaluate() on each
 * (all must return ok:true), takes snapshots, diffs versions, verifies each
 * fault spec via injectFault()+detectFaults(), builds the evidence packet,
 * and writes every JSON file under fixtures/.
 *
 * Run:  npx vitest run src/generate.test.ts   (from fixtures/)
 * All numbers below are invented for demonstration (2026-10-07).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_UNITS,
  buildEvidencePacket,
  detectFaults,
  diffSnapshots,
  evaluate,
  graphSchema,
  injectFault,
  isEvaluateOk,
  takeSnapshot,
} from "../../engine/src/index.js";
import type { Graph, Snapshot, Trace } from "../../engine/src/index.js";
import {
  AS_OF,
  AS_OF_V1,
  CREATED_AT,
  CX30_V1_FLOW_TWEAKS,
  CX30_V1_LEG_TWEAKS,
  CX30_V2_FLOWS,
  CX30_V2_LEGS,
  CX30_V3_FLOW_TWEAKS,
  DATASETS,
  ECO25_FLOWS,
  ECO25_LEGS,
  EPD_RECORDS,
  FACILITIES,
  FAULT_DOCS,
  FAULT_SPECS,
  HE50_FLOWS,
  HE50_LEGS,
  JEV_DECISIONS,
  PRODUCTS,
  PRODUCT_VERSIONS,
  STD40_FLOWS,
  STD40_LEGS,
  SYNTHETIC_LABEL,
  buildGraph,
} from "./index.js";

const HERE = dirname(fileURLToPath(import.meta.url)); // fixtures/src
const FIXTURES = join(HERE, ".."); // fixtures/

function write(rel: string, payload: Record<string, unknown>): void {
  const p = join(FIXTURES, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ _header: SYNTHETIC_LABEL, ...payload }, null, 2) + "\n");
  console.log("wrote", rel);
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log("ok -", msg);
}

export interface GenResult {
  gwps: Record<string, number>;
  snapshotIds: Record<string, string>;
}

export function main(): GenResult {
  // ---- 1. solve the CX-30 v2 outbound leg so the anchor is exactly 167 ----
  const probe = buildGraph("prod-cx30", "v2", CX30_V2_FLOWS, CX30_V2_LEGS, 0, "delivery-ticket:HV-2026-10-04-031");
  const r0 = evaluate(probe, DEFAULT_UNITS, DATASETS, AS_OF);
  if (!isEvaluateOk(r0)) throw new Error(`probe evaluation failed: ${JSON.stringify(r0.issues)}`);
  const outboundTkm = (167 - r0.trace.gwp) / 0.112;
  console.log(`solved CX-30 outbound tkm = ${outboundTkm}`);

  // ---- 2. build all graph versions ----
  const graphs: Record<string, Graph> = {
    "cx30-v1": buildGraph("prod-cx30", "v1", CX30_V2_FLOWS, CX30_V2_LEGS, outboundTkm,
      "delivery-ticket:HV-2024-06-02-014", CX30_V1_FLOW_TWEAKS, CX30_V1_LEG_TWEAKS),
    "cx30-v2": buildGraph("prod-cx30", "v2", CX30_V2_FLOWS, CX30_V2_LEGS, outboundTkm,
      "delivery-ticket:HV-2026-10-04-031"),
    "cx30-v3": buildGraph("prod-cx30", "v3", CX30_V2_FLOWS, CX30_V2_LEGS, outboundTkm,
      "delivery-ticket:HV-2026-10-05-002", CX30_V3_FLOW_TWEAKS),
    "std40-v1": buildGraph("prod-std40", "v1", STD40_FLOWS, STD40_LEGS, 55.1568,
      "delivery-ticket:RV-2026-10-03-042"),
    "he50-v1": buildGraph("prod-he50", "v1", HE50_FLOWS, HE50_LEGS, 33.33,
      "delivery-ticket:MB-2026-10-02-019"),
    "eco25-v1": buildGraph("prod-eco25", "v1", ECO25_FLOWS, ECO25_LEGS, 36.9144,
      "delivery-ticket:HV-2026-10-04-040"),
  };
  const asOf: Record<string, string> = {
    "cx30-v1": AS_OF_V1, "cx30-v2": AS_OF, "cx30-v3": AS_OF,
    "std40-v1": AS_OF, "he50-v1": AS_OF, "eco25-v1": AS_OF,
  };

  // ---- 3. Zod-validate + evaluate + snapshot every version ----
  const snaps: Record<string, Snapshot> = {};
  const traces: Record<string, Trace> = {};
  const gwps: Record<string, number> = {};
  for (const [name, g] of Object.entries(graphs)) {
    graphSchema.parse(g); // contract shape check
    const r = evaluate(g, DEFAULT_UNITS, DATASETS, asOf[name]);
    assert(isEvaluateOk(r), `${name}: canonical evaluate() ok:true`);
    if (!isEvaluateOk(r)) throw new Error("unreachable");
    const snap = takeSnapshot(g, r, CREATED_AT, asOf[name]);
    const trace: Trace = { ...r.trace, snapshotId: snap.id };
    snaps[name] = snap;
    traces[name] = trace;
    gwps[name] = r.trace.gwp;
    write(`graphs/${name}.json`, { graph: g });
    write(`snapshots/${snap.id}.json`, { snapshot: snap });
    write(`traces/${name}.trace.json`, { trace });
  }

  // ---- catalog files ----
  write("facilities.json", { facilities: FACILITIES });
  write("products.json", { products: PRODUCTS, versions: PRODUCT_VERSIONS });
  write("datasets.json", { datasets: DATASETS });
  write("units.json", { units: DEFAULT_UNITS });

  // ---- 4. anchor assertions (the demo hinges on these) ----
  assert(Math.abs(gwps["cx30-v2"] - 167) < 1e-9, `CX-30 v2 GWP == 167 (got ${gwps["cx30-v2"]})`);
  assert(gwps["cx30-v1"] > 187 && gwps["cx30-v1"] < 190, `CX-30 v1 GWP ~= 188 (got ${gwps["cx30-v1"]})`);
  assert(Math.abs(gwps["cx30-v2"] - gwps["cx30-v3"] - 2.142) < 1e-9,
    `CX-30 v2→v3 delta == -2.142 (got ${gwps["cx30-v2"] - gwps["cx30-v3"]})`);
  assert(gwps["std40-v1"] > 283 && gwps["std40-v1"] < 287, `STD-40 GWP ~= 285 (got ${gwps["std40-v1"]})`);
  assert(gwps["he50-v1"] > 318 && gwps["he50-v1"] < 323, `HE-50 GWP ~= 320 (got ${gwps["he50-v1"]})`);
  assert(gwps["eco25-v1"] > 100 && gwps["eco25-v1"] < 108, `ECO-25 GWP ~= 104 (got ${gwps["eco25-v1"]})`);

  // ---- 5. diffs (same graphId across versions by construction) ----
  const diff12 = diffSnapshots(snaps["cx30-v1"], snaps["cx30-v2"]);
  const diff23 = diffSnapshots(snaps["cx30-v2"], snaps["cx30-v3"]);
  write("diffs/cx30-v1--v2.json", { diff: diff12 });
  write("diffs/cx30-v2--v3.json", { diff: diff23 });
  assert(diff12.changedNodes.some((c) => c.nodeId === "f_cement"), "v1→v2 diff touches the cement factor node");
  assert(diff23.changedNodes.some((c) => c.nodeId === "f_electricity"), "v2→v3 diff touches the electricity factor node");

  // ---- 6. fault specs: inject live, verify detection ----
  const faultReport = FAULT_SPECS.map((spec) => {
    const faulted = injectFault(graphs["cx30-v2"], spec);
    const detected = detectFaults(faulted, DEFAULT_UNITS, DATASETS, AS_OF);
    const hit = detected.find((f) => f.type === spec.type);
    assert(!!hit, `fault ${spec.type}: injectFault+detectFaults round-trip detects '${spec.type}'`);
    return {
      ...spec,
      documentation: FAULT_DOCS[spec.type],
      targetGraph: graphs["cx30-v2"].id,
      detected: hit!,
    };
  });
  write("faults.json", { faultSpecs: faultReport });

  // ---- 7. EPDs, Jev decisions, evidence packet ----
  write("epds.json", { epdRecords: EPD_RECORDS });
  write("jev-decisions.json", {
    illustrative: true,
    note: "Example bounded-judgment records for the Jev integration agent. Produced by the deterministic fallback, clearly labeled — not model output.",
    decisions: JEV_DECISIONS,
  });
  const packet = buildEvidencePacket({
    snapshot: snaps["cx30-v2"],
    trace: traces["cx30-v2"],
    diff: diff12,
    faults: [],
    jevDecisions: JEV_DECISIONS,
    datasets: DATASETS,
  });
  write("packets/cx30-v2.packet.json", { packet });
  assert(packet.reproHash === snaps["cx30-v2"].reproHash, "packet reproHash pins the snapshot");

  console.log("\nAll fixture generation assertions passed.");
  const snapshotIds: Record<string, string> = {};
  for (const [name, s] of Object.entries(snaps)) {
    snapshotIds[name] = s.id;
    console.log(`  ${name}: GWP = ${gwps[name].toFixed(4)} kgCO2e/m³  (${s.id})`);
  }
  return { gwps, snapshotIds };
}
