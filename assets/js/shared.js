/* 여러 화면이 같이 쓰는 큰 조각: 일정 보기·편집 창, 할 일 한 줄, 응원 보내기 */
import { state, api, h, icon, avatar, toast, errToast, modal, confirmBtn, visibilityPicker, colorPicker, mdw } from './core.js';

/* 친구 일정 보기 (읽기 전용) */
export function showEvent(e) {
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

/* 내 일정 추가·고치기. onSaved(저장된 날짜) */
export function editEvent(e, date, onSaved) {
  const isNew = !e;
  e = e || { title: '', memo: '', startDate: date, endDate: date, startTime: null, endTime: null, color: state.me.color, visibility: 'friends', shares: [] };
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
      m.close(); toast(isNew ? '일정을 추가했어요' : '일정을 고쳤어요'); if (onSaved) onSaved(sd.value);
    } catch (ex) { err.textContent = ex.message; } finally { save.disabled = false; }
  } },
    h('label', { class: 'field' }, '일정 이름', title),
    h('div', { class: 'two' }, h('label', { class: 'field' }, '시작 날짜', sd), h('label', { class: 'field' }, '끝 날짜', ed)),
    h('label', { class: 'check-line' }, allDay, '하루 종일'), times,
    h('label', { class: 'field' }, '메모', memo), color.el, vis.el, err,
    h('div', { class: 'actions' },
      isNew ? null : h('span', { class: 'left' }, confirmBtn('삭제', '한 번 더 누르면 삭제', async () => {
        try { await api.post('events.delete', { id: e.id }); m.close(); toast('일정을 지웠어요'); if (onSaved) onSaved(null); } catch (ex) { errToast(ex); }
      })),
      h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, '취소'), save));
  const m = modal([h('h2', null, isNew ? '일정 추가' : '일정 고치기'), h('p', { class: 'lead' }, '공개 범위에 따라 친구 캘린더에도 보여요'), form]);
}

/* 일정 한 줄 (누르면 내 것은 고치기, 친구 것은 보기) */
export function eventRow(e, onChanged) {
  const VIS = { private: '나만', friends: '친구 모두', selected: '고른 친구' };
  const when = e.startDate !== e.endDate ? `${e.startDate.slice(5).replace('-', '/')} ~ ${e.endDate.slice(5).replace('-', '/')}` : '';
  const time = e.startTime ? e.startTime + (e.endTime ? ' ~ ' + e.endTime : '') : '하루 종일';
  return h('button', { type: 'button', class: 'evrow', style: { '--c': e.color }, onclick: () => (e.mine ? editEvent(e, null, onChanged) : showEvent(e)) },
    h('span', { class: 'stripe' }),
    h('span', null, h('div', { class: 't' }, e.title),
      h('div', { class: 's' }, avatar(e.owner, 'sm'), e.mine ? '나' : e.owner.name, '·', time, when ? '· ' + when : null, e.mine && e.visibility ? h('span', { class: 'pill' }, VIS[e.visibility]) : null)));
}

/* 할 일 한 줄. canCheck 일 때만 체크할 수 있어요.
   공동 계획 할 일이면 오른쪽에 체크한 사람들 얼굴이 보여요 (people: 공동 계획 참여자 정보 목록) */
export function taskLine(t, { canCheck = !!t.mine, showPlan = false, people = null, onToggled, actions = null } = {}) {
  const color = t.planColor || 'var(--me)';
  const btn = h('button', { type: 'button', class: 'check', style: { '--c': color }, 'aria-pressed': String(!!t.done), disabled: !canCheck,
    'aria-label': (t.subject ? t.subject + ' ' : '') + t.content + (t.done ? ' 끝냄' : '') }, icon('check'));
  const right = h('span', { class: 'row', style: { gap: '6px', 'flex-wrap': 'nowrap' } });
  if (t.checks && people) {
    const faces = h('span', { class: 'faces', title: '끝낸 사람' });
    for (const uid of t.checks) { const u = people.find((p) => p.id === uid); if (u) faces.append(avatar(u, 'xs')); }
    right.append(faces);
  }
  if (t.kind === 'group' || t.checks) right.append(h('span', { class: 'pill accent', style: { padding: '1px 7px' } }, '공동'));
  if (showPlan && t.planId) right.append(h('a', { class: 'tiny muted', href: '#/study/plan/' + t.planId, onclick: (e) => e.stopPropagation() }, t.planTitle));
  if (actions) right.append(actions);
  const li = h('li', { class: 'task' + (t.done ? ' done' : '') + (canCheck ? ' can' : '') }, btn,
    h('span', { class: 'tx' }, t.subject ? h('b', null, t.subject) : null, h('span', null, t.content)), right);
  if (canCheck) li.addEventListener('click', async () => {
    const was = !!t.done; t.done = !was;
    const paint = () => { li.classList.toggle('done', !!t.done); btn.setAttribute('aria-pressed', String(!!t.done)); };
    paint();
    if (t.checks) t.checks = t.done ? [...t.checks, state.me.id] : t.checks.filter((x) => x !== state.me.id);
    try { await api.post('tasks.toggle', { id: t.id, done: t.done }); if (onToggled) onToggled(t); }
    catch (e) { t.done = was; if (t.checks) t.checks = was ? [...t.checks, state.me.id] : t.checks.filter((x) => x !== state.me.id); paint(); errToast(e); }
  });
  return li;
}

/* 응원 메시지 보내기 */
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
