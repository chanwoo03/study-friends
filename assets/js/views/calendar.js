/* 공유 캘린더: 내 일정 + 친구가 보여 준 일정 + 공부 계획의 할 일 */
import { state, api, h, icon, avatar, toast, errToast, modal, confirmBtn, visibilityPicker, colorPicker, loadFriends, every, setTitle,
  WD, ymd, parseD, today, addDays, mdw, HOLIDAYS, VIS_LABEL, visIcon, app } from '../core.js';

export default async function mount(view, route) {
  setTitle('캘린더');
  const t0 = parseD(route.query.d && /^\d{4}-\d{2}-\d{2}$/.test(route.query.d) ? route.query.d : today());
  const S = { y: t0.getFullYear(), m: t0.getMonth(), sel: ymd(t0), events: [], tasks: [], friends: [], hidden: new Set(), loading: true };
  try { S.hidden = new Set(JSON.parse(localStorage.getItem('sf-cal-hidden') || '[]')); } catch (e) {}

  const title = h('h2');
  const filters = h('div', { class: 'filters', 'aria-label': '누구 일정을 볼지' });
  const grid = h('div', { class: 'month' });
  const panel = h('div', { class: 'card day-panel' });
  view.append(
    h('div', { class: 'cal-layout' },
      h('div', { class: 'card' },
        h('div', { class: 'cal-head' }, title,
          h('button', { class: 'btn icon sm', type: 'button', 'aria-label': '이전 달', onclick: () => move(-1) }, icon('back')),
          h('button', { class: 'btn sm', type: 'button', onclick: () => { const d = new Date(); S.y = d.getFullYear(); S.m = d.getMonth(); S.sel = today(); load(); } }, '오늘'),
          h('button', { class: 'btn icon sm', type: 'button', 'aria-label': '다음 달', onclick: () => move(1) }, icon('next')),
          h('div', { class: 'grow' }),
          h('button', { class: 'btn primary sm', type: 'button', onclick: () => editEvent(null, S.sel) }, icon('plus'), '일정')),
        filters, h('div', { style: { 'overflow-x': 'auto' } }, grid)),
      panel));

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
      const cls = ['dcell', out && 'out', d.getDay() === 0 && 'sun', d.getDay() === 6 && 'sat', hol && 'hol', ds === T && 'today', ds === S.sel && 'sel'].filter(Boolean).join(' ');
      const cell = h('button', { type: 'button', class: cls, 'aria-pressed': String(ds === S.sel),
        'aria-label': `${mdw(ds)}${hol ? ', ' + hol : ''}, 일정 ${dayEv.length}개${dayTk.length ? ', 할 일 ' + dayTk.length + '개' : ''}`,
        onclick: () => { S.sel = ds; if (out) { S.y = d.getFullYear(); S.m = d.getMonth(); load(); } else paint(); if (matchMedia('(max-width:1080px)').matches) panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
        ondblclick: () => editEvent(null, ds) },
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
    paintPanel(evs, tks);
  }

  function paintPanel(evs, tks) {
    const ds = S.sel;
    const hol = HOLIDAYS[ds.slice(5)];
    const dayEv = evs.filter((e) => e.startDate <= ds && e.endDate >= ds);
    const dayTk = tks.filter((t) => t.date === ds);
    panel.replaceChildren(
      h('h2', null, mdw(ds), hol ? h('span', { class: 'pill', style: { color: 'var(--red)' } }, hol) : null),
      h('button', { class: 'btn primary sm', type: 'button', onclick: () => editEvent(null, ds) }, icon('plus'), '이 날에 일정 추가'));
    if (S.loading) { panel.append(h('div', { class: 'empty' }, '불러오는 중…')); return; }
    panel.append(h('div', { class: 'sec-label' }, `일정 ${dayEv.length}`));
    if (!dayEv.length) panel.append(h('div', { class: 'small muted' }, '이 날 일정이 없어요'));
    for (const e of dayEv) {
      const when = e.startDate !== e.endDate ? `${e.startDate.slice(5).replace('-', '/')} ~ ${e.endDate.slice(5).replace('-', '/')}` : '';
      const time = e.startTime ? e.startTime + (e.endTime ? ' ~ ' + e.endTime : '') : '하루 종일';
      panel.append(h('button', { type: 'button', class: 'evrow', style: { '--c': e.color }, onclick: () => (e.mine ? editEvent(e) : showEvent(e)) },
        h('span', { class: 'stripe' }),
        h('span', null, h('div', { class: 't' }, e.title),
          h('div', { class: 's' }, avatar(e.owner, 'sm'), e.mine ? '나' : e.owner.name, '·', time, when ? '· ' + when : null, e.mine ? h('span', { class: 'pill' }, visIcon(e.visibility), VIS_LABEL[e.visibility]) : null))));
    }
    if (dayTk.length) {
      panel.append(h('div', { class: 'sec-label' }, '공부 할 일'));
      const byOwner = new Map();
      for (const t of dayTk) { if (!byOwner.has(t.owner.id)) byOwner.set(t.owner.id, []); byOwner.get(t.owner.id).push(t); }
      for (const [, list] of byOwner) {
        const o = list[0].owner, mine = list[0].mine;
        panel.append(h('div', { class: 'row small', style: { margin: '8px 0 2px', 'font-weight': '700' } }, avatar(o, 'sm'), mine ? '나' : o.name,
          h('span', { class: 'muted' }, `${list.filter((t) => t.done).length}/${list.length}`)));
        const ul = h('ul', { class: 'list' });
        for (const t of list) ul.append(taskRow(t));
        panel.append(ul);
      }
    }
  }

  function taskRow(t) {
    const btn = h('button', { type: 'button', class: 'check', style: { '--c': t.planColor }, 'aria-pressed': String(t.done), disabled: !t.mine, 'aria-label': (t.subject ? t.subject + ' ' : '') + t.content }, icon('check'));
    const li = h('li', { class: 'task' + (t.done ? ' done' : '') + (t.mine ? ' can' : '') }, btn,
      h('span', { class: 'tx' }, t.subject ? h('b', null, t.subject) : null, h('span', null, t.content)),
      h('a', { class: 'tiny muted', href: '#/study/plan/' + t.planId, onclick: (e) => e.stopPropagation() }, t.planTitle));
    if (t.mine) li.addEventListener('click', async () => {
      t.done = !t.done; paint();
      try { await api.post('tasks.toggle', { id: t.id, done: t.done }); } catch (e) { t.done = !t.done; paint(); errToast(e); }
    });
    return li;
  }

  function showEvent(e) {
    const m = modal([
      h('h2', null, e.title),
      h('p', { class: 'lead row' }, avatar(e.owner, 'sm'), e.owner.name + '님의 일정'),
      h('div', { class: 'form' },
        h('div', null, h('div', { class: 'eyebrow' }, '날짜'), e.startDate === e.endDate ? mdw(e.startDate) : `${mdw(e.startDate)} ~ ${mdw(e.endDate)}`),
        h('div', null, h('div', { class: 'eyebrow' }, '시간'), e.startTime ? e.startTime + (e.endTime ? ' ~ ' + e.endTime : '') : '하루 종일'),
        e.memo ? h('div', null, h('div', { class: 'eyebrow' }, '메모'), h('div', { style: { 'white-space': 'pre-wrap' } }, e.memo)) : null),
      h('div', { class: 'actions' },
        h('a', { class: 'btn', href: '#/messages/' + e.owner.id, onclick: () => m.close() }, icon('chat'), '메시지 보내기'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => m.close() }, '닫기')),
    ]);
  }

  function editEvent(e, date) {
    const isNew = !e;
    e = e || { title: '', memo: '', startDate: date || S.sel, endDate: date || S.sel, startTime: null, endTime: null, color: state.me.color, visibility: 'friends', shares: [] };
    const title = h('input', { maxlength: '100', value: e.title, placeholder: '예: DB 시험, 스터디 모임' });
    const sd = h('input', { type: 'date', value: e.startDate, onchange: () => { if (ed.value < sd.value) ed.value = sd.value; } });
    const ed = h('input', { type: 'date', value: e.endDate });
    const allDay = h('input', { type: 'checkbox', checked: !e.startTime, onchange: () => { times.hidden = allDay.checked; } });
    const st = h('input', { type: 'time', value: e.startTime || '09:00' });
    const et = h('input', { type: 'time', value: e.endTime || '' });
    const times = h('div', { class: 'two', hidden: !e.startTime }, h('label', { class: 'field' }, '시작 시간', st), h('label', { class: 'field' }, '끝 시간 (선택)', et));
    const memo = h('textarea', { maxlength: '2000', value: e.memo || '', placeholder: '장소, 준비물, 시험 범위 등', rows: '3' });
    const color = colorPicker(e.color);
    const vis = visibilityPicker(e.visibility, e.shares);
    const err = h('div', { class: 'err', role: 'alert' });
    const save = h('button', { class: 'btn primary', type: 'submit' }, isNew ? '추가' : '저장');
    const form = h('form', { class: 'form', onsubmit: async (ev) => {
      ev.preventDefault(); err.textContent = ''; save.disabled = true;
      try {
        await api.post('events.save', { id: e.id, title: title.value, memo: memo.value, startDate: sd.value, endDate: ed.value || sd.value,
          startTime: allDay.checked ? '' : st.value, endTime: allDay.checked ? '' : et.value, color: color.value(), ...vis.value() });
        m.close(); toast(isNew ? '일정을 추가했어요' : '일정을 고쳤어요'); S.sel = sd.value; load(true);
      } catch (ex) { err.textContent = ex.message; } finally { save.disabled = false; }
    } },
      h('label', { class: 'field' }, '일정 이름', title),
      h('div', { class: 'two' }, h('label', { class: 'field' }, '시작 날짜', sd), h('label', { class: 'field' }, '끝 날짜', ed)),
      h('label', { class: 'check-line' }, allDay, '하루 종일'), times,
      h('label', { class: 'field' }, '메모', memo), color.el, vis.el, err,
      h('div', { class: 'actions' },
        isNew ? null : h('span', { class: 'left' }, confirmBtn('삭제', '한 번 더 누르면 삭제', async () => {
          try { await api.post('events.delete', { id: e.id }); m.close(); toast('일정을 지웠어요'); load(true); } catch (ex) { errToast(ex); }
        })),
        h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, '취소'), save));
    const m = modal([h('h2', null, isNew ? '일정 추가' : '일정 고치기'), h('p', { class: 'lead' }, '공개 범위에 따라 친구 캘린더에도 보여요'), form]);
  }

  await load();
  return every(60000, () => load(true));
}
