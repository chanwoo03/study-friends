/* 여러 화면이 같이 쓰는 도구: 서버 요청, 화면 조각 만들기, 날짜, 알림, 모달 */

/* 화면에 조각을 넣을 때 null·undefined·false 는 건너뛰어요.
   (조건에 따라 빠지는 조각이 'null' 글자로 보이는 실수를 앱 전체에서 막아요) */
for (const m of ['append', 'prepend', 'replaceChildren']) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...kids) { return orig.apply(this, kids.filter((k) => k !== null && k !== undefined && k !== false)); };
}

export const state = { me: null, csrf: '', providers: {}, allowRegister: true, friends: [], friendsAt: 0, unread: 0 };

/* ===== 서버 요청 ===== */
export class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data || {}; }
}
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function call(action, { method = 'GET', params, body, retried } = {}) {
  let url = 'api.php?a=' + encodeURIComponent(action);
  if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
  let res;
  try {
    res = await fetch(url, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: method === 'POST' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf } : {},
      body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
    });
  } catch (e) {
    throw new ApiError(0, '인터넷 연결을 확인해 주세요');
  }
  let data = {};
  try { data = await res.json(); } catch (e) { data = {}; }
  if (res.ok) return data;
  if (res.status === 403 && data.code === 'csrf' && !retried) {
    const c = await call('config');
    state.csrf = c.csrf;
    return call(action, { method, params, body, retried: true });
  }
  if (res.status === 401 && action !== 'auth.login') onUnauthorized();
  throw new ApiError(res.status, data.error || '서버에 연결하지 못했어요', data);
}
export const api = {
  get: (a, params) => call(a, { params }),
  post: (a, body) => call(a, { method: 'POST', body }),
  /* 파일 올리기 (multipart). onProgress(0~1) 로 진행률을 알려 줘요 */
  upload: (a, form, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'api.php?a=' + encodeURIComponent(a));
    xhr.setRequestHeader('X-CSRF-Token', state.csrf);
    xhr.withCredentials = true;
    if (onProgress) xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch (e) {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else { if (xhr.status === 401) onUnauthorized(); reject(new ApiError(xhr.status, data.error || (xhr.status === 413 ? '파일이 너무 커요' : '파일을 보내지 못했어요'), data)); }
    };
    xhr.onerror = () => reject(new ApiError(0, '인터넷 연결을 확인해 주세요'));
    xhr.send(form);
  }),
};
/* 앱(Flutter)으로 열었는지. 앱에서는 내려받기를 앱이 대신 처리해요 */
export const inApp = () => !!(window.SFApp && window.SFApp.postMessage);
/* 파일 내려받기: 브라우저는 링크로, 앱은 내용을 앱에 넘겨 저장·공유 창을 띄워요 */
export async function download(url, name) {
  if (!inApp()) { const a = document.createElement('a'); a.href = url; a.download = name || ''; document.body.append(a); a.click(); a.remove(); return; }
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('파일을 받지 못했어요');
  const blob = await res.blob();
  const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.readAsDataURL(blob); });
  window.SFApp.postMessage(JSON.stringify({ type: 'download', name: name || 'file', data: b64 }));
}

/* ===== 화면 조각 =====
   h('div', {class: 'x', onclick: fn}, '글자', 자식요소...) — 글자는 항상 textContent 로 들어가요 */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv); }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'indeterminate') el[k] = v;
    else if (k === 'svg') el.innerHTML = v;   // 코드 안에 적힌 아이콘만
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const $ = (sel, root = document) => root.querySelector(sel);

/* ===== 아이콘 ===== */
const P = {
  calendar: '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  study: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 8h7M9 12h5"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
  board: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/>',
  draw: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  note: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  sidebar: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  globe: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  pick: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20a6.5 6.5 0 0 1 10-5.5"/><path d="M15 18l2 2 4-4"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  eraser: '<path d="M20 20H8.5L3.6 15.1a2 2 0 0 1 0-2.8l9.5-9.5a2 2 0 0 1 2.8 0l4.9 4.9a2 2 0 0 1 0 2.8L13 18.3"/><path d="M7 11l6 6"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7c1.9 0 3.6-.6 5-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  cursor: '<path d="M5 3l14 8-6 1.6L10 19z"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1.5"/>',
  diamond: '<path d="M12 3l9 9-9 9-9-9z"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  badge: '<circle cx="12" cy="9" r="6"/><path d="M8.5 13.5L7 22l5-3 5 3-1.5-8.5"/><path d="M9.5 9l1.8 1.8L14.8 7.3"/>',
  circle: '<ellipse cx="12" cy="12" rx="8.5" ry="7"/>',
  line: '<path d="M5 19L19 5"/>',
  arrow: '<path d="M5 19L19 5M10 5h9v9"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  sticky: '<path d="M5 4h14v10l-6 6H5z"/><path d="M13 20v-6h6"/>',
  grid: '<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
  mindmap: '<circle cx="12" cy="12" r="3"/><circle cx="4.5" cy="5" r="2"/><circle cx="19.5" cy="5" r="2"/><circle cx="4.5" cy="19" r="2"/><circle cx="19.5" cy="19" r="2"/><path d="M9.8 10L6 6.4M14.2 10L18 6.4M9.8 14L6 17.6M14.2 14L18 17.6"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  clip: '<path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l9.2-9.2a3.7 3.7 0 0 1 5.2 5.2l-9.2 9.2a1.8 1.8 0 0 1-2.6-2.6l8.6-8.6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  pin: '<path d="M9 4h6l-1 6 4 3H6l4-3z"/><path d="M12 13v8"/>',
  group: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2.5 19a5.5 5.5 0 0 1 11 0M10.5 19a5.5 5.5 0 0 1 11 0"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
};
export function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'i ' + cls);
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = P[name] || '';
  return s;
}

/* ===== 날짜 ===== */
export const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseD = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const parseDT = (s) => { const [d, t = '00:00:00'] = s.split(' '); const [y, m, dd] = d.split('-').map(Number); const [hh, mi, ss] = t.split(':').map(Number); return new Date(y, m - 1, dd, hh, mi, ss || 0); };
/* '오늘'은 서버(한국 시간) 기준이에요. 기기 시간대가 달라도 캘린더·공부 기록의 날짜가 서버와 같게 */
let clockSkew = 0;
export function setServerNow(s) { if (s) clockSkew = parseDT(s).getTime() - Date.now(); }
export const nowLocal = () => new Date(Date.now() + clockSkew);
export const today = () => ymd(nowLocal());
export const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
export const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
export function mdw(s) { const d = parseD(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`; }
export function md(s) { const d = parseD(s); return `${d.getMonth() + 1}/${d.getDate()}`; }
export function fmtDur(sec) {
  sec = Math.max(0, Math.floor(sec / 60));
  const hh = Math.floor(sec / 60), mm = sec % 60;
  return hh ? `${hh}시간 ${mm}분` : `${mm}분`;
}
export function ago(dt) {
  if (!dt) return '';
  const m = Math.floor((nowLocal() - parseDT(dt)) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
  if (m < 10080) return `${Math.floor(m / 1440)}일 전`;
  return md(dt);
}
export function hm(dt) { const d = parseDT(dt); const hh = d.getHours(); return `${hh < 12 ? '오전' : '오후'} ${hh % 12 || 12}:${pad(d.getMinutes())}`; }

/* 양력 고정 공휴일 (음력 공휴일·대체공휴일은 해마다 달라서 따로 넣지 않았어요) */
export const HOLIDAYS = { '01-01': '신정', '03-01': '삼일절', '05-05': '어린이날', '06-06': '현충일', '08-15': '광복절', '10-03': '개천절', '10-09': '한글날', '12-25': '성탄절' };

/* ===== 알림·모달 ===== */
let toastT;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
}
export function errToast(e) { toast(e && e.message ? e.message : '문제가 생겼어요'); }

export function modal(content, { wide = false, onClose } = {}) {
  const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' }, content);
  const bg = h('div', { class: 'modal-bg' }, box);
  const prevFocus = document.activeElement;
  function close() {
    bg.remove(); document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(bg);
  setTimeout(() => { const f = box.querySelector('input:not([type=checkbox]):not([type=hidden]), textarea'); if (f) f.focus(); }, 30);
  return { close, box };
}
/* 한 번 더 눌러야 실행되는 버튼 (확인 창 대신) */
export function confirmBtn(label, confirmLabel, onConfirm, cls = 'btn danger sm') {
  const b = h('button', { type: 'button', class: cls }, label);
  let armed = false, t;
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!armed) { armed = true; b.textContent = confirmLabel; t = setTimeout(() => { armed = false; b.textContent = label; }, 3000); return; }
    clearTimeout(t); b.disabled = true;
    try { await onConfirm(); } finally { b.disabled = false; armed = false; b.textContent = label; }
  });
  return b;
}

/* ===== 사람 ===== */
/* 프로필 사진이 있으면 사진, 없으면 이름 첫 글자 동그라미 */
export function avatar(u, size = '') {
  const name = (u && u.name) || '?';
  const letter = h('span', { class: 'av ' + size, style: { '--c': (u && u.color) || '#888' }, title: name }, Array.from(name)[0]);
  if (u && u.avatar && /^uploads\/avatars\/[A-Za-z0-9_]+\.(jpg|png|webp)$/.test(u.avatar)) {
    const img = h('img', { class: 'av img ' + size, src: u.avatar, alt: '', title: name, loading: 'lazy' });
    img.addEventListener('error', () => img.replaceWith(letter));
    return img;
  }
  return letter;
}
export async function loadFriends(force = false) {
  if (!force && Date.now() - state.friendsAt < 15000) return state.friends;
  const r = await api.get('friends.list');
  state.friends = r.friends; state.friendsAt = Date.now();
  return state.friends;
}

/* ===== 공개 범위 고르기 =====
   반환값의 value() 로 {visibility, shares} 를 얻어요 */
export const VIS_LABEL = { private: '나만 보기', friends: '친구 모두', selected: '고른 친구만' };
export function visIcon(v) { return icon(v === 'private' ? 'lock' : v === 'selected' ? 'pick' : 'globe'); }
export function visibilityPicker(initial = 'friends', initialShares = []) {
  let vis = initial;
  const chosen = new Set(initialShares.map(Number));
  const who = h('div', { class: 'who' });
  const note = h('div', { class: 'tiny muted' });
  const opts = h('div', { class: 'opts', role: 'group', 'aria-label': '공개 범위' });
  const btns = {};
  for (const v of ['private', 'friends', 'selected']) {
    btns[v] = h('button', { type: 'button', class: 'opt', 'aria-pressed': String(v === vis), onclick: () => { vis = v; paint(); } }, visIcon(v), VIS_LABEL[v]);
    opts.append(btns[v]);
  }
  function paint() {
    for (const v in btns) btns[v].setAttribute('aria-pressed', String(v === vis));
    who.hidden = vis !== 'selected';
    note.textContent = vis === 'private' ? '나만 볼 수 있어요' : vis === 'friends' ? '내 친구 모두가 볼 수 있어요' : '';
    note.hidden = vis === 'selected';
  }
  loadFriends().then((fr) => {
    who.replaceChildren();
    if (!fr.length) { who.append(h('span', { class: 'tiny muted' }, '아직 친구가 없어요. 친구 화면에서 초대 코드로 추가하세요')); return; }
    for (const f of fr) {
      const cb = h('input', { type: 'checkbox', checked: chosen.has(f.id), onchange: (e) => { e.target.checked ? chosen.add(f.id) : chosen.delete(f.id); } });
      who.append(h('label', null, cb, avatar(f, 'sm'), f.name));
    }
  }).catch(() => {});
  paint();
  const el = h('div', { class: 'vis' }, h('div', { class: 'field' }, '공개 범위'), opts, note, who);
  return { el, value: () => ({ visibility: vis, shares: vis === 'selected' ? [...chosen] : [] }) };
}

export const COLORS = ['#3182f6', '#f2638a', '#20c997', '#ff9f43', '#845ef7', '#0ca5b0', '#e8590c', '#5c7cfa', '#868e96'];
export function colorPicker(initial = COLORS[0]) {
  let cur = initial;
  const wrap = h('div', { class: 'colors', role: 'group', 'aria-label': '색' });
  const btns = COLORS.map((c) => h('button', { type: 'button', style: { '--c': c }, 'aria-label': '색 ' + c, 'aria-pressed': String(c === cur), onclick: () => { cur = c; btns.forEach((b, i) => b.setAttribute('aria-pressed', String(COLORS[i] === cur))); } }));
  wrap.append(...btns);
  return { el: h('div', { class: 'field' }, '색', wrap), value: () => cur };
}

/* 화면 위쪽 제목줄 */
export function pageHead(title, sub, ...actions) {
  return h('div', { class: 'head' }, h('div', null, h('h1', null, title), sub ? h('p', { class: 'sub' }, sub) : null), actions.length ? h('div', { class: 'row' }, actions) : null);
}
export function setTitle(t) { document.title = t ? `${t} · 공부 친구` : '공부 친구'; }

/* 화면이 보이는 동안만 반복 (다른 화면으로 가면 stop) */
export function every(ms, fn) {
  let stopped = false, t;
  async function tick() {
    if (stopped) return;
    if (document.visibilityState === 'visible') { try { await fn(); } catch (e) { /* 다음에 다시 */ } }
    if (!stopped) t = setTimeout(tick, ms);
  }
  t = setTimeout(tick, ms);
  return () => { stopped = true; clearTimeout(t); };
}

/* main.js 가 채워 넣는 앱 동작 (화면들이 main.js 를 직접 불러오지 않게) */
export const app = { go: (p) => { location.hash = '#/' + p; }, logout: async () => {}, paintMe: () => {}, paintBadges: () => {}, toggleTheme: () => {}, render: () => {} };
