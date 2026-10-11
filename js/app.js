// Start-up, navigation, printer status, reminders and offline updates.
import * as db from './db.js';
import * as printer from './printer.js';
import {S, bus, loadAll} from './state.js';
import {initBilling, refreshBilling} from './billing.js';
import {initBills, renderBills, initReports, renderReports} from './bills.js';
import {initMenu, renderMenu, initSettings, renderSettings, allowFolder} from './admin.js';
import * as files from './files.js';
import {toast} from './ui.js';
export const VERSION = '1.1.0';
const $ = s => document.querySelector(s);
let view = 'billing';
const RENDER = {billing: refreshBilling, bills: renderBills, reports: renderReports, menu: renderMenu, settings: renderSettings};

function show(v) {
  view = v;
  document.querySelectorAll('.view').forEach(s => s.hidden = s.id !== 'v-' + v);
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-current', String(b.dataset.view === v)));
  RENDER[v]();
}
function paintChip(state, label) {
  const c = $('#printerChip');
  c.dataset.state = state;
  c.textContent = state === 'connected' ? 'Printer ready' : state === 'connecting' ? 'Connecting printer…' : 'Printer not connected: tap to connect';
  c.title = label || '';
}
async function checkBackup() {
  const lastBill = await db.getMeta('lastBillAt', null), last = await db.getMeta('lastBackup', null);
  const due = lastBill && (!last || (lastBill > last && Date.now() - new Date(last) > 24 * 3600e3));
  $('#backupBanner').hidden = !due;
}
// Reminds the operator when bills are not reaching the YULO Bills folder.
async function checkFiles() {
  const st = await files.status(), pend = (await db.getMeta('pendingFiles', [])).length, b = $('#fileBanner');
  b.hidden = st === 'unsupported' || (st === 'ready' && !pend) || (st === 'none' && !pend);
  if (b.hidden) return;
  const ask = st === 'needs-permission';
  b.querySelector('span').textContent = ask ? 'Bills folder needs permission to keep saving bill files.' : `${pend} ${pend === 1 ? 'bill is' : 'bills are'} not saved in the YULO Bills folder yet.`;
  b.querySelector('button').textContent = ask ? 'Allow folder access' : 'Set up folder';
  b.querySelector('button').onclick = () => ask ? allowFolder().then(checkFiles) : show('settings');
}
function updateBanner(worker) {
  const b = $('#updateBanner'); b.hidden = false;
  b.querySelector('button').onclick = () => worker.postMessage('skip');
}

async function boot() {
  try { await db.open(); }
  catch (e) { document.body.innerHTML = `<p style="padding:24px;font:18px system-ui">The app cannot open its storage (${e.message}). Open it in Google Chrome, not in private/incognito mode.</p>`; return; }
  navigator.storage?.persist?.().catch(() => {});
  await loadAll();
  await initBilling(); initBills(); initReports(); initMenu(); initSettings();
  $('nav').onclick = e => { const b = e.target.closest('[data-view]'); if (b) show(b.dataset.view); };
  $('#printerChip').onclick = async () => {
    if (printer.isConnected()) return toast('Printer is connected');
    try { await printer.connect(); toast('Printer connected'); } catch (e) { if (e.name !== 'NotFoundError') toast('Printer: ' + e.message, true); }
  };
  $('#backupBanner button').onclick = () => show('settings');
  printer.onChange(paintChip);
  printer.autoConnect();
  bus.addEventListener('products', () => { refreshBilling(); if (view === 'menu') renderMenu(); });
  bus.addEventListener('bills', () => { checkBackup(); if (view !== 'billing') RENDER[view](); });
  bus.addEventListener('settings', () => { refreshBilling(); if (view === 'settings') renderSettings(); });
  bus.addEventListener('backup', checkBackup);
  bus.addEventListener('files', () => { checkFiles(); if (view === 'settings') renderSettings(); });
  checkFiles();
  checkBackup(); setInterval(checkBackup, 15 * 60e3);
  $('#version').textContent = VERSION;
  show('billing');

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      if (reg.waiting && navigator.serviceWorker.controller) updateBanner(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) updateBanner(w); });
      });
      // Reload only when an update was accepted, not when the app is installed for the first time.
      const hadController = !!navigator.serviceWorker.controller; let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
    } catch (e) { console.warn('Offline support not available:', e); }
  }
}
boot();
