/**
 * Snapshot bundles for the demo app — built from the canonical fixtures
 * (blackbox-fixtures) with the canonical engine (blackbox-engine).
 *
 * Mirrors fixtures/src/generate.ts: solves the CX-30 v2 outbound leg so the
 * anchor GWP is exactly 167.00, evaluates every graph version, and takes
 * immutable snapshots. Computed once and cached.
 */
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
  HE50_FLOWS,
  HE50_LEGS,
  STD40_FLOWS,
  STD40_LEGS,
  buildGraph,
} from "blackbox-fixtures";
import {
  DEFAULT_UNITS,
  evaluate,
  isEvaluateOk,
  takeSnapshot,
  type Graph,
  type Snapshot,
  type Trace,
} from "blackbox-engine";

export interface SnapshotBundle {
  key: string;
  productId: string;
  version: string;
  label: string;
  graph: Graph;
  snapshot: Snapshot;
  trace: Trace;
}

function mustEvaluate(graph: Graph, asOf: string): { snapshot: Snapshot; trace: Trace } {
  const r = evaluate(graph, DEFAULT_UNITS, DATASETS, asOf);
  if (!isEvaluateOk(r)) {
    throw new Error(
      `Bundle evaluation failed for ${graph.id} v${graph.version}: ` +
        r.issues.map((i) => `[${i.code}] ${i.message}`).join("; "),
    );
  }
  const snapshot = takeSnapshot(graph, r, CREATED_AT, asOf);
  return { snapshot, trace: { ...r.trace, snapshotId: snapshot.id } };
}

function makeBundle(
  key: string,
  productId: string,
  version: string,
  label: string,
  graph: Graph,
  asOf: string,
): SnapshotBundle {
  const { snapshot, trace } = mustEvaluate(graph, asOf);
  return { key, productId, version, label, graph, snapshot, trace };
}

let cache: SnapshotBundle[] | null = null;

export function getBundles(): SnapshotBundle[] {
  if (cache) return cache;

  // Solve the CX-30 v2 outbound leg so the anchor GWP is exactly 167.00.
  const probe = buildGraph(
    "prod-cx30", "v2", CX30_V2_FLOWS, CX30_V2_LEGS, 0,
    "delivery-ticket:HV-2026-10-04-031",
  );
  const r0 = evaluate(probe, DEFAULT_UNITS, DATASETS, AS_OF);
  if (!isEvaluateOk(r0)) throw new Error("Outbound-leg probe evaluation failed");
  const outboundTkm = (167 - r0.trace.gwp) / 0.112;

  const defs: {
    key: string; productId: string; version: string; label: string;
    graph: Graph; asOf: string;
  }[] = [
    {
      key: "cx30-v1", productId: "prod-cx30", version: "v1", label: "v1 · Supplier A cement",
      graph: buildGraph("prod-cx30", "v1", CX30_V2_FLOWS, CX30_V2_LEGS, outboundTkm,
        "delivery-ticket:HV-2024-06-02-014", CX30_V1_FLOW_TWEAKS, CX30_V1_LEG_TWEAKS),
      asOf: AS_OF_V1,
    },
    {
      key: "cx30-v2", productId: "prod-cx30", version: "v2", label: "v2 · Supplier B cement · current",
      graph: buildGraph("prod-cx30", "v2", CX30_V2_FLOWS, CX30_V2_LEGS, outboundTkm,
        "delivery-ticket:HV-2026-10-04-031"),
      asOf: AS_OF,
    },
    {
      key: "cx30-v3", productId: "prod-cx30", version: "v3", label: "v3 · green-tariff electricity",
      graph: buildGraph("prod-cx30", "v3", CX30_V2_FLOWS, CX30_V2_LEGS, outboundTkm,
        "delivery-ticket:HV-2026-10-05-002", CX30_V3_FLOW_TWEAKS),
      asOf: AS_OF,
    },
    {
      key: "std40-v1", productId: "prod-std40", version: "v1", label: "v1 · baseline",
      graph: buildGraph("prod-std40", "v1", STD40_FLOWS, STD40_LEGS, 55.1568,
        "delivery-ticket:RV-2026-10-03-042"),
      asOf: AS_OF,
    },
    {
      key: "he50-v1", productId: "prod-he50", version: "v1", label: "v1 · baseline",
      graph: buildGraph("prod-he50", "v1", HE50_FLOWS, HE50_LEGS, 33.33,
        "delivery-ticket:MB-2026-10-02-019"),
      asOf: AS_OF,
    },
    {
      key: "eco25-v1", productId: "prod-eco25", version: "v1", label: "v1 · baseline",
      graph: buildGraph("prod-eco25", "v1", ECO25_FLOWS, ECO25_LEGS, 36.9144,
        "delivery-ticket:HV-2026-10-04-040"),
      asOf: AS_OF,
    },
  ];

  cache = defs.map((d) => makeBundle(d.key, d.productId, d.version, d.label, d.graph, d.asOf));

  const anchor = cache.find((b) => b.key === "cx30-v2")!;
  if (Math.abs(anchor.snapshot.gwp - 167) > 1e-9) {
    throw new Error(`Anchor drifted: CX-30 v2 GWP = ${anchor.snapshot.gwp}, expected exactly 167`);
  }
  return cache;
}

export function bundlesForProduct(productId: string): SnapshotBundle[] {
  return getBundles().filter((b) => b.productId === productId);
}

export function currentBundle(productId: string, currentVersion: string): SnapshotBundle {
  const b = getBundles().find((x) => x.productId === productId && x.version === currentVersion);
  if (!b) throw new Error(`No bundle for ${productId}@${currentVersion}`);
  return b;
}
