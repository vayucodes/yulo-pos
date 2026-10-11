// Counter billing screen.
import * as db from './db.js';
import {S, categories, emit, saveBillFile} from './state.js';
import {esc, rupees, billLabel, dayKey} from './util.js';
import {computeTax} from './tax.js';
import {keypad, confirmBox, toast} from './ui.js';
import {billModal} from './bills.js';
const $ = s => document.querySelector(s);
let cat = null, diet = null, cart = [], discount = 0, busy = false;

export async function initBilling() {
  const d = await db.getMeta('draft', null);          // restore an unfinished bill after a restart
  if (d) { cart = d.lines || []; discount = d.discount || 0; }
  $('#q').oninput = renderProducts;
  document.querySelectorAll('.diet').forEach(b => b.onclick = () => { diet = diet === b.dataset.d ? null : b.dataset.d; renderProducts(); });
  $('#rail').onclick = e => { const b = e.target.closest('[data-cat]'); if (b) { cat = b.dataset.cat; $('#q').value = ''; renderProducts(); } };
  $('#grid').onclick = e => { const b = e.target.closest('[data-pid]'); if (b) tapProduct(+b.dataset.pid); };
  $('#lines').onclick = async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const l = cart[+b.closest('[data-i]').dataset.i];
    if (b.dataset.act === 'inc') l.qty++;
    else if (b.dataset.act === 'dec') { if (l.qty > 1) l.qty--; else cart.splice(cart.indexOf(l), 1); }
    else { const v = await keypad(l.name, {initial: String(l.qty), ok: 'Set quantity'}); if (v === null) return; +v > 0 ? l.qty = +v : cart.splice(cart.indexOf(l), 1); }
    changed();
  };
  $('#clearBill').onclick = async () => { if (cart.length && await confirmBox('Clear all items from this bill?', 'Clear bill', true)) { cart = []; discount = 0; changed(); } };
  $('#discBtn').onclick = async () => { const v = await keypad('Discount amount (₹)', {initial: String(discount / 100), max: 5, ok: 'Set discount'}); if (v !== null) { discount = +v * 100; changed(); } };
  $('#printBill').onclick = completeAndPrint;
  refreshBilling();
}
export function refreshBilling() { renderRail(); renderProducts(); renderBill(); }
const activeProducts = () => S.products.filter(p => p.active);

function renderRail() {
  const cats = categories(activeProducts());
  if (!cats.includes(cat)) cat = cats[0] ?? null;
  $('#rail').innerHTML = cats.map(c => `<button class="cat" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
}
function renderProducts() {
  const q = $('#q').value.trim().toLowerCase();
  $('#rail').querySelectorAll('.cat').forEach(b => b.setAttribute('aria-pressed', String(!q && b.dataset.cat === cat)));
  document.querySelectorAll('.diet').forEach(b => b.setAttribute('aria-pressed', String(diet === b.dataset.d)));
  const items = activeProducts().filter(p => (q ? p.name.toLowerCase().includes(q) : p.category === cat) && (!diet || p.diet === diet));
  const qty = new Map(); cart.forEach(l => qty.set(l.pid, (qty.get(l.pid) || 0) + l.qty));
  $('#grid').innerHTML = items.length ? items.map(p => `<button class="p" data-pid="${p.id}">${p.diet ? `<span class="mark ${p.diet}"></span>` : ''}
    <span class="n">${esc(p.name)}</span><span class="r">${p.price == null ? 'On MRP' : rupees(p.price)}</span>${qty.get(p.id) ? `<span class="qb">${qty.get(p.id)}</span>` : ''}</button>`).join('')
    : '<div class="empty">No items match. Try a shorter search.</div>';
}
function totals() {
  const subtotal = cart.reduce((a, l) => a + l.price * l.qty, 0), disc = Math.min(discount, subtotal);
  const tax = computeTax(cart, subtotal, disc, S.settings);
  return {subtotal, disc, tax, total: subtotal - disc + tax.taxTotal, count: cart.reduce((a, l) => a + l.qty, 0)};
}
function renderBill() {
  const t = totals();
  $('#lines').innerHTML = cart.length ? cart.map((l, i) => `<div class="ln" data-i="${i}"><span class="n">${esc(l.name)}</span><span class="amt">${rupees(l.price * l.qty)}</span>
    <span class="rate">${rupees(l.price)} each</span><span class="qty"><button data-act="dec" aria-label="Decrease">−</button><button class="q" data-act="set" aria-label="Set quantity">${l.qty}</button><button data-act="inc" aria-label="Increase">+</button></span></div>`).join('')
    : '<div class="empty">Tap an item to start the bill.</div>';
  $('#count').textContent = t.count + (t.count === 1 ? ' item' : ' items');
  $('#sub').textContent = rupees(t.subtotal);
  $('#discRow').hidden = !S.settings.discounts && !discount;
  $('#discAmt').textContent = t.disc ? '−' + rupees(t.disc) : '';
  $('#discBtn').textContent = t.disc ? 'Change discount' : 'Add discount';
  $('#tot').textContent = rupees(t.total);
  $('#printBill').disabled = busy || !cart.length;
  db.getMeta('nextBillNo', 1).then(n => $('#billNo').textContent = 'Bill ' + billLabel(n));
}
async function tapProduct(pid) {
  const p = S.products.find(x => x.id === pid); if (!p) return;
  let price = p.price;
  if (price == null) { const v = await keypad('Enter MRP (₹) for ' + p.name, {max: 5, ok: 'Add to bill'}); if (!v || +v <= 0) return; price = +v * 100; }
  const l = cart.find(x => x.pid === p.id && x.price === price);
  l ? l.qty++ : cart.push({pid: p.id, name: p.name, price, qty: 1});
  changed();
}
function changed() {
  db.setMeta('draft', {lines: cart, discount}).catch(e => toast('Could not save the current bill: ' + e.message, true));
  renderBill(); renderProducts();
}
async function completeAndPrint() {
  if (busy || !cart.length) return;
  busy = true; renderBill();
  try {
    const t = totals(), now = new Date();
    const bill = await db.completeBill({
      createdAt: now.toISOString(), day: dayKey(now),
      lines: cart.map(l => ({pid: l.pid, name: l.name, price: l.price, qty: l.qty})),
      itemCount: t.count, subtotal: t.subtotal, discount: t.disc, tax: t.tax, total: t.total,
      status: 'completed', print: {status: 'pending', count: 0}
    });
    cart = []; discount = 0; emit('bills'); saveBillFile(bill);
    billModal(bill, {fresh: true});
  } catch (e) { toast('The bill could not be saved (' + e.message + '). Nothing was recorded; tap Print Bill again.', true); }
  finally { busy = false; renderBill(); renderProducts(); }
}
