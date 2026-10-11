// Copies bill files to Google Drive:  YULO Bills / Months / October 2026 / Bill#01_10-10-2026.txt
// Uses the "drive.file" permission: the app can only see and change files it created itself.
import * as db from './db.js';
import {billText, fileName, monthFolder} from './files.js';
export const CLIENT_ID = '953907811917-3k9buualnekn231hlgblfbigrpihkndh.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file', FOLDER = 'application/vnd.google-apps.folder';
let gis = null, token = null, tokenExp = 0;

export function loadGoogle() {
  if (!gis) gis = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = res; s.onerror = () => { gis = null; s.remove(); rej(new Error('Could not reach Google. Check the internet connection.')); };
    document.head.append(s);
  });
  return gis;
}
async function getToken() {
  if (token && Date.now() < tokenExp - 60e3) return token;
  await loadGoogle();
  return new Promise((res, rej) => {
    window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPE,
      callback: r => { if (r.error) return rej(new Error(r.error_description || r.error)); token = r.access_token; tokenExp = Date.now() + r.expires_in * 1000; res(token); },
      error_callback: e => rej(new Error(e.type === 'popup_closed' ? 'Google sign-in was closed before finishing' : 'Google sign-in failed (' + (e.type || e.message) + ')'))
    }).requestAccessToken({prompt: ''});
  });
}
async function api(path, opt = {}) {
  const r = await fetch('https://www.googleapis.com/' + path, {...opt, headers: {Authorization: 'Bearer ' + token, ...(opt.headers || {})}});
  if (r.status === 401) { token = null; throw new Error('Google sign-in expired. Tap Sync again.'); }
  if (!r.ok) throw Object.assign(new Error('Google Drive error ' + r.status), {status: r.status});
  return r.status === 204 ? null : r.json();
}
const quote = s => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
async function folder(name, parent) {
  const q = `name=${quote(name)} and mimeType='${FOLDER}' and trashed=false and '${parent}' in parents`;
  const r = await api('drive/v3/files?fields=files(id)&q=' + encodeURIComponent(q));
  if (r.files.length) return r.files[0].id;
  return (await api('drive/v3/files?fields=id', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, mimeType: FOLDER, parents: [parent]})})).id;
}
async function filesIn(parent) {
  const out = {}; let page = '';
  do {
    const r = await api(`drive/v3/files?pageSize=1000&fields=nextPageToken,files(id,name)&q=${encodeURIComponent(`'${parent}' in parents and trashed=false`)}${page ? '&pageToken=' + page : ''}`);
    r.files.forEach(f => out[f.name] = f.id); page = r.nextPageToken;
  } while (page);
  return out;
}
async function upload(name, parent, text, id) {
  if (id) return (await api(`upload/drive/v3/files/${id}?uploadType=media&fields=id`, {method: 'PATCH', headers: {'Content-Type': 'text/plain; charset=UTF-8'}, body: text})).id;
  const b = 'yulo' + Date.now();
  const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name, parents: [parent]})}\r\n--${b}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text}\r\n--${b}--`;
  return (await api('upload/drive/v3/files?uploadType=multipart&fields=id', {method: 'POST', headers: {'Content-Type': 'multipart/related; boundary=' + b}, body})).id;
}

// Bills never sent to Drive, plus bills changed since (printed later, cancelled).
export async function waiting() {
  const sent = await db.getMeta('driveSent', {}), changed = await db.getMeta('driveChanged', {});
  return (await db.billNumbers()).filter(no => !sent[no] || changed[no]);
}
// clearChanged runs in the same queue as file saves, so a bill changed during upload is sent again next time.
export async function sync(settings, clearChanged, progress = () => {}) {
  const list = await waiting();
  if (!list.length) return 0;
  await getToken();
  const months = await folder('Months', await folder('YULO Bills', 'root')), cache = {};
  const sent = await db.getMeta('driveSent', {});
  let n = 0;
  for (const no of list) {
    const bill = await db.get('bills', no); if (!bill) continue;
    const ver = (await db.getMeta('driveChanged', {}))[no];
    const m = monthFolder(bill);
    if (!cache[m]) { const id = await folder(m, months); cache[m] = {id, files: await filesIn(id)}; }
    const name = fileName(bill), text = billText(bill, settings);
    let id;
    try { id = await upload(name, cache[m].id, text, cache[m].files[name]); }
    catch (e) { if (e.status !== 404) throw e; id = await upload(name, cache[m].id, text, null); }   // deleted on Drive: create again
    cache[m].files[name] = id; sent[no] = 1;
    await db.setMeta('driveSent', sent); await clearChanged(no, ver);
    progress(++n, list.length);
  }
  await db.setMeta('lastDriveSync', new Date().toISOString());
  return n;
}
