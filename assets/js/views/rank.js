/* 친구 등수: 나와 내 친구들끼리만 (친구의 친구는 나오지 않아요) */
import { state, api, h, icon, avatar, errToast, every, setTitle, pageHead, fmtDur } from '../core.js';

const PERIODS = [['today', '오늘'], ['week', '이번 주'], ['month', '이번 달']];
export const METRICS = [
  ['seconds', '공부 시간', (r) => fmtDur(r.seconds)],
  ['tasks', '끝낸 할 일', (r) => `${r.tasks}개`],
  ['streak', '연속 공부', (r) => `${r.streak}일`],
];
/* 같은 값이면 같은 등수 */
export function ranked(rows, key) {
  const sorted = [...rows].sort((a, b) => (b[key] - a[key]) || (b.mine - a.mine) || a.user.name.localeCompare(b.user.name));
  let last = null, rank = 0;
  return sorted.map((r, i) => { if (r[key] !== last) { rank = i + 1; last = r[key]; } return { ...r, rank }; });
}
const MEDAL = { 1: 'gold', 2: 'silver', 3: 'bronze' };

export default async function mount(view, route) {
  setTitle('등수');
  let period = ['today', 'week', 'month'].includes(route.query.p) ? route.query.p : 'week';
  let metric = METRICS.some((m) => m[0] === route.query.m) ? route.query.m : 'seconds';
  let data = null;
  const segP = h('div', { class: 'seg', role: 'group', 'aria-label': '기간' });
  const segM = h('div', { class: 'seg', role: 'group', 'aria-label': '기준' });
  const podium = h('div', { class: 'podium' });
  const list = h('ol', { class: 'rank-list' });
  const foot = h('p', { class: 'small muted', style: { margin: '14px 2px 0' } });
  view.append(pageHead('친구 등수', '나와 내 친구들끼리만 비교해요. 다른 사람의 친구는 보이지 않아요'),
    h('div', { class: 'row', style: { 'margin-bottom': '18px', gap: '10px' } }, segP, segM),
    h('div', { class: 'card rank-card' }, podium, list, foot));

  function paintSegs() {
    segP.replaceChildren(...PERIODS.map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(k === period), onclick: () => { period = k; load(); } }, l)));
    segM.replaceChildren(...METRICS.map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(k === metric), onclick: () => { metric = k; paint(); } }, l)));
  }
  function valueOf(r) { return METRICS.find((m) => m[0] === metric)[2](r); }
  function paint() {
    paintSegs();
    if (!data) return;
    const rows = ranked(data.rows, metric);
    podium.replaceChildren(); list.replaceChildren();
    if (rows.length < 2) {
      podium.append(h('div', { class: 'empty' }, '친구를 추가하면 같이 등수를 겨룰 수 있어요. ', h('a', { href: '#/friends' }, '친구 추가')));
    }
    // 시상대: 2등 - 1등 - 3등 순서로 놓아요
    const top = rows.filter((r) => r.rank <= 3).slice(0, 3);
    const order = [top.find((r, i) => i === 1), top[0], top.find((r, i) => i === 2)].filter(Boolean);
    if (rows.length >= 2) for (const r of order) {
      podium.append(h('div', { class: 'pod pod-' + (MEDAL[r.rank] || 'bronze') + (r.mine ? ' me' : '') },
        h('div', { class: 'pod-who' }, r.rank === 1 ? h('span', { class: 'crown', 'aria-hidden': 'true' }, '👑') : null, avatar(r.user, 'lg'),
          h('b', null, r.mine ? '나' : r.user.name), h('span', { class: 'pod-val' }, valueOf(r)),
          r.studying ? h('span', { class: 'pill live' }, h('span', { class: 'live-dot' }), '공부 중') : null),
        h('div', { class: 'pod-step' }, h('span', null, `${r.rank}등`))));
    }
    const max = Math.max(1, ...rows.map((r) => r[metric]));
    for (const r of rows) {
      if (rows.length >= 2 && order.includes(r)) continue;
      list.append(h('li', { class: 'rank-row' + (r.mine ? ' me' : '') },
        h('span', { class: 'rk' }, `${r.rank}`), avatar(r.user),
        h('div', { class: 'grow', style: { 'min-width': '0' } },
          h('div', { class: 'row', style: { 'justify-content': 'space-between' } }, h('b', null, r.mine ? '나' : r.user.name), h('span', { class: 'small' }, valueOf(r))),
          h('div', { class: 'bar', style: { '--c': r.user.color } }, h('i', { style: { width: (r[metric] / max * 100) + '%' } })),
          metric === 'seconds' && r.proofSeconds ? h('div', { class: 'tiny muted' }, `인증한 공부 ${fmtDur(r.proofSeconds)}`) : null)));
    }
    const mine = rows.find((r) => r.mine);
    foot.textContent = mine ? `나는 ${rows.length}명 중 ${mine.rank}등이에요.` + (metric === 'streak' ? ' 연속 공부는 하루 10분 이상 공부한 날을 세요.' : '') : '';
  }
  async function load() {
    paintSegs();
    try { data = await api.get('rank.get', { period }); paint(); } catch (e) { errToast(e); }
  }
  await load();
  return every(60000, load);
}
