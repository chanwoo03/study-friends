/* 날짜 화면: 그날 내 공부 계획과 공부 시간, 일정, 그리고 친구별로 펼쳐 보는 진도 */
import { state, api, h, icon, avatar, errToast, every, setTitle, today, addDays, parseD, parseDT, mdw, fmtDur, HOLIDAYS, app } from '../core.js';
import { editEvent, eventRow, taskLine, cheerModal } from '../shared.js';

export default async function mount(view, route) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(route.params[0] || '') ? route.params[0] : today();
  setTitle(mdw(date));
  let data = null, skew = 0;
  const open = new Set();   // 펼쳐 둔 친구
  try { (JSON.parse(sessionStorage.getItem('sf-day-open') || '[]')).forEach((x) => open.add(x)); } catch (e) {}

  const head = h('div');
  const mine = h('div', { class: 'card' });
  const evBox = h('div', { class: 'card' });
  const friendsBox = h('div', { class: 'card' });
  view.append(head, h('div', { class: 'day-grid' }, mine, evBox), friendsBox);

  const elapsed = (since) => since ? Math.max(0, (Date.now() + skew - parseDT(since).getTime()) / 1000) : 0;
  const isToday = () => data && data.date === data.today;
  /* 공부 중이면 마지막으로 받은 뒤 흐른 시간만큼 더해서 보여 줘요 */
  function liveSecs(p) { return p.studySeconds + (isToday() && p.studyingSince ? Math.max(0, elapsed(p.studyingSince) - (p._base || 0)) : 0); }

  function paintHead() {
    const d = parseD(date), hol = HOLIDAYS[date.slice(5)];
    head.replaceChildren(
      h('div', { class: 'row', style: { 'margin-bottom': '6px' } },
        h('a', { class: 'btn ghost sm', href: '#/calendar?d=' + date }, icon('back'), `${d.getMonth() + 1}월 캘린더`)),
      h('div', { class: 'head' },
        h('div', null, h('h1', null, mdw(date)),
          h('p', { class: 'sub' }, date === today() ? '오늘' : date < today() ? `${Math.round((parseD(today()) - d) / 86400000)}일 전` : `${Math.round((d - parseD(today())) / 86400000)}일 뒤`, hol ? ' · ' + hol : '')),
        h('div', { class: 'row' },
          h('a', { class: 'btn icon', href: '#/day/' + addDays(date, -1), 'aria-label': '전날' }, icon('back')),
          date !== today() ? h('a', { class: 'btn', href: '#/day/' + today() }, '오늘') : null,
          h('a', { class: 'btn icon', href: '#/day/' + addDays(date, 1), 'aria-label': '다음 날' }, icon('next')))));
  }

  function paintMine() {
    const me = data.me, tasks = me.tasks;
    const done = tasks.filter((t) => t.done).length;
    const on = isToday() && !!me.studyingSince;
    const timeBig = h('div', { class: 'big-num' }, fmtDur(liveSecs(me)));
    const timer = isToday() ? h('button', { class: 'tbtn' + (on ? ' on' : ''), type: 'button', style: { 'margin-top': '10px' }, onclick: async (e) => {
      e.currentTarget.disabled = true;
      try { await api.post(on ? 'study.stop' : 'study.start'); await load(); } catch (ex) { errToast(ex); }
    } }, on ? h('span', { class: 'live-dot' }) : icon('play'), on ? '공부 끝내기' : '공부 시작') : null;
    const ul = h('ul', { class: 'list' });
    for (const t of tasks) ul.append(taskLine(t, { showPlan: true, onToggled: () => { paintMineHeadOnly(); } }));
    const bar = h('div', { class: 'bar', style: { '--c': 'var(--me)', margin: '6px 0 12px' } }, h('i', { style: { width: (tasks.length ? done / tasks.length * 100 : 0) + '%' } }));
    const cnt = h('span', { class: 'muted small' }, `${done}/${tasks.length} 완료`);
    function paintMineHeadOnly() {
      const d2 = tasks.filter((t) => t.done).length;
      bar.firstChild.style.width = (tasks.length ? d2 / tasks.length * 100 : 0) + '%';
      cnt.textContent = `${d2}/${tasks.length} 완료`;
    }
    mine.replaceChildren(
      h('div', { class: 'day-me' },
        h('div', null, h('p', { class: 'eyebrow' }, isToday() ? '오늘 내가 공부한 시간' : '이날 내가 공부한 시간'), timeBig, timer),
        h('div', { class: 'grow' },
          h('div', { class: 'row', style: { 'justify-content': 'space-between' } }, h('h2', { style: { margin: 0 } }, '내 공부 계획'), cnt),
          bar,
          tasks.length ? ul : h('div', { class: 'small muted' }, '이날 잡힌 할 일이 없어요. ', h('a', { href: '#/study' }, '공부 계획'), '에서 추가할 수 있어요'))));
    mine._timeBig = timeBig;
  }

  function paintEvents() {
    evBox.replaceChildren(
      h('div', { class: 'row', style: { 'justify-content': 'space-between', 'margin-bottom': '6px' } }, h('h2', { style: { margin: 0 } }, '일정'),
        h('button', { class: 'btn primary sm', type: 'button', onclick: () => editEvent(null, date, () => load()) }, icon('plus'), '일정 추가')));
    if (!data.events.length) evBox.append(h('div', { class: 'small muted' }, '이날 일정이 없어요'));
    for (const e of data.events) evBox.append(eventRow(e, () => load()));
  }

  function paintFriends() {
    friendsBox.replaceChildren(h('h2', null, '친구들은 이날'));
    if (!data.friends.length) { friendsBox.append(h('div', { class: 'small muted' }, '친구를 추가하면 여기서 친구들의 하루를 볼 수 있어요. ', h('a', { href: '#/friends' }, '친구 추가'))); return; }
    for (const f of data.friends) {
      const u = f.user, n = f.tasks.length, d = f.tasks.filter((t) => t.done).length;
      const on = isToday() && !!f.studyingSince;
      const body = h('div', { class: 'fr-body' });
      const row = h('div', { class: 'fr' + (open.has(u.id) ? ' open' : '') });
      const toggle = h('button', { type: 'button', class: 'fr-head', 'aria-expanded': String(open.has(u.id)), onclick: () => {
        open.has(u.id) ? open.delete(u.id) : open.add(u.id);
        try { sessionStorage.setItem('sf-day-open', JSON.stringify([...open])); } catch (e) {}
        row.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open.has(u.id)));
      } },
        avatar(u),
        h('span', { class: 'fr-name' }, h('b', null, u.name),
          h('span', { class: 'st' }, on ? [h('span', { class: 'live-dot' }), '공부 중 · '] : null, '공부 ', h('span', { class: 'fr-secs' }, fmtDur(liveSecs(f))))),
        h('span', { class: 'fr-prog' }, n ? [h('span', { class: 'bar', style: { '--c': u.color } }, h('i', { style: { width: d / n * 100 + '%' } })), h('span', { class: 'small muted' }, `${d}/${n}`)] : h('span', { class: 'small muted' }, '할 일 없음')),
        icon('next', 'chev'));
      const ul = h('ul', { class: 'list' });
      for (const t of f.tasks) ul.append(taskLine(t, { canCheck: false, showPlan: true }));
      body.append(n ? ul : h('div', { class: 'small muted' }, '이날 보여 준 할 일이 없어요'),
        h('div', { class: 'row', style: { 'margin-top': '8px' } },
          h('button', { class: 'btn sm', type: 'button', onclick: () => cheerModal(u) }, '응원 보내기'),
          h('a', { class: 'btn sm', href: '#/messages/' + u.id }, icon('chat'), '메시지')));
      row.append(toggle, body);
      friendsBox.append(row);
    }
  }

  async function load() {
    const r = await api.get('day.get', { date });
    skew = parseDT(r.now).getTime() - Date.now();
    for (const p of [r.me, ...r.friends]) p._base = p.studyingSince ? elapsed(p.studyingSince) : 0;
    data = r;
    paintHead(); paintMine(); paintEvents(); paintFriends();
  }
  function tick() {
    if (!data || !isToday()) return;
    if (mine._timeBig) mine._timeBig.textContent = fmtDur(liveSecs(data.me));
    friendsBox.querySelectorAll('.fr').forEach((row, i) => { const s = row.querySelector('.fr-secs'); if (s && data.friends[i]) s.textContent = fmtDur(liveSecs(data.friends[i])); });
  }

  paintHead();
  try { await load(); } catch (e) { mine.replaceChildren(h('div', { class: 'empty' }, e.message)); return; }
  const s1 = every(10000, async () => tick());
  const s2 = every(30000, () => { const a = document.activeElement; if (!a || !view.contains(a) || a.tagName !== 'INPUT') return load(); });
  return () => { s1(); s2(); };
}
