// Menu management, settings, backup and restore.
import * as db from './db.js';
import * as printer from './printer.js';
import {S, emit, reloadProducts, saveSettings, categories} from './state.js';
import {esc, rupees, toPaise, dayKey, download, billLabel} from './util.js';
import {buildReceipt, toText, toEscPos} from './receipt.js';
import {parseCSV, toCSV} from './csv.js';
import {modal, confirmBox, keypad, toast} from './ui.js';
const $ = s => document.querySelector(s);
const norm = s => String(s || '').trim().replace(/\s+/g, ' ');
const key = s => norm(s).toLowerCase();

// ================= MENU =================
export function initMenu() {
  ['#mSearch', '#mCat'].forEach(s => $(s).oninput = renderMenu);
  $('#mAdd').onclick = () => editProduct(null);
  $('#mList').onclick = e => { const r = e.target.closest('[data-id]'); if (r) editProduct(S.products.find(p => p.id === +r.dataset.id)); };
  $('#mRename').onclick = renameCategory;
  $('#mExport').onclick = () => download(new Blob([toCSV([['category', 'name', 'price', 'diet', 'code', 'active'],
    ...S.products.map(p => [p.category, p.name, p.price == null ? 'MRP' : p.price / 100, p.diet, p.code, p.active ? 'yes' : 'no'])])], {type: 'text/csv'}), `yulo-menu-${dayKey()}.csv`);
  $('#mImport').onclick = () => $('#mFile').click();
  $('#mFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) importMenu(await f.text()); };
}
export function renderMenu() {
  const cats = categories(), sel = $('#mCat'), cur = sel.value;
  sel.innerHTML = '<option value="">All categories</option>' + cats.map(c => `<option${c === cur ? ' selected' : ''}>${esc(c)}</option>`).join('');
  const q = key($('#mSearch').value), c = sel.value;
  const list = S.products.filter(p => (!c || p.category === c) && (!q || p.name.toLowerCase().includes(q)));
  $('#mCount').textContent = `${list.length} of ${S.products.length} items`;
  $('#mList').innerHTML = list.map(p => `<button class="mrow${p.active ? '' : ' off'}" data-id="${p.id}">${p.diet ? `<span class="mark ${p.diet}"></span>` : '<span class="mark none"></span>'}
    <span class="n">${esc(p.name)}</span><span class="c">${esc(p.category)}</span><span class="r">${p.price == null ? 'On MRP' : rupees(p.price)}</span>
    <span class="tags">${p.active ? '' : '<i class="tag">Hidden</i>'}</span></button>`).join('') || '<div class="empty">No items match.</div>';
}
async function afterMenuChange() { await reloadProducts(); emit('products'); }

function editProduct(p) {
  const isNew = !p;
  p = p || {name: '', category: $('#mCat').value || '', price: 0, diet: '', code: '', active: true};
  const m = modal(`<h3>${isNew ? 'Add item' : 'Edit item'}</h3>
    <label>Item name<input name="name" value="${esc(p.name)}" autocomplete="off"></label>
    <label>Category<input name="category" list="catlist" value="${esc(p.category)}" autocomplete="off"><datalist id="catlist">${categories().map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <label>Price (₹)<input name="price" inputmode="decimal" value="${p.price == null ? '' : p.price / 100}"></label>
    <label class="chk"><input type="checkbox" name="mrp"${p.price == null ? ' checked' : ''}> Price is "On MRP" (asked at billing)</label>
    <label>Veg / non-veg<select name="diet"><option value="">Not marked</option><option value="veg">Veg</option><option value="nonveg">Non-veg</option></select></label>
    <label>Product code (optional)<input name="code" value="${esc(p.code)}" autocomplete="off"></label>
    <label class="chk"><input type="checkbox" name="active"${p.active ? ' checked' : ''}> Show on the billing screen</label>
    <p class="err"></p>
    <div class="acts">${isNew ? '' : '<button class="danger" data-a="del">Delete</button>'}<button data-a="no">Cancel</button><button class="go" data-a="save">Save</button></div>`, 'form');
  const f = n => m.el.querySelector(`[name=${n}]`), err = m.el.querySelector('.err');
  f('diet').value = p.diet || '';
  const syncMrp = () => { f('price').disabled = f('mrp').checked; }; f('mrp').onchange = syncMrp; syncMrp();
  m.el.onclick = async e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'no') return m.close();
    if (a === 'del') {
      if (await confirmBox(`Delete "${p.name}"? Old bills keep their copy of this item. To stop selling it for a while, untick "Show on the billing screen" instead.`, 'Delete', true)) {
        await db.del('products', p.id); m.close(); await afterMenuChange(); toast('Item deleted');
      }
      return;
    }
    const name = norm(f('name').value), category = norm(f('category').value), mrp = f('mrp').checked, price = mrp ? null : toPaise(f('price').value);
    if (!name) return err.textContent = 'Enter the item name.';
    if (!category) return err.textContent = 'Enter a category.';
    if (!mrp && !(price > 0)) return err.textContent = 'Enter a price above zero, like 249 or 249.50.';
    if (S.products.some(x => x.id !== p.id && key(x.name) === key(name))) return err.textContent = `"${name}" already exists. Use a different name.`;
    const item = {...p, name, category, price, diet: f('diet').value, code: norm(f('code').value), active: f('active').checked};
    if (isNew) { delete item.id; item.sort = Math.max(0, ...S.products.map(x => x.sort)) + 1; }
    await db.put('products', item); m.close(); await afterMenuChange(); toast(isNew ? 'Item added' : 'Item saved');
  };
}

function renameCategory() {
  const cats = categories();
  const m = modal(`<h3>Rename a category</h3>
    <label>Category<select name="from">${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
    <label>New name<input name="to" autocomplete="off"></label><p class="err"></p>
    <div class="acts"><button data-a="no">Cancel</button><button class="go" data-a="ok">Rename</button></div>`, 'form');
  const from = m.el.querySelector('[name=from]'), to = m.el.querySelector('[name=to]');
  if ($('#mCat').value) from.value = $('#mCat').value;
  m.el.onclick = async e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'no') return m.close();
    const nn = norm(to.value);
    if (!nn) return m.el.querySelector('.err').textContent = 'Enter the new name.';
    const clash = cats.find(c => key(c) === key(nn) && c !== from.value);
    if (clash && !await confirmBox(`"${clash}" already exists. Move all items from "${from.value}" into "${clash}"?`, 'Merge')) return;
    await db.putMany('products', S.products.filter(p => p.category === from.value).map(p => ({...p, category: clash || nn})));
    m.close(); await afterMenuChange(); toast('Category renamed');
  };
}

// CSV columns: category, name, price (number or MRP), diet (veg / nonveg / blank), code, active (yes / no).
// Items are matched by name (ignoring capitals and extra spaces), so importing never creates duplicates.
async function importMenu(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return toast('That file has no rows to import.', true);
  const h = rows[0].map(x => key(x)), col = n => h.indexOf(n);
  if (col('name') < 0 || col('price') < 0 || col('category') < 0) return toast('The file needs columns named category, name and price.', true);
  const byName = new Map(S.products.map(p => [key(p.name), p])), seen = new Set();
  const add = [], upd = [], problems = []; let same = 0, sort = Math.max(0, ...S.products.map(x => x.sort));
  rows.slice(1).forEach((r, i) => {
    const line = i + 2, v = n => col(n) < 0 ? '' : norm(r[col(n)]);
    const name = v('name'), category = v('category'), pr = v('price');
    if (!name) return problems.push(`Row ${line}: no item name`);
    if (seen.has(key(name))) return problems.push(`Row ${line}: "${name}" appears twice in the file`);
    seen.add(key(name));
    const price = /^(on )?mrp$/i.test(pr) ? null : toPaise(pr);
    if (price !== null && !(price > 0)) return problems.push(`Row ${line}: "${name}" has an unclear price "${pr}"`);
    if (!category) return problems.push(`Row ${line}: "${name}" has no category`);
    const d = key(v('diet')).replace(/[^a-z]/g, ''), diet = d === 'veg' ? 'veg' : d === 'nonveg' ? 'nonveg' : '';
    const active = col('active') < 0 ? true : !/^(no|n|false|0)$/i.test(v('active'));
    const old = byName.get(key(name)), item = {name, category, price, diet, code: v('code'), active};
    if (!old) add.push({...item, sort: ++sort});
    else if (['name', 'category', 'price', 'diet', 'code', 'active'].some(k => old[k] !== item[k] && !(k === 'code' && !old[k] && !item[k]))) upd.push({...old, ...item});
    else same++;
  });
  const m = modal(`<h3>Import menu</h3><p class="msg">${add.length} new items, ${upd.length} items changed, ${same} unchanged.</p>
    ${problems.length ? `<p class="err">${problems.length} rows will be skipped:</p><ul class="probs">${problems.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${upd.length ? `<details><summary>Show changed items</summary><ul class="probs">${upd.map(x => `<li>${esc(x.name)}</li>`).join('')}</ul></details>` : ''}
    <div class="acts"><button data-a="no">Cancel</button><button class="go" data-a="ok" ${add.length + upd.length ? '' : 'disabled'}>Apply changes</button></div>`, 'form');
  m.el.onclick = async e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; m.close();
    if (a === 'ok') { await db.putMany('products', [...add, ...upd]); await afterMenuChange(); toast(`Menu updated: ${add.length} added, ${upd.length} changed`); }
  };
}

// ================= SETTINGS =================
const FIELDS = ['cafeName', 'address', 'fssai', 'headerExtra', 'footer'];
export function initSettings() {
  $('#sSave').onclick = async () => {
    const patch = {phones: [0, 1, 2].map(i => norm($('#sPhone' + i).value))};
    FIELDS.forEach(k => patch[k] = norm($('#s_' + k).value));
    await saveSettings(patch); toast('Receipt details saved');
  };
  $('#sPreview').onclick = () => { const m = modal(`<div class="paper">${esc(toText(buildReceipt(sampleBill(), S.settings), S.settings.paperCols))}</div><div class="acts"><button class="go" data-a="x">Close</button></div>`, 'billsheet'); m.el.onclick = e => e.target.closest('[data-a]') && m.close(); };
  document.querySelectorAll('[name=pkind]').forEach(r => r.onchange = () => saveSettings({printerKind: r.value}));
  $('#sPaper').onchange = () => saveSettings({paperCols: +$('#sPaper').value});
  $('#sDisc').onchange = () => saveSettings({discounts: $('#sDisc').checked});
  $('#sConnect').onclick = async () => { try { await printer.connect(); toast('Printer connected'); } catch (e) { if (e.name !== 'NotFoundError') toast('Printer: ' + e.message, true); } };
  $('#sTest').onclick = async () => {
    try { await printer.print(toEscPos(buildReceipt(sampleBill(), S.settings))); toast('Test receipt sent to the printer'); }
    catch (e) { toast('Test print failed: ' + e.message + '. Tap Connect printer first.', true); }
  };
  $('#sNextNo').onclick = async () => {
    const max = await db.maxBillNo(), v = await keypad(`Next bill number (must be above ${billLabel(max)})`, {max: 7, ok: 'Set number'});
    if (v === null) return;
    if (+v <= max) return toast(`Bill numbers must stay above the last bill ${billLabel(max)}, so no number is used twice.`, true);
    await db.setMeta('nextBillNo', +v); emit('settings'); toast('Next bill will be ' + billLabel(+v));
  };
  $('#sBackupFile').onclick = () => backup('download');
  $('#sBackupShare').onclick = () => backup('share');
  $('#sRestore').onclick = () => $('#sRestoreFile').click();
  $('#sRestoreFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) restore(await f.text()); };
  $('#sErase').onclick = async () => {
    if (!await confirmBox('Erase ALL bills, menu changes and settings on this tablet? Make a backup first. This cannot be undone.', 'Erase everything', true)) return;
    if (!await confirmBox('Are you sure? Every bill will be permanently deleted.', 'Yes, erase', true)) return;
    await db.replaceAll({}); location.reload();
  };
}
export async function renderSettings() {
  const s = S.settings;
  FIELDS.forEach(k => $('#s_' + k).value = s[k] || '');
  [0, 1, 2].forEach(i => $('#sPhone' + i).value = (s.phones || [])[i] || '');
  document.querySelectorAll('[name=pkind]').forEach(r => r.checked = r.value === s.printerKind);
  $('#sPaper').value = String(s.paperCols); $('#sDisc').checked = !!s.discounts;
  $('#sNext').textContent = billLabel(await db.getMeta('nextBillNo', 1));
  const last = await db.getMeta('lastBackup', null);
  $('#sLastBackup').textContent = last ? new Date(last).toLocaleString('en-IN') : 'Never';
  const persisted = await navigator.storage?.persisted?.();
  $('#sStorage').textContent = persisted ? 'Protected: Chrome will not clear app data on its own.' : 'Not protected yet: install the app to the home screen, then reopen it.';
}
function sampleBill() {
  const ps = S.products.filter(p => p.price != null).slice(0, 2);
  const lines = ps.map((p, i) => ({name: p.name, price: p.price, qty: i + 1})), sub = lines.reduce((a, l) => a + l.price * l.qty, 0);
  return {no: 'TEST', createdAt: new Date().toISOString(), lines, subtotal: sub, discount: 0, total: sub, status: 'completed'};
}

// ================= BACKUP =================
async function backup(how) {
  try {
    const now = new Date(), data = {app: 'yulo-pos', format: 1, exportedAt: now.toISOString(), ...await db.dump()};
    const stamp = dayKey(now) + '-' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
    const json = JSON.stringify(data);
    if (how === 'share') {
      // Android's share sheet does not accept .json files, so the shared copy is a .txt (Restore accepts both).
      const file = new File([json], `yulo-backup-${stamp}.txt`, {type: 'text/plain'});
      if (!navigator.canShare?.({files: [file]})) return toast('Sharing is not available here. Use "Save backup to tablet".', true);
      try { await navigator.share({files: [file], title: 'YULO backup ' + stamp}); }
      catch (e) { if (e.name === 'AbortError') return toast('Backup was not sent.', true); throw e; }
    } else download(new Blob([json], {type: 'application/json'}), `yulo-backup-${stamp}.json`);
    await db.setMeta('lastBackup', now.toISOString()); emit('backup');
    toast(`Backup made: ${data.bills.length} bills, ${data.products.length} menu items`);
    renderSettings();
  } catch (e) { toast('Backup failed: ' + e.message, true); }
}
async function restore(text) {
  let data;
  try { data = JSON.parse(text); } catch { return toast('That file is not a YULO backup.', true); }
  if (data.app !== 'yulo-pos' || !Array.isArray(data.products) || !Array.isArray(data.bills) || !Array.isArray(data.meta)) return toast('That file is not a YULO backup.', true);
  const nowBills = (await db.all('bills')).length;
  if (!await confirmBox(`Replace everything on this tablet (${nowBills} bills, ${S.products.length} menu items) with the backup from ${new Date(data.exportedAt).toLocaleString('en-IN')} (${data.bills.length} bills, ${data.products.length} menu items)?`, 'Restore backup', true)) return;
  await db.replaceAll(data); location.reload();
}
