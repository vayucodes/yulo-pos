// Bill history, one bill's details (print / reprint / cancel), and sales reports.
import * as db from './db.js';
import * as printer from './printer.js';
import {S, emit, printBill, saveBillFile} from './state.js';
import {esc, rupees, billLabel, dayKey, fmtDate, fmtTime} from './util.js';
import {buildReceipt, toText} from './receipt.js';
import {modal, confirmBox, toast} from './ui.js';
const $ = s => document.querySelector(s);

export function billModal(bill, {fresh = false} = {}) {
  const m = modal(`<div class="bmhead"><b></b><span class="bmtot"></span></div><div class="pstat"></div><div class="paper"></div><div class="acts"></div>`, 'billsheet');
  let printing = false;
  const paint = () => {
    const cancelled = bill.status === 'cancelled', p = bill.print;
    m.el.querySelector('b').textContent = 'Bill ' + billLabel(bill.no) + (cancelled ? ' (cancelled)' : '');
    m.el.querySelector('.bmtot').textContent = rupees(bill.total);
    m.el.querySelector('.paper').textContent = toText(buildReceipt(bill, S.settings, p.status === 'printed'), S.settings.paperCols);
    const st = m.el.querySelector('.pstat');
    st.className = 'pstat ' + (printing ? '' : p.status === 'printed' ? 'ok' : p.status === 'failed' ? 'bad' : '');
    st.textContent = printing ? 'Printing…' : p.status === 'printed' ? `Saved and printed${p.count > 1 ? ' (' + p.count + ' copies)' : ''}.`
      : p.status === 'failed' ? `Saved, but NOT printed: ${p.error}. Do not charge again. Connect the printer and tap Retry print.`
      : 'Saved. Not printed yet.';
    const btn = [];
    if (!printer.isConnected() && !printing) btn.push('<button data-a="connect">Connect printer</button>');
    btn.push(`<button data-a="print" ${printing ? 'disabled' : ''}>${p.status === 'printed' ? 'Reprint' : 'Retry print'}</button>`);
    if (!fresh && !cancelled) btn.push('<button data-a="cancel" class="danger">Cancel bill</button>');
    btn.push(`<button class="go" data-a="close">${fresh ? 'New Bill' : 'Close'}</button>`);
    m.el.querySelector('.acts').innerHTML = btn.join('');
  };
  const doPrint = async () => {
    printing = true; paint();
    try { await printBill(bill); } catch (e) { if (bill.print.status === 'printed') toast('Reprint failed: ' + e.message, true); }
    printing = false; paint();
  };
  m.el.onclick = async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'close') m.close();
    if (a === 'print') doPrint();
    if (a === 'connect') { try { await printer.connect(); paint(); doPrint(); } catch (err) { if (err.name !== 'NotFoundError') toast('Printer: ' + err.message, true); } }
    if (a === 'cancel' && await confirmBox(`Cancel bill ${billLabel(bill.no)}? It stays in history but is removed from sales totals. This cannot be undone.`, 'Cancel bill', true)) {
      bill.status = 'cancelled'; bill.cancelledAt = new Date().toISOString(); await db.put('bills', bill); emit('bills'); saveBillFile(bill); paint();
    }
  };
  paint();
  if (fresh) doPrint();
}

// ---- Bills (history) ----
export function initBills() {
  $('#bDate').value = dayKey();
  ['#bDate', '#bSearch', '#bFilter'].forEach(s => $(s).oninput = renderBills);
  $('#bList').onclick = async e => { const r = e.target.closest('[data-no]'); if (r) billModal(await db.get('bills', +r.dataset.no)); };
}
export async function renderBills() {
  const day = $('#bDate').value || dayKey(), q = $('#bSearch').value.trim().toLowerCase(), f = $('#bFilter').value;
  let list;
  if (/^#?\d+$/.test(q)) { const b = await db.get('bills', +q.replace('#', '')); list = b ? [b] : []; }
  else { list = await db.billsBetween(day, day); if (q) list = list.filter(b => b.lines.some(l => l.name.toLowerCase().includes(q))); }
  if (f === 'unprinted') list = list.filter(b => b.status === 'completed' && b.print.status !== 'printed');
  if (f === 'cancelled') list = list.filter(b => b.status === 'cancelled');
  list.sort((a, b) => b.no - a.no);
  const ok = list.filter(b => b.status === 'completed');
  $('#bSummary').textContent = `${ok.length} ${ok.length === 1 ? 'bill' : 'bills'}, total ${rupees(ok.reduce((a, b) => a + b.total, 0))}`;
  $('#bList').innerHTML = list.length ? list.map(b => `<button class="brow" data-no="${b.no}"><b>${billLabel(b.no)}</b><span>${fmtTime(new Date(b.createdAt))}</span>
     <span>${b.itemCount} ${b.itemCount === 1 ? 'item' : 'items'}</span><span class="tags">${b.status === 'cancelled' ? '<i class="tag bad">Cancelled</i>' : b.print.status !== 'printed' ? '<i class="tag warn">Not printed</i>' : ''}</span><b class="amt">${rupees(b.total)}</b></button>`).join('')
    : '<div class="empty">No bills found for this day and search.</div>';
}

// ---- Reports ----
export function initReports() {
  const t = dayKey(); $('#rFrom').value = t; $('#rTo').value = t;
  ['#rFrom', '#rTo'].forEach(s => $(s).oninput = renderReports);
  $('#rQuick').onclick = e => {
    const k = e.target.closest('[data-r]')?.dataset.r; if (!k) return;
    const now = new Date(), d = n => { const x = new Date(now); x.setDate(x.getDate() - n); return dayKey(x); };
    const [f, to] = {today: [d(0), d(0)], yesterday: [d(1), d(1)], week: [d(6), d(0)], month: [dayKey(new Date(now.getFullYear(), now.getMonth(), 1)), d(0)]}[k];
    $('#rFrom').value = f; $('#rTo').value = to; renderReports();
  };
}
export async function renderReports() {
  const from = $('#rFrom').value, to = $('#rTo').value, out = $('#rOut');
  if (!from || !to || from > to) { out.innerHTML = '<div class="empty">Choose a start date that is on or before the end date.</div>'; return; }
  const bills = await db.billsBetween(from, to), ok = bills.filter(b => b.status === 'completed'), can = bills.filter(b => b.status === 'cancelled');
  const sum = (l, f) => l.reduce((a, b) => a + f(b), 0), sales = sum(ok, b => b.total);
  const days = new Map(), items = new Map();
  for (const b of ok) {
    const d = days.get(b.day) || {n: 0, t: 0}; d.n++; d.t += b.total; days.set(b.day, d);
    for (const l of b.lines) { const i = items.get(l.name) || {q: 0, t: 0}; i.q += l.qty; i.t += l.qty * l.price; items.set(l.name, i); }
  }
  const dmy = k => fmtDate(new Date(k + 'T00:00'));
  out.innerHTML = `<div class="stats">
    <div><span>Total sales</span><b>${rupees(sales)}</b></div><div><span>Bills</span><b>${ok.length}</b></div>
    <div><span>Average bill</span><b>${ok.length ? rupees(Math.round(sales / ok.length)) : '–'}</b></div>
    <div><span>Discounts given</span><b>${rupees(sum(ok, b => b.discount))}</b></div>
    <div><span>Cancelled bills</span><b>${can.length} (${rupees(sum(can, b => b.total))})</b></div></div>
    <h3>Sales by date</h3><div class="tbl"><table><tr><th>Date</th><th class="n">Bills</th><th class="n">Sales</th></tr>
    ${[...days].sort((a, b) => b[0].localeCompare(a[0])).map(([k, v]) => `<tr><td>${dmy(k)}</td><td class="n">${v.n}</td><td class="n">${rupees(v.t)}</td></tr>`).join('') || '<tr><td colspan="3">No sales in this period.</td></tr>'}</table></div>
    <h3>Item-wise sales</h3><div class="tbl"><table><tr><th>Item</th><th class="n">Qty</th><th class="n">Amount</th></tr>
    ${[...items].sort((a, b) => b[1].t - a[1].t).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v.q}</td><td class="n">${rupees(v.t)}</td></tr>`).join('') || '<tr><td colspan="3">No items sold in this period.</td></tr>'}</table></div>
    <p class="hint">Item amounts are before discounts.</p>`;
}
