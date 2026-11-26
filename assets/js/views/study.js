/* 공부: 타이머, 친구들 공부 상태, 주간 공부 시간, 공부 계획(할 일 체크) */
import { state, api, h, icon, avatar, toast, errToast, modal, confirmBtn, visibilityPicker, colorPicker, loadFriends, every, setTitle, pageHead,
  WD, parseD, parseDT, today, addDays, mdw, md, fmtDur, VIS_LABEL, visIcon, app } from '../core.js';

export default function mount(view, route) {
  if (route.params[0] === 'plan' && route.params[1]) return planPage(view, Number(route.params[1]));
  return dashboard(view);
}

/* 서버 시각과 내 기기 시각 차이를 맞춰 '몇 분째'를 계산 */
let skew = 0;
function setNow(serverNow) { if (serverNow) skew = parseDT(serverNow).getTime() - Date.now(); }
function elapsed(since) { return since ? Math.max(0, (Date.now() + skew - parseDT(since).getTime()) / 1000) : 0; }

const CHEERS = ['화이팅!', '같이 공부하자', '오늘도 수고했어', '조금만 더 힘내'];
export function cheerModal(friend) {
  const input = h('input', { maxlength: '200', placeholder: '직접 써서 보내기' });
  async function send(text) {
    if (!text.trim()) return;
    try { await api.post('messages.send', { to: friend.id, body: text.trim() }); m.close(); toast(friend.name + '님에게 보냈어요'); } catch (e) { errToast(e); }
  }
  const m = modal([
    h('h2', null, friend.name + '님 응원하기'), h('p', { class: 'lead' }, '메시지로 바로 보내져요'),
    h('div', { class: 'quick' }, CHEERS.map((c) => h('button', { type: 'button', onclick: () => send(c) }, c))),
    h('form', { class: 'composer', style: { 'border-top': '0' }, onsubmit: (e) => { e.preventDefault(); send(input.value); } }, h('div', { class: 'grow field' }, input), h('button', { class: 'btn primary', type: 'submit' }, icon('send'), '보내기')),
  ]);
}

/* ===== 공부 첫 화면 ===== */
async function dashboard(view) {
  setTitle('공부');
  const S = { status: { todaySeconds: 0, studyingSince: null }, friends: [], week: null, todayTasks: [], plans: [] };
  const timerBig = h('div', { class: 'big' }, '0분');
  const timerBtn = h('button', { class: 'tbtn', type: 'button', onclick: toggleTimer });
  const mates = h('div');
  const weekBox = h('div');
  const todayBox = h('div');
  const plansBox = h('div', { class: 'plans' });

  view.append(
    pageHead('공부', '친구들과 같이 공부 시간과 계획을 나눠요', h('button', { class: 'btn primary', type: 'button', onclick: () => editPlan(null) }, icon('plus'), '새 계획')),
    h('div', { class: 'study-top' },
      h('div', { class: 'card timer' }, h('p', { class: 'eyebrow' }, '오늘 내가 공부한 시간'), timerBig, timerBtn,
        h('p', { class: 'tiny muted', style: { margin: '10px 0 0' } }, '공부를 시작하면 친구들 화면에 ‘공부 중’으로 보여요')),
      h('div', { class: 'card' }, h('h2', null, '친구들은 지금'), mates)),
    h('div', { class: 'grid2', style: { 'margin-top': '14px' } },
      h('div', { class: 'card' }, h('h2', null, '오늘 할 일'), todayBox),
      h('div', { class: 'card' }, h('h2', null, '최근 7일 공부 시간'), weekBox)),
    h('div', { class: 'head', style: { margin: '28px 0 12px' } }, h('h2', { style: { margin: 0, 'font-size': '19px', 'font-weight': '800' } }, '공부 계획')),
    plansBox);

  function paintTimer() {
    const on = !!S.status.studyingSince;
    const total = S.status.todaySeconds + (on ? Math.max(0, elapsed(S.status.studyingSince) - S.status._base) : 0);
    timerBig.textContent = fmtDur(total);
    timerBtn.classList.toggle('on', on);
    timerBtn.replaceChildren(on ? h('span', { class: 'live-dot' }) : icon('play'), on ? '공부 끝내기' : '공부 시작');
    paintMates();
  }
  function setStatus(s) {
    setNow(s.now);
    S.status = { todaySeconds: s.todaySeconds, studyingSince: s.studyingSince, _base: s.studyingSince ? elapsed(s.studyingSince) : 0 };
  }
  async function toggleTimer() {
    timerBtn.disabled = true;
    try {
      const on = !!S.status.studyingSince;
      const s = await api.post(on ? 'study.stop' : 'study.start');
      setStatus(s);
      toast(on ? `오늘 ${fmtDur(s.todaySeconds)} 공부했어요` : '공부를 시작했어요');
      paintTimer();
      if (on) loadWeek();
    } catch (e) { errToast(e); } finally { timerBtn.disabled = false; }
  }
  function paintMates() {
    mates.replaceChildren();
    if (!S.friends.length) {
      mates.append(h('div', { class: 'empty' }, '친구를 추가하면 여기서 서로 공부하는 모습이 보여요', h('br'), h('a', { href: '#/friends' }, '친구 추가하러 가기')));
      return;
    }
    const sorted = [...S.friends].sort((a, b) => (!!b.studyingSince - !!a.studyingSince) || (b.todaySeconds - a.todaySeconds));
    for (const f of sorted) {
      const on = !!f.studyingSince;
      const secs = f.todaySeconds + (on ? Math.max(0, elapsed(f.studyingSince) - f._base) : 0);
      mates.append(h('div', { class: 'mate' }, avatar(f),
        h('div', { style: { 'min-width': '0' } }, h('div', { class: 'nm' }, f.name),
          h('div', { class: 'st' }, on ? [h('span', { class: 'live-dot' }), `공부 중 · ${fmtDur(elapsed(f.studyingSince))}째`] : `쉬는 중`, ` · 오늘 ${fmtDur(secs)}`)),
        h('button', { class: 'btn sm', type: 'button', onclick: () => cheerModal(f) }, '응원')));
    }
  }
  async function loadStatus() {
    const [s, fr] = await Promise.all([api.get('study.status'), loadFriends(true)]);
    setStatus(s);
    S.friends = fr.map((f) => ({ ...f, _base: f.studyingSince ? elapsed(f.studyingSince) : 0 }));
    paintTimer();
  }
  async function loadWeek() {
    const w = await api.get('study.week');
    const max = Math.max(3600, ...w.series.flatMap((s) => s.seconds));
    const T = today();
    const cols = w.days.map((d, i) => h('div', null,
      h('div', { class: 'col', title: w.series.map((s) => `${s.mine ? '나' : s.user.name} ${fmtDur(s.seconds[i])}`).join('\n') },
        w.series.map((s) => h('i', { style: { '--c': s.seconds[i] ? s.user.color : 'var(--line)', height: Math.max(2, Math.round(s.seconds[i] / max * 100)) + '%' } }))),
      h('div', { class: 'lb' + (d === T ? ' today' : '') }, d === T ? '오늘' : WD[parseD(d).getDay()])));
    const mine = w.series.find((s) => s.mine);
    weekBox.replaceChildren(
      h('div', { class: 'legend' }, w.series.map((s) => h('span', null, h('i', { class: 'dot', style: { '--c': s.user.color } }), s.mine ? '나' : s.user.name))),
      h('div', { class: 'week' }, cols),
      h('p', { class: 'small muted', style: { margin: '10px 0 0' } }, `이번 7일 동안 나는 ${fmtDur(mine ? mine.seconds.reduce((a, b) => a + b, 0) : 0)} 공부했어요`));
  }
  async function loadToday() {
    const T = today();
    const r = await api.get('tasks.range', { from: T, to: T });
    const mine = r.tasks.filter((t) => t.mine), others = r.tasks.filter((t) => !t.mine);
    todayBox.replaceChildren();
    if (!mine.length) todayBox.append(h('div', { class: 'small muted' }, '오늘 날짜에 잡힌 내 할 일이 없어요. 아래에서 계획을 만들거나 열어 할 일을 추가하세요'));
    const ul = h('ul', { class: 'list' });
    for (const t of mine) ul.append(taskItem(t, { onChange: loadPlans, showPlan: true }));
    todayBox.append(ul);
    if (others.length) {
      const by = new Map();
      for (const t of others) { if (!by.has(t.owner.id)) by.set(t.owner.id, { u: t.owner, n: 0, d: 0 }); const x = by.get(t.owner.id); x.n++; if (t.done) x.d++; }
      todayBox.append(h('div', { class: 'sec-label' }, '친구들 오늘 진도'));
      for (const { u, n, d } of by.values()) todayBox.append(h('div', { class: 'row small', style: { margin: '6px 0' } }, avatar(u, 'sm'), h('b', null, u.name),
        h('div', { class: 'bar grow', style: { '--c': u.color } }, h('i', { style: { width: (d / n * 100) + '%' } })), h('span', { class: 'muted' }, `${d}/${n}`)));
    }
  }
  async function loadPlans() {
    const r = await api.get('plans.list');
    S.plans = r.plans;
    plansBox.replaceChildren();
    if (!r.plans.length) { plansBox.append(h('div', { class: 'card empty', style: { 'grid-column': '1/-1' } }, '아직 공부 계획이 없어요. ‘새 계획’으로 시험 준비표를 만들어 보세요')); return; }
    for (const p of r.plans) plansBox.append(planCard(p));
  }

  await Promise.all([loadStatus(), loadWeek(), loadToday(), loadPlans()]).catch(errToast);
  const stopTick = every(10000, async () => paintTimer());
  const stopPoll = every(30000, () => Promise.all([loadStatus(), loadToday()]));
  return () => { stopTick(); stopPoll(); };
}

function planCard(p) {
  const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
  return h('a', { class: 'plan-card', href: '#/study/plan/' + p.id },
    h('div', { class: 't' }, h('i', { class: 'dot', style: { '--c': p.color } }), h('span', null, p.title)),
    h('div', { class: 'row small muted' }, avatar(p.owner, 'sm'), p.mine ? '나' : p.owner.name, p.mine ? h('span', { class: 'pill' }, visIcon(p.visibility), VIS_LABEL[p.visibility]) : null),
    h('div', { class: 'bar', style: { '--c': p.color } }, h('i', { style: { width: pct + '%' } })),
    h('div', { class: 'meta' }, h('span', null, `${p.done}/${p.total} 완료 · ${pct}%`), h('span', null, p.firstDate ? `${md(p.firstDate)} – ${md(p.lastDate)}` : '할 일 없음')));
}

/* 할 일 한 줄. 내 것만 체크할 수 있어요 */
function taskItem(t, { onChange, showPlan, onEdit, onDelete } = {}) {
  const color = t.planColor || 'var(--me)';
  const btn = h('button', { type: 'button', class: 'check', style: { '--c': color }, 'aria-pressed': String(!!t.done), disabled: t.mine === false, 'aria-label': (t.subject ? t.subject + ' ' : '') + t.content }, icon('check'));
  const acts = onEdit ? h('span', { class: 'acts' },
    h('button', { class: 'btn ghost icon sm', type: 'button', 'aria-label': '고치기', onclick: (e) => { e.stopPropagation(); onEdit(t); } }, icon('edit')),
    h('button', { class: 'btn ghost icon sm', type: 'button', 'aria-label': '지우기', onclick: (e) => { e.stopPropagation(); onDelete(t); } }, icon('trash'))) : null;
  const li = h('li', { class: 'task' + (t.done ? ' done' : '') + (t.mine !== false ? ' can' : '') }, btn,
    h('span', { class: 'tx' }, t.subject ? h('b', null, t.subject) : null, h('span', null, t.content)),
    showPlan ? h('a', { class: 'tiny muted', href: '#/study/plan/' + t.planId, onclick: (e) => e.stopPropagation() }, t.planTitle) : acts);
  if (t.mine !== false) li.addEventListener('click', async () => {
    t.done = !t.done;
    li.classList.toggle('done', t.done); btn.setAttribute('aria-pressed', String(t.done));
    try {
      await api.post('tasks.toggle', { id: t.id, done: t.done });
      if (onChange) onChange(t);
    } catch (e) { t.done = !t.done; li.classList.toggle('done', t.done); btn.setAttribute('aria-pressed', String(t.done)); errToast(e); }
  });
  return li;
}

/* 계획 만들기/고치기 */
function editPlan(p, onSaved) {
  const isNew = !p;
  p = p || { title: '', color: state.me.color, visibility: 'friends', shares: [] };
  const title = h('input', { maxlength: '100', value: p.title, placeholder: '예: 2학기 기말고사 준비' });
  const color = colorPicker(p.color);
  const vis = visibilityPicker(p.visibility, p.shares);
  const err = h('div', { class: 'err', role: 'alert' });
  const save = h('button', { class: 'btn primary', type: 'submit' }, isNew ? '만들기' : '저장');
  const m = modal([h('h2', null, isNew ? '새 공부 계획' : '계획 설정'),
    h('p', { class: 'lead' }, '할 일은 계획을 만든 뒤 날짜별로 추가해요. 체크는 만든 사람만 할 수 있어요'),
    h('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = ''; save.disabled = true;
      try {
        const r = await api.post('plans.save', { id: p.id, title: title.value, color: color.value(), ...vis.value() });
        m.close(); toast(isNew ? '계획을 만들었어요' : '저장했어요');
        if (isNew) app.go('study/plan/' + r.id); else if (onSaved) onSaved();
      } catch (ex) { err.textContent = ex.message; } finally { save.disabled = false; }
    } }, h('label', { class: 'field' }, '계획 이름', title), color.el, vis.el, err,
      h('div', { class: 'actions' },
        isNew ? null : h('span', { class: 'left' }, confirmBtn('계획 삭제', '한 번 더 누르면 할 일까지 모두 삭제', async () => {
          try { await api.post('plans.delete', { id: p.id }); m.close(); toast('계획을 지웠어요'); app.go('study'); } catch (ex) { errToast(ex); }
        })),
        h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, '취소'), save))]);
}

/* ===== 계획 한 개 ===== */
async function planPage(view, id) {
  let plan, tasks;
  const headBox = h('div');
  const addBox = h('div');
  const listBox = h('div', { class: 'card' });
  view.append(h('a', { class: 'btn ghost sm', href: '#/study', style: { 'margin-bottom': '8px' } }, icon('back'), '공부'), headBox, addBox, listBox);

  async function load() {
    const r = await api.get('plans.get', { id });
    plan = r.plan; tasks = r.tasks;
    setTitle(plan.title);
    paint();
  }
  function paint() {
    const done = tasks.filter((t) => t.done).length, pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    headBox.replaceChildren(
      pageHead(plan.title, null, plan.mine ? h('button', { class: 'btn', type: 'button', onclick: () => editPlan(plan, load) }, icon('gear'), '설정') : null,
        plan.mine ? h('button', { class: 'btn', type: 'button', onclick: bulk }, icon('plus'), '여러 줄 추가') : null,
        plan.mine ? null : h('button', { class: 'btn', type: 'button', onclick: () => cheerModal(plan.owner) }, '응원하기')),
      h('div', { class: 'row small muted', style: { 'margin-top': '-8px', 'margin-bottom': '14px' } }, avatar(plan.owner, 'sm'), plan.mine ? '내 계획' : plan.owner.name + '님의 계획',
        plan.mine ? h('span', { class: 'pill' }, visIcon(plan.visibility), VIS_LABEL[plan.visibility]) : null,
        h('span', { class: 'grow' }),
        h('span', null, `${done}/${tasks.length} 완료 · ${pct}%`)),
      h('div', { class: 'bar', style: { '--c': plan.color, 'margin-bottom': '14px' } }, h('i', { style: { width: pct + '%' } })));
    addBox.replaceChildren(plan.mine ? addForm() : h('div'));
    paintList();
  }
  function paintList() {
    listBox.replaceChildren();
    if (!tasks.length) { listBox.append(h('div', { class: 'empty' }, plan.mine ? '위에서 날짜·과목·할 일을 넣어 추가하세요' : '아직 할 일이 없어요')); return; }
    const T = today();
    const by = new Map();
    for (const t of tasks) { if (!by.has(t.date)) by.set(t.date, []); by.get(t.date).push(t); }
    for (const [d, list] of by) {
      const dd = parseD(d);
      const ul = h('ul', { class: 'list' });
      for (const t of list) ul.append(taskItem({ ...t, mine: plan.mine, planColor: plan.color, planTitle: plan.title }, {
        onChange: (x) => { const o = tasks.find((y) => y.id === x.id); if (o) o.done = x.done; paintHeadOnly(); },
        onEdit: plan.mine ? editTask : null, onDelete: plan.mine ? delTask : null }));
      listBox.append(h('div', { class: 'date-group' + (d === T ? ' today' : d < T ? ' past' : '') },
        h('div', { class: 'w' }, h('b', null, `${dd.getMonth() + 1}.${dd.getDate()}`), h('small', null, WD[dd.getDay()] + '요일' + (d === T ? ' · 오늘' : ''))),
        h('div', { style: { 'min-width': '0' } }, ul)));
    }
  }
  function paintHeadOnly() { const sy = scrollY; paint(); scrollTo(0, sy); }

  function addForm() {
    const date = h('input', { type: 'date', value: lastDate || today() });
    const subject = h('input', { maxlength: '40', placeholder: '과목 (선택)', list: 'subj-list', value: lastSubject });
    const content = h('input', { maxlength: '200', placeholder: '할 일 (예: 9주차 복습)', required: true });
    const subjects = [...new Set(tasks.map((t) => t.subject).filter(Boolean))];
    const btn = h('button', { class: 'btn primary', type: 'submit' }, icon('plus'), '추가');
    return h('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault(); btn.disabled = true;
      try {
        const r = await api.post('tasks.save', { planId: plan.id, date: date.value, subject: subject.value, content: content.value });
        tasks.push(r.task); tasks.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
        lastDate = date.value; lastSubject = subject.value;
        const sy = scrollY; paint(); scrollTo(0, sy);
        const c = addBox.querySelector('input[required]'); if (c) c.focus();
      } catch (ex) { errToast(ex); } finally { btn.disabled = false; }
    } }, h('div', { class: 'add-grid' },
      h('label', { class: 'field' }, '날짜', date), h('label', { class: 'field' }, '과목', subject), h('label', { class: 'field' }, '할 일', content), btn),
      h('datalist', { id: 'subj-list' }, subjects.map((s) => h('option', { value: s }))));
  }
  let lastDate = null, lastSubject = '';

  function editTask(t) {
    const date = h('input', { type: 'date', value: t.date });
    const subject = h('input', { maxlength: '40', value: t.subject });
    const content = h('input', { maxlength: '200', value: t.content });
    const err = h('div', { class: 'err' });
    const m = modal([h('h2', null, '할 일 고치기'), h('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault();
      try {
        const r = await api.post('tasks.save', { id: t.id, date: date.value, subject: subject.value, content: content.value });
        Object.assign(tasks.find((x) => x.id === t.id), r.task); tasks.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
        m.close(); paintHeadOnly();
      } catch (ex) { err.textContent = ex.message; }
    } }, h('label', { class: 'field' }, '날짜', date), h('label', { class: 'field' }, '과목', subject), h('label', { class: 'field' }, '할 일', content), err,
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, '취소'), h('button', { class: 'btn primary', type: 'submit' }, '저장')))]);
  }
  async function delTask(t) {
    try { await api.post('tasks.delete', { id: t.id }); tasks = tasks.filter((x) => x.id !== t.id); paintHeadOnly(); toast('지웠어요'); } catch (e) { errToast(e); }
  }
  function bulk() {
    const ta = h('textarea', { rows: '10', placeholder: '2026-12-01 | DB | 11주차 복습\n2026-12-02 | 프론트엔드 | 11~13주차\n12/3 머신러닝 전체 복습' });
    const err = h('div', { class: 'err' });
    const m = modal([h('h2', null, '여러 줄 한꺼번에 추가'),
      h('p', { class: 'lead' }, '한 줄에 하나씩 “날짜 | 과목 | 할 일” 또는 “12/3 과목 할 일”로 적어요. 연도를 빼면 올해로 들어가요'),
      h('form', { class: 'form', onsubmit: async (e) => {
        e.preventDefault(); err.textContent = '';
        try {
          const r = await api.post('tasks.bulk', { planId: plan.id, text: ta.value });
          m.close(); toast(`${r.added}개 추가했어요` + (r.badLines.length ? ` · ${r.badLines.join(', ')}번째 줄은 형식이 맞지 않아 뺐어요` : ''));
          load();
        } catch (ex) { err.textContent = ex.message; }
      } }, h('label', { class: 'field' }, '할 일 목록', ta), err,
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, '취소'), h('button', { class: 'btn primary', type: 'submit' }, '추가')))], { wide: true });
  }

  try { await load(); } catch (e) {
    view.replaceChildren(h('div', { class: 'card empty' }, e.message, h('br'), h('a', { href: '#/study' }, '공부 화면으로')));
    return;
  }
  return every(45000, async () => { if (!plan.mine) await load(); });
}
