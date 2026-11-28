/* 포도알 판: 목표를 이룰 때마다 한 알씩 칠하고, 다 채우면 배지를 받아요 */
import { state, api, h, icon, avatar, toast, errToast, modal, confirmBtn, setTitle, pageHead, loadFriends, md, ago } from '../core.js';

/* 판 그림에서 잰 포도알 자리: [가로 %, 세로 %, 반지름(가로 %)] — 위에서부터 칠해요
   4번(동글 포도)이 지금 판이고, 1~3번은 예전에 만든 판이 그대로 보이도록 남겨 둬요 */
const SIZE = { 1: [1086, 1448], 2: [1086, 1448], 3: [1086, 1448], 4: [1199, 1312] };
const P = (s, list, r) => list.map(([x, y]) => [x / SIZE[s][0] * 100, y / SIZE[s][1] * 100, r / SIZE[s][0] * 100]);
const LAYOUT = {
  // 4번은 알이 살짝 가로로 긴 동그라미라 [가로, 세로, 너비, 높이](px)로 재서 타원으로 칠해요
  4: [[292, 472, 178, 171], [494, 472, 177, 171], [694, 469, 179, 174], [896, 470, 177, 169], [298, 668, 176, 165], [497, 666, 170, 160], [694, 666, 171, 162], [892, 666, 173, 165],
      [399, 839, 176, 158], [598, 837, 171, 156], [796, 838, 172, 157], [494, 1000, 179, 159], [696, 1001, 178, 162], [590, 1164, 186, 169]]
    .map(([x, y, w, hh]) => [x / 1199 * 100, y / 1312 * 100, w / 2 / 1199 * 100, (hh + 8) / 1312 * 100, (w + 8) / 1199 * 100]),
  1: P(1, [[309, 508], [475, 508], [629, 508], [796, 508], [385, 665], [553, 665], [721, 665], [332, 817], [498, 817], [665, 817], [408, 971], [578, 971], [746, 971], [471, 1125], [647, 1125], [544, 1275]], 81),
  2: P(2, [[364, 529], [543, 529], [722, 529], [274, 684], [453, 684], [632, 684], [811, 684], [363, 840], [544, 840], [722, 840], [452, 996], [631, 996], [542, 1150]], 86),
  3: P(3, [[383, 546], [547, 546], [711, 546], [296, 696], [463, 696], [629, 696], [793, 696], [379, 850], [547, 850], [713, 850], [460, 997], [630, 997], [409, 1151], [569, 1151], [491, 1290]], 80),
};
const DESIGNS = [[4, '동글 포도', 14]];
const TARGETS = [30, 60, 90, 120, 180, 240, 300];
const fmtMin = (m) => { const hh = Math.floor(m / 60), mm = m % 60; return hh ? (mm ? `${hh}시간 ${mm}분` : `${hh}시간`) : `${mm}분`; };
const modeText = (b) => (b.mode === 'study' ? `하루 ${fmtMin(b.targetMin)} 공부하면 저절로 칠해져요` : '목표를 이룬 날 직접 칠해요');

/* 포도알 판 그림 + 칠한 알 */
function boardEl(b, { anim = -1, small = false } = {}) {
  const people = new Map(b.people.map((u) => [u.id, u]));
  const st = LAYOUT[b.style] ? b.style : 4, spots = LAYOUT[st];
  const marks = b.marks || [];
  const el = h('div', { class: `gp-board s${st}` + (small ? ' sm' : '') + (b.completedAt ? ' done' : ''), style: { aspectRatio: `${SIZE[st][0]} / ${SIZE[st][1]}` } },
    h('img', { class: 'gp-img', src: `assets/grapes/board${st}.webp`, alt: `${b.title} 포도알 판, ${b.total}알 중 ${b.count}알`, draggable: 'false', loading: small ? 'lazy' : 'eager' }));
  spots.slice(0, b.count).forEach(([x, y, r, eh, ew], i) => {
    const m = marks[i], u = m && people.get(m.user);
    el.append(h('span', { class: 'gp-fill' + (i === anim ? ' pop' : ''), style: ew ? { left: `${x}%`, top: `${y}%`, width: `${ew}%`, height: `${eh}%`, aspectRatio: 'auto' } : { left: `${x}%`, top: `${y}%`, width: `${r * 2 * 0.9}%` },
      title: m ? `${u ? u.name : '친구'} · ${md(m.day)}${m.note ? ' · ' + m.note : ''}` : '' },
      !small && u && b.people.length > 1 ? h('b', null, Array.from(u.name)[0]) : null));
  });
  return el;
}
/* 배지: 금테 메달 안의 작은 포도송이 */
function badgeEl(x) {
  return h('div', { class: 'gp-badge', title: `${x.title} · ${md(x.at.slice(0, 10))}` },
    h('span', { class: 'gp-medal', 'aria-hidden': 'true' }, grapeIcon()),
    h('b', null, x.title), h('small', null, x.at.slice(0, 10).replace(/-/g, '.')));
}
function grapeIcon() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 40 44');
  s.innerHTML = '<path d="M20 9c0-4 3-7 7-7" fill="none" stroke="#8a6a3a" stroke-width="1.6" stroke-linecap="round"/><path d="M21 7c4-3 10-2 12 2-5 2-9 1-12-2z" fill="#9db08a"/>'
    + [[13, 14], [20, 14], [27, 14], [16.5, 20.5], [23.5, 20.5], [13, 27], [20, 27], [27, 27], [16.5, 33.5], [23.5, 33.5], [20, 40]].filter((_, i) => i !== 5 && i !== 7)
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.2" fill="url(#gpg)" stroke="#c9a86a" stroke-width=".7"/>`).join('')
    + '<defs><radialGradient id="gpg" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e6d6ff"/><stop offset=".5" stop-color="#8b5fcf"/><stop offset="1" stop-color="#4b2585"/></radialGradient></defs>';
  return s;
}

export default async function mount(view, route) {
  const id = Number(route.params[0]) || 0;
  return id ? boardPage(view, id) : listPage(view);
}

async function listPage(view) {
  setTitle('포도알 판');
  let r;
  try { r = await api.get('grape.list'); } catch (e) { view.append(h('div', { class: 'card empty' }, e.message)); return; }
  view.append(pageHead('포도알 판', '목표를 이룰 때마다 한 알씩 칠해요. 다 채우면 같이 한 사람 모두 배지를 받아요',
    h('button', { type: 'button', class: 'btn primary', onclick: () => editModal(null) }, icon('plus'), '새 포도알 판')));
  const doing = r.boards.filter((b) => !b.completedAt), done = r.boards.filter((b) => b.completedAt);
  if (!r.boards.length) {
    view.append(h('section', { class: 'card gp-empty' },
      boardEl({ style: 4, count: 5, total: 14, title: '예시', people: [], marks: [], completedAt: null }, { small: true }),
      h('div', null, h('h3', null, '첫 포도알 판을 만들어 보세요'),
        h('p', { class: 'muted' }, '하루 2시간 공부하면 저절로 한 알, 아니면 목표를 이룬 날 직접 한 알. 친구와 같이 채우면 더 빨라요.'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => editModal(null) }, icon('plus'), '새 포도알 판'))));
  }
  const card = (b) => h('a', { class: 'gp-card' + (b.completedAt ? ' done' : ''), href: `#/grapes/${b.id}` },
    boardEl(b, { small: true }),
    h('div', { class: 'gp-card-t' }, h('b', null, b.title), h('span', { class: 'gp-count' }, `${b.count}/${b.total}`)),
    h('div', { class: 'gp-bar' }, h('i', { style: { width: `${(b.count / b.total) * 100}%` } })),
    h('div', { class: 'gp-card-m' }, h('span', { class: 'tiny muted' }, b.completedAt ? '다 채웠어요 🍇' : b.doneToday ? '오늘 칠했어요 ✓' : modeText(b)),
      h('span', { class: 'gp-avs' }, b.people.slice(0, 5).map((u) => avatar(u, 'sm')))));
  if (doing.length) view.append(h('h2', { class: 'gp-h2' }, '채우는 중'), h('div', { class: 'gp-grid' }, doing.map(card)));
  if (done.length) view.append(h('h2', { class: 'gp-h2' }, '다 채운 판'), h('div', { class: 'gp-grid' }, done.map(card)));
  view.append(h('h2', { class: 'gp-h2' }, '내 배지', r.badges.length ? h('span', { class: 'gp-count' }, `${r.badges.length}개`) : null),
    r.badges.length ? h('div', { class: 'gp-badges' }, r.badges.map(badgeEl)) : h('p', { class: 'small muted' }, '포도알 판을 다 채우면 여기에 배지가 생겨요'));
}

async function boardPage(view, id) {
  setTitle('포도알 판');
  let b;
  try { b = (await api.get('grape.get', { id })).board; } catch (e) { view.append(h('div', { class: 'card empty' }, e.message)); return; }
  const stage = h('div', { class: 'gp-stage' });
  const side = h('div', { class: 'gp-side' });
  view.append(h('div', { class: 'gp-top' }, h('a', { class: 'btn ghost sm', href: '#/grapes' }, icon('back'), '포도알 판')),
    h('div', { class: 'gp-layout' }, stage, side));
  function paint(anim = -1, justDone = false) {
    stage.replaceChildren(boardEl(b, { anim }), b.completedAt ? h('div', { class: 'gp-ribbon' + (b.style === 4 || !LAYOUT[b.style] ? ' top' : '') + (justDone ? ' celebrate' : '') }, '다 채웠어요 🍇') : null);
    const people = new Map(b.people.map((u) => [u.id, u]));
    const per = new Map(b.people.map((u) => [u.id, 0]));
    for (const m of b.marks) per.set(m.user, (per.get(m.user) || 0) + 1);
    const today = (() => {
      if (b.completedAt) return h('div', { class: 'gp-today done' }, badgeEl({ title: b.title, at: b.completedAt, style: b.style }), h('p', null, '같이 한 사람 모두 배지를 받았어요. 수고했어요!'));
      if (b.mode === 'study') {
        const min = Math.floor(b.todayStudySec / 60), pct = Math.min(100, Math.round((min / b.targetMin) * 100));
        return h('div', { class: 'gp-today' }, h('div', { class: 'gp-today-t' }, b.doneToday ? '오늘 한 알 칠했어요 ✓' : '오늘 공부', h('span', null, `${fmtMin(min)} / ${fmtMin(b.targetMin)}`)),
          h('div', { class: 'gp-bar' }, h('i', { style: { width: `${pct}%` } })),
          b.doneToday ? null : h('p', { class: 'small muted' }, '목표 시간을 넘기면 공부를 끝낼 때 저절로 칠해져요'),
          b.doneToday ? null : h('a', { class: 'btn sm', href: '#/planner' }, icon('play'), '플래너에서 공부 시작'));
      }
      if (b.doneToday) return h('div', { class: 'gp-today' }, h('div', { class: 'gp-today-t' }, '오늘 한 알 칠했어요 ✓'),
        h('button', { type: 'button', class: 'btn ghost sm', onclick: async () => { try { b = (await api.post('grape.unmark', { id })).board; paint(); } catch (e) { errToast(e); } } }, '잘못 칠했어요 (지우기)'));
      const note = h('input', { class: 'input', maxlength: '60', placeholder: '무엇을 했나요? (선택)', 'aria-label': '한 줄 메모' });
      return h('form', { class: 'gp-today', onsubmit: async (e) => {
        e.preventDefault();
        const before = b.count;
        try { b = (await api.post('grape.mark', { id, note: note.value.trim() })).board; paint(before, !!b.completedAt); if (b.completedAt) toast('포도알을 다 채웠어요! 배지를 받았어요'); else toast('한 알 칠했어요'); } catch (er) { errToast(er); }
      } }, h('div', { class: 'gp-today-t' }, '오늘 목표를 이뤘나요?'), note, h('button', { type: 'submit', class: 'btn primary gp-mark' }, '🍇 오늘 포도알 칠하기'));
    })();
    side.replaceChildren(
      h('h1', { class: 'gp-title' }, b.title),
      h('p', { class: 'gp-sub' }, modeText(b)),
      h('div', { class: 'gp-progress' }, h('b', null, b.count), h('span', null, ` / ${b.total}알`), h('div', { class: 'gp-bar' }, h('i', { style: { width: `${(b.count / b.total) * 100}%` } }))),
      today,
      h('section', { class: 'gp-sec' }, h('h3', null, '같이 채우는 사람'), h('ul', { class: 'gp-people' }, b.people.map((u) => h('li', null, avatar(u, 'sm'), h('span', { class: 'gp-pn' }, u.id === state.me.id ? '나' : u.name), h('b', null, `${per.get(u.id) || 0}알`))))),
      b.marks.length ? h('section', { class: 'gp-sec' }, h('h3', null, '칠한 기록'), h('ul', { class: 'gp-log' }, [...b.marks].sort((x, y) => (y.day < x.day ? -1 : y.day > x.day ? 1 : 0)).slice(0, 20).map((m) => {
        const u = people.get(m.user);
        return h('li', null, h('span', { class: 'gp-dot' }), h('span', null, h('b', null, u ? (u.id === state.me.id ? '나' : u.name) : '친구'), m.note ? ` · ${m.note}` : ''), h('small', null, md(m.day)));
      }))) : null,
      h('div', { class: 'row gp-acts' },
        b.mine ? h('button', { type: 'button', class: 'btn sm', onclick: () => editModal(b, (nb) => { b = nb; paint(); }) }, icon('gear'), '판 고치기') : null,
        confirmBtn(b.mine ? '판 지우기' : '나가기', '한 번 더 누르면 ' + (b.mine ? '지워요' : '나가요'), async () => { await api.post('grape.leave', { id }); location.hash = '#/grapes'; }, 'btn ghost sm')));
  }
  paint();
}

/* 만들기·고치기 */
async function editModal(b, onSaved) {
  const friends = await loadFriends(true).catch(() => []);   // 방금 맺은 친구도 보이게 새로 받아요
  let style = b ? b.style : DESIGNS[0][0], mode = b ? b.mode : 'study', target = b ? b.targetMin : 120;
  const chosen = new Set(b ? b.people.map((u) => u.id).filter((x) => x !== state.me.id) : []);
  const title = h('input', { class: 'input', maxlength: '40', value: b ? b.title : '', placeholder: '예: 기말고사 같이 공부', 'aria-label': '판 이름' });
  const designs = h('div', { class: 'gp-designs' });
  const paintDesigns = () => designs.replaceChildren(...DESIGNS.map(([k, name, n]) => h('button', { type: 'button', class: 'gp-design' + (k === style ? ' on' : ''), 'aria-pressed': String(k === style), onclick: () => { style = k; paintDesigns(); } },
    h('img', { src: `assets/grapes/board${k}.webp`, alt: '' }), h('span', null, name, h('small', null, `${n}알`)))));
  paintDesigns();
  const targetSel = h('select', { class: 'input', 'aria-label': '하루 목표 공부 시간', onchange: (e) => { target = Number(e.target.value); } }, TARGETS.map((t) => h('option', { value: t, selected: t === target }, fmtMin(t))));
  const targetRow = h('label', { class: 'field' }, '하루 목표 공부 시간', targetSel);
  const modes = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': '칠하는 법' });
  const paintModes = () => { modes.replaceChildren(...[['study', '공부 시간으로 저절로'], ['check', '직접 칠하기']].map(([k, label]) => h('button', { type: 'button', role: 'radio', class: mode === k ? 'on' : '', 'aria-checked': String(mode === k), onclick: () => { mode = k; paintModes(); } }, label))); targetRow.hidden = mode !== 'study'; };
  paintModes();
  const who = h('div', { class: 'who-box' }, friends.length ? friends.map((f) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: chosen.has(f.id), onchange: (e) => { e.target.checked ? chosen.add(f.id) : chosen.delete(f.id); } }), avatar(f, 'sm'), f.name))
    : h('p', { class: 'small muted' }, '친구를 추가하면 같이 채울 수 있어요. 혼자 채워도 돼요.'));
  const m = modal(h('form', { class: 'form', onsubmit: async (e) => {
    e.preventDefault();
    if (!title.value.trim()) { toast('판 이름을 적어 주세요'); return; }
    try {
      const r = await api.post('grape.save', { id: b ? b.id : 0, title: title.value.trim(), style, mode, targetMin: target, members: [...chosen] });
      m.close();
      if (onSaved) onSaved(r.board); else location.hash = `#/grapes/${r.board.id}`;
      toast(b ? '판을 고쳤어요' : '포도알 판을 만들었어요');
    } catch (er) { errToast(er); }
  } }, h('h2', null, b ? '포도알 판 고치기' : '새 포도알 판'), h('label', { class: 'field' }, '판 이름', title),
    DESIGNS.length > 1 ? h('div', { class: 'field' }, '판 그림', designs) : null, h('div', { class: 'field' }, '칠하는 법', modes), targetRow,
    h('div', { class: 'field' }, '같이 채울 친구 (선택)', who),
    h('div', { class: 'row end' }, h('button', { type: 'submit', class: 'btn primary' }, b ? '저장' : '만들기'))), { wide: true });
}
