/* 학습 플래너: 하루 한 장 · 주간 보기 · 책장 · 한 달 플래너 북 */
import { state, api, h, icon, avatar, toast, errToast, modal, confirmBtn, setTitle, every, today, addDays, daysBetween, parseD, parseDT, nowLocal, WD, pad, COLORS } from '../core.js';
import { PACKS, packsReady, sticker } from '../stickers.js';
import { decoEditor, paintDecos } from '../deco.js';

const SLOTS = 144, START_H = 6;           // 10분 칸 144개, 아침 6시부터
const MOODS = [['😫', '힘들었어'], ['😕', '별로'], ['🙂', '보통'], ['😊', '좋았어'], ['🤩', '최고']];
const NO_SUBJECT = '#8b95a1';
// 천 표지 색 (달마다 하나): 숲·남색 리넨·말린 장미·겨자·자두·청회색…
const BOOK_COLORS = ['#2f4a3e', '#253a5e', '#a8606b', '#b98a2a', '#5b3f63', '#49586b', '#7a3b3b', '#2e5e5b', '#6b5a3a', '#3c4f7a', '#8a4f2a', '#4a4a58'];

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


/* ================= 하루 한 장: 펼친 다이어리 =================
   왼쪽 쪽: 날짜·기분·D-day / 오늘의 목표 / 할 일(과목 · 할 일 · ○△×) / 돌아보기
   오른쪽 쪽: 10분 타임테이블 / 과목별 시간
   그 위에 스티커·테이프·도장·사진을 자유롭게 붙여요. 플래너 북도 이 두 쪽을 그대로 묶어요. */
const MARKS = ['', '○', '△', '×'];
const MARK_LABEL = ['아직', '다 했어요', '조금 했어요', '못 했어요'];

function pageShell(side) { return h('section', { class: `pd-page pd-${side}` }, h('div', { class: 'pd-in' })); }
/* 속지 분위기 장식 (누를 수 없고, 꾸미기와 따로예요) */
const ORN = {
  cute: [[['hoodie/study', 'br']], [['hoodie/cheer', 'tr']]],
  classic: [[['sprig', 'br']], []],
  feminine: [[['bow', 'tc'], ['tulips', 'bl']], [['bow', 'tc']]],
};
function addOrnaments(pages, theme) {
  (ORN[theme] || []).forEach((list, i) => {
    if (!pages[i]) return;
    pages[i].append(h('div', { class: 'pd-orn', 'aria-hidden': 'true' }, list.map(([src, pos]) =>
      h('img', { class: `orn orn-${pos} orn-${src.replace('/', '-')}`, src: src.includes('/') ? `assets/stickers/${src}.webp` : `assets/ornaments/${src}.png`, alt: '', draggable: 'false' }))));
  });
}
function lbl(text, ...extra) { return h('div', { class: 'pd-lbl' }, h('span', { class: 'pd-hl' }, text), ...extra); }
function ttGrid(slotsOf, subs) {
  const grid = h('div', { class: 'pd-tt' });
  const cells = [];
  for (let r = 0; r < 24; r++) {
    const row = h('div', { class: 'pd-tt-r' }, h('span', { class: 'pd-tt-h' }, hourLabel(r)));
    for (let c = 0; c < 6; c++) { const i = r * 6 + c; const cell = h('i', { class: 'pd-tt-c', 'data-i': i, title: slotTime(i) }); cells.push(cell); row.append(cell); }
    grid.append(row);
  }
  const paint = (i) => {
    const [sid, auto] = slotsOf(i);
    const cell = cells[i];
    cell.classList.toggle('on', sid !== undefined);
    cell.classList.toggle('auto', sid !== undefined && auto);
    cell.style.setProperty('--c', sid !== undefined ? colorOf(subs(), sid) : '');
  };
  return { grid, cells, paint, paintAll: () => { for (let i = 0; i < SLOTS; i++) paint(i); } };
}
function subTotals(merged, subsMap) {
  const by = {};
  for (const sid of Object.values(merged)) by[sid] = (by[sid] || 0) + 10;
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return h('p', { class: 'pd-none' }, '아직 칠한 칸이 없어요');
  const top = rows[0][1];
  return h('div', { class: 'pd-subs' }, rows.map(([sid, m]) => { const s = subsMap.get(Number(sid)); return h('div', { class: 'pd-subs-r' },
    h('span', { class: 'pd-subs-n' }, h('i', { style: { '--c': colorOf(subsMap, Number(sid)) } }), s ? s.name : '과목 없음'),
    h('span', { class: 'pd-subs-t' }, h('i', { style: { width: `${(m / top) * 100}%`, background: colorOf(subsMap, Number(sid)) } })), h('b', null, fmtMin(m))); }));
}
function moodRowEl(mood, onPick) {
  return h('div', { class: 'pd-moods', role: 'group', 'aria-label': '오늘 기분' }, MOODS.map(([e, label], i) =>
    onPick ? h('button', { type: 'button', class: 'pd-mood' + (mood === i + 1 ? ' on' : ''), 'aria-pressed': String(mood === i + 1), 'aria-label': '기분 ' + label, title: label, onclick: () => onPick(i + 1) }, e)
      : (mood === i + 1 ? h('span', { class: 'pd-mood on', title: label }, e) : null)));
}
function headEl(date, x, ddays, moodEl) {
  const d = parseD(date);
  return h('div', { class: 'pd-head' },
    h('div', { class: 'pd-num' }, d.getDate()),
    h('div', { class: 'pd-meta' }, h('span', null, `${d.getMonth() + 1}월`), h('span', null, wd(date))),
    h('div', { class: 'pd-head-r' }, moodEl,
      ddays.length ? h('div', { class: 'pd-dd' }, ddays.slice(0, 2).map((y) => h('span', { style: { '--c': y.color } }, h('b', null, ddayText(y.day, date)), y.title))) : null));
}
function ringEl(m, g) {
  const pct = g ? Math.min(100, Math.round((m / g) * 100)) : 0;
  return h('div', { class: 'pd-ring', style: { '--p': pct } }, h('span', null, g ? `${pct}%` : '—'));
}

async function dayPage(view, date, u) {
  setTitle('플래너');
  let d;
  try { [d] = await Promise.all([api.get('planner.get', u ? { date, u } : { date }), packsReady]); } catch (e) { view.append(h('div', { class: 'card empty' }, e.message)); return; }
  const ro = !d.mine, isToday = date === d.today;
  let subs = subjectMap(d.subjects);
  const manual = { ...d.blocks };
  const photos = Object.fromEntries(d.photos.map((p) => [p.id, p]));
  const stop = [];

  /* 도구줄: 날짜 넘기기 · 공부 타이머 · 꾸미기 */
  const timerBox = h('div', { class: 'pd-timer' });
  let pick = d.subjects[0] ? d.subjects[0].id : 0, timerTick = null;
  function paintTimer() {
    timerTick = null;
    if (!d.mine || !isToday) { timerBox.hidden = true; return; }
    if (d.studyingSince) {
      const el = h('b', { class: 'pd-clock' });
      timerTick = () => { el.textContent = fmtClock((nowLocal() - parseDT(d.studyingSince)) / 1000); };
      timerTick();
      const s = d.studyingSubject && subs.get(d.studyingSubject);
      timerBox.replaceChildren(h('span', { class: 'pd-live', style: { '--c': s ? s.color : NO_SUBJECT } }, h('i'), s ? s.name : '공부'), el,
        h('button', { type: 'button', class: 'btn sm danger', onclick: stopStudy }, '끝내기'));
    } else {
      const sel = h('select', { class: 'input pd-tsel', 'aria-label': '공부할 과목', onchange: (e) => { pick = Number(e.target.value); } },
        [...d.subjects, { id: 0, name: '과목 없이' }].map((s) => h('option', { value: s.id, selected: s.id === pick }, s.name)));
      timerBox.replaceChildren(sel, h('button', { type: 'button', class: 'btn primary sm', onclick: startStudy }, icon('play'), '공부 시작'));
    }
  }
  stop.push(every(1000, () => { if (timerTick) timerTick(); }));
  async function startStudy() { try { await api.post('study.start', pick ? { subject: pick } : {}); await reload(); toast('공부를 시작했어요. 타임테이블에 저절로 칠해져요'); } catch (e) { errToast(e); } }
  async function stopStudy() { try { await api.post('study.stop'); await reload(); toast('수고했어요!'); } catch (e) { errToast(e); } }
  const decoBtn = ro ? null : h('button', { type: 'button', class: 'btn sm pd-decobtn', onclick: () => { const on = editor.toggle(); decoBtn.classList.toggle('on', on); decoBtn.lastChild.textContent = on ? '꾸미는 중' : '꾸미기'; } }, icon('sticky'), h('span', null, '꾸미기'));

  view.append(topBar('day', { date, u, owner: d.owner, mine: d.mine, friends: d.friendsSharing, vis: d.vis, onVis: toggleVis }),
    h('div', { class: 'pd-bar' },
      h('a', { class: 'btn ghost icon', href: `#/planner/${addDays(date, -1)}${uq(u)}`, 'aria-label': '전날' }, icon('back')),
      h('a', { class: 'btn ghost icon', href: `#/planner/${addDays(date, 1)}${uq(u)}`, 'aria-label': '다음날' }, icon('next')),
      isToday ? null : h('a', { class: 'btn sm', href: `#/planner/${d.today}${uq(u)}` }, '오늘'),
      ro ? h('span', { class: 'small muted' }, `${d.owner.name}의 플래너 · 보기만 할 수 있어요`) : null,
      h('span', { class: 'grow' }), timerBox, decoBtn));

  /* ---- 왼쪽 쪽 ---- */
  const left = pageShell('left'), right = pageShell('right');
  const L = left.firstChild, R = right.firstChild;
  const headBox = h('div');
  function paintHead() {
    headBox.replaceChildren(headEl(date, d, d.ddays, moodRowEl(d.mood, ro ? null : (n) => { d.mood = d.mood === n ? null : n; paintHead(); save({ mood: d.mood }); })),
      d.mine ? h('button', { type: 'button', class: 'pd-ddadd', onclick: ddayModal }, d.ddays.length ? 'D-day 고치기' : '+ D-day') : null);
  }
  const goalBox = h('div', { class: 'pd-goal' });
  const minutes = () => Object.keys(merge(d.auto, manual)).length * 10;
  function paintGoal() {
    const m = minutes(), g = d.goalMin || 0;
    goalBox.replaceChildren(ringEl(m, g),
      h('div', { class: 'pd-goal-t' },
        h('div', null, h('span', { class: 'pd-k' }, '공부한 시간'), h('b', { class: 'pd-hand' }, fmtMin(m))),
        h('div', null, h('span', { class: 'pd-k' }, '목표'),
          ro ? null : h('button', { type: 'button', class: 'pd-step', 'aria-label': '목표 30분 줄이기', onclick: () => stepGoal(-30) }, '−'),
          h('b', { class: 'pd-hand' }, g ? fmtMin(g) : '정하기'),
          ro ? null : h('button', { type: 'button', class: 'pd-step', 'aria-label': '목표 30분 늘리기', onclick: () => stepGoal(30) }, '+'))));
    ttTotal.textContent = fmtMin(m);
    subsBox.replaceChildren(subTotals(merge(d.auto, manual), subs));
  }
  const stepGoal = (delta) => { d.goalMin = Math.max(0, Math.min(1440, (d.goalMin || 0) + delta)) || null; paintGoal(); save({ goalMin: d.goalMin }); };

  const todoBox = h('div', { class: 'pd-tbl' });
  const todoCount = h('span', { class: 'pd-cnt' });
  function markBtn(state, label, onClick) {
    return h('button', { type: 'button', class: `pd-mark m${state}`, disabled: !onClick, 'aria-label': `${label} 표시: ${MARK_LABEL[state]}`, title: '눌러서 ○ → △ → × 바꾸기', onclick: onClick }, MARKS[state]);
  }
  function paintTodos() {
    const rows = [];
    for (const t of d.tasks) rows.push(h('div', { class: 'pd-tr' + (t.done ? ' done' : '') },
      h('span', { class: 'pd-sub', style: { '--c': t.planColor || NO_SUBJECT } }, t.subject || '계획'),
      h('span', { class: 'pd-txt', title: t.planTitle }, t.content),
      markBtn(t.done ? 1 : 0, t.content, async () => { try { await api.post('tasks.toggle', { id: t.id, done: !t.done }); t.done = !t.done; paintTodos(); } catch (e) { errToast(e); } })));
    for (const t of d.todos) {
      const s = t.subjectId && subs.get(t.subjectId);
      rows.push(h('div', { class: `pd-tr${t.state === 1 ? ' done' : ''}` },
        h('span', { class: 'pd-sub', style: { '--c': colorOf(subs, t.subjectId) } }, s ? s.name : '—'),
        h('span', { class: 'pd-txt' }, t.text,
          ro ? null : h('span', { class: 'pd-acts' },
            t.state === 1 ? null : h('button', { type: 'button', title: '다음날로 미루기', 'aria-label': t.text + ' 다음날로', onclick: async () => { try { await api.post('planner.todo_move', { id: t.id, to: addDays(date, 1) }); d.todos = d.todos.filter((x) => x !== t); paintTodos(); toast('다음날로 옮겼어요'); } catch (e) { errToast(e); } } }, icon('next')),
            h('button', { type: 'button', 'aria-label': t.text + ' 지우기', onclick: async () => { try { await api.post('planner.todo_del', { id: t.id }); d.todos = d.todos.filter((x) => x !== t); paintTodos(); } catch (e) { errToast(e); } } }, icon('x')))),
        markBtn(t.state, t.text, ro ? null : async () => { const next = (t.state + 1) % 4; try { await api.post('planner.todo_toggle', { id: t.id, state: next }); t.state = next; t.done = next === 1; paintTodos(); } catch (e) { errToast(e); } })));
    }
    const done = d.tasks.filter((t) => t.done).length + d.todos.filter((t) => t.state === 1).length, total = d.tasks.length + d.todos.length;
    todoCount.textContent = total ? `${done}/${total}` : '';
    if (!rows.length) rows.push(h('div', { class: 'pd-tr empty' }, h('span', { class: 'pd-sub' }), h('span', { class: 'pd-txt pd-none' }, ro ? '할 일이 없어요' : '아래에 오늘 할 일을 적어요'), h('span')));
    todoBox.replaceChildren(h('div', { class: 'pd-th' }, h('span', null, '과목'), h('span', null, '할 일'), h('span', null, '○△×')), ...rows, ro ? null : addRow);
  }
  const todoIn = h('input', { class: 'pd-in-t', maxlength: '120', placeholder: '할 일 적고 Enter', 'aria-label': '할 일 추가' });
  const todoSub = h('select', { class: 'pd-in-s', 'aria-label': '과목' });
  function paintSubSelect() { todoSub.replaceChildren(h('option', { value: '' }, '과목'), ...d.subjects.map((s) => h('option', { value: s.id }, s.name))); }
  paintSubSelect();
  const addRow = h('form', { class: 'pd-tr add', onsubmit: async (e) => {
    e.preventDefault();
    const text = todoIn.value.trim(); if (!text) return;
    try { const r = await api.post('planner.todo_add', { date, text, subjectId: Number(todoSub.value) || 0 }); d.todos.push(r.todo); todoIn.value = ''; paintTodos(); todoIn.focus(); } catch (er) { errToast(er); }
  } }, todoSub, todoIn, h('button', { type: 'submit', class: 'pd-mark add', 'aria-label': '할 일 추가' }, '+'));

  const stars = h('span', { class: 'pd-stars', role: 'group', 'aria-label': '오늘 만족도' });
  function paintStars() {
    stars.replaceChildren(...[1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', class: (d.rating || 0) >= n ? 'on' : '', disabled: ro, 'aria-label': `만족도 ${n}점`,
      onclick: () => { d.rating = d.rating === n ? null : n; paintStars(); save({ rating: d.rating }); } }, '★')));
  }
  const reflect = h('textarea', { class: 'pd-lines', maxlength: '500', rows: '5', readonly: ro, placeholder: ro ? '' : '잘한 점, 아쉬운 점, 내일 할 것', 'aria-label': '하루 돌아보기' });
  reflect.value = d.reflection;
  let refT = null;
  reflect.addEventListener('input', () => { clearTimeout(refT); refT = setTimeout(() => save({ reflection: reflect.value }), 800); });

  L.append(headBox,
    h('div', { class: 'pd-sec' }, lbl('오늘의 목표'), goalBox),
    h('div', { class: 'pd-sec pd-grow' }, lbl('할 일', todoCount), todoBox),
    h('div', { class: 'pd-sec' }, lbl('돌아보기', stars), reflect));

  /* ---- 오른쪽 쪽 ---- */
  const tt = ttGrid((i) => {
    const man = manual[i];
    if (man !== undefined) return man < 0 ? [undefined, false] : [man, false];
    return [d.auto[i], true];
  }, () => subs);
  const ttTotal = h('span', { class: 'pd-cnt' });
  const subsBox = h('div');
  let brush = null;
  const legend = h('div', { class: 'pd-legend' });
  const hint = h('p', { class: 'pd-hint' });
  function paintLegend() {
    if (ro) { legend.replaceChildren(); hint.textContent = ''; return; }
    legend.replaceChildren(
      ...[...d.subjects, { id: 0, name: '과목 없음', color: NO_SUBJECT }].map((s) => h('button', { type: 'button', class: 'pd-brush' + (brush === s.id ? ' on' : ''), style: { '--c': s.color }, 'aria-pressed': String(brush === s.id), onclick: () => setBrush(brush === s.id ? null : s.id) }, h('i'), s.name)),
      h('button', { type: 'button', class: 'pd-brush erase' + (brush === 'erase' ? ' on' : ''), 'aria-pressed': String(brush === 'erase'), onclick: () => setBrush(brush === 'erase' ? null : 'erase') }, icon('eraser'), '지우개'),
      h('button', { type: 'button', class: 'pd-brush ghost', onclick: subjectModal }, icon('gear'), '과목'));
    hint.textContent = brush === null ? '과목을 고르고 칸을 눌러 칠해요. 타이머 기록은 빗금으로 저절로 칠해져요' : '칸을 누르거나 끌어서 칠해요 · 다 칠하면 과목을 다시 눌러요';
  }
  function setBrush(b) { brush = b; tt.grid.classList.toggle('painting', b !== null); paintLegend(); }
  function apply(i) {
    if (brush === null || i < 0 || Number.isNaN(i)) return;
    if (brush === 'erase') { if (d.auto[i] !== undefined) manual[i] = -1; else delete manual[i]; } else manual[i] = brush;
    tt.paint(i); dirtyBlocks();
  }
  let painting = false;
  const cellAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.classList && el.classList.contains('pd-tt-c') ? Number(el.dataset.i) : -1; };
  tt.grid.addEventListener('pointerdown', (e) => { if (brush === null || ro) return; painting = true; tt.grid.setPointerCapture(e.pointerId); apply(cellAt(e.clientX, e.clientY)); e.preventDefault(); });
  tt.grid.addEventListener('pointermove', (e) => { if (painting) apply(cellAt(e.clientX, e.clientY)); });
  const endPaint = () => { painting = false; };
  tt.grid.addEventListener('pointerup', endPaint); tt.grid.addEventListener('pointercancel', endPaint);
  let blocksT = null;
  function dirtyBlocks() { paintGoal(); clearTimeout(blocksT); blocksT = setTimeout(() => api.post('planner.blocks', { date, blocks: manual }).catch(errToast), 700); }
  R.append(h('div', { class: 'pd-sec' }, lbl('타임테이블', ttTotal), legend, tt.grid, hint), h('div', { class: 'pd-sec' }, lbl('과목별 시간'), subsBox));

  const theme = themeOf(d.cover ? d.cover.style : '');
  const spread = h('div', { class: `pd-spread theme-${theme}` + (ro ? ' ro' : '') }, left, right);
  addOrnaments([left, right], theme);
  view.append(spread);
  paintHead(); paintGoal(); paintTodos(); paintStars(); tt.paintAll(); paintLegend(); paintTimer();
  const editor = ro ? null : decoEditor({ date, pages: [left, right], decos: d.decos, photos, onChange: () => {} });
  if (ro) paintDecos([left, right], d.decos, { photos, u });

  async function save(fields) { if (ro) return; try { await api.post('planner.save', { date, ...fields }); } catch (e) { errToast(e); } }
  async function reload() {
    const n = await api.get('planner.get', u ? { date, u } : { date });
    Object.assign(d, { auto: n.auto, studyingSince: n.studyingSince, studyingSubject: n.studyingSubject, studySeconds: n.studySeconds, tasks: n.tasks, todos: n.todos, subjects: n.subjects, ddays: n.ddays });
    subs = subjectMap(d.subjects);
    tt.paintAll(); paintGoal(); paintTimer(); paintTodos(); paintLegend(); paintSubSelect(); paintHead();
  }
  if (isToday) stop.push(every(60000, () => { if (!painting && document.visibilityState === 'visible' && !(editor && editor.isOn())) reload().catch(() => {}); }));

  async function toggleVis() {
    const next = d.vis === 'friends' ? 'private' : 'friends';
    try { const r = await api.post('planner.vis', { vis: next }); d.vis = r.vis; toast(r.vis === 'friends' ? '친구들이 내 플래너를 볼 수 있어요' : '이제 나만 볼 수 있어요'); view.querySelector('.pl-vis').replaceWith(topBar('day', { date, u, mine: true, friends: d.friendsSharing, vis: d.vis, onVis: toggleVis }).querySelector('.pl-vis')); } catch (e) { errToast(e); }
  }
  function subjectModal() {
    const list = h('div', { class: 'pl-sublist' });
    const after = (r) => { d.subjects = r.subjects; subs = subjectMap(d.subjects); paint(); paintLegend(); tt.paintAll(); paintSubSelect(); paintTimer(); paintTodos(); paintGoal(); };
    const paint = () => list.replaceChildren(...d.subjects.map((s) => subjectRow(s)), subjectRow(null));
    function subjectRow(s) {
      let color = s ? s.color : COLORS[d.subjects.length % COLORS.length];
      const name = h('input', { class: 'input', maxlength: '20', placeholder: s ? '' : '새 과목 이름', value: s ? s.name : '', 'aria-label': '과목 이름' });
      const sw = h('div', { class: 'pl-swatches' }, COLORS.map((c) => h('button', { type: 'button', style: { '--c': c }, 'aria-label': '색 ' + c, 'aria-pressed': String(c === color), onclick: (e) => { color = c; sw.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } })));
      return h('div', { class: 'pl-subrow' }, name, sw,
        h('button', { type: 'button', class: 'btn sm' + (s ? '' : ' primary'), onclick: async () => {
          if (!name.value.trim()) { toast('과목 이름을 적어 주세요'); return; }
          try { after(await api.post('planner.subject_save', { id: s ? s.id : 0, name: name.value.trim(), color })); } catch (e) { errToast(e); }
        } }, s ? '저장' : '추가'),
        s ? confirmBtn('삭제', '한 번 더', async () => after(await api.post('planner.subject_del', { id: s.id })), 'btn ghost sm') : null);
    }
    paint();
    modal(h('div', { class: 'form' }, h('h2', null, '과목'), h('p', { class: 'small muted', style: { margin: 0 } }, '타임테이블과 할 일에 쓰는 과목과 색이에요'), list));
  }
  function ddayModal() {
    const list = h('div', { class: 'pl-ddlist' });
    const paint = () => list.replaceChildren(...(d.ddays.length ? d.ddays.map((x) => h('div', { class: 'pl-ddrow' }, h('span', { class: 'pl-dday', style: { '--c': x.color } }, h('b', null, ddayText(x.day, d.today)), x.title), h('span', { class: 'tiny muted' }, x.day),
      confirmBtn('삭제', '한 번 더', async () => { const r = await api.post('dday.del', { id: x.id }); d.ddays = r.ddays; paint(); paintHead(); }, 'btn ghost sm'))) : [h('p', { class: 'small muted' }, '아직 D-day가 없어요')]));
    paint();
    const title = h('input', { class: 'input', maxlength: '40', placeholder: '예: DB 기말고사', 'aria-label': 'D-day 이름' });
    const day = h('input', { class: 'input', type: 'date', value: addDays(d.today, 14), 'aria-label': '날짜' });
    let color = '#f04452';
    const sw = h('div', { class: 'pl-swatches' }, ['#f04452', ...COLORS].map((c) => h('button', { type: 'button', style: { '--c': c }, 'aria-pressed': String(c === color), 'aria-label': '색 ' + c, onclick: (e) => { color = c; sw.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } })));
    modal(h('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault();
      if (!title.value.trim()) { toast('이름을 적어 주세요'); return; }
      try { const r = await api.post('dday.save', { title: title.value.trim(), day: day.value, color }); d.ddays = r.ddays; title.value = ''; paint(); paintHead(); } catch (er) { errToast(er); }
    } }, h('h2', null, 'D-day'), list, h('div', { class: 'pl-ddnew' }, title, day), sw, h('div', { class: 'row end' }, h('button', { type: 'submit', class: 'btn primary' }, '추가'))));
  }
  return () => { stop.forEach((f) => f()); if (editor) editor.destroy(); };
}
function fmtClock(sec) { sec = Math.max(0, Math.floor(sec)); return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`; }

/* 플래너 북 한 쪽씩 (보기 전용, 하루 화면과 같은 모양) */
function staticSpread(x, subs, opts) {
  const left = pageShell('left'), right = pageShell('right');
  const todos = [...(x.tasks || []).map((t) => ({ sub: t.subject || '계획', c: t.planColor, text: t.content, m: t.done ? 1 : 0 })),
    ...(x.todos || []).map((t) => { const s = t.subjectId && subs.get(t.subjectId); return { sub: s ? s.name : '—', c: colorOf(subs, t.subjectId), text: t.text, m: t.state || 0 }; })];
  left.firstChild.append(headEl(x.date, x, opts.ddays || [], moodRowEl(x.mood, null)),
    h('div', { class: 'pd-sec' }, lbl('오늘의 목표'), h('div', { class: 'pd-goal' }, ringEl(x.minutes, x.goalMin || 0),
      h('div', { class: 'pd-goal-t' }, h('div', null, h('span', { class: 'pd-k' }, '공부한 시간'), h('b', { class: 'pd-hand' }, fmtMin(x.minutes))),
        h('div', null, h('span', { class: 'pd-k' }, '목표'), h('b', { class: 'pd-hand' }, x.goalMin ? fmtMin(x.goalMin) : '—'))))),
    h('div', { class: 'pd-sec pd-grow' }, lbl('할 일', h('span', { class: 'pd-cnt' }, x.todoTotal ? `${x.todoDone}/${x.todoTotal}` : '')),
      h('div', { class: 'pd-tbl' }, h('div', { class: 'pd-th' }, h('span', null, '과목'), h('span', null, '할 일'), h('span', null, '○△×')),
        todos.length ? todos.slice(0, 14).map((t) => h('div', { class: 'pd-tr' + (t.m === 1 ? ' done' : '') }, h('span', { class: 'pd-sub', style: { '--c': t.c || NO_SUBJECT } }, t.sub), h('span', { class: 'pd-txt' }, t.text), h('span', { class: `pd-mark m${t.m}` }, MARKS[t.m])))
          : h('div', { class: 'pd-tr empty' }, h('span', { class: 'pd-sub' }), h('span', { class: 'pd-txt pd-none' }, '—'), h('span')))),
    h('div', { class: 'pd-sec' }, lbl('돌아보기', x.rating ? h('span', { class: 'pd-stars' }, '★'.repeat(x.rating).split('').map(() => h('button', { class: 'on', disabled: true }, '★'))) : null),
      h('p', { class: 'pd-lines' }, x.reflection || '')));
  const slots = x.slots || {};
  const tt = ttGrid((i) => [slots[i], false], () => subs);
  tt.paintAll();
  right.firstChild.append(h('div', { class: 'pd-sec' }, lbl('타임테이블', h('span', { class: 'pd-cnt' }, fmtMin(x.minutes))), tt.grid),
    h('div', { class: 'pd-sec' }, lbl('과목별 시간'), subTotals(slots, subs)));
  addOrnaments([left, right], opts.theme);
  paintDecos([left, right], x.decos || [], opts);
  return [left, right];
}

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


/* ================= 책장: 책등이 꽂힌 선반 ================= */
async function shelfPage(view, u) {
  setTitle('플래너 북');
  let r;
  try { [r] = await Promise.all([api.get('planner.months', u ? { u } : {}), packsReady]); } catch (e) { view.append(h('div', { class: 'card empty' }, e.message)); return; }
  view.append(topBar('book', { date: today(), u, owner: r.owner, mine: r.mine }));
  view.append(h('div', { class: 'pl-shelf-head' }, h('h2', null, r.mine ? '내 책장' : `${r.owner.name}의 책장`), h('p', { class: 'small muted' }, '한 달이 한 권이 돼요. 책을 눌러 펼쳐 보세요')));
  const rows = [];
  const months = [...r.months].reverse();   // 왼쪽부터 오래된 달 → 이번 달
  for (let i = 0; i < months.length; i += 8) rows.push(months.slice(i, i + 8));
  view.append(h('div', { class: 'sh' }, rows.map((row) => h('div', { class: 'sh-row' },
    h('div', { class: 'sh-books' }, row.map((m, i) => {
      const [y, mo] = m.ym.split('-').map(Number);
      const art = ART[m.cover.style];
      return h('a', { class: `sh-book cv-${m.cover.style}` + (art ? ` sh-art art-${art.theme}` : '') + (m.current ? ' cur' : ''), href: `#/planner/book/${m.ym}${uq(u)}`, style: { '--hgt': `${88 + ((mo * 7 + y) % 4) * 4}%`, '--tilt': i === 0 && row.length > 2 ? '4deg' : '0deg', ...(art ? { '--cv-bg': art.bg, '--cv-art': `url("${new URL(`assets/covers/${m.cover.style}.jpg`, location.href).href}")` } : {}) }, 'aria-label': `${y}년 ${mo}월 플래너 북${m.current ? ', 작성 중' : ''}` },
        h('span', { class: 'cv-pat', 'aria-hidden': 'true' }),
        h('span', { class: 'sh-m' }, mo, h('small', null, '월')), h('span', { class: 'sh-y' }, y),
        h('span', { class: 'sh-t' }, m.studyMinutes ? shortMin(m.studyMinutes) : ''),
        m.current ? h('span', { class: 'sh-ribbon' }) : null);
    }), row === rows[rows.length - 1] && r.mine ? h('span', { class: 'sh-next', 'aria-hidden': 'true' }, '다음 달') : null), h('div', { class: 'sh-board' })))));
}

/* ================= 한 달 플래너 북 ================= */
/* 표지 디자인 8종: 납작한 색 + 큼직한 숫자 + 패턴 하나 (달마다 고를 수 있어요) */
const COVERS = [
  ['lavender', '라벤더 체크'], ['strawberry', '딸기우유'], ['mint', '민트 물결'], ['lemon', '레몬 무지개'],
  ['night', '밤하늘 모눈'], ['oat', '오트밀 줄무늬'], ['matcha', '말차 데이지'], ['mono', '모노 핑크'],
];
/* 그림 표지 8종: 고르면 그 달 속지도 같은 분위기로 바뀌어요 (theme) */
const ART = {
  cute: { name: '귀여운 친구들', bg: '#c7e1fd', fit: 'cover', theme: 'cute' },
  'classic-ivory': { name: '클래식 아이보리', bg: '#ece4d6', fit: 'cover', theme: 'classic' },
  'classic-green': { name: '클래식 올리브', bg: '#4b5a3b', fit: 'cover', theme: 'classic' },
  'classic-wine': { name: '클래식 와인', bg: '#5a2426', fit: 'cover', theme: 'classic' },
  'classic-plaid': { name: '클래식 체크', bg: '#6c5646', fit: 'cover', theme: 'classic' },
  modern: { name: '모던 네이비', bg: '#2f3a52', fit: 'contain', theme: 'modern' },
  'fem-ribbon': { name: '핑크 리본', bg: '#f6e3e3', fit: 'contain', theme: 'feminine' },
  'fem-tulip': { name: '핑크 튤립', bg: '#f4e2dc', fit: 'contain', theme: 'feminine' },
};
const themeOf = (style) => (ART[style] ? ART[style].theme : 'grid');
const coverName = (style) => (ART[style] ? ART[style].name : (COVERS.find((c) => c[0] === style) || ['', ''])[1]);
function coverEl(Y, M, who, cover, sub) {
  const art = ART[cover.style];
  if (art) {
    return h('div', { class: `bk-page cv cv-art art-${art.theme}`, style: { '--cv-bg': art.bg } },
      h('img', { class: 'cv-img', src: `assets/covers/${cover.style}.jpg`, alt: '', draggable: 'false', style: { 'object-fit': art.fit } }),
      h('div', { class: 'cv-badge' }, h('b', null, M, h('small', null, '월')), h('span', null, who)),
      cover.motto || sub ? h('div', { class: 'cv-tag' }, cover.motto ? h('span', { class: 'cv-motto' }, cover.motto) : null, sub ? h('small', null, sub) : null) : null);
  }
  return h('div', { class: `bk-page cv cv-${cover.style}` },
    h('span', { class: 'cv-pat', 'aria-hidden': 'true' }),
    h('div', { class: 'cv-top' }, h('span', null, Y), h('span', null, '공부 기록')),
    h('div', { class: 'cv-num', 'aria-hidden': 'true' }, M),
    h('div', { class: 'cv-name' }, h('b', null, `${who}의 ${M}월`), cover.motto ? h('span', { class: 'cv-motto' }, cover.motto) : null, sub ? h('small', null, sub) : null));
}
function coverModal(ym, cur, who, onSave) {
  const [Y, M] = ym.split('-').map(Number);
  let style = cur.style;
  const artGrid = h('div', { class: 'cv-grid' }), flatGrid = h('div', { class: 'cv-grid' });
  const opt = (k, label) => h('button', { type: 'button', class: 'cv-opt' + (k === style ? ' on' : ''), 'aria-pressed': String(k === style), onclick: () => { style = k; paint(); } },
    coverEl(Y, M, who, { style: k, motto: '' }), h('span', null, label));
  const paint = () => {
    artGrid.replaceChildren(...Object.entries(ART).map(([k, a]) => opt(k, a.name)));
    flatGrid.replaceChildren(...COVERS.map(([k, label]) => opt(k, label)));
  };
  paint();
  const grid = h('div', { class: 'cv-groups' },
    h('h3', { class: 'cv-gh' }, '그림 다이어리', h('small', null, '속지도 같은 분위기로 바뀌어요')), artGrid,
    h('h3', { class: 'cv-gh' }, '심플 표지', h('small', null, '속지는 모눈 종이')), flatGrid);
  const motto = h('input', { class: 'input', maxlength: '40', value: cur.motto || '', placeholder: '예: 꾸준함이 이긴다', 'aria-label': '좌우명' });
  const m = modal(h('form', { class: 'form', onsubmit: async (e) => {
    e.preventDefault();
    try { const r = await api.post('planner.cover_save', { ym, style, motto: motto.value.trim() }); m.close(); onSave(r.cover); toast('표지를 바꿨어요'); } catch (er) { errToast(er); }
  } }, h('h2', null, `${M}월 표지`), grid, h('label', { class: 'field' }, '표지에 쓸 한 줄 (선택)', motto), h('div', { class: 'row end' }, h('button', { type: 'submit', class: 'btn primary' }, '이 표지로 하기'))), { wide: true });
}
async function bookPage(view, ym, u) {
  const [Y, M] = ym.split('-').map(Number);
  setTitle(`${M}월 플래너 북`);
  let r;
  try { [r] = await Promise.all([api.get('planner.month', u ? { ym, u } : { ym }), packsReady]); } catch (e) { view.append(h('div', { class: 'card empty' }, e.message)); return; }
  const subs = subjectMap(r.subjects);
  let cover = r.cover;
  const color = BOOK_COLORS[(M - 1) % 12];
  const who = r.mine ? (state.me && state.me.name) : r.owner.name;
  const days = r.days;
  const filled = days.filter((x) => x.minutes || x.todoTotal || x.reflection || x.mood || (x.decos && x.decos.length));
  const total = days.reduce((s, x) => s + x.minutes, 0);
  const best = days.reduce((b, x) => (x.minutes > (b ? b.minutes : 0) ? x : b), null);
  const goalDays = days.filter((x) => x.goalMin && x.minutes >= x.goalMin).length;
  let streak = 0, run = 0;
  for (const x of days) { if (x.minutes > 0) { run++; streak = Math.max(streak, run); } else run = 0; }
  const allSlots = {};
  let k = 0;
  for (const x of days) for (const sid of Object.values(x.slots || {})) allSlots[k++] = sid;
  const opts = { photos: r.photos || {}, u, get theme() { return themeOf(cover.style); } };

  /* 쪽: 표지 / (달력 · 한 달 정리) / (그날 왼쪽 · 오른쪽)… / 뒤표지 */
  const calendarPage = () => {
    const first = parseD(`${ym}-01`).getDay();
    const maxM = Math.max(60, ...days.map((x) => x.minutes));
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(h('span', { class: 'bk-cal-c empty' }));
    for (const x of days) {
      const lv = x.minutes ? Math.min(4, Math.ceil((x.minutes / maxM) * 4)) : 0;
      cells.push(h('span', { class: `bk-cal-c lv${lv}`, style: { '--b': color } }, h('b', null, Number(x.date.slice(8))), x.mood ? h('em', null, MOODS[x.mood - 1][0]) : null, x.minutes ? h('small', null, shortMin(x.minutes)) : null));
    }
    return h('section', { class: 'pd-page bk-inner' }, h('div', { class: 'pd-in' },
      h('div', { class: 'bk-title pd-hand' }, `${M}월`), lbl('한 달 달력'),
      h('div', { class: 'bk-cal' }, WD.map((w0) => h('span', { class: 'bk-cal-w' }, w0)), cells),
      r.ddays.length ? h('div', { class: 'pd-sec' }, lbl('이달의 D-day'), h('div', { class: 'pd-dd wrap' }, r.ddays.map((x) => h('span', { style: { '--c': x.color } }, h('b', null, `${Number(x.day.slice(5, 7))}/${Number(x.day.slice(8))}`), x.title)))) : null));
  };
  const statsPage = () => h('section', { class: 'pd-page bk-inner' }, h('div', { class: 'pd-in' },
    h('div', { class: 'bk-title pd-hand' }, '한 달 정리'),
    h('div', { class: 'bk-stats' },
      bkStat('총 공부', fmtMin(total)), bkStat('공부한 날', `${days.filter((x) => x.minutes).length}일`), bkStat('가장 길게 이어서', `${streak}일`),
      bkStat('목표 달성', `${goalDays}일`), bkStat('가장 많이 한 날', best ? `${Number(best.date.slice(8))}일 ${fmtMin(best.minutes)}` : '—'),
      bkStat('할 일 끝냄', (() => { const a = days.reduce((s, x) => s + x.todoTotal, 0); return a ? `${Math.round((days.reduce((s, x) => s + x.todoDone, 0) / a) * 100)}%` : '—'; })())),
    h('div', { class: 'pd-sec' }, lbl('과목별 시간'), subTotals(allSlots, subs)),
    h('p', { class: 'bk-note pd-hand' }, filled.length ? '이번 달도 수고했어요. 다음 장부터 하루하루가 이어져요' : '아직 기록이 없어요. 하루 플래너를 쓰면 여기부터 한 장씩 쌓여요')));
  const backCover = () => h('div', { class: `bk-page cv cv-back cv-${cover.style}` }, h('span', { class: 'cv-pat', 'aria-hidden': 'true' }), h('span', { class: 'cv-back-t' }, '공부 친구'));
  const pages = [() => coverEl(Y, M, who, cover, `${fmtMin(total)} · ${filled.length}일의 기록`), calendarPage, statsPage];
  const cache = new Map();
  for (const x of filled) { const get = (i) => { if (!cache.has(x.date)) cache.set(x.date, staticSpread(x, subs, { ...opts, theme: opts.theme, ddays: r.ddays.filter((y) => y.day >= x.date) })); return cache.get(x.date)[i]; }; pages.push(() => get(0), () => get(1)); }
  pages.push(backCover);
  const pageEl = (i) => (i >= 0 && i < pages.length ? pages[i]() : h('div', { class: 'bk-blank' }));

  /* 넘겨 보기: 넓은 화면은 펼침면(왼쪽·오른쪽), 휴대폰은 한 쪽씩 */
  const wide = () => window.matchMedia('(min-width: 900px)').matches;
  let at = 0;
  const stage = h('div', { class: 'bk-stage' });
  const counter = h('span', { class: 'small muted' });
  const prevB = h('button', { type: 'button', class: 'btn icon bk-nav', 'aria-label': '앞 장', onclick: () => go(-1) }, icon('back'));
  const nextB = h('button', { type: 'button', class: 'btn icon bk-nav', 'aria-label': '다음 장', onclick: () => go(1) }, icon('next'));
  const spreadIdx = () => (wide() ? (at === 0 ? [-1, 0] : [at, at + 1]) : [at]);
  function render(dir = 0) {
    const idx = spreadIdx();
    const book = h('div', { class: `bk-book theme-${themeOf(cover.style)}` + (wide() ? ' two' : ' one') + (dir > 0 ? ' turn-next' : dir < 0 ? ' turn-prev' : '') + (idx[0] === -1 ? ' closed' : '') }, ...idx.map(pageEl));
    stage.replaceChildren(book);
    const last = pages.length - 1;
    prevB.disabled = at === 0;
    nextB.disabled = wide() ? (at === 0 ? last < 1 : at + 1 >= last) : at >= last;
    const dayOf = (i) => { const n = i - 3; return n >= 0 && n < filled.length * 2 ? filled[Math.floor(n / 2)].date : null; };
    const dd = dayOf(idx[idx.length - 1]) || dayOf(idx[0]);
    counter.textContent = dd ? `${Number(dd.slice(5, 7))}월 ${Number(dd.slice(8))}일` : at === 0 ? '표지' : at >= last - 1 ? '뒤표지' : '한 달 정리';
  }
  function go(dir) {
    if (wide()) { if (dir > 0) at = at === 0 ? 1 : at + 2; else at = at <= 1 ? 0 : at - 2; at = Math.max(0, Math.min(at, pages.length - 1)); }
    else at = Math.max(0, Math.min(pages.length - 1, at + dir));
    render(dir);
  }
  const onKey = (e) => { if (e.target.closest && e.target.closest('input,textarea,select')) return; if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
  document.addEventListener('keydown', onKey);
  let sx = null;
  stage.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', (e) => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); });
  const onResize = () => { if (wide() && at > 0 && at % 2 === 0) at -= 1; render(); };
  window.addEventListener('resize', onResize);

  function printBook() {
    cache.clear();   // 인쇄용은 새로 그려요 (책에 보이는 쪽을 빼 가지 않게)
    const all = h('div', { class: `bk-print theme-${themeOf(cover.style)}` }, pages.map((f) => f()));
    cache.clear();
    document.body.append(all); document.body.classList.add('bk-printing');
    const done = () => { all.remove(); document.body.classList.remove('bk-printing'); window.removeEventListener('afterprint', done); render(); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 1000); }, 300);
  }
  view.append(topBar('book', { date: `${ym}-01`, u, owner: r.owner, mine: r.mine }),
    h('div', { class: 'bk-bar' }, h('a', { class: 'btn ghost sm', href: `#/planner/books${uq(u)}` }, icon('back'), '책장'), h('b', null, `${Y}년 ${M}월`), counter, h('span', { class: 'grow' }),
      r.mine ? h('button', { type: 'button', class: 'btn sm', onclick: () => coverModal(ym, cover, who, (c) => { cover = c; cache.clear(); render(); }) }, icon('draw'), '다이어리 고르기') : null,
      h('button', { type: 'button', class: 'btn sm', onclick: printBook }, icon('download'), 'PDF로 저장')),
    h('div', { class: 'bk-wrap' }, prevB, stage, nextB));
  render();
  return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
}
const bkStat = (k, v) => h('div', { class: 'bk-stat' }, h('span', null, k), h('b', { class: 'pd-hand' }, v));
