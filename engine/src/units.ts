/**
 * Unit registry and dimensional analysis.
 *
 * ASSUMPTIONS (explicit):
 *  - Every quantity converts to an SI base unit via UnitDef.toBase
 *    (multiplicative only — no affine conversions like °C; temperature
 *    does not appear in this model).
 *  - Emission-factor units (e.g. "kgCO2e/kg") are NOT entries in the
 *    registry. They are parsed structurally as <emission-unit>/<flow-unit>
 *    by parseFactorUnit(): the numerator must be an `emission` unit, the
 *    denominator any known unit. Their `toBase` handling is therefore
 *    exact rather than table-driven.
 *  - Conversion constants below are standard SI/imperial definitions.
 */
import type { Dimension, UnitDef } from "./schema";

/** Base unit symbol per dimension. */
export const BASE_UNIT: Record<Dimension, string> = {
  mass: "kg",
  length: "m",
  volume: "m3",
  energy: "MJ",
  transport: "tkm",
  emission: "kgCO2e",
  emission_factor: "kgCO2e/kg", // placeholder; factor units are parsed, not looked up
  dimensionless: "1",
};

/**
 * Default unit table, keyed by symbol. Pure data — callers may supply
 * their own table; evaluation only requires that every referenced symbol
 * resolves.
 */
export const DEFAULT_UNITS: Record<string, UnitDef> = {
  // mass (base kg)
  kg: { symbol: "kg", dimension: "mass", toBase: 1 },
  g: { symbol: "g", dimension: "mass", toBase: 0.001 },
  t: { symbol: "t", dimension: "mass", toBase: 1000 },
  lb: { symbol: "lb", dimension: "mass", toBase: 0.45359237 },
  // length (base m)
  m: { symbol: "m", dimension: "length", toBase: 1 },
  km: { symbol: "km", dimension: "length", toBase: 1000 },
  mi: { symbol: "mi", dimension: "length", toBase: 1609.344 },
  ft: { symbol: "ft", dimension: "length", toBase: 0.3048 },
  // volume (base m3)
  m3: { symbol: "m3", dimension: "volume", toBase: 1 },
  L: { symbol: "L", dimension: "volume", toBase: 0.001 },
  cm3: { symbol: "cm3", dimension: "volume", toBase: 1e-6 },
  gal: { symbol: "gal", dimension: "volume", toBase: 0.00378541 },
  // energy (base MJ)
  MJ: { symbol: "MJ", dimension: "energy", toBase: 1 },
  kWh: { symbol: "kWh", dimension: "energy", toBase: 3.6 },
  GJ: { symbol: "GJ", dimension: "energy", toBase: 1000 },
  J: { symbol: "J", dimension: "energy", toBase: 1e-6 },
  BTU: { symbol: "BTU", dimension: "energy", toBase: 0.00105506 },
  // transport work (base tkm)
  tkm: { symbol: "tkm", dimension: "transport", toBase: 1 },
  "tonne-km": { symbol: "tonne-km", dimension: "transport", toBase: 1 },
  // emission amounts (base kgCO2e)
  kgCO2e: { symbol: "kgCO2e", dimension: "emission", toBase: 1 },
  gCO2e: { symbol: "gCO2e", dimension: "emission", toBase: 0.001 },
  tCO2e: { symbol: "tCO2e", dimension: "emission", toBase: 1000 },
  // dimensionless
  "1": { symbol: "1", dimension: "dimensionless", toBase: 1 },
  each: { symbol: "each", dimension: "dimensionless", toBase: 1 },
  "%": { symbol: "%", dimension: "dimensionless", toBase: 0.01 },
};

/** Dimension of a unit symbol. Throws on unknown symbols. */
export function dimensionOf(
  units: Record<string, UnitDef>,
  symbol: string,
): Dimension {
  const def = units[symbol];
  if (!def) throw new Error(`Unknown unit: "${symbol}"`);
  return def.dimension;
}

/** Multiplicative factor converting `symbol` to its dimension's base unit. */
export function toBaseFactor(
  units: Record<string, UnitDef>,
  symbol: string,
): number {
  const def = units[symbol];
  if (!def) throw new Error(`Unknown unit: "${symbol}"`);
  return def.toBase;
}

export interface ParsedFactorUnit {
  /** Numerator symbol, e.g. "kgCO2e" (always an emission unit). */
  num: string;
  /** Denominator symbol, e.g. "kWh". */
  den: string;
  /** Dimension of the denominator — the flow dimension the factor applies to. */
  denDim: Dimension;
}

/**
 * Parse an emission-factor unit of the form "<emission>/<flow>", e.g.
 * "kgCO2e/kg", "kgCO2e/kWh", "gCO2e/tkm". Throws with a descriptive
 * message on malformed input (callers convert to validation issues).
 */
export function parseFactorUnit(
  units: Record<string, UnitDef>,
  symbol: string,
): ParsedFactorUnit {
  const parts = symbol.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid emission-factor unit "${symbol}": expected "<emission>/<flow>", e.g. "kgCO2e/kg"`,
    );
  }
  const [num, den] = parts;
  const numDef = units[num];
  if (!numDef) throw new Error(`Unknown unit in factor numerator: "${num}"`);
  if (numDef.dimension !== "emission") {
    throw new Error(
      `Invalid emission-factor unit "${symbol}": numerator "${num}" is ${numDef.dimension}, expected an emission unit (kgCO2e)`,
    );
  }
  const denDef = units[den];
  if (!denDef) throw new Error(`Unknown unit in factor denominator: "${den}"`);
  return { num, den, denDim: denDef.dimension };
}

/** Convert `qty` in `symbol` to the dimension's base unit value. */
export function toBase(
  units: Record<string, UnitDef>,
  qty: number,
  symbol: string,
): number {
  return qty * toBaseFactor(units, symbol);
}
