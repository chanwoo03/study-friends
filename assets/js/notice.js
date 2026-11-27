/* 화면 위 공지 창: 나와 내 친구들이 보드에서 '공지로 고정'한 글
   - 어느 화면에서나 위에 떠 있어요. 접으면 작은 '공지' 단추가 되고, 닫은 공지는 새 공지가 올라올 때까지 안 떠요 */
import { api, h, icon, avatar, ago, every, state } from './core.js';

const KEY_HIDE = 'sf-notice-hidden', KEY_MIN = 'sf-notice-min';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

export function noticeFloat() {
  const el = h('aside', { class: 'notice-float', 'aria-label': '공지', hidden: true });
  let notices = [], idx = 0;
  let hidden = new Set(load(KEY_HIDE, []));   // 닫은 공지 id
  let min = load(KEY_MIN, false);
  const shown = () => notices.filter((n) => !hidden.has(n.id));

  function paint() {
    const list = shown();
    el.hidden = !list.length;
    if (!list.length) return;
    if (idx >= list.length) idx = 0;
    const n = list[idx];
    el.classList.toggle('min', min);
    if (min) {
      el.replaceChildren(h('button', { type: 'button', class: 'nf-pill', onclick: () => { min = false; save(KEY_MIN, false); paint(); } },
        icon('pin'), `공지 ${list.length}`));
      return;
    }
    const body = h('div', { class: 'nf-body' }, n.body);
    el.replaceChildren(
      h('div', { class: 'nf-head' },
        h('span', { class: 'nf-tag' }, icon('pin'), '공지'),
        avatar(n.author, 'sm'), h('b', null, n.mine ? '나' : n.author.name), h('span', { class: 'tiny muted' }, ago(n.pinnedAt)),
        h('span', { class: 'grow' }),
        list.length > 1 ? h('span', { class: 'nf-nav' },
          h('button', { type: 'button', class: 'btn ghost icon sm', 'aria-label': '이전 공지', onclick: () => { idx = (idx + list.length - 1) % list.length; paint(); } }, icon('back')),
          h('span', { class: 'tiny muted' }, `${idx + 1}/${list.length}`),
          h('button', { type: 'button', class: 'btn ghost icon sm', 'aria-label': '다음 공지', onclick: () => { idx = (idx + 1) % list.length; paint(); } }, icon('next'))) : null,
        h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { min = true; save(KEY_MIN, true); paint(); } }, '접기'),
        h('button', { type: 'button', class: 'btn ghost icon sm', 'aria-label': '이 공지 닫기', onclick: () => { hidden.add(n.id); save(KEY_HIDE, [...hidden].slice(-50)); paint(); } }, icon('x'))),
      body,
      h('div', { class: 'nf-foot' },
        h('button', { type: 'button', class: 'link', onclick: () => body.classList.toggle('open') }, '펼치기·줄이기'),
        h('a', { class: 'link', href: '#/board' }, '보드에서 보기')));
  }
  let last = 0;
  async function refresh() {
    if (!state.me) return;
    last = Date.now();
    const r = await api.get('notice.list');
    const ids = new Set(r.notices.map((n) => n.id));
    // 지금 없는 공지는 '닫음' 목록에서도 정리 → 다시 고정되면 또 떠요
    hidden = new Set([...hidden].filter((id) => ids.has(id))); save(KEY_HIDE, [...hidden]);
    notices = r.notices; paint();
  }
  refresh().catch(() => {});
  const stop = every(20000, refresh);
  // 화면을 옮길 때마다 (3초에 한 번까지) 새 공지를 확인해요
  const soft = () => { if (Date.now() - last > 3000) refresh().catch(() => {}); };
  return { el, refresh, soft, stop };
}
