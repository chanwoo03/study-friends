/* 학습 플래너: 하루 한 장 · 주간 보기 · 책장 · 한 달 플래너 북 */
import { state, api, h, icon, avatar, toast, errToast, modal, confirmBtn, setTitle, every, today, addDays, daysBetween, parseD, parseDT, nowLocal, WD, pad, COLORS, fmtDur } from '../core.js';

const SLOTS = 144, START_H = 6;           // 10분 칸 144개, 아침 6시부터
const MOODS = [['😫', '힘들었어'], ['😕', '별로'], ['🙂', '보통'], ['😊', '좋았어'], ['🤩', '최고']];
const NO_SUBJECT = '#8b95a1';
const BOOK_COLORS = ['#3d5a80', '#c8553d', '#2a9d8f', '#7b5ea7', '#e9a03b', '#3f7d58', '#d1495b', '#33658a', '#8d6a9f', '#b56576', '#457b9d', '#6b705c'];

const fmtMin = (m) => { m = Math.round(m || 0); const hh = Math.floor(m / 60), mm = m % 60; return hh ? (mm ? `${hh}시간 ${mm}분` : `${hh}시간`) : `${mm}분`; };
const shortMin = (m) => { m = Math.round(m || 0); return m >= 60 ? `${(m / 60).toFixed(m % 60 ? 1 : 0)}h` : `${m}m`; };
const ddayText = (day, from) => { const n = daysBetween(from, day); return n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`; };
const longDate = (s) => { const d = parseD(s); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const wd = (s) => WD[parseD(s).getDay()] + '요일';
const uq = (u) => (u ? `?u=${u}` : '');
const slotTime = (i) => { const m = START_H * 60 + i * 10; return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`; };
const hourLabel = (r) => String((START_H + r) % 24);

function subjectMap(list) { const m = new Map(); for (const s of list) m.set(s.id, s); return m; }
const colorOf = (subs, sid) => (sid && subs.get(sid) ? subs.get(sid).color : NO_SUBJECT);
function merge(auto, manual) {
  const out = {};
  for (const [k, v] of Object.entries(auto || {})) out[k] = v;
  for (const [k, v] of Object.entries(manual || {})) { if (v < 0) delete out[k]; else out[k] = v; }
  return out;
}

export default async function mount(view, route) {
  const p = route.params, u = route.query.u ? Number(route.query.u) : 0;
  if (p[0] === 'week') return weekPage(view, /^\d{4}-\d{2}-\d{2}$/.test(p[1] || '') ? p[1] : today(), u);
  if (p[0] === 'books') return shelfPage(view, u);
  if (p[0] === 'book') return bookPage(view, /^\d{4}-\d{2}$/.test(p[1] || '') ? p[1] : today().slice(0, 7), u);
  return dayPage(view, /^\d{4}-\d{2}-\d{2}$/.test(p[0] || '') ? p[0] : today(), u);
}

/* 위쪽: 하루/주간/플래너 북 탭 + 누구 플래너인지 */
function topBar(mode, { date, u, owner, mine, friends = [], vis, onVis }) {
  const tab = (k, label, href) => h('a', { class: 'pl-tab' + (mode === k ? ' on' : ''), href }, label);
  const who = friends.length || !mine ? h('div', { class: 'pl-who', role: 'group', 'aria-label': '누구 플래너' },
    h('a', { class: 'pl-who-b' + (mine ? ' on' : ''), href: `#/planner/${date}`, title: '내 플래너' }, avatar(state.me, 'sm'), h('span', null, '나')),
    (mine ? friends : [owner].filter(Boolean)).map((f) => h('a', { class: 'pl-who-b' + (!mine && owner && owner.id === f.id ? ' on' : ''), href: `#/planner/${date}?u=${f.id}`, title: f.name + ' 플래너' }, avatar(f, 'sm'), h('span', null, f.name)))) : null;
  const visBtn = mine && onVis ? h('button', { type: 'button', class: 'btn ghost sm pl-vis', title: '플래너 공개 범위', onclick: onVis },
    icon(vis === 'friends' ? 'globe' : 'lock'), vis === 'friends' ? '친구 공개' : '나만 보기') : null;
  return h('div', { class: 'pl-top' },
    h('div', { class: 'pl-tabs', role: 'tablist' },
      tab('day', '하루', `#/planner/${date}${uq(u)}`), tab('week', '주간', `#/planner/week/${date}${uq(u)}`), tab('book', '플래너 북', `#/planner/books${uq(u)}`)),
    h('div', { class: 'grow' }), who, visBtn);
}

/* ================= 하루 한 장 ================= */
async function dayPage(view, date, u) {
  setTitle('플래너');
  let d;
  try { d = await api.get('planner.get', u ? { date, u } : { date }); } catch (e) { view.append(h('div', { class: 'card empty' }, e.message)); return; }
  const ro = !d.mine, isToday = date === d.today;
  let subs = subjectMap(d.subjects);
  const manual = { ...d.blocks };
  const stop = [];

  const ownerName = d.mine ? '나' : d.owner.name;
  view.append(topBar('day', { date, u, owner: d.owner, mine: d.mine, friends: d.friendsSharing, vis: d.vis, onVis: toggleVis }));

  /* 머리: 날짜 · D-day · 기분 */
  const moodRow = h('div', { class: 'pl-moods', role: 'group', 'aria-label': '오늘 기분' });
  function paintMood() {
    moodRow.replaceChildren(...MOODS.map(([e, label], i) => h('button', { type: 'button', class: 'pl-mood' + (d.mood === i + 1 ? ' on' : ''), disabled: ro, 'aria-pressed': String(d.mood === i + 1), title: label, 'aria-label': '기분 ' + label,
      onclick: () => { d.mood = d.mood === i + 1 ? null : i + 1; paintMood(); save({ mood: d.mood }); } }, e)));
  }
  paintMood();
  const ddayRow = h('div', { class: 'pl-ddays' });
  function paintDdays() {
    ddayRow.replaceChildren(...d.ddays.slice(0, 3).map((x) => h('span', { class: 'pl-dday', style: { '--c': x.color } }, h('b', null, ddayText(x.day, date)), x.title)),
      d.mine ? h('button', { type: 'button', class: 'pl-dday add', onclick: ddayModal }, icon('plus'), 'D-day') : null);
  }
  paintDdays();
  view.append(h('header', { class: 'pl-head' },
    h('a', { class: 'btn ghost icon', href: `#/planner/${addDays(date, -1)}${uq(u)}`, 'aria-label': '전날' }, icon('back')),
    h('div', { class: 'pl-date' }, h('div', { class: 'pl-date-n' }, longDate(date)), h('div', { class: 'pl-date-w' }, wd(date), d.mine ? null : ` · ${ownerName}의 플래너`)),
    h('a', { class: 'btn ghost icon', href: `#/planner/${addDays(date, 1)}${uq(u)}`, 'aria-label': '다음날' }, icon('next')),
    isToday ? null : h('a', { class: 'btn sm', href: `#/planner/${d.today}${uq(u)}` }, '오늘'),
    h('div', { class: 'grow' }), ddayRow, moodRow));

  /* 목표 + 타이머 */
  const ring = h('div', { class: 'pl-ring' });
  const goalVal = h('b');
  const studiedEl = h('div', { class: 'pl-studied' });
  function minutes() { return Object.keys(merge(d.auto, manual)).length * 10; }
  function paintGoal() {
    const m = minutes(), g = d.goalMin || 0, pct = g ? Math.min(100, Math.round((m / g) * 100)) : 0;
    ring.style.setProperty('--p', pct);
    ring.replaceChildren(h('span', null, g ? pct + '%' : '—'));
    goalVal.textContent = g ? fmtMin(g) : '목표 없음';
    studiedEl.replaceChildren(h('span', { class: 'small muted' }, '공부한 시간'), h('b', null, fmtMin(m)),
      d.studySeconds && Math.abs(d.studySeconds / 60 - m) >= 10 ? h('span', { class: 'tiny muted' }, `타이머 ${fmtDur(d.studySeconds)}`) : null);
  }
  const stepGoal = (delta) => { d.goalMin = Math.max(0, Math.min(1440, (d.goalMin || 0) + delta)) || null; paintGoal(); save({ goalMin: d.goalMin }); };
  const timerBox = h('div', { class: 'pl-timer' });
  let pick = d.subjects[0] ? d.subjects[0].id : 0;
  function paintTimer() {
    if (!d.mine || !isToday) { timerBox.hidden = true; return; }
    if (d.studyingSince) {
      const el = h('b', { class: 'pl-clock' });
      const tick = () => { el.textContent = fmtClock((nowLocal() - parseDT(d.studyingSince)) / 1000); };
      tick();
      const s = d.studyingSubject && subs.get(d.studyingSubject);
      timerBox.replaceChildren(h('span', { class: 'pl-live', style: { '--c': s ? s.color : NO_SUBJECT } }, h('i'), s ? s.name : '공부', ' 중'), el,
        h('button', { type: 'button', class: 'btn sm danger', onclick: stopStudy }, '끝내기'));
      timerTick = tick;
    } else {
      timerTick = null;
      timerBox.replaceChildren(
        h('div', { class: 'pl-pick' }, [...d.subjects.map((s) => ({ id: s.id, name: s.name, color: s.color })), { id: 0, name: '과목 없이', color: NO_SUBJECT }].map((s) =>
          h('button', { type: 'button', class: 'pl-chip' + (pick === s.id ? ' on' : ''), style: { '--c': s.color }, onclick: () => { pick = s.id; paintTimer(); } }, h('i'), s.name))),
        h('button', { type: 'button', class: 'btn primary sm', onclick: startStudy }, icon('play'), '공부 시작'));
    }
  }
  let timerTick = null;
  stop.push(every(1000, () => { if (timerTick) timerTick(); }));
  async function startStudy() {
    try { await api.post('study.start', pick ? { subject: pick } : {}); await reload(); toast('공부를 시작했어요. 타임테이블에 저절로 칠해져요'); } catch (e) { errToast(e); }
  }
  async function stopStudy() {
    try { await api.post('study.stop'); await reload(); toast('수고했어요!'); } catch (e) { errToast(e); }
  }
  const goalCard = h('section', { class: 'card pl-goal' },
    h('h3', { class: 'pl-h' }, '오늘의 목표'),
    h('div', { class: 'pl-goal-row' }, ring,
      h('div', { class: 'pl-goal-txt' }, studiedEl,
        h('div', { class: 'pl-goal-set' }, h('span', { class: 'small muted' }, '목표'),
          ro ? null : h('button', { type: 'button', class: 'btn ghost icon sm', 'aria-label': '목표 30분 줄이기', onclick: () => stepGoal(-30) }, '−'),
          goalVal,
          ro ? null : h('button', { type: 'button', class: 'btn ghost icon sm', 'aria-label': '목표 30분 늘리기', onclick: () => stepGoal(30) }, '+')))),
    timerBox);

  /* 할 일 */
  const todoList = h('ul', { class: 'pl-todos' });
  function paintTodos() {
    const items = [];
    for (const t of d.tasks) items.push(h('li', { class: 'pl-todo' + (t.done ? ' done' : '') },
      h('label', null, h('input', { type: 'checkbox', checked: t.done, onchange: async (e) => { try { await api.post('tasks.toggle', { id: t.id, done: e.target.checked }); t.done = e.target.checked; paintTodos(); } catch (er) { errToast(er); e.target.checked = !e.target.checked; } } }),
        h('i', { class: 'pl-dot', style: { '--c': t.planColor || NO_SUBJECT } }), h('span', { class: 'pl-todo-t' }, t.subject ? h('em', null, t.subject) : null, t.content)),
      h('span', { class: 'pl-tag', title: t.planTitle }, t.kind === 'group' ? '공동' : '계획')));
    for (const t of d.todos) items.push(h('li', { class: 'pl-todo' + (t.done ? ' done' : '') },
      h('label', null, h('input', { type: 'checkbox', checked: t.done, disabled: ro, onchange: async (e) => { try { await api.post('planner.todo_toggle', { id: t.id, done: e.target.checked }); t.done = e.target.checked; paintTodos(); } catch (er) { errToast(er); } } }),
        h('i', { class: 'pl-dot', style: { '--c': colorOf(subs, t.subjectId) } }), h('span', { class: 'pl-todo-t' }, t.subjectId && subs.get(t.subjectId) ? h('em', null, subs.get(t.subjectId).name) : null, t.text)),
      ro ? null : h('span', { class: 'pl-todo-acts' },
        t.done ? null : h('button', { type: 'button', class: 'btn ghost icon sm', title: '다음날로 미루기', 'aria-label': t.text + ' 다음날로', onclick: async () => { try { await api.post('planner.todo_move', { id: t.id, to: addDays(date, 1) }); d.todos = d.todos.filter((x) => x !== t); paintTodos(); toast('다음날로 옮겼어요'); } catch (e) { errToast(e); } } }, icon('next')),
        h('button', { type: 'button', class: 'btn ghost icon sm', 'aria-label': t.text + ' 지우기', onclick: async () => { try { await api.post('planner.todo_del', { id: t.id }); d.todos = d.todos.filter((x) => x !== t); paintTodos(); } catch (e) { errToast(e); } } }, icon('x')))));
    const done = d.tasks.filter((t) => t.done).length + d.todos.filter((t) => t.done).length, total = d.tasks.length + d.todos.length;
    todoCount.textContent = total ? `${done}/${total}` : '';
    todoList.replaceChildren(...(items.length ? items : [h('li', { class: 'pl-empty' }, ro ? '할 일이 없어요' : '오늘 할 일을 적어 보세요')]));
  }
  const todoCount = h('span', { class: 'pl-count' });
  const todoIn = h('input', { class: 'input', maxlength: '120', placeholder: '할 일 추가', 'aria-label': '할 일 추가' });
  const todoSub = h('select', { class: 'input pl-sel', 'aria-label': '과목' });
  function paintSubSelect() { todoSub.replaceChildren(h('option', { value: '' }, '과목'), ...d.subjects.map((s) => h('option', { value: s.id }, s.name))); }
  paintSubSelect();
  const todoCard = h('section', { class: 'card pl-todo-card' },
    h('h3', { class: 'pl-h' }, '오늘 할 일', todoCount),
    todoList,
    ro ? null : h('form', { class: 'pl-add', onsubmit: async (e) => {
      e.preventDefault();
      const text = todoIn.value.trim(); if (!text) return;
      try { const r = await api.post('planner.todo_add', { date, text, subjectId: Number(todoSub.value) || 0 }); d.todos.push(r.todo); todoIn.value = ''; paintTodos(); } catch (er) { errToast(er); }
    } }, todoIn, todoSub, h('button', { class: 'btn primary icon', type: 'submit', 'aria-label': '추가' }, icon('plus'))));
  paintTodos();

  /* 타임테이블 */
  const cells = [];
  const grid = h('div', { class: 'tt-grid', 'aria-label': '타임테이블 (10분 칸)' });
  for (let r = 0; r < 24; r++) {
    const row = h('div', { class: 'tt-row' }, h('span', { class: 'tt-h' }, hourLabel(r)));
    for (let c = 0; c < 6; c++) { const i = r * 6 + c; const cell = h('span', { class: 'tt-c', 'data-i': i, title: slotTime(i) }); cells.push(cell); row.append(cell); }
    grid.append(row);
  }
  function paintCell(i) {
    const auto = d.auto[i], man = manual[i];
    const sid = man !== undefined ? (man < 0 ? undefined : man) : auto;
    const cell = cells[i];
    cell.classList.toggle('on', sid !== undefined);
    cell.classList.toggle('auto', sid !== undefined && man === undefined);
    cell.style.setProperty('--c', sid !== undefined ? colorOf(subs, sid) : '');
  }
  const paintGrid = () => { for (let i = 0; i < SLOTS; i++) paintCell(i); };
  let brush = null;   // null = 보기, 'erase', 또는 과목 id (0 = 과목 없음)
  const legend = h('div', { class: 'tt-legend' });
  function paintLegend() {
    const by = {};
    for (const sid of Object.values(merge(d.auto, manual))) by[sid] = (by[sid] || 0) + 10;
    const list = [...d.subjects, ...(by[0] ? [{ id: 0, name: '과목 없음', color: NO_SUBJECT }] : [])];
    legend.replaceChildren(
      ...list.map((s) => h('button', { type: 'button', class: 'pl-chip' + (brush === s.id ? ' on' : ''), style: { '--c': s.color }, disabled: ro, 'aria-pressed': String(brush === s.id),
        title: ro ? '' : s.name + '(으)로 칠하기', onclick: () => setBrush(brush === s.id ? null : s.id) }, h('i'), s.name, by[s.id] ? h('small', null, shortMin(by[s.id])) : null)),
      ro ? null : h('button', { type: 'button', class: 'pl-chip erase' + (brush === 'erase' ? ' on' : ''), 'aria-pressed': String(brush === 'erase'), onclick: () => setBrush(brush === 'erase' ? null : 'erase') }, icon('eraser'), '지우개'),
      ro ? null : h('button', { type: 'button', class: 'btn ghost sm', onclick: subjectModal }, icon('gear'), '과목'));
    hint.textContent = ro ? '' : brush === null ? '과목을 고르고 칸을 누르거나 끌어서 칠해요. 공부 타이머 기록은 저절로 칠해져요' : brush === 'erase' ? '지울 칸을 누르거나 끌어요 · 다시 누르면 끝' : '칠할 칸을 누르거나 끌어요 · 과목을 다시 누르면 끝';
  }
  const hint = h('p', { class: 'tiny muted tt-hint' });
  function setBrush(b) { brush = b; grid.classList.toggle('painting', b !== null); paintLegend(); }
  function apply(i) {
    if (brush === null || i < 0) return;
    if (brush === 'erase') { if (d.auto[i] !== undefined) manual[i] = -1; else delete manual[i]; }
    else manual[i] = brush;
    paintCell(i); dirtyBlocks();
  }
  let painting = false;
  const cellAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.classList && el.classList.contains('tt-c') ? Number(el.dataset.i) : -1; };
  grid.addEventListener('pointerdown', (e) => { if (brush === null || ro) return; painting = true; grid.setPointerCapture(e.pointerId); apply(cellAt(e.clientX, e.clientY)); e.preventDefault(); });
  grid.addEventListener('pointermove', (e) => { if (painting) apply(cellAt(e.clientX, e.clientY)); });
  const endPaint = () => { painting = false; };
  grid.addEventListener('pointerup', endPaint); grid.addEventListener('pointercancel', endPaint);
  let blocksT = null;
  function dirtyBlocks() {
    paintGoal(); paintLegend();
    clearTimeout(blocksT);
    blocksT = setTimeout(() => api.post('planner.blocks', { date, blocks: manual }).catch(errToast), 700);
  }
  paintGrid(); paintLegend();
  const ttCard = h('section', { class: 'card pl-tt' }, h('h3', { class: 'pl-h' }, '타임테이블', h('span', { class: 'pl-count' }, fmtMin(minutes()))), legend, grid, hint);
  const ttTotal = ttCard.querySelector('.pl-count');

  /* 돌아보기 */
  const stars = h('div', { class: 'pl-stars', role: 'group', 'aria-label': '오늘 만족도' });
  function paintStars() {
    stars.replaceChildren(...[1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', class: (d.rating || 0) >= n ? 'on' : '', disabled: ro, 'aria-label': `만족도 ${n}점`,
      onclick: () => { d.rating = d.rating === n ? null : n; paintStars(); save({ rating: d.rating }); } }, '★')));
  }
  paintStars();
  const reflect = h('textarea', { class: 'pl-reflect', maxlength: '500', rows: '4', placeholder: ro ? '' : '오늘 잘한 점, 아쉬운 점, 내일 할 것…', readonly: ro, 'aria-label': '하루 돌아보기' });
  reflect.value = d.reflection;
  let refT = null;
  reflect.addEventListener('input', () => { clearTimeout(refT); refT = setTimeout(() => save({ reflection: reflect.value }), 800); });
  const reflectCard = h('section', { class: 'card pl-reflect-card' }, h('h3', { class: 'pl-h' }, '하루 돌아보기', stars), reflect);

  view.append(h('div', { class: 'pl-grid' }, h('div', { class: 'pl-col' }, goalCard, todoCard, reflectCard), h('div', { class: 'pl-col' }, ttCard)));
  const oldPaintGoal = paintGoal;
  paintGoal = () => { oldPaintGoal(); ttTotal.textContent = fmtMin(minutes()); };   // eslint-disable-line no-func-assign
  paintGoal(); paintTimer();

  async function save(fields) { if (ro) return; try { await api.post('planner.save', { date, ...fields }); } catch (e) { errToast(e); } }
  async function reload() {
    d = await api.get('planner.get', u ? { date, u } : { date });
    subs = subjectMap(d.subjects);
    Object.keys(manual).forEach((k) => delete manual[k]); Object.assign(manual, d.blocks);
    paintGrid(); paintLegend(); paintGoal(); paintTimer(); paintSubSelect(); paintTodos(); paintDdays();
  }
  if (isToday) stop.push(every(60000, () => { if (!painting && document.visibilityState === 'visible') reload().catch(() => {}); }));

  async function toggleVis() {
    const next = d.vis === 'friends' ? 'private' : 'friends';
    try { const r = await api.post('planner.vis', { vis: next }); d.vis = r.vis; toast(r.vis === 'friends' ? '친구들이 내 플래너를 볼 수 있어요' : '이제 나만 볼 수 있어요'); view.querySelector('.pl-vis').replaceWith(topBar('day', { date, u, mine: true, friends: d.friendsSharing, vis: d.vis, onVis: toggleVis }).querySelector('.pl-vis')); } catch (e) { errToast(e); }
  }
  function subjectModal() {
    const list = h('div', { class: 'pl-sublist' });
    const paint = () => list.replaceChildren(...d.subjects.map((s) => subjectRow(s)), subjectRow(null));
    function subjectRow(s) {
      let color = s ? s.color : COLORS[d.subjects.length % COLORS.length];
      const name = h('input', { class: 'input', maxlength: '20', placeholder: s ? '' : '새 과목 이름', value: s ? s.name : '', 'aria-label': '과목 이름' });
      const sw = h('div', { class: 'pl-swatches' }, COLORS.map((c) => h('button', { type: 'button', style: { '--c': c }, 'aria-label': '색 ' + c, 'aria-pressed': String(c === color), onclick: (e) => { color = c; sw.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } })));
      const saveBtn = h('button', { type: 'button', class: 'btn sm' + (s ? '' : ' primary'), onclick: async () => {
        if (!name.value.trim()) { toast('과목 이름을 적어 주세요'); return; }
        try { const r = await api.post('planner.subject_save', { id: s ? s.id : 0, name: name.value.trim(), color }); d.subjects = r.subjects; subs = subjectMap(d.subjects); paint(); paintLegend(); paintGrid(); paintSubSelect(); paintTimer(); paintTodos(); } catch (e) { errToast(e); }
      } }, s ? '저장' : '추가');
      return h('div', { class: 'pl-subrow' }, name, sw, saveBtn,
        s ? confirmBtn('삭제', '한 번 더', async () => { const r = await api.post('planner.subject_del', { id: s.id }); d.subjects = r.subjects; subs = subjectMap(d.subjects); paint(); paintLegend(); paintGrid(); paintSubSelect(); paintTimer(); paintTodos(); }, 'btn ghost sm') : null);
    }
    paint();
    modal(h('div', { class: 'form' }, h('h2', null, '과목'), h('p', { class: 'small muted', style: { margin: 0 } }, '타임테이블과 할 일에 쓰는 과목과 색이에요'), list,
      h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn', onclick: (e) => e.target.closest('.modal-bg').remove() }, '닫기'))));
  }
  function ddayModal() {
    const list = h('div', { class: 'pl-ddlist' });
    const paint = () => list.replaceChildren(...(d.ddays.length ? d.ddays.map((x) => h('div', { class: 'pl-ddrow' }, h('span', { class: 'pl-dday', style: { '--c': x.color } }, h('b', null, ddayText(x.day, d.today)), x.title), h('span', { class: 'tiny muted' }, x.day),
      confirmBtn('삭제', '한 번 더', async () => { const r = await api.post('dday.del', { id: x.id }); d.ddays = r.ddays; paint(); paintDdays(); }, 'btn ghost sm'))) : [h('p', { class: 'small muted' }, '아직 D-day가 없어요')]));
    paint();
    const title = h('input', { class: 'input', maxlength: '40', placeholder: '예: DB 기말고사', 'aria-label': 'D-day 이름' });
    const day = h('input', { class: 'input', type: 'date', value: addDays(d.today, 14), 'aria-label': '날짜' });
    let color = '#f04452';
    const sw = h('div', { class: 'pl-swatches' }, ['#f04452', ...COLORS].map((c) => h('button', { type: 'button', style: { '--c': c }, 'aria-pressed': String(c === color), 'aria-label': '색 ' + c, onclick: (e) => { color = c; sw.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } })));
    modal(h('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault();
      if (!title.value.trim()) { toast('이름을 적어 주세요'); return; }
      try { const r = await api.post('dday.save', { title: title.value.trim(), day: day.value, color }); d.ddays = r.ddays; title.value = ''; paint(); paintDdays(); } catch (er) { errToast(er); }
    } }, h('h2', null, 'D-day'), list, h('div', { class: 'pl-ddnew' }, title, day), sw,
      h('div', { class: 'row end' }, h('button', { type: 'submit', class: 'btn primary' }, '추가'))));
  }
  return () => stop.forEach((f) => f());
}
function fmtClock(sec) { sec = Math.max(0, Math.floor(sec)); return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`; }

/* ================= 주간 보기 ================= */
async function weekPage(view, date, u) {
  setTitle('주간 플래너');
  let w;
  try { w = await api.get('planner.week', u ? { start: date, u } : { start: date }); } catch (e) { view.append(h('div', { class: 'card empty' }, e.message)); return; }
  const subs = subjectMap(w.subjects);
  view.append(topBar('week', { date, u, owner: w.owner, mine: w.mine }));
  const end = addDays(w.start, 6);
  const total = w.days.reduce((s, x) => s + x.minutes, 0);
  const studied = w.days.filter((x) => x.minutes > 0).length;
  const goalDays = w.days.filter((x) => x.goalMin && x.minutes >= x.goalMin).length;
  const tDone = w.days.reduce((s, x) => s + x.todoDone, 0), tAll = w.days.reduce((s, x) => s + x.todoTotal, 0);
  const max = Math.max(60, ...w.days.map((x) => Math.max(x.minutes, x.goalMin || 0)));
  view.append(h('header', { class: 'pl-head' },
    h('a', { class: 'btn ghost icon', href: `#/planner/week/${addDays(w.start, -7)}${uq(u)}`, 'aria-label': '지난주' }, icon('back')),
    h('div', { class: 'pl-date' }, h('div', { class: 'pl-date-n' }, `${longDate(w.start)} – ${longDate(end)}`), h('div', { class: 'pl-date-w' }, w.mine ? '이번 주 기록' : `${w.owner.name}의 한 주`)),
    h('a', { class: 'btn ghost icon', href: `#/planner/week/${addDays(w.start, 7)}${uq(u)}`, 'aria-label': '다음주' }, icon('next'))));
  view.append(h('div', { class: 'pl-stats' },
    stat('이번 주 공부', fmtMin(total)), stat('하루 평균', fmtMin(studied ? total / 7 : 0)), stat('공부한 날', `${studied}일`), stat('목표 달성', `${goalDays}일`), stat('할 일', tAll ? `${tDone}/${tAll}` : '—')));
  view.append(h('section', { class: 'card pl-week' }, h('div', { class: 'pl-bars' }, w.days.map((x) => {
    const segs = Object.entries(x.bySubject).sort((a, b) => b[1] - a[1]);
    return h('a', { class: 'pl-bar' + (x.date === today() ? ' today' : ''), href: `#/planner/${x.date}${uq(u)}`, title: `${x.date} ${fmtMin(x.minutes)}` },
      h('span', { class: 'pl-bar-v' }, x.minutes ? shortMin(x.minutes) : ''),
      h('span', { class: 'pl-bar-track' },
        x.goalMin ? h('i', { class: 'pl-bar-goal', style: { bottom: `${(x.goalMin / max) * 100}%` }, title: '목표 ' + fmtMin(x.goalMin) }) : null,
        h('span', { class: 'pl-bar-fill', style: { height: `${(x.minutes / max) * 100}%` } }, segs.map(([sid, m]) => h('i', { style: { flex: String(m), background: colorOf(subs, Number(sid)) } })))),
      h('span', { class: 'pl-bar-d' }, WD[parseD(x.date).getDay()]), h('span', { class: 'pl-bar-m' }, x.mood ? MOODS[x.mood - 1][0] : '·'));
  }))));
  const bySub = {};
  for (const x of w.days) for (const [sid, m] of Object.entries(x.bySubject)) bySub[sid] = (bySub[sid] || 0) + m;
  const rows = Object.entries(bySub).sort((a, b) => b[1] - a[1]);
  const topM = rows.length ? rows[0][1] : 1;
  view.append(h('section', { class: 'card' }, h('h3', { class: 'pl-h' }, '과목별 공부 시간'),
    rows.length ? h('div', { class: 'pl-subbars' }, rows.map(([sid, m]) => { const s = subs.get(Number(sid)); return h('div', { class: 'pl-subbar' },
      h('span', { class: 'pl-subbar-n' }, h('i', { class: 'pl-dot', style: { '--c': colorOf(subs, Number(sid)) } }), s ? s.name : '과목 없음'),
      h('span', { class: 'pl-subbar-t' }, h('i', { style: { width: `${(m / topM) * 100}%`, background: colorOf(subs, Number(sid)) } })), h('b', null, fmtMin(m))); }))
      : h('p', { class: 'small muted' }, '이번 주 기록이 아직 없어요. 공부 타이머를 켜거나 타임테이블을 칠해 보세요')));
}
const stat = (k, v) => h('div', { class: 'pl-stat' }, h('span', null, k), h('b', null, v));

/* ================= 책장 ================= */
async function shelfPage(view, u) {
  setTitle('플래너 북');
  let r;
  try { r = await api.get('planner.months', u ? { u } : {}); } catch (e) { view.append(h('div', { class: 'card empty' }, e.message)); return; }
  view.append(topBar('book', { date: today(), u, owner: r.owner, mine: r.mine }));
  view.append(h('div', { class: 'pl-shelf-head' }, h('h2', null, r.mine ? '나의 플래너 책장' : `${r.owner.name}의 책장`), h('p', { class: 'small muted' }, '한 달이 한 권의 책이 돼요. 눌러서 넘겨 보세요')));
  const shelf = h('div', { class: 'pl-shelf' });
  for (const m of r.months) {
    const [y, mo] = m.ym.split('-').map(Number);
    shelf.append(h('a', { class: 'pl-bookcover', href: `#/planner/book/${m.ym}${uq(u)}`, style: { '--b': BOOK_COLORS[(mo - 1) % 12] }, 'aria-label': `${y}년 ${mo}월 플래너 북` },
      m.current ? h('span', { class: 'pl-ribbon' }, '작성 중') : null,
      h('span', { class: 'pl-bc-y' }, y), h('span', { class: 'pl-bc-m' }, mo, h('small', null, '월')), h('span', { class: 'pl-bc-t' }, 'STUDY PLANNER'),
      h('span', { class: 'pl-bc-s' }, m.studyMinutes ? fmtMin(m.studyMinutes) : '새 책')));
  }
  view.append(h('div', { class: 'pl-shelf-wrap' }, shelf, h('div', { class: 'pl-shelf-board' })));
}

/* ================= 한 달 플래너 북 ================= */
async function bookPage(view, ym, u) {
  const [Y, M] = ym.split('-').map(Number);
  setTitle(`${M}월 플래너 북`);
  let r;
  try { r = await api.get('planner.month', u ? { ym, u } : { ym }); } catch (e) { view.append(h('div', { class: 'card empty' }, e.message)); return; }
  const subs = subjectMap(r.subjects);
  const color = BOOK_COLORS[(M - 1) % 12];
  const who = r.mine ? (state.me && state.me.name) : r.owner.name;
  const days = r.days;
  const filled = days.filter((x) => x.minutes || x.todoTotal || x.reflection || x.mood);
  const total = days.reduce((s, x) => s + x.minutes, 0);
  const best = days.reduce((b, x) => (x.minutes > (b ? b.minutes : 0) ? x : b), null);
  const goalDays = days.filter((x) => x.goalMin && x.minutes >= x.goalMin).length;
  let streak = 0, run = 0;
  for (const x of days) { if (x.minutes > 0) { run++; streak = Math.max(streak, run); } else run = 0; }
  const bySub = {};
  for (const x of days) for (const [sid, m] of Object.entries(x.bySubject)) bySub[sid] = (bySub[sid] || 0) + m;
  const subRows = Object.entries(bySub).sort((a, b) => b[1] - a[1]);

  /* 쪽 만들기 */
  const cover = () => h('div', { class: 'bk-page bk-cover', style: { '--b': color } },
    h('div', { class: 'bk-cover-in' }, h('span', { class: 'bk-c-label' }, 'STUDY PLANNER'), h('span', { class: 'bk-c-y' }, Y), h('span', { class: 'bk-c-m' }, `${M}월`),
      h('span', { class: 'bk-c-line' }), h('span', { class: 'bk-c-who' }, `${who}의 한 달`),
      h('span', { class: 'bk-c-sum' }, `${fmtMin(total)} · ${filled.length}일의 기록`)));
  const calendarPage = () => {
    const first = parseD(`${ym}-01`).getDay();
    const maxM = Math.max(60, ...days.map((x) => x.minutes));
    const cellsEl = [];
    for (let i = 0; i < first; i++) cellsEl.push(h('span', { class: 'bk-cal-c empty' }));
    for (const x of days) {
      const lv = x.minutes ? Math.min(4, Math.ceil((x.minutes / maxM) * 4)) : 0;
      cellsEl.push(h('span', { class: `bk-cal-c lv${lv}`, style: { '--b': color } }, h('b', null, Number(x.date.slice(8))), x.mood ? h('em', null, MOODS[x.mood - 1][0]) : null, x.minutes ? h('small', null, shortMin(x.minutes)) : null));
    }
    return h('div', { class: 'bk-page bk-paper' }, h('div', { class: 'bk-ptitle' }, `${M}월 한눈에`),
      h('div', { class: 'bk-cal' }, WD.map((w0) => h('span', { class: 'bk-cal-w' }, w0)), cellsEl),
      r.ddays.length ? h('div', { class: 'bk-dd' }, r.ddays.map((x) => h('span', { style: { '--c': x.color } }, `${Number(x.day.slice(5, 7))}/${Number(x.day.slice(8))} ${x.title}`))) : null,
      h('div', { class: 'bk-foot' }, '2'));
  };
  const dayPageEl = (x, n) => {
    const slots = x.slots || {};
    const tt = h('div', { class: 'bk-tt' });
    for (let rr = 0; rr < 24; rr++) {
      const row = h('div', { class: 'bk-tt-r' }, h('span', null, hourLabel(rr)));
      for (let c = 0; c < 6; c++) { const sid = slots[rr * 6 + c]; row.append(h('i', { style: sid !== undefined ? { background: colorOf(subs, sid) } : null })); }
      tt.append(row);
    }
    const todos = [...x.tasks.map((t) => ({ text: (t.subject ? `[${t.subject}] ` : '') + t.content, done: t.done, c: t.planColor })), ...x.todos.map((t) => ({ text: t.text, done: t.done, c: colorOf(subs, t.subjectId) }))];
    return h('div', { class: 'bk-page bk-paper bk-day' },
      h('div', { class: 'bk-dhead' }, h('span', { class: 'bk-dn' }, Number(x.date.slice(8))), h('span', { class: 'bk-dw' }, `${M}월 · ${wd(x.date)}`), h('span', { class: 'grow' }),
        x.mood ? h('span', { class: 'bk-mood' }, MOODS[x.mood - 1][0]) : null),
      h('div', { class: 'bk-dbody' },
        h('div', { class: 'bk-dleft' },
          h('div', { class: 'bk-lbl' }, '공부 시간'), h('div', { class: 'bk-big' }, fmtMin(x.minutes), x.goalMin ? h('small', null, ` / ${fmtMin(x.goalMin)}`) : null),
          h('div', { class: 'bk-lbl' }, '할 일', x.todoTotal ? ` ${x.todoDone}/${x.todoTotal}` : ''),
          h('ul', { class: 'bk-todos' }, todos.length ? todos.slice(0, 12).map((t) => h('li', { class: t.done ? 'done' : '' }, h('i', { style: { '--c': t.c || NO_SUBJECT } }), t.text)) : h('li', { class: 'none' }, '—')),
          h('div', { class: 'bk-lbl' }, '돌아보기', x.rating ? h('span', { class: 'bk-stars' }, ' ' + '★'.repeat(x.rating) + '☆'.repeat(5 - x.rating)) : null),
          h('p', { class: 'bk-reflect' }, x.reflection || '')),
        tt),
      h('div', { class: 'bk-foot' }, String(n)));
  };
  const summaryPage = (n) => h('div', { class: 'bk-page bk-paper' }, h('div', { class: 'bk-ptitle' }, `${M}월을 마치며`),
    h('div', { class: 'bk-sum' },
      sumItem('총 공부', fmtMin(total)), sumItem('공부한 날', `${days.filter((x) => x.minutes).length}일`), sumItem('최장 연속', `${streak}일`),
      sumItem('목표 달성', `${goalDays}일`), sumItem('최고의 날', best ? `${Number(best.date.slice(8))}일 · ${fmtMin(best.minutes)}` : '—'),
      sumItem('할 일 완료', (() => { const a = days.reduce((s, x) => s + x.todoTotal, 0); return a ? `${Math.round((days.reduce((s, x) => s + x.todoDone, 0) / a) * 100)}%` : '—'; })())),
    subRows.length ? h('div', { class: 'bk-subs' }, subRows.map(([sid, m]) => { const s = subs.get(Number(sid)); return h('div', null, h('span', null, h('i', { style: { '--c': colorOf(subs, Number(sid)) } }), s ? s.name : '과목 없음'),
      h('span', { class: 'bk-subs-t' }, h('i', { style: { width: `${(m / subRows[0][1]) * 100}%`, background: colorOf(subs, Number(sid)) } })), h('b', null, fmtMin(m))); })) : null,
    h('div', { class: 'bk-end' }, '수고했어요, 다음 달도 화이팅!'), h('div', { class: 'bk-foot' }, String(n)));
  const pages = [cover, calendarPage, ...filled.map((x) => (n) => dayPageEl(x, n)), (n) => summaryPage(n)];
  const pageEl = (i) => (i >= 0 && i < pages.length ? pages[i](i + 1) : h('div', { class: 'bk-page bk-blank' }));

  /* 넘겨 보기: 넓은 화면은 두 쪽, 휴대폰은 한 쪽 */
  const wide = () => window.matchMedia('(min-width: 900px)').matches;
  let at = 0;   // 넓은 화면: 왼쪽 쪽 번호(표지는 오른쪽에 혼자), 좁은 화면: 지금 쪽
  const stage = h('div', { class: 'bk-stage' });
  const counter = h('span', { class: 'small muted' });
  const prevB = h('button', { type: 'button', class: 'btn icon bk-nav', 'aria-label': '앞 쪽', onclick: () => go(-1) }, icon('back'));
  const nextB = h('button', { type: 'button', class: 'btn icon bk-nav', 'aria-label': '다음 쪽', onclick: () => go(1) }, icon('next'));
  function spread() { return wide() ? (at === 0 ? [-1, 0] : [at, at + 1]) : [at]; }
  function render(dir = 0) {
    const [a, b] = spread();
    const book = h('div', { class: 'bk-book' + (wide() ? ' two' : ' one') + (dir ? (dir > 0 ? ' turn-next' : ' turn-prev') : '') }, ...(wide() ? [pageEl(a), pageEl(b)] : [pageEl(a)]));
    stage.replaceChildren(book);
    const last = pages.length - 1;
    prevB.disabled = at === 0;
    nextB.disabled = wide() ? (at === 0 ? last < 1 : at + 1 >= last) : at >= last;
    counter.textContent = wide() ? (at === 0 ? `표지 / ${pages.length}쪽` : `${a + 1}–${Math.min(b + 1, pages.length)} / ${pages.length}쪽`) : `${at + 1} / ${pages.length}쪽`;
  }
  function go(dir) {
    if (wide()) { if (dir > 0) at = at === 0 ? 1 : at + 2; else at = at <= 1 ? 0 : at - 2; at = Math.max(0, Math.min(at, pages.length - 1)); }
    else at = Math.max(0, Math.min(pages.length - 1, at + dir));
    render(dir);
  }
  const onKey = (e) => { if (e.target.closest && e.target.closest('input,textarea')) return; if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
  document.addEventListener('keydown', onKey);
  let sx = null;
  stage.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', (e) => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); });
  const onResize = () => { at = wide() && at > 0 && at % 2 === 0 ? at - 1 : at; render(); };
  window.addEventListener('resize', onResize);

  /* PDF 로 저장: 모든 쪽을 차례로 놓고 인쇄 창을 열어요 (인쇄 창에서 'PDF로 저장') */
  function printBook() {
    const all = h('div', { class: 'bk-print' }, pages.map((f, i) => f(i + 1)));
    document.body.append(all); document.body.classList.add('bk-printing');
    const done = () => { all.remove(); document.body.classList.remove('bk-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 1000); }, 50);
  }
  view.append(topBar('book', { date: `${ym}-01`, u, owner: r.owner, mine: r.mine }),
    h('div', { class: 'bk-bar' }, h('a', { class: 'btn ghost sm', href: `#/planner/books${uq(u)}` }, icon('back'), '책장'), h('b', null, `${Y}년 ${M}월`), h('span', { class: 'grow' }), counter,
      h('button', { type: 'button', class: 'btn sm', onclick: printBook }, icon('download'), 'PDF로 저장')),
    h('div', { class: 'bk-wrap' }, prevB, stage, nextB),
    filled.length ? null : h('p', { class: 'small muted', style: { 'text-align': 'center' } }, '이 달은 아직 기록이 없어요. 하루 플래너를 쓰면 여기 한 쪽씩 쌓여요'));
  render();
  return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
}
const sumItem = (k, v) => h('div', { class: 'bk-sum-i' }, h('span', null, k), h('b', null, v));
