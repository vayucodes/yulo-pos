// Saves every bill as a .txt file in:  YULO Bills / Months / October 2026 / Bill#01_10-10-2026.txt
// The last line of each file (#DATA ...) holds the bill details so the app can rebuild bills and reports from the folder.
import * as db from './db.js';
import {buildReceipt, toText} from './receipt.js';
import {billLabel, fmtDate} from './util.js';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ROOT = 'YULO Bills';
let dir = null;

export const supported = () => 'showDirectoryPicker' in window;
export async function load() { dir = await db.getMeta('billsDir', null); }
export const folderName = () => dir?.name || '';
// 'unsupported' | 'none' | 'needs-permission' | 'ready'
export async function status() {
  if (!supported()) return 'unsupported';
  if (!dir) return 'none';
  try { return await dir.queryPermission({mode: 'readwrite'}) === 'granted' ? 'ready' : 'needs-permission'; }
  catch { return 'needs-permission'; }
}
// Needs a tap. If the chosen folder isn't "YULO Bills", one is created inside it.
export async function choose() {
  let d = await window.showDirectoryPicker({id: 'yulo-bills', mode: 'readwrite'});
  if (d.name !== ROOT) d = await d.getDirectoryHandle(ROOT, {create: true});
  dir = d; await db.setMeta('billsDir', d);
}
export async function allow() { return dir ? await dir.requestPermission({mode: 'readwrite'}) === 'granted' : false; }

export const monthFolder = b => { const d = new Date(b.createdAt); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
export const fileName = b => `Bill${billLabel(b.no)}_${fmtDate(new Date(b.createdAt))}.txt`;

export const billText = (bill, settings) => toText(buildReceipt(bill, settings, false), settings.paperCols) + '\n\n#DATA ' + JSON.stringify(bill) + '\n';

export async function writeBill(bill, settings) {
  if (await status() !== 'ready') throw new Error('Bills folder not available');
  const months = await dir.getDirectoryHandle('Months', {create: true});
  const month = await months.getDirectoryHandle(monthFolder(bill), {create: true});
  const w = await (await month.getFileHandle(fileName(bill), {create: true})).createWritable();
  await w.write(billText(bill, settings));
  await w.close();
}
// Reads every bill file back. Files that can't be read are listed in `bad`, never guessed.
export async function readAll() {
  const bills = [], bad = [];
  const months = await dir.getDirectoryHandle('Months', {create: true});
  for await (const [mName, m] of months.entries()) {
    if (m.kind !== 'directory') continue;
    for await (const [fName, f] of m.entries()) {
      if (f.kind !== 'file' || !fName.endsWith('.txt')) continue;
      try {
        const line = (await (await f.getFile()).text()).split('\n').find(l => l.startsWith('#DATA '));
        const b = JSON.parse(line.slice(6));
        if (!Number.isInteger(b.no) || !Array.isArray(b.lines) || !b.day) throw 0;
        bills.push(b);
      } catch { bad.push(mName + ' / ' + fName); }
    }
  }
  return {bills, bad};
}
