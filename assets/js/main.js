/* 앱 시작, 로그인 화면, 메뉴, 화면 전환 */
import { state, api, h, icon, toast, setUnauthorizedHandler, every, setTitle, avatar, app, setServerNow, inApp } from './core.js';
import { noticeFloat } from './notice.js';
import { webPushOn, forgetPush } from './webpush.js';

const root = document.getElementById('root');
const NAV = [
  ['calendar', '캘린더', 'calendar'],
  ['study', '공부', 'study'],
  ['planner', '플래너', 'planner'],
  ['rank', '등수', 'trophy'],
  ['messages', '메시지', 'chat'],
  ['board', '보드', 'board'],
  ['draw', '그림판', 'draw'],
  ['notes', '메모장', 'note'],
  ['friends', '친구', 'users'],
  ['notifs', '알림', 'bell'],
  ['settings', '설정', 'gear'],
];
const TABS = ['calendar', 'study', 'messages', 'board', 'more'];
const VIEWS = {
  calendar: () => import('./views/calendar.js'),
  day: () => import('./views/day.js'),
  study: () => import('./views/study.js'),
  rank: () => import('./views/rank.js'),
  messages: () => import('./views/messages.js'),
  board: () => import('./views/board.js'),
  draw: () => import('./views/draw.js'),
  notes: () => import('./views/notes.js'),
  friends: () => import('./views/friends.js'),
  settings: () => import('./views/settings.js'),
  more: () => import('./views/more.js'),
  notifs: () => import('./views/notifs.js'),
  planner: () => import('./views/planner.js'),
};

/* #/notes/3?x=1 → {name:'notes', params:['3'], query:{x:'1'}} */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(qs));
  return { name: parts[0] || '', params: parts.slice(1), query };
}
export function go(path) { location.hash = '#/' + path; }

/* ===== 로그인 화면 ===== */
function authScreen(query) {
  setTitle('로그인');
  let mode = query.mode === 'register' && state.allowRegister ? 'register' : 'login';
  const err = h('div', { class: 'err', role: 'alert' }, query.err || '');
  const user = h('input', { id: 'auth-user', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', maxlength: '20', placeholder: '영문 소문자·숫자 4~20자' });
  const pass = h('input', { id: 'auth-pass', type: 'password', autocomplete: 'current-password', maxlength: '200', placeholder: '8자 이상' });
  const name = h('input', { id: 'auth-name', maxlength: '20', placeholder: '친구들에게 보일 이름' });
  const nameField = h('label', { class: 'field' }, '이름', name);
  const submit = h('button', { class: 'btn primary block', type: 'submit' });
  const seg = h('div', { class: 'seg', style: { width: '100%', display: 'grid', 'grid-template-columns': '1fr 1fr' } });
  const tabL = h('button', { type: 'button', onclick: () => { mode = 'login'; paint(); } }, '로그인');
  const tabR = h('button', { type: 'button', onclick: () => { mode = 'register'; paint(); } }, '회원가입');
  seg.append(tabL, tabR);
  if (!state.allowRegister) tabR.hidden = true;
  function paint() {
    tabL.setAttribute('aria-pressed', String(mode === 'login'));
    tabR.setAttribute('aria-pressed', String(mode === 'register'));
    nameField.hidden = mode !== 'register';
    pass.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    submit.textContent = mode === 'register' ? '가입하고 시작하기' : '로그인';
    err.textContent = '';
  }
  const form = h('form', { class: 'form', onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = ''; submit.disabled = true;
    try {
      const r = mode === 'register'
        ? await api.post('auth.register', { username: user.value, password: pass.value, name: name.value })
        : await api.post('auth.login', { username: user.value, password: pass.value });
      state.me = r.me; state.csrf = r.csrf;
      go(mode === 'register' ? 'friends?welcome=1' : 'calendar');
      render();
    } catch (ex) { err.textContent = ex.message; }
    finally { submit.disabled = false; }
  } }, seg,
    h('label', { class: 'field' }, '아이디', user),
    h('label', { class: 'field' }, '비밀번호', pass),
    nameField, err, submit);
  paint();

  const social = [];
  if (state.providers.kakao) social.push(h('a', { class: 'sbtn kakao', href: 'oauth/kakao.php?start=login', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#191919" d="M12 3.5C6.8 3.5 2.5 6.9 2.5 11c0 2.7 1.8 5 4.4 6.3l-.9 3.4c-.1.3.3.6.6.4l4-2.7c.5.1.9.1 1.4.1 5.2 0 9.5-3.4 9.5-7.5S17.2 3.5 12 3.5z"/></svg>' }));
  if (state.providers.google) social.push(h('a', { class: 'sbtn google', href: 'oauth/google.php?start=login', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.7 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.6 2.8C6.6 7.3 9.1 5.4 12 5.4z"/></svg>' }));
  if (social[0]) social[0].append('카카오로 계속하기');
  if (state.providers.kakao && social[1]) social[1].append('Google로 계속하기');
  else if (!state.providers.kakao && social[0]) social[0].append('Google로 계속하기');

  root.replaceChildren(h('div', { class: 'auth-wrap' }, h('div', { class: 'auth' },
    h('div', { class: 'brand' }, h('img', { class: 'logo', src: 'icon.svg', alt: '' }), '공부 친구'),
    h('p', { class: 'tag' }, '친구끼리만 보는 캘린더 · 공부 계획 · 메시지'),
    h('div', { class: 'card' }, form, social.length ? [h('div', { class: 'or' }, '또는'), h('div', { class: 'social' }, social)] : null),
  )));
  setTimeout(() => user.focus(), 30);
}

/* ===== 메뉴가 있는 화면 ===== */
let shell = null, cleanup = null, mountSeq = 0, notices = null;
function buildShell() {
  // 메뉴 접기: 컴퓨터는 왼쪽 메뉴가 아이콘만 남고, 휴대폰은 아래 메뉴가 작은 단추가 돼요 (기기마다 기억)
  const sideToggle = h('button', { class: 'btn ghost icon sm side-toggle', type: 'button', onclick: () => setNavMin(!navMin('side'), 'side') }, icon('sidebar'));
  const side = h('aside', { class: 'side', 'aria-label': '메뉴' }, h('div', { class: 'brand' }, h('img', { class: 'logo', src: 'icon.svg', alt: '' }), h('span', { class: 'nl' }, '공부 친구'), sideToggle));
  for (const [k, label, ic] of NAV) side.append(h('a', { class: 'nav-a', href: '#/' + k, 'data-k': k, title: label }, icon(ic), h('span', { class: 'nl' }, label), h('span', { class: 'badge-n', hidden: true })));
  side.append(h('div', { class: 'spacer' }));
  const meChip = h('a', { class: 'me-chip', href: '#/settings' });
  side.append(meChip);
  const themeBtn = h('button', { class: 'btn ghost icon', type: 'button', 'aria-label': '화면 테마 바꾸기', onclick: toggleTheme });
  const topMe = h('a', { class: 'top-me', href: '#/settings', 'aria-label': '내 프로필' });
  const top = h('header', { class: 'topbar' }, h('div', { class: 'brand' }, h('img', { class: 'logo', src: 'icon.svg', alt: '' }), '공부 친구'), h('div', { class: 'grow' }), themeBtn,
    h('a', { class: 'btn ghost icon top-bell', href: '#/notifs', 'data-k': 'notifs', 'aria-label': '알림' }, icon('bell'), h('span', { class: 'badge-n', hidden: true })),
    h('a', { class: 'btn ghost icon', href: '#/friends', 'aria-label': '친구' }, icon('users')), topMe);
  const tabs = h('nav', { class: 'tabbar', 'aria-label': '메뉴' });
  const tabLabel = { calendar: ['캘린더', 'calendar'], study: ['공부', 'study'], messages: ['메시지', 'chat'], board: ['보드', 'board'], more: ['더보기', 'more'] };
  for (const k of TABS) tabs.append(h('a', { class: 'tab', href: '#/' + k, 'data-k': k }, icon(tabLabel[k][1]), tabLabel[k][0], h('span', { class: 'badge-n', hidden: true })));
  tabs.append(h('button', { class: 'tab tab-fold', type: 'button', 'aria-label': '아래 메뉴 접기', onclick: () => setNavMin(true, 'tab') }, icon('down'), '접기'));
  const tabOpen = h('button', { class: 'tab-open', type: 'button', 'data-k': 'messages', 'aria-label': '아래 메뉴 펴기', onclick: () => setNavMin(false, 'tab') }, icon('menu'), h('span', { class: 'badge-n', hidden: true }));
  const view = h('div', { class: 'page', id: 'view' });
  if (notices) notices.stop();
  notices = noticeFloat();
  const main = h('main', { class: 'main' }, top, notices.el, view);
  root.replaceChildren(h('div', { class: 'shell' }, side, main, tabs, tabOpen));
  shell = { side, tabs, view, meChip, themeBtn, topMe, sideToggle };
  paintNavMin();
  paintMe(); paintTheme(); paintBadges();
}
const NAV_KEY = { side: 'sf-side-min', tab: 'sf-tab-min' };
function navMin(which) { try { return localStorage.getItem(NAV_KEY[which]) === '1'; } catch (e) { return false; } }
function setNavMin(on, which) { try { localStorage.setItem(NAV_KEY[which], on ? '1' : '0'); } catch (e) {} paintNavMin(); }
function paintNavMin() {
  const side = navMin('side'), tab = navMin('tab');
  document.documentElement.classList.toggle('side-min', side);
  document.documentElement.classList.toggle('tab-min', tab);
  if (shell) { shell.sideToggle.setAttribute('aria-label', side ? '왼쪽 메뉴 펴기' : '왼쪽 메뉴 접기'); shell.sideToggle.setAttribute('aria-expanded', String(!side)); }
}
export function paintMe() {
  if (!shell || !state.me) return;
  shell.meChip.replaceChildren(avatar(state.me), h('span', { class: 'grow nl', style: { overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' } }, state.me.name), icon('gear'));
  shell.topMe.replaceChildren(avatar(state.me));
}
function paintNav(name) {
  if (name === 'day') name = 'calendar';
  const k = name === 'more' ? 'more' : name;
  for (const a of shell.side.querySelectorAll('.nav-a')) a.classList.toggle('on', a.dataset.k === k);
  const inMore = ['draw', 'notes', 'friends', 'settings', 'more', 'rank', 'notifs', 'planner'].includes(name);
  for (const a of shell.tabs.querySelectorAll('.tab')) a.classList.toggle('on', a.dataset.k === name || (a.dataset.k === 'more' && inMore));
}
export function paintBadges() {
  if (!shell) return;
  for (const b of document.querySelectorAll('[data-k="messages"] .badge-n')) { b.hidden = !state.unread; b.textContent = state.unread > 99 ? '99+' : String(state.unread); }
  for (const b of document.querySelectorAll('[data-k="notifs"] .badge-n')) { b.hidden = !state.notifUnread; b.textContent = state.notifUnread > 99 ? '99+' : String(state.notifUnread); }
}
function paintTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (shell) shell.themeBtn.replaceChildren(icon(dark ? 'moon' : 'sun'));
  document.getElementById('theme-color').setAttribute('content', dark ? '#101013' : '#f2f4f6');
}
export function toggleTheme() {
  const n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', n);
  try { localStorage.setItem('sf-theme', n); } catch (e) {}
  paintTheme();
}

async function render() {
  const route = parseHash();
  if (!state.me) {
    if (cleanup) { cleanup(); cleanup = null; }
    shell = null;
    if (route.name !== 'login') { history.replaceState(null, '', '#/login' + (route.query.err ? '?err=' + encodeURIComponent(route.query.err) : '')); }
    authScreen(route.query);
    return;
  }
  if (!route.name || route.name === 'login') { history.replaceState(null, '', '#/calendar'); return render(); }
  if (!VIEWS[route.name]) { history.replaceState(null, '', '#/calendar'); return render(); }
  if (!shell) buildShell(); else if (notices) notices.soft();
  paintNav(route.name);
  if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
  const seq = ++mountSeq;
  const view = shell.view;
  view.replaceChildren(h('div', { class: 'empty' }, '불러오는 중…'));
  try {
    const mod = await VIEWS[route.name]();
    if (seq !== mountSeq) return;
    view.replaceChildren();
    window.scrollTo(0, 0);
    const c = await mod.default(view, route);
    if (seq !== mountSeq) { if (typeof c === 'function') c(); return; }
    cleanup = typeof c === 'function' ? c : null;
  } catch (e) {
    if (seq !== mountSeq) return;
    view.replaceChildren(h('div', { class: 'card' }, h('p', null, e.message || '화면을 불러오지 못했어요'),
      h('button', { class: 'btn', type: 'button', onclick: render }, icon('refresh'), '다시 시도')));
  }
}

export async function logout() {
  try { const r = await api.post('auth.logout'); state.csrf = r.csrf; } catch (e) {}
  state.me = null; state.friends = []; state.friendsAt = 0; state.notifLast = null; state.notifUnread = 0;
  try { localStorage.removeItem('sf-device'); } catch (e) {}
  forgetPush();
  if (inApp()) window.SFApp.postMessage(JSON.stringify({ type: 'logout' }));
  go('login'); render();
}

setUnauthorizedHandler(() => {
  if (!state.me) return;
  state.me = null; toast('다시 로그인해 주세요'); render();
});

async function syncBadge() {
  if (!state.me) return;
  const first = state.notifLast === null;
  const r = await api.get('sync', first ? {} : { after: state.notifLast });
  setServerNow(r.now);
  if (r.unread !== state.unread || r.notifUnread !== state.notifUnread) { state.unread = r.unread; state.notifUnread = r.notifUnread; paintBadges(); }
  if (!first) for (const n of r.notifs || []) showNotif(n);
  state.notifLast = Math.max(state.notifLast || 0, r.notifLast || 0);
  if (first) registerDevice().catch(() => {});
}
/* 새 알림: 앱이면 휴대폰 알림으로, 웹이면 화면 아래 작은 알림으로 (지금 그 화면을 보고 있으면 건너뛰어요) */
function showNotif(n) {
  if (location.hash.replace(/^#/, '') === n.link) return;
  if (inApp()) { window.SFApp.postMessage(JSON.stringify({ type: 'notify', id: n.id, title: n.title, body: n.body, link: n.link, kind: n.kind })); return; }
  if (webPushOn()) return;   // 이 기기는 푸시로 이미 알림이 떠요
  toast(n.title + (n.body ? ' · ' + n.body : ''));
}
/* 앱으로 열었으면 이 기기를 알림 받을 곳으로 등록 (로그인한 사람마다 한 번) */
async function registerDevice() {
  if (!inApp() || !state.me) return;
  const key = 'sf-device';
  try { if (localStorage.getItem(key) === String(state.me.id)) return; } catch (e) {}
  const r = await api.post('notif.device');
  window.SFApp.postMessage(JSON.stringify({ type: 'device', token: r.token, lastId: r.lastId, api: new URL('api.php', location.href).href }));
  try { localStorage.setItem(key, String(state.me.id)); } catch (e) {}
}
app.syncNow = () => syncBadge().catch(() => {});
window.sfRegisterDevice = () => registerDevice().catch(() => {});   // 앱이 '다시 등록해 줘' 할 때

async function boot() {
  try {
    const c = await api.get('config');
    Object.assign(state, { csrf: c.csrf, providers: c.providers, allowRegister: c.allowRegister, me: c.me, webPush: c.webPush || null });
    setServerNow(c.now);
  } catch (e) {
    root.replaceChildren(h('div', { class: 'auth-wrap' }, h('div', { class: 'card auth' }, h('h2', null, '서버에 연결하지 못했어요'), h('p', { class: 'muted' }, e.message),
      h('button', { class: 'btn primary', type: 'button', onclick: () => location.reload() }, '다시 시도'))));
    return;
  }
  window.addEventListener('hashchange', render);
  await render();
  syncBadge().catch(() => {});
  every(20000, syncBadge);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncBadge().catch(() => {}); });
}
Object.assign(app, { go, logout, paintMe, paintBadges, toggleTheme, render, refreshNotices: () => notices && notices.refresh() });
boot();

/* 앱으로 설치 (홈 화면에 추가) */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

