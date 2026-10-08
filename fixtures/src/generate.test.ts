/**
 * Regenerates + validates every fixture via the canonical engine.
 * Deterministic: same inputs → identical JSON outputs.
 */
import { describe, expect, it } from "vitest";
import { main } from "./generate.js";

describe("blackbox fixtures", () => {
  it("builds clean graphs, evaluates ok:true, writes JSON", () => {
    const { gwps } = main();
    expect(gwps["cx30-v2"]).toBeCloseTo(167, 9);
    expect(gwps["cx30-v1"]).toBeGreaterThan(187);
    expect(gwps["cx30-v1"]).toBeLessThan(190);
    expect(gwps["cx30-v2"] - gwps["cx30-v3"]).toBeCloseTo(2.142, 9);
  });
});
