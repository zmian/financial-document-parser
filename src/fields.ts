export type Leaf = string | number | boolean | null;

export interface FlatField {
  path: string;
  value: Leaf;
}

/** Turns { taxes: [{ ytd: 1 }] } into [{ path: "taxes[0].ytd", value: 1 }]. */
export function flatten(value: unknown, prefix = ""): FlatField[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => flatten(item, `${prefix}[${i}]`));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      flatten(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [{ path: prefix, value: value as Leaf }];
}

/** Reads "taxes[0].ytd" back out of an object. */
export function get(value: unknown, path: string): unknown {
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let current: unknown = value;
  for (const key of keys) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export const CENT_TOLERANCE = 0.02;

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function sameMoney(a: number, b: number, tolerance = CENT_TOLERANCE): boolean {
  return Math.abs(toCents(a) - toCents(b)) <= Math.round(tolerance * 100);
}

export function sum(values: number[]): number {
  return values.reduce((total, v) => total + toCents(v), 0) / 100;
}

export function money(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** For comparing quoted text against a text layer: case, spacing and $ don't matter. */
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\$/g, "").replace(/\s+/g, "");
}
