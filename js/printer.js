// Printer connection: Bluetooth (default) or USB. Both were tested on the EZO 58D on 10-10-2026.
import {getMeta, setMeta} from './db.js';
const BT_SERVICES = ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb', '0000fee7-0000-1000-8000-00805f9b34fb', '0000ae30-0000-1000-8000-00805f9b34fb', '0000ffe0-0000-1000-8000-00805f9b34fb'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let kind = 'bluetooth', dev = null, write = null, state = 'disconnected', label = '';
const listeners = new Set();
const set = (s, l = label) => { state = s; label = l || ''; listeners.forEach(f => f(state, label)); };
export const onChange = f => { listeners.add(f); f(state, label); };
export const isConnected = () => state === 'connected';
export const getKind = () => kind;

export function setKind(k) {
  if (k === kind) return;
  try { kind === 'usb' ? dev?.close() : dev?.gatt?.disconnect(); } catch {}
  kind = k; dev = null; write = null; set('disconnected', '');
}

async function bindBle(d) {
  set('connecting', d.name);
  try {
    const g = await d.gatt.connect(); let ch = null;
    for (const s of await g.getPrimaryServices())
      for (const c of await s.getCharacteristics())
        if (!ch && (c.properties.write || c.properties.writeWithoutResponse)) ch = c;
    if (!ch) throw new Error('This Bluetooth device is not a supported printer');
    dev = d;
    write = async bytes => {
      for (let i = 0; i < bytes.length; i += 100) {
        const part = bytes.slice(i, i + 100);
        if (ch.properties.writeWithoutResponse) await ch.writeValueWithoutResponse(part); else await ch.writeValueWithResponse(part);
        await sleep(20);
      }
    };
    if (!d.__yulo) { d.__yulo = true; d.addEventListener('gattserverdisconnected', () => { if (dev === d) { write = null; set('disconnected', d.name); retryBle(d); } }); }
    set('connected', d.name);
  } catch (e) { set('disconnected', d.name); throw e; }
}
// Printer switched off or out of range: keep trying quietly for a while.
async function retryBle(d) {
  for (const wait of [2000, 5000, 10000, 20000]) {
    await sleep(wait);
    if (dev !== d || state === 'connected' || kind !== 'bluetooth') return;
    try { await bindBle(d); return; } catch {}
  }
}

async function bindUsb(d) {
  set('connecting', d.productName);
  try {
    if (!d.opened) await d.open();
    if (d.configuration === null) await d.selectConfiguration(1);
    let pick = null;
    for (const itf of d.configuration.interfaces) {
      const alt = itf.alternate, out = alt.endpoints.find(e => e.direction === 'out' && e.type === 'bulk');
      if (out && (!pick || alt.interfaceClass === 7)) pick = {n: itf.interfaceNumber, ep: out.endpointNumber};
    }
    if (!pick) throw new Error('This USB device is not a supported printer');
    await d.claimInterface(pick.n);
    dev = d;
    write = async bytes => {
      for (let i = 0; i < bytes.length; i += 4096) {
        const r = await d.transferOut(pick.ep, bytes.slice(i, i + 4096));
        if (r.status !== 'ok') throw new Error('USB transfer ' + r.status);
      }
    };
    set('connected', d.productName || 'USB printer');
  } catch (e) { set('disconnected', d.productName); throw e; }
}
if (navigator.usb) {
  navigator.usb.addEventListener('disconnect', e => { if (e.device === dev) { write = null; dev = null; set('disconnected', 'USB cable unplugged'); } });
  navigator.usb.addEventListener('connect', e => { if (kind === 'usb' && state !== 'connected') bindUsb(e.device).catch(() => {}); });
}

// Needs a tap (the browser shows its device list).
export async function connect() {
  if (kind === 'bluetooth') {
    if (!navigator.bluetooth) throw new Error('Bluetooth is not available here. Use Google Chrome.');
    const d = await navigator.bluetooth.requestDevice({acceptAllDevices: true, optionalServices: BT_SERVICES});
    await bindBle(d); await setMeta('printerBtId', d.id);
  } else {
    if (!navigator.usb) throw new Error('USB is not available here. Use Google Chrome.');
    await bindUsb(await navigator.usb.requestDevice({filters: []}));
  }
}
// No tap needed. Works only where Chrome remembers the permission; otherwise the operator taps "Connect printer".
export async function autoConnect() {
  try {
    if (kind === 'bluetooth') {
      if (!navigator.bluetooth?.getDevices) return;
      const id = await getMeta('printerBtId'), d = (await navigator.bluetooth.getDevices()).find(x => x.id === id);
      if (d) await bindBle(d);
    } else if (navigator.usb) {
      const d = (await navigator.usb.getDevices())[0];
      if (d) await bindUsb(d);
    }
  } catch {}
}
export async function print(bytes) {
  if (!write && dev && kind === 'bluetooth') { try { await bindBle(dev); } catch {} }
  if (!write) throw new Error('Printer not connected');
  await write(bytes);
}
