// Shared app state: settings, products, and printing a saved bill.
import * as db from './db.js';
import * as printer from './printer.js';
import {buildReceipt, toEscPos} from './receipt.js';
import SEED from './seed.js';
import * as files from './files.js';
export const DEFAULTS = {
  cafeName: 'YULO CAFE', address: 'SATYA NIKETAN, NEW DELHI', phones: ['', '', ''], fssai: '', headerExtra: '',
  footer: 'Thank you for visiting!', printerKind: 'bluetooth', paperCols: 32, discounts: false,
  gst: {enabled: false}   // reserved: GST is not active in this version
};
export const S = {settings: {...DEFAULTS}, products: []};
export const bus = new EventTarget();
export const emit = what => bus.dispatchEvent(new Event(what));   // 'products' | 'bills' | 'settings'

export async function loadAll() {
  await files.load();
  S.settings = {...DEFAULTS, ...await db.getMeta('settings', {})};
  await db.seedOnce(SEED.map((m, i) => ({name: m.n, category: m.c, price: m.p == null ? null : m.p * 100, diet: m.d, code: '', active: true, sort: i})));
  await reloadProducts();
  printer.setKind(S.settings.printerKind);
}
export async function reloadProducts() { S.products = (await db.all('products')).sort((a, b) => a.sort - b.sort || a.id - b.id); }
export async function saveSettings(patch) {
  S.settings = {...S.settings, ...patch}; await db.setMeta('settings', S.settings);
  if ('printerKind' in patch) printer.setKind(S.settings.printerKind);
  emit('settings');
}
export function categories(list = S.products) { const out = []; for (const p of list) if (!out.includes(p.category)) out.push(p.category); return out; }

// Prints a bill that is ALREADY saved. Never creates a new bill, so a retry can't charge twice.
export async function printBill(bill) {
  const reprint = bill.print.status === 'printed';
  try {
    await printer.print(toEscPos(buildReceipt(bill, S.settings, reprint)));
    bill.print = {status: 'printed', count: (bill.print.count || 0) + 1, at: new Date().toISOString()};
    await db.put('bills', bill); emit('bills'); saveBillFile(bill);
  } catch (e) {
    if (!reprint) { bill.print = {...bill.print, status: 'failed', error: e.message}; await db.put('bills', bill); emit('bills'); saveBillFile(bill); }
    throw e;
  }
}

// ---- Bill files (YULO Bills folder) ----
// Writes run one at a time. A bill that can't be written yet is remembered and written later.
let fileQueue = Promise.resolve();
export function saveBillFile(bill) { fileQueue = fileQueue.then(() => saveNow(bill)); return fileQueue; }
async function saveNow(bill) {
  const changed = await db.getMeta('driveChanged', {}); changed[bill.no] = (changed[bill.no] || 0) + 1;   // needs (re)sending to Drive
  await db.setMeta('driveChanged', changed);
  const pending = new Set(await db.getMeta('pendingFiles', []));
  try { await files.writeBill(bill, S.settings); pending.delete(bill.no); }
  catch { pending.add(bill.no); }
  await db.setMeta('pendingFiles', [...pending]); emit('files');
}
export function clearDriveChanged(no, ver) {
  fileQueue = fileQueue.then(async () => { const c = await db.getMeta('driveChanged', {}); if (c[no] === ver) { delete c[no]; await db.setMeta('driveChanged', c); } });
  return fileQueue;
}
export async function savePendingFiles() { for (const no of await db.getMeta('pendingFiles', [])) { const b = await db.get('bills', no); if (b) await saveBillFile(b); } }
export async function saveAllFiles() { for (const b of await db.all('bills')) await saveBillFile(b); }

