/* 공부: 타이머, 친구들 공부 상태, 주간 공부 시간, 공부 계획 (혼자 계획 / 공동 계획) */
import { state, api, h, icon, avatar, toast, errToast, modal, confirmBtn, visibilityPicker, colorPicker, loadFriends, every, setTitle, pageHead,
  WD, parseD, parseDT, today, addDays, md, mdw, fmtDur, VIS_LABEL, visIcon, app } from '../core.js';
import { taskLine, cheerModal } from '../shared.js';

export default function mount(view, route) {
  if (route.params[0] === 'plan' && route.params[1]) return planPage(view, Number(route.params[1]));
  return dashboard(view);
}

/* 서버 시각과 내 기기 시각 차이를 맞춰 '몇 분째'를 계산 */
let skew = 0;
function setNow(serverNow) { if (serverNow) skew = parseDT(serverNow).getTime() - Date.now(); }
function elapsed(since) { return since ? Math.max(0, (Date.now() + skew - parseDT(since).getTime()) / 1000) : 0; }

/* ===== 공부 첫 화면 ===== */
async function dashboard(view) {
  setTitle('공부');
  const S = { status: { todaySeconds: 0, studyingSince: null, _base: 0 }, friends: [] };
  const timerBig = h('div', { class: 'big' }, '0분');
  const timerBtn = h('button', { class: 'tbtn', type: 'button', onclick: toggleTimer });
  const mates = h('div');
  const weekBox = h('div');
  const todayBox = h('div');
  const groupBox = h('div', { class: 'plans' });
  const plansBox = h('div', { class: 'plans' });

  view.append(
    pageHead('공부', '친구들과 같이 공부 시간과 계획을 나눠요',
      h('button', { class: 'btn', type: 'button', onclick: () => editPlan(null, null, 'group') }, icon('group'), '공동 계획'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => editPlan(null, null, 'personal') }, icon('plus'), '새 계획')),
    h('div', { class: 'study-top' },
      h('div', { class: 'card timer' }, h('p', { class: 'eyebrow' }, '오늘 내가 공부한 시간'), timerBig, timerBtn,
        h('p', { class: 'tiny muted', style: { margin: '10px 0 0' } }, '공부를 시작하면 친구들 화면에 ‘공부 중’으로 보여요')),
      h('div', { class: 'card' }, h('h2', null, '친구들은 지금'), mates)),
    h('div', { class: 'grid2', style: { 'margin-top': '14px' } },
      h('div', { class: 'card' }, h('div', { class: 'row', style: { 'justify-content': 'space-between', 'margin-bottom': '12px' } },
        h('h2', { style: { margin: 0 } }, '오늘 할 일'), h('a', { class: 'btn ghost sm', href: '#/day/' + today() }, '오늘 자세히', icon('next'))), todayBox),
      h('div', { class: 'card' }, h('h2', null, '최근 7일 공부 시간'), weekBox)),
    h('h2', { class: 'sec-title' }, icon('group'), '공동 계획'), groupBox,
    h('h2', { class: 'sec-title' }, icon('study'), '공부 계획'), plansBox);

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
          h('div', { class: 'st' }, on ? [h('span', { class: 'live-dot' }), `공부 중 · ${fmtDur(elapsed(f.studyingSince))}째`] : '쉬는 중', ` · 오늘 ${fmtDur(secs)}`)),
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
    const cols = w.days.map((d, i) => h('a', { href: '#/day/' + d, class: 'wk', title: w.series.map((s) => `${s.mine ? '나' : s.user.name} ${fmtDur(s.seconds[i])}`).join('\n') },
      h('div', { class: 'col' },
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
    const mine = r.tasks.filter((t) => t.mine);
    todayBox.replaceChildren();
    if (!mine.length) { todayBox.append(h('div', { class: 'small muted' }, '오늘 날짜에 잡힌 내 할 일이 없어요. 아래에서 계획을 만들거나 열어 할 일을 추가하세요')); return; }
    const ul = h('ul', { class: 'list' });
    for (const t of mine) ul.append(taskLine(t, { showPlan: true, onToggled: () => loadPlans() }));
    todayBox.append(ul);
  }
  async function loadPlans() {
    const r = await api.get('plans.list');
    const groups = r.plans.filter((p) => p.kind === 'group'), solo = r.plans.filter((p) => p.kind !== 'group');
    groupBox.replaceChildren();
    if (!groups.length) groupBox.append(h('div', { class: 'card empty', style: { 'grid-column': '1/-1' } }, '친구들과 같은 목표를 세워 보세요. 같은 할 일을 각자 체크하고, 같이 공부한 시간을 모아요. ',
      h('button', { class: 'link', type: 'button', onclick: () => editPlan(null, null, 'group') }, '공동 계획 만들기')));
    for (const p of groups) groupBox.append(planCard(p));
    plansBox.replaceChildren();
    if (!solo.length) plansBox.append(h('div', { class: 'card empty', style: { 'grid-column': '1/-1' } }, '아직 공부 계획이 없어요. ‘새 계획’으로 시험 준비표를 만들어 보세요'));
    for (const p of solo) plansBox.append(planCard(p));
  }

  await Promise.all([loadStatus(), loadWeek(), loadToday(), loadPlans()]).catch(errToast);
  const stopTick = every(10000, async () => paintTimer());
  const stopPoll = every(30000, () => Promise.all([loadStatus(), loadToday()]));
  return () => { stopTick(); stopPoll(); };
}

function planCard(p) {
  const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
  const group = p.kind === 'group';
  return h('a', { class: 'plan-card' + (group ? ' group' : ''), href: '#/study/plan/' + p.id },
    h('div', { class: 't' }, h('i', { class: 'dot', style: { '--c': p.color } }), h('span', null, p.title)),
    group
      ? h('div', { class: 'row small muted' }, h('span', { class: 'faces' }, (p.members || []).slice(0, 6).map((u) => avatar(u, 'sm'))), `${(p.members || []).length}명이 같이`)
      : h('div', { class: 'row small muted' }, avatar(p.owner, 'sm'), p.mine ? '나' : p.owner.name, p.mine ? h('span', { class: 'pill' }, visIcon(p.visibility), VIS_LABEL[p.visibility]) : null),
    h('div', { class: 'bar', style: { '--c': p.color } }, h('i', { style: { width: pct + '%' } })),
    h('div', { class: 'meta' }, h('span', null, `${group ? '내 진도 ' : ''}${p.done}/${p.total} · ${pct}%`), h('span', null, p.firstDate ? `${md(p.firstDate)} – ${md(p.lastDate)}` : '할 일 없음')),
    p.goal ? h('div', { class: 'tiny muted row' }, icon('target'), `목표 ${p.goal.hours}시간 · ${md(p.goal.from)}–${md(p.goal.to)}`) : null);
}

/* 계획 만들기/설정. kind: personal(혼자) / group(공동) */
function editPlan(p, onSaved, kind) {
  const isNew = !p;
  kind = p ? p.kind : kind;
  const group = kind === 'group';
  p = p || { title: '', color: state.me.color, visibility: 'friends', shares: [], memberIds: [], goal: null };
  const title = h('input', { maxlength: '100', value: p.title, placeholder: group ? '예: 같이 기말고사 끝내기' : '예: 2학기 기말고사 준비' });
  const color = colorPicker(p.color);
  const vis = group ? null : visibilityPicker(p.visibility, p.shares);
  /* 공동 계획 참여자 고르기 (내 친구 중에서) */
  const chosen = new Set((p.memberIds || []).map(Number));
  const who = h('div', { class: 'who' }, h('span', { class: 'tiny muted' }, '친구 목록을 불러오는 중…'));
  if (group) loadFriends().then((fr) => {
    who.replaceChildren();
    if (!fr.length) { who.append(h('span', { class: 'tiny muted' }, '아직 친구가 없어요. 친구를 먼저 추가하세요')); return; }
    for (const f of fr) {
      const cb = h('input', { type: 'checkbox', checked: chosen.has(f.id), onchange: (e) => { e.target.checked ? chosen.add(f.id) : chosen.delete(f.id); } });
      who.append(h('label', null, cb, avatar(f, 'sm'), f.name));
    }
  }).catch(() => {});
  /* 공동 목표: 기간 동안 모두 합쳐 공부할 시간 */
  const g = p.goal || {};
  const goalOn = h('input', { type: 'checkbox', checked: !!p.goal, onchange: () => { goalBox.hidden = !goalOn.checked; } });
  const goalHours = h('input', { type: 'number', min: '1', max: '10000', value: g.hours || (group ? 30 : 10), inputmode: 'numeric' });
  const goalFrom = h('input', { type: 'date', value: g.from || today() });
  const goalTo = h('input', { type: 'date', value: g.to || addDays(today(), 6) });
  const goalBox = h('div', { class: 'form', hidden: !p.goal },
    h('label', { class: 'field' }, group ? '모두 합쳐 공부할 시간 (시간)' : '공부할 시간 (시간)', goalHours),
    h('div', { class: 'two' }, h('label', { class: 'field' }, '시작', goalFrom), h('label', { class: 'field' }, '끝', goalTo)));
  const err = h('div', { class: 'err', role: 'alert' });
  const save = h('button', { class: 'btn primary', type: 'submit' }, isNew ? '만들기' : '저장');
  const m = modal([h('h2', null, isNew ? (group ? '공동 계획 만들기' : '새 공부 계획') : (group ? '공동 계획 설정' : '계획 설정')),
    h('p', { class: 'lead' }, group ? '고른 친구들과 같은 할 일 목록을 같이 써요. 할 일은 누구나 추가할 수 있고, 체크는 각자 해요'
      : '할 일은 계획을 만든 뒤 날짜별로 추가해요. 체크는 만든 사람만 할 수 있어요'),
    h('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      if (group && isNew && !chosen.size) { err.textContent = '같이 할 친구를 한 명 이상 골라 주세요'; return; }
      save.disabled = true;
      try {
        const body = { id: p.id, kind, title: title.value, color: color.value(),
          goalHours: goalOn.checked ? goalHours.value : 0, goalFrom: goalFrom.value, goalTo: goalTo.value };
        if (group) body.members = [...chosen]; else Object.assign(body, vis.value());
        const r = await api.post('plans.save', body);
        m.close(); toast(isNew ? '계획을 만들었어요' : '저장했어요');
        if (isNew) app.go('study/plan/' + r.id); else if (onSaved) onSaved();
      } catch (ex) { err.textContent = ex.message; } finally { save.disabled = false; }
    } }, h('label', { class: 'field' }, '계획 이름', title), color.el,
      group ? h('div', { class: 'vis' }, h('div', { class: 'field' }, '같이 할 친구'), who) : vis.el,
      h('label', { class: 'check-line' }, goalOn, group ? '공동 목표 시간 정하기' : '목표 공부 시간 정하기'), goalBox, err,
      h('div', { class: 'actions' },
        isNew ? null : h('span', { class: 'left' }, confirmBtn('계획 삭제', '한 번 더 누르면 할 일까지 모두 삭제', async () => {
          try { await api.post('plans.delete', { id: p.id }); m.close(); toast('계획을 지웠어요'); app.go('study'); } catch (ex) { errToast(ex); }
        })),
        h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, '취소'), save))]);
}

/* ===== 계획 한 개 ===== */
async function planPage(view, id) {
  let plan, tasks;
  let lastDate = null, lastSubject = '';
  const headBox = h('div');
  const groupBox = h('div');
  const addBox = h('div');
  const listBox = h('div', { class: 'card' });
  view.append(h('a', { class: 'btn ghost sm', href: '#/study', style: { 'margin-bottom': '8px' } }, icon('back'), '공부'), headBox, groupBox, addBox, listBox);

  async function load() {
    const r = await api.get('plans.get', { id });
    plan = r.plan; tasks = r.tasks;
    setTitle(plan.title);
    paint();
  }
  const isGroup = () => plan.kind === 'group';
  const people = () => plan.members || [plan.owner];

  function paint() {
    const done = tasks.filter((t) => t.done).length, pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    headBox.replaceChildren(
      pageHead(plan.title, null,
        plan.mine ? h('button', { class: 'btn', type: 'button', onclick: () => editPlan(plan, load) }, icon('gear'), '설정') : null,
        plan.canWork ? h('button', { class: 'btn', type: 'button', onclick: bulk }, icon('plus'), '여러 줄 추가') : null,
        isGroup() && !plan.mine && plan.canWork ? confirmBtn('나가기', '한 번 더 누르면 나가요', async () => {
          try { await api.post('plans.leave', { id: plan.id }); toast('공동 계획에서 나왔어요'); app.go('study'); } catch (e) { errToast(e); }
        }, 'btn ghost') : null,
        !isGroup() && !plan.mine ? h('button', { class: 'btn', type: 'button', onclick: () => cheerModal(plan.owner) }, '응원하기') : null),
      h('div', { class: 'row small muted', style: { 'margin-top': '-8px', 'margin-bottom': '14px' } },
        isGroup() ? [h('span', { class: 'pill accent' }, icon('group'), '공동 계획'), `${plan.owner.name}님이 만듦`]
          : [avatar(plan.owner, 'sm'), plan.mine ? '내 계획' : plan.owner.name + '님의 계획', plan.mine ? h('span', { class: 'pill' }, visIcon(plan.visibility), VIS_LABEL[plan.visibility]) : null],
        h('span', { class: 'grow' }),
        h('span', null, `${isGroup() ? '내 진도 ' : ''}${done}/${tasks.length} · ${pct}%`)),
      h('div', { class: 'bar', style: { '--c': plan.color, 'margin-bottom': '14px' } }, h('i', { style: { width: pct + '%' } })));
    paintGroup();
    addBox.replaceChildren(plan.canWork ? addForm() : h('div'));
    paintList();
  }

  /* 공동 계획: 사람별 진도와 공동 목표 */
  function paintGroup() {
    groupBox.replaceChildren();
    const goal = plan.goal;
    if (!isGroup() && !goal) return;
    const card = h('div', { class: 'card', style: { 'margin-bottom': '14px' } });
    if (goal) {
      const total = plan.goalSeconds || 0;
      const goalSecs = goal.hours * 3600;
      const ended = today() > goal.to, notYet = today() < goal.from;
      const left = Math.max(0, Math.round((parseD(goal.to) - parseD(today())) / 86400000));
      card.append(h('div', { class: 'goal' },
        h('div', { class: 'row', style: { 'justify-content': 'space-between' } },
          h('h2', { style: { margin: 0 } }, icon('target'), isGroup() ? ' 공동 목표' : ' 목표'),
          h('span', { class: 'small muted' }, `${mdw(goal.from)} ~ ${mdw(goal.to)}` + (ended ? ' · 끝남' : notYet ? ' · 시작 전' : ` · ${left}일 남음`))),
        h('div', { class: 'goal-num' }, h('b', null, fmtDur(total)), h('span', null, ` / ${goal.hours}시간`),
          h('span', { class: 'pill' + (total >= goalSecs ? ' live' : '') }, total >= goalSecs ? '달성!' : `${Math.round(total / goalSecs * 100)}%`)),
        isGroup() ? stackBar(plan.members, goalSecs) : h('div', { class: 'bar', style: { '--c': plan.color } }, h('i', { style: { width: Math.min(100, total / goalSecs * 100) + '%' } })),
        h('p', { class: 'tiny muted', style: { margin: '8px 0 0' } }, isGroup() ? '참여한 사람들이 이 기간에 공부 타이머로 잰 시간을 모두 더해요' : '이 기간에 공부 타이머로 잰 시간이 모여요')));
    }
    if (isGroup()) {
      card.append(h('div', { class: 'sec-label' }, '사람별 진도'));
      const n = tasks.length;
      for (const u of plan.members) {
        card.append(h('div', { class: 'member' }, avatar(u), h('div', { class: 'grow', style: { 'min-width': '0' } },
          h('div', { class: 'row', style: { 'justify-content': 'space-between' } }, h('b', null, u.name, u.isOwner ? h('span', { class: 'tiny muted' }, ' · 만든 사람') : null),
            h('span', { class: 'small muted' }, `${u.done}/${n}` + (goal ? ` · ${fmtDur(u.goalSeconds)}` : ''))),
          h('div', { class: 'bar', style: { '--c': u.color } }, h('i', { style: { width: (n ? u.done / n * 100 : 0) + '%' } })))));
      }
    }
    groupBox.append(card);
  }
  function stackBar(members, goalSecs) {
    const bar = h('div', { class: 'stack', title: members.map((u) => `${u.name} ${fmtDur(u.goalSeconds)}`).join('\n') });
    for (const u of members) if (u.goalSeconds) bar.append(h('i', { style: { '--c': u.color, width: Math.min(100, u.goalSeconds / goalSecs * 100) + '%' } }));
    return bar;
  }

  function paintList() {
    listBox.replaceChildren();
    if (!tasks.length) { listBox.append(h('div', { class: 'empty' }, plan.canWork ? '위에서 날짜·과목·할 일을 넣어 추가하세요' : '아직 할 일이 없어요')); return; }
    const T = today();
    const by = new Map();
    for (const t of tasks) { if (!by.has(t.date)) by.set(t.date, []); by.get(t.date).push(t); }
    for (const [d, list] of by) {
      const dd = parseD(d);
      const ul = h('ul', { class: 'list' });
      for (const t of list) {
        const task = { ...t, planColor: plan.color, planTitle: plan.title, kind: plan.kind };
        const actions = plan.canWork ? h('span', { class: 'acts' },
          h('button', { class: 'btn ghost icon sm', type: 'button', 'aria-label': '고치기', onclick: (e) => { e.stopPropagation(); editTask(t); } }, icon('edit')),
          h('button', { class: 'btn ghost icon sm', type: 'button', 'aria-label': '지우기', onclick: (e) => { e.stopPropagation(); delTask(t); } }, icon('trash'))) : null;
        ul.append(taskLine(task, { canCheck: plan.canWork, people: isGroup() ? people() : null, actions,
          onToggled: (x) => { const o = tasks.find((y) => y.id === x.id); if (o) { o.done = x.done; if (x.checks) o.checks = x.checks; } refreshCounts(); } }));
      }
      listBox.append(h('div', { class: 'date-group' + (d === T ? ' today' : d < T ? ' past' : '') },
        h('a', { class: 'w', href: '#/day/' + d }, h('b', null, `${dd.getMonth() + 1}.${dd.getDate()}`), h('small', null, WD[dd.getDay()] + '요일' + (d === T ? ' · 오늘' : ''))),
        h('div', { style: { 'min-width': '0' } }, ul)));
    }
  }
  /* 체크한 뒤 위쪽 숫자·사람별 진도만 다시 계산 (목록은 그대로) */
  function refreshCounts() {
    if (isGroup()) for (const u of plan.members) u.done = tasks.filter((t) => (t.checks || []).includes(u.id)).length;
    const y = scrollY;
    const done = tasks.filter((t) => t.done).length, pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    headBox.querySelector('.bar i').style.width = pct + '%';
    const label = headBox.querySelector('.row.small.muted > span:last-child'); if (label) label.textContent = `${isGroup() ? '내 진도 ' : ''}${done}/${tasks.length} · ${pct}%`;
    paintGroup(); scrollTo(0, y);
  }

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
        m.close(); const y = scrollY; paint(); scrollTo(0, y);
      } catch (ex) { err.textContent = ex.message; }
    } }, h('label', { class: 'field' }, '날짜', date), h('label', { class: 'field' }, '과목', subject), h('label', { class: 'field' }, '할 일', content), err,
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, '취소'), h('button', { class: 'btn primary', type: 'submit' }, '저장')))]);
  }
  async function delTask(t) {
    try { await api.post('tasks.delete', { id: t.id }); tasks = tasks.filter((x) => x.id !== t.id); const y = scrollY; paint(); scrollTo(0, y); toast('지웠어요'); } catch (e) { errToast(e); }
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
  // 공동 계획이거나 친구 계획이면 다른 사람이 바꾼 내용을 가끔 다시 받아요 (입력 중이 아닐 때)
  return every(30000, async () => {
    if (!isGroup() && plan.mine) return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && view.contains(a)) return;
    if (document.querySelector('.modal-bg')) return;
    const y = scrollY; await load(); scrollTo(0, y);
  });
}
