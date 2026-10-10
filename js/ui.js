// Pop-up panels, number keypad and short messages. (The browser's own pop-ups are not used: they can be blocked.)
import {esc} from './util.js';
export function modal(html, cls = '') {
  const o = document.createElement('div'); o.className = 'modal';
  o.innerHTML = `<div class="sheet ${cls}">${html}</div>`; document.body.append(o);
  return {el: o.firstElementChild, close: () => o.remove()};
}
export function confirmBox(msg, ok = 'OK', danger = false) {
  return new Promise(res => {
    const m = modal(`<p class="msg">${esc(msg)}</p><div class="acts"><button data-a="no">Go back</button><button class="${danger ? 'danger' : 'go'}" data-a="yes">${esc(ok)}</button></div>`);
    m.el.onclick = e => { const a = e.target.closest('[data-a]')?.dataset.a; if (a) { m.close(); res(a === 'yes'); } };
  });
}
// Resolves with the typed digits, or null if cancelled / nothing typed.
export function keypad(title, {initial = '0', max = 3, ok = 'OK'} = {}) {
  return new Promise(res => {
    let v = '';
    const m = modal(`<div class="kt">${esc(title)}</div><div class="kd">${esc(initial)}</div>
      <div class="keys">${['1','2','3','4','5','6','7','8','9','C','0','⌫'].map(k => `<button data-k="${k}">${k}</button>`).join('')}</div>
      <div class="acts"><button data-a="no">Cancel</button><button class="go" data-a="yes">${esc(ok)}</button></div>`, 'narrow');
    const kd = m.el.querySelector('.kd');
    m.el.onclick = e => {
      const k = e.target.closest('[data-k]')?.dataset.k;
      if (k) { v = k === 'C' ? '' : k === '⌫' ? v.slice(0, -1) : (v + k).replace(/^0+(?=\d)/, '').slice(0, max); kd.textContent = v || '0'; return; }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a) { m.close(); res(a === 'yes' && v !== '' ? v : null); }
    };
  });
}
export function toast(msg, bad = false) {
  const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg;
  t.onclick = () => t.remove(); document.body.append(t); setTimeout(() => t.remove(), bad ? 7000 : 2500);
}
