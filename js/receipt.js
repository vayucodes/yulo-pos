// Builds the receipt once as a list of lines, then renders it as screen text or as printer bytes (ESC/POS).
import {plain, fmtDate, fmtTime, billLabel} from './util.js';
const ascii = s => String(s ?? '').replace(/₹/g, 'Rs.').replace(/[^\x20-\x7E]/g, '?'); // printer has no ₹ (code page PC850)

function wrap(s, W) {
  const out = []; let line = '';
  for (let w of s.split(/\s+/).filter(Boolean)) {
    while (w.length > W) { if (line) { out.push(line); line = ''; } out.push(w.slice(0, W)); w = w.slice(W); }
    if (!w) continue;
    if ((line ? line + ' ' + w : w).length <= W) line = line ? line + ' ' + w : w; else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
}
export function buildReceipt(bill, set, reprint = false) {
  const W = set.paperCols || 32, o = [];
  const L = (s, x = {}) => o.push({s, ...x});
  const C = s => wrap(ascii(s), W).forEach(x => L(' '.repeat((W - x.length) >> 1) + x));
  const lr = (l, r) => r ? l + ' '.repeat(Math.max(1, W - l.length - r.length)) + r : l;
  const name = ascii(set.cafeName).trim();
  if (name) { if (name.length <= W / 2) L(name, {big: true}); else wrap(name, W).forEach(x => L(' '.repeat((W - x.length) >> 1) + x, {bold: true})); }
  [set.address, ...(set.phones || []).filter(p => p && p.trim()).map(p => 'Mob: ' + p.trim()),
   set.fssai && 'FSSAI Lic. No: ' + set.fssai, set.headerExtra].forEach(x => { if (x && x.trim()) C(x); });
  L('-'.repeat(W));
  L(lr('Bill No: ' + billLabel(bill.no), reprint ? 'REPRINT' : ''));
  const d = new Date(bill.createdAt); L(lr(fmtDate(d), fmtTime(d)));
  if (bill.status === 'cancelled') C('*** CANCELLED BILL ***');
  L('-'.repeat(W)); L(lr('Item', 'Amount')); L('-'.repeat(W));
  for (const l of bill.lines) { wrap(ascii(l.name), W).forEach(x => L(x)); L(lr(`  ${l.qty} x ${plain(l.price)}`, plain(l.price * l.qty))); }
  L('-'.repeat(W));
  L(lr('Subtotal', plain(bill.subtotal)));
  if (bill.discount) L(lr('Discount', '-' + plain(bill.discount)));
  L('='.repeat(W)); L(lr('TOTAL Rs.', plain(bill.total)), {bold: true}); L('='.repeat(W));
  if (set.footer && set.footer.trim()) { L(''); C(set.footer); }
  return o;
}
export const toText = (ops, W = 32) => ops.map(x => x.big ? ' '.repeat(Math.max(0, (W - x.s.length) >> 1)) + x.s : x.s).join('\n');
export function toEscPos(ops) {
  const b = [27, 64];                                   // reset
  for (const x of ops) {
    if (x.big) b.push(27, 97, 1, 29, 33, 0x11);         // centre + double size (tested on the EZO 58D)
    if (x.bold) b.push(27, 69, 1);
    for (const ch of x.s) b.push(ch.charCodeAt(0));
    b.push(10);
    if (x.big) b.push(29, 33, 0, 27, 97, 0);
    if (x.bold) b.push(27, 69, 0);
  }
  b.push(27, 100, 4);                                   // feed paper to tear-off
  return new Uint8Array(b);
}
