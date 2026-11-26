/* 공유 캘린더: 내 일정 + 친구가 보여 준 일정 + 공부 계획의 할 일 */
import { state, api, h, icon, avatar, errToast, loadFriends, every, setTitle, WD, ymd, parseD, today, addDays, mdw, HOLIDAYS, app } from '../core.js';
import { editEvent } from '../shared.js';

/* 날짜를 누르면 그날 화면(#/day/날짜)으로 들어가요 */

export default async function mount(view, route) {
  setTitle('캘린더');
  const t0 = parseD(route.query.d && /^\d{4}-\d{2}-\d{2}$/.test(route.query.d) ? route.query.d : today());
  const S = { y: t0.getFullYear(), m: t0.getMonth(), sel: ymd(t0), events: [], tasks: [], friends: [], hidden: new Set(), loading: true };
  try { S.hidden = new Set(JSON.parse(localStorage.getItem('sf-cal-hidden') || '[]')); } catch (e) {}

  const title = h('h2');
  const filters = h('div', { class: 'filters', 'aria-label': '누구 일정을 볼지' });
  const grid = h('div', { class: 'month' });
  view.append(
    h('div', null,
      h('div', { class: 'card' },
        h('div', { class: 'cal-head' }, title,
          h('button', { class: 'btn icon sm', type: 'button', 'aria-label': '이전 달', onclick: () => move(-1) }, icon('back')),
          h('button', { class: 'btn sm', type: 'button', onclick: () => { const d = new Date(); S.y = d.getFullYear(); S.m = d.getMonth(); S.sel = today(); load(); } }, '오늘'),
          h('button', { class: 'btn icon sm', type: 'button', 'aria-label': '다음 달', onclick: () => move(1) }, icon('next')),
          h('div', { class: 'grow' }),
          h('button', { class: 'btn primary sm', type: 'button', onclick: () => editEvent(null, S.sel, () => load(true)) }, icon('plus'), '일정')),
        filters, h('div', { style: { 'overflow-x': 'auto' } }, grid),
        h('p', { class: 'tiny muted', style: { margin: '10px 2px 0' } }, '날짜를 누르면 그날의 공부 계획, 공부 시간, 친구들 진도를 볼 수 있어요'))));

  function range() {
    const first = new Date(S.y, S.m, 1);
    const start = new Date(S.y, S.m, 1 - first.getDay());
    const days = new Date(S.y, S.m + 1, 0).getDate();
    const weeks = Math.ceil((first.getDay() + days) / 7);
    return { start: ymd(start), end: addDays(ymd(start), weeks * 7 - 1), weeks };
  }
  function move(n) { const d = new Date(S.y, S.m + n, 1); S.y = d.getFullYear(); S.m = d.getMonth(); S.sel = ymd(d); load(); }

  async function load(quiet) {
    const { start, end } = range();
    if (!quiet) { S.loading = true; paint(); }
    try {
      const [ev, tk, fr] = await Promise.all([api.get('events.list', { from: start, to: end }), api.get('tasks.range', { from: start, to: end }), loadFriends()]);
      S.events = ev.events; S.tasks = tk.tasks; S.friends = fr;
    } catch (e) { if (!quiet) errToast(e); }
    S.loading = false;
    paint();
  }
  const visibleOwner = (u) => u && !S.hidden.has(u.id);

  function paintFilters() {
    filters.replaceChildren();
    const people = [state.me, ...S.friends];
    if (people.length < 2) return;
    for (const p of people) {
      const on = !S.hidden.has(p.id);
      filters.append(h('button', { type: 'button', class: 'fchip', style: { '--c': p.color }, 'aria-pressed': String(on), onclick: () => {
        on ? S.hidden.add(p.id) : S.hidden.delete(p.id);
        try { localStorage.setItem('sf-cal-hidden', JSON.stringify([...S.hidden])); } catch (e) {}
        paint();
      } }, avatar(p, 'sm'), p.id === state.me.id ? '나' : p.name));
    }
  }

  function paint() {
    title.textContent = `${S.y}년 ${S.m + 1}월`;
    paintFilters();
    const { start, weeks } = range();
    const evs = S.events.filter((e) => visibleOwner(e.owner));
    const tks = S.tasks.filter((t) => visibleOwner(t.owner));
    grid.replaceChildren(...WD.map((w, i) => h('div', { class: 'wh' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}, w)));
    const T = today();
    for (let i = 0; i < weeks * 7; i++) {
      const ds = addDays(start, i), d = parseD(ds);
      const out = d.getMonth() !== S.m;
      const hol = HOLIDAYS[ds.slice(5)];
      const dayEv = evs.filter((e) => e.startDate <= ds && e.endDate >= ds);
      const dayTk = tks.filter((t) => t.date === ds);
      const myTk = dayTk.filter((t) => t.mine);
      const cls = ['dcell', out && 'out', d.getDay() === 0 && 'sun', d.getDay() === 6 && 'sat', hol && 'hol', ds === T && 'today'].filter(Boolean).join(' ');
      const cell = h('button', { type: 'button', class: cls, 
        'aria-label': `${mdw(ds)}${hol ? ', ' + hol : ''}, 일정 ${dayEv.length}개${dayTk.length ? ', 할 일 ' + dayTk.length + '개' : ''}`,
        onclick: () => app.go('day/' + ds) },
        h('span', { class: 'n' }, d.getDate()), hol && !out ? h('span', { class: 'hn' }, hol) : null);
      dayEv.slice(0, 3).forEach((e) => cell.append(h('span', { class: 'ev', style: { '--c': e.color, '--o': e.owner.color } }, e.mine ? null : h('span', { class: 'who' }), h('span', { class: 'tt' }, (e.startTime && e.startDate === ds ? e.startTime + ' ' : '') + e.title))));
      if (dayEv.length > 3) cell.append(h('span', { class: 'more' }, `+${dayEv.length - 3}개`));
      if (dayTk.length) {
        const doneMine = myTk.filter((t) => t.done).length;
        cell.append(h('span', { class: 'tk' }, icon('check'), myTk.length ? `할 일 ${doneMine}/${myTk.length}` : `친구 할 일 ${dayTk.length}`));
      }
      const dots = h('span', { class: 'dots' });
      [...dayEv.slice(0, 4).map((e) => e.color), ...(dayTk.length ? ['var(--faint)'] : [])].forEach((c) => dots.append(h('i', { class: 'dot', style: { '--c': c } })));
      cell.append(dots);
      grid.append(cell);
    }
  }

  await load();
  return every(60000, () => load(true));
}
