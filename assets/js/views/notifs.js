/* 알림 목록과 알림 설정 */
import { state, api, h, icon, avatar, ago, setTitle, pageHead, errToast, toast, app, every, today, subNav } from '../core.js';
import { pushStatus, enablePush, disablePush } from '../webpush.js';

const KIND_ICON = { message: 'chat', event: 'calendar', plan: 'study', share: 'note', board: 'board', grape: 'grape' };
const KIND_HINT = {
  message: '친구가 보낸 메시지',
  event: '친구가 나에게 보이는 일정을 등록하거나 바꿨을 때',
  plan: '공동 계획에 초대되거나, 다른 참여자가 할 일을 고쳤을 때',
  share: '같이 쓰는 메모·그림판을 다른 사람이 고쳤을 때 (내 혼자 것은 알리지 않아요)',
  board: '내 글에 댓글이 달리거나 친구가 공지를 올렸을 때',
  grape: '포도알 판에 초대되거나, 같이 하는 친구가 칠했거나, 다 채웠을 때',
};

export default async function mount(view, route) {
  const prefsEl = h('div', { class: 'card' });
  if (route && route.name === 'notifset') {   // 내 정보 > 알림 설정
    setTitle('알림 설정');
    view.append(subNav('me', 'notifset'), pageHead('알림 설정', '받을 알림을 고르고, 이 기기에서 푸시를 켜요'), prefsEl);
    let data = null;
    const paintPrefs = () => prefsCard(prefsEl, data, paintPrefs);
    try { data = await api.get('notif.list'); paintPrefs(); } catch (e) { prefsEl.replaceChildren(h('div', { class: 'empty' }, e.message)); }
    return;
  }
  setTitle('알림');
  const listEl = h('div', { class: 'card nt-card' });
  const readAllBtn = h('button', { class: 'btn sm', type: 'button', onclick: () => readAll() }, '모두 읽음');
  const clearBtn = h('button', { class: 'btn ghost sm', type: 'button', onclick: () => clearRead() }, '읽은 알림 지우기');
  const setBtn = h('a', { class: 'btn ghost sm', href: '#/notifset' }, icon('gear'), '알림 설정');
  view.append(pageHead('알림', '친구 일정, 공동 계획, 메시지, 같이 고친 메모·그림판 소식', readAllBtn, clearBtn, setBtn), listEl);
  let data = null;

  function setUnread(n) { state.notifUnread = n; app.paintBadges(); }
  function paint() {
    const items = data.items;
    readAllBtn.disabled = !data.unread;
    if (!items.length) { listEl.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'nt-empty-ico' }, icon('bell')), '아직 알림이 없어요')); return; }
    let lastGroup = null;
    const rows = [];
    for (const n of items) {
      const g = n.at.slice(0, 10) === today() ? '오늘' : '이전';
      if (g !== lastGroup) { rows.push(h('div', { class: 'nt-group' }, g)); lastGroup = g; }
      rows.push(h('a', { class: 'nt-item' + (n.read ? '' : ' unread'), href: '#' + (n.link || '/notifs'), onclick: () => open(n) },
        h('span', { class: 'nt-ico k-' + n.kind }, n.actor ? avatar(n.actor, 'sm') : null, h('i', null, icon(KIND_ICON[n.kind] || 'bell'))),
        h('span', { class: 'nt-text' }, h('b', null, n.title), n.body ? h('span', { class: 'nt-body' }, n.body) : null, h('span', { class: 'tiny muted' }, ago(n.at))),
        n.read ? null : h('span', { class: 'nt-dot', 'aria-label': '안 읽음' })));
    }
    listEl.replaceChildren(...rows);
  }
  async function load() {
    data = await api.get('notif.list');
    setUnread(data.unread); paint();
  }
  async function open(n) {
    if (n.read) return;
    n.read = true;
    try { const r = await api.post('notif.read', { id: n.id }); setUnread(r.unread); } catch (e) {}
  }
  async function readAll() {
    try { const r = await api.post('notif.read', { all: true }); setUnread(r.unread); data.items.forEach((n) => { n.read = true; }); data.unread = 0; paint(); } catch (e) { errToast(e); }
  }
  async function clearRead() {
    try { const r = await api.post('notif.clear'); setUnread(r.unread); data.items = data.items.filter((n) => !n.read); paint(); } catch (e) { errToast(e); }
  }
  try { await load(); } catch (e) { listEl.replaceChildren(h('div', { class: 'empty' }, e.message)); }
  return every(20000, () => load().catch(() => {}));
}

/* 이 기기에서 푸시 받기 (아이폰 홈 화면 웹앱·컴퓨터 브라우저) */
function pushRow(repaint) {
  const st = pushStatus();
  if (st === 'unavailable') return null;
  const msg = {
    'ios-home': '아이폰은 Safari 아래 공유 버튼 → ‘홈 화면에 추가’로 설치한 뒤, 홈 화면의 공부 친구 아이콘으로 열면 푸시를 켤 수 있어요 (iOS 16.4 이상)',
    unsupported: '이 브라우저는 푸시를 지원하지 않아요',
    denied: '알림이 차단돼 있어요. 휴대폰·브라우저 설정에서 이 사이트 알림을 허용해 주세요',
    on: '앱을 꺼도 이 기기로 바로 알림이 와요',
    off: '켜면 앱을 꺼도 이 기기로 바로 알림이 와요',
  }[st];
  const btn = (st === 'on' || st === 'off') ? h('button', { class: 'btn sm' + (st === 'off' ? ' primary' : ''), type: 'button', onclick: async () => {
    btn.disabled = true;
    try { if (st === 'off') { await enablePush(); toast('이 기기에서 푸시를 켰어요'); } else { await disablePush(); toast('이 기기 푸시를 껐어요'); } }
    catch (e) { errToast(e); }
    repaint();
  } }, st === 'off' ? '켜기' : '끄기') : null;
  return h('div', { class: 'nt-push' + (st === 'on' ? ' on' : '') }, h('span', { class: 'nt-ico k-message' }, h('i', null, icon('bell'))),
    h('span', { class: 'grow' }, h('b', null, '이 기기에서 푸시 받기'), h('span', { class: 'tiny muted' }, msg)), btn);
}
export function prefsCard(prefsEl, data, repaint) {
  const off = new Set(data.off);
  prefsEl.replaceChildren(h('h3', { class: 'card-title' }, icon('gear'), '알림 받을 것'), pushRow(repaint),
    h('p', { class: 'small muted' }, '끄면 그 종류는 알림 목록과 휴대폰 알림에 오지 않아요. 내 혼자 쓰는 것은 원래 알리지 않아요.'),
    h('div', { class: 'nt-prefs' }, Object.entries(data.kinds).map(([k, label]) => {
      const cb = h('input', { type: 'checkbox', role: 'switch', checked: !off.has(k), 'aria-label': label + ' 알림',
        onchange: async () => {
          cb.checked ? off.delete(k) : off.add(k);
          try { const r = await api.post('notif.prefs', { off: [...off] }); data.off = r.off; toast(cb.checked ? label + ' 알림을 켰어요' : label + ' 알림을 껐어요'); }
          catch (e) { errToast(e); cb.checked = !cb.checked; }
        } });
      return h('label', { class: 'nt-pref' }, h('span', { class: 'nt-ico k-' + k }, h('i', null, icon(KIND_ICON[k]))),
        h('span', { class: 'grow' }, h('b', null, label), h('span', { class: 'tiny muted' }, KIND_HINT[k] || '')), h('span', { class: 'sw' }, cb, h('span', { class: 'sw-t', 'aria-hidden': 'true' })));
    })));
}
