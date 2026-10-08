/**
 * Immutable, content-addressed snapshots.
 *
 * reproHash = sha256(canonical JSON of { sorted nodes, sorted edges,
 * quantities, units, dataset id@version, asOf }).
 *
 * EXCLUDED from the hash: createdAt, snapshot id, evaluation outputs.
 * createdAt is metadata about *when* the snapshot was taken, not *what*
 * was computed — two snapshots of identical inputs hash identically even
 * when taken at different times. No Date.now() inside hashing: callers
 * pass createdAt in (it defaults to now only for the metadata field).
 */
import type {
  Dataset,
  EvaluateOk,
  Graph,
  Snapshot,
  UnitDef,
} from "./schema";
import { reproHash } from "./hash";

export interface ReproHashInput {
  nodes: { id: string; label: string; kind: string; quantity: number | null; unit: string | null; datasetId: string | null; datasetVersion: string | null }[];
  edges: { id: string; from: string; to: string; quantity: number; unit: string; role: string }[];
  asOf: string | null;
}

/** The exact payload covered by the reproducibility hash. */
export function reproHashPayload(graph: Graph, asOf?: string | null): ReproHashInput {
  return {
    nodes: graph.nodes
      .map((n) => ({
        id: n.id,
        label: n.label,
        kind: n.kind,
        quantity: n.quantity,
        unit: n.unit,
        datasetId: n.datasetId,
        datasetVersion: n.datasetVersion,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
    edges: graph.edges
      .map((e) => ({
        id: e.id,
        from: e.from,
        to: e.to,
        quantity: e.quantity,
        unit: e.unit,
        role: e.role,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
    asOf: asOf ?? null,
  };
}

export function computeReproHash(graph: Graph, asOf?: string | null): string {
  return reproHash(reproHashPayload(graph, asOf));
}

/**
 * Freeze an evaluation into an immutable snapshot. `createdAt` is accepted
 * as a parameter (never read from the clock inside the hash).
 */
export function takeSnapshot(
  graph: Graph,
  evalOk: EvaluateOk,
  createdAt?: string,
  asOf?: string | null,
): Snapshot {
  const hash = computeReproHash(graph, asOf);
  const nodeLabels: Record<string, string> = {};
  for (const n of graph.nodes) nodeLabels[n.id] = n.label;
  return {
    id: `snap_${hash.slice(0, 16)}`,
    graphId: graph.id,
    graphVersion: graph.version,
    createdAt: createdAt ?? new Date().toISOString(),
    reproHash: hash,
    values: evalOk.values,
    warnings: [...evalOk.warnings],
    resultNodeId: evalOk.trace.resultNodeId,
    gwp: evalOk.trace.gwp,
    nodeLabels,
    asOf: asOf ?? null,
  };
}

/** Recompute a snapshot's hash from a graph and check it matches. */
export function verifySnapshot(
  snapshot: Snapshot,
  graph: Graph,
): { ok: boolean; recomputed: string } {
  const recomputed = computeReproHash(graph, snapshot.asOf);
  return { ok: recomputed === snapshot.reproHash, recomputed };
}

export type { Dataset, UnitDef };
