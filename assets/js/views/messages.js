/* 친구와 1:1 메시지. 열려 있는 동안 3초마다 새 메시지를 확인해요 */
import { state, api, h, icon, avatar, errToast, every, setTitle, hm, ago, mdw, today, app } from '../core.js';

const QUICK = ['화이팅!', '지금 공부 중이야', '같이 공부할래?', '수고했어'];

export default async function mount(view, route) {
  const withId = route.params[0] ? Number(route.params[0]) : null;
  setTitle('메시지');
  const layout = h('div', { class: 'chat-layout' + (withId ? ' has-chat' : '') });
  const threadsEl = h('div', { class: 'threads' });
  const listPane = h('div', { class: 'card list-pane' }, h('h2', { style: { margin: '4px 4px 10px' } }, '메시지'), threadsEl);
  const chatPane = h('div', { class: 'card chat-pane' });
  layout.append(listPane, chatPane);
  view.append(layout);

  let threads = [];
  async function loadThreads() {
    const r = await api.get('messages.threads');
    threads = r.threads;
    state.unread = threads.reduce((a, t) => a + (t.friend.id === withId ? 0 : t.unread), 0);
    app.paintBadges();
    threadsEl.replaceChildren();
    if (!threads.length) { threadsEl.append(h('div', { class: 'empty' }, '친구를 추가하면 메시지를 보낼 수 있어요', h('br'), h('a', { href: '#/friends' }, '친구 추가'))); return; }
    for (const t of threads) {
      threadsEl.append(h('a', { class: 'thread' + (t.friend.id === withId ? ' on' : ''), href: '#/messages/' + t.friend.id },
        avatar(t.friend),
        h('div', { style: { 'min-width': '0' } }, h('div', { class: 't' }, t.friend.name),
          h('div', { class: 's' }, t.last ? (t.last.mine ? '나: ' : '') + t.last.body : '아직 대화가 없어요')),
        h('div', { style: { display: 'grid', 'justify-items': 'end', gap: '4px' } },
          t.last ? h('span', { class: 'tiny muted' }, ago(t.last.at)) : null,
          t.unread && t.friend.id !== withId ? h('span', { class: 'badge-n', style: { margin: 0 } }, t.unread) : null)));
    }
  }

  if (!withId) {
    chatPane.append(h('div', { class: 'empty', style: { margin: 'auto' } }, '왼쪽에서 친구를 골라 대화를 시작하세요'));
    await loadThreads().catch(errToast);
    return every(10000, loadThreads);
  }

  /* ===== 대화창 ===== */
  const msgsEl = h('div', { class: 'msgs', 'aria-live': 'polite' });
  const input = h('textarea', { class: 'input', rows: '1', maxlength: '2000', placeholder: '메시지 보내기', 'aria-label': '메시지' });
  const sendBtn = h('button', { class: 'btn primary icon', type: 'submit', 'aria-label': '보내기' }, icon('send'));
  const headName = h('b');
  const headAv = h('span');
  chatPane.append(
    h('div', { class: 'chat-head' }, h('a', { class: 'btn ghost icon sm', href: '#/messages', 'aria-label': '목록으로' }, icon('back')), headAv, headName),
    msgsEl,
    h('div', { class: 'quick' }, QUICK.map((q) => h('button', { type: 'button', onclick: () => send(q) }, q))),
    h('form', { class: 'composer', onsubmit: (e) => { e.preventDefault(); send(input.value); } }, input, sendBtn));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(input.value); }
  });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight) + 'px'; });

  let msgs = [], lastId = 0, readUpTo = 0, hasMore = false, sending = false;
  function nearBottom() { return msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 80; }
  function paint(stick) {
    const keep = stick || nearBottom();
    const prevTop = msgsEl.scrollTop;
    msgsEl.replaceChildren();
    if (hasMore) msgsEl.append(h('button', { class: 'btn sm', type: 'button', style: { 'align-self': 'center' }, onclick: older }, '이전 메시지 더 보기'));
    if (!msgs.length) msgsEl.append(h('div', { class: 'empty', style: { margin: 'auto' } }, '첫 메시지를 보내 보세요'));
    let lastDay = '';
    const lastMineRead = [...msgs].reverse().find((m) => m.mine && m.id <= readUpTo);
    for (const m of msgs) {
      const day = m.at.slice(0, 10);
      if (day !== lastDay) { msgsEl.append(h('div', { class: 'day-sep' }, mdw(day))); lastDay = day; }
      msgsEl.append(h('div', { class: 'msg' + (m.mine ? ' mine' : '') },
        h('div', { class: 'b' }, m.body),
        h('div', { class: 'm' }, m === lastMineRead ? h('span', null, '읽음') : null, h('span', null, m.pending ? '보내는 중' : hm(m.at)))));
    }
    if (keep) msgsEl.scrollTop = msgsEl.scrollHeight;
    else msgsEl.scrollTop = prevTop;
  }
  async function first() {
    const r = await api.get('messages.list', { with: withId });
    msgs = r.messages; readUpTo = r.readUpTo; hasMore = r.hasMore;
    lastId = msgs.length ? msgs[msgs.length - 1].id : 0;
    paint(true);
  }
  async function poll() {
    const r = await api.get('messages.list', { with: withId, after: lastId });
    const changed = r.messages.length || r.readUpTo !== readUpTo;
    for (const m of r.messages) if (!msgs.some((x) => x.id === m.id)) msgs.push(m);
    if (r.messages.length) lastId = r.messages[r.messages.length - 1].id;
    readUpTo = r.readUpTo;
    if (changed) paint(false);
  }
  async function older() {
    if (!msgs.length) return;
    const r = await api.get('messages.list', { with: withId, before: msgs[0].id });
    const prevH = msgsEl.scrollHeight;
    msgs = [...r.messages, ...msgs]; hasMore = r.hasMore;
    paint(false);
    msgsEl.scrollTop = msgsEl.scrollHeight - prevH;
  }
  async function send(text) {
    text = (text || '').trim();
    if (!text || sending) return;
    sending = true; sendBtn.disabled = true;
    const temp = { id: Number.MAX_SAFE_INTEGER, mine: true, body: text, at: today() + ' 00:00:00', pending: true };
    msgs.push(temp); input.value = ''; input.style.height = 'auto'; paint(true);
    try {
      const r = await api.post('messages.send', { to: withId, body: text });
      msgs = msgs.filter((m) => m !== temp);
      if (!msgs.some((x) => x.id === r.message.id)) msgs.push(r.message);
      msgs.sort((a, b) => a.id - b.id);
      paint(true);
      loadThreads().catch(() => {});
    } catch (e) {
      msgs = msgs.filter((m) => m !== temp); paint(true);
      input.value = text; errToast(e);
    } finally { sending = false; sendBtn.disabled = false; input.focus(); }
  }

  try {
    await Promise.all([loadThreads(), first()]);
  } catch (e) {
    chatPane.replaceChildren(h('div', { class: 'empty', style: { margin: 'auto' } }, e.message, h('br'), h('a', { href: '#/messages' }, '목록으로')));
    return every(10000, loadThreads);
  }
  const t = threads.find((x) => x.friend.id === withId);
  const friend = t ? t.friend : { name: '친구', color: '#888' };
  headName.textContent = friend.name;
  headAv.replaceChildren(avatar(friend));
  setTitle(friend.name);
  if (matchMedia('(min-width: 900px)').matches) input.focus();
  const s1 = every(3000, poll);
  const s2 = every(15000, loadThreads);
  return () => { s1(); s2(); };
}
