/** Small shared helpers for the BLACKBOX demo app. */

export function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a !== 0 && (a >= 1e7 || a < 1e-4)) return n.toExponential(2);
  return Number(n.toFixed(digits)).toString();
}

export function fmtSigned(n: number, digits = 2): string {
  const s = fmt(n, digits);
  return (n > 0 ? "+" : "") + s;
}

export function downloadJson(filename: string, obj: unknown): void {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function shortHash(hash: string, len = 12): string {
  return hash.slice(0, len);
}
