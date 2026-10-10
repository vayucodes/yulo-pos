// Small shared helpers. All money is stored as whole paise (integers) so totals never drift.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const rupees = p => '₹' + (p / 100).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
export const plain = p => (p / 100).toFixed(2);
const z = n => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
export const fmtDate = d => `${z(d.getDate())}-${z(d.getMonth() + 1)}-${d.getFullYear()}`;
export const fmtTime = d => { let h = d.getHours(); const ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12; return `${z(h)}:${z(d.getMinutes())} ${ap}`; };
export const billLabel = no => '#' + String(no).padStart(2, '0');
// "249" or "249.5" -> 24950 paise; anything else -> NaN
export const toPaise = s => { const m = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(String(s)); return m ? +m[1] * 100 + +(m[2] || '0').padEnd(2, '0') : NaN; };
export function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
