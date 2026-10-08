/**
 * Evidence packets — the unit of accountability for an investigation.
 *
 * A packet pins a snapshot (via reproHash) together with its trace, an
 * optional diff, detected faults, bounded-judgment (Jev) decisions, and the
 * dataset references — enough for an engineer or reviewer to independently
 * re-derive the result.
 *
 * packetId is DERIVED from the packet content (hash), never from a counter
 * or timestamp: identical investigations produce identical packet ids.
 * generatedAt is metadata only and is excluded from the id hash.
 *
 * The packet is an investigative artifact. It is NOT an EPD, is NOT
 * third-party verified, and makes no compliance claim — the disclaimer
 * below is fixed text, always included.
 */
import type {
  Dataset,
  Diff,
  EvidencePacket,
  Fault,
  JevDecision,
  Snapshot,
  Trace,
} from "./schema.js";
import { reproHash } from "./hash.js";

export const EVIDENCE_PACKET_DISCLAIMER =
  "BLACKBOX evidence packet — investigative artifact only. This is NOT an " +
  "Environmental Product Declaration and is NOT third-party verified. It makes " +
  "no claim of regulatory compliance. Arithmetic is a simplified illustrative " +
  "LCA-style aggregation, not ISO 14040/14044/14025 compliant. Do not use for " +
  "regulatory submissions.";

export interface BuildEvidencePacketArgs {
  snapshot: Snapshot;
  trace: Trace;
  diff?: Diff;
  faults: Fault[];
  jevDecisions: JevDecision[];
  datasets: Dataset[];
}

export function buildEvidencePacket(args: BuildEvidencePacketArgs): EvidencePacket {
  const { snapshot, trace, diff, faults, jevDecisions, datasets } = args;
  const packetId =
    "pkt_" +
    reproHash({
      snapshotId: snapshot.id,
      reproHash: snapshot.reproHash,
      trace,
      diff: diff ?? null,
      faults,
      jevDecisions,
      datasetRefs: datasets.map((d) => `${d.id}@${d.version}`).sort(),
    }).slice(0, 16);

  return {
    packetId,
    snapshotId: snapshot.id,
    reproHash: snapshot.reproHash,
    generatedAt: new Date().toISOString(),
    trace,
    diff,
    faults,
    jevDecisions,
    datasets,
    disclaimer: EVIDENCE_PACKET_DISCLAIMER,
  };
}
