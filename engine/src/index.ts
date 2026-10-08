/**
 * blackbox-engine — deterministic calculation forensics for environmental
 * impact graphs. Pure functions only: no I/O, no network, no randomness
 * in evaluation or hashing.
 *
 * Implements the provisional cross-agent data contract (Zod-validated
 * types in schema.ts). See engine-sibling-backup/README.md for the
 * contract-divergence note of 2026-10-07.
 */
export * from "./schema";
export * from "./hash";
export * from "./units";
export * from "./graph";
export * from "./evaluate";
export * from "./snapshot";
export * from "./diff";
export * from "./faults";
export * from "./evidence";
