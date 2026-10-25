/** Shared heuristics for rejecting Grok-hallucinated status IDs (they 404 on X). */
export function isSuspiciousTweetId(id: string): boolean {
  const s = String(id).trim();
  if (!/^\d{15,22}$/.test(s)) return true;
  if (/^1834567890\d{9}$/.test(s)) return true;
  if (/^1234567890\d{9}$/.test(s)) return true;

  let inc = 1;
  for (let i = 1; i < s.length; i++) {
    const a = Number(s[i - 1]);
    const b = Number(s[i]);
    if (Number.isFinite(a) && Number.isFinite(b) && b === a + 1) inc++;
    else inc = 1;
    if (inc >= 8) return true;
  }
  return false;
}
