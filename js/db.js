// IndexedDB storage: products, bills, and small settings/state values ("meta").
const NAME = 'yulo-pos', VERSION = 1;
let db;
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error || new Error('Save failed')); });

export function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('products', {keyPath: 'id', autoIncrement: true});
      d.createObjectStore('bills', {keyPath: 'no'}).createIndex('day', 'day');
      d.createObjectStore('meta', {keyPath: 'key'});
    };
    r.onsuccess = () => { db = r.result; res(); };
    r.onerror = () => rej(r.error);
  });
}
export const all = s => req(db.transaction(s).objectStore(s).getAll());
export const get = (s, k) => req(db.transaction(s).objectStore(s).get(k));
export async function put(s, v) { const t = db.transaction(s, 'readwrite'); const k = await req(t.objectStore(s).put(v)); await done(t); return k; }
export async function del(s, k) { const t = db.transaction(s, 'readwrite'); t.objectStore(s).delete(k); await done(t); }
export async function putMany(s, items) { const t = db.transaction(s, 'readwrite'); const st = t.objectStore(s); items.forEach(i => st.put(i)); await done(t); }
export const billsBetween = (from, to) => req(db.transaction('bills').objectStore('bills').index('day').getAll(IDBKeyRange.bound(from, to)));
export const billNumbers = () => req(db.transaction('bills').objectStore('bills').getAllKeys());
export async function maxBillNo() { const c = await req(db.transaction('bills').objectStore('bills').openCursor(null, 'prev')); return c ? c.key : 0; }
export async function getMeta(k, def) { const r = await get('meta', k); return r ? r.value : def; }
export const setMeta = (k, v) => put('meta', {key: k, value: v});

// First start only: load the menu and mark it loaded in the same step, so it can never load twice.
export async function seedOnce(products) {
  const t = db.transaction(['products', 'meta'], 'readwrite');
  const m = t.objectStore('meta');
  if (!await req(m.get('seeded'))) { products.forEach(p => t.objectStore('products').add(p)); m.put({key: 'seeded', value: true}); }
  await done(t);
}
// Completing a sale is all-or-nothing: take the next number, save the bill, clear the draft.
export async function completeBill(bill) {
  const t = db.transaction(['meta', 'bills'], 'readwrite'); const m = t.objectStore('meta');
  const c = await req(m.get('nextBillNo'));
  bill.no = c ? c.value : 1;
  t.objectStore('bills').add(bill);
  m.put({key: 'nextBillNo', value: bill.no + 1});
  m.put({key: 'lastBillAt', value: bill.createdAt});
  m.delete('draft');
  await done(t);
  return bill;
}
export async function dump() { return {products: await all('products'), bills: await all('bills'), meta: (await all('meta')).filter(m => m.key !== 'billsDir')}; }
export async function replaceAll(data) {
  const t = db.transaction(['products', 'bills', 'meta'], 'readwrite');
  for (const s of ['products', 'bills', 'meta']) { const st = t.objectStore(s); st.clear(); (data[s] || []).forEach(x => st.put(x)); }
  await done(t);
}
