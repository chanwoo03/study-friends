/* 플래너 꾸미기: 그림 이모티콘 · 이모지 · 마스킹테이프 · 도장 · 사진(폴라로이드)
   위치·크기는 '한 쪽 너비 = 100'으로 저장해요. 그래서 휴대폰·컴퓨터·플래너 북 어디서나 같은 자리에 붙어 있어요. */
import { h, icon, api, toast, errToast } from './core.js';
import { PACKS, packsReady, sticker } from './stickers.js';
import { toJpeg, loadImage } from './journal.js';

export const TAPES = [
  ['mint-dot', '민트 도트'], ['lemon-stripe', '레몬 줄무늬'], ['pink-grid', '분홍 모눈'], ['lav-plain', '라벤더'],
  ['kraft', '크라프트'], ['sky-check', '하늘 체크'], ['peach-flower', '복숭아 꽃'], ['navy-star', '밤하늘'],
];
export const STAMPS = { great: ['참 잘', '했어요'], done: ['오늘', '완료'], focus: ['집중', '모드'], perfect: ['완벽', '해!'], fighting: ['화이', '팅!'], rest: ['쉬어', '가기'] };
const EMOJIS = ['🌸', '🌷', '🌼', '🍀', '⭐', '✨', '🌙', '☀️', '☁️', '🌈', '❤️', '🧡', '💛', '💚', '💙', '💜', '🎀', '🎉', '🔥', '💯', '✅', '📚', '📖', '✏️', '📝', '📌', '☕', '🍰', '🍓', '🍑', '🐣', '🐻', '🐰', '🐱', '🎧', '💪', '👍', '😊', '🥰', '😴'];
const DEFAULT_W = { st: 24, em: 9, tp: 34, sp: 18, ph: 38 };

export const photoSrc = (id, u, full) => `api.php?a=planner.photo&id=${id}${full ? '&size=full' : ''}${u ? `&u=${u}` : ''}`;

/* 붙인 것 하나 그리기 */
export function decoEl(d, { photos = {}, u = 0 } = {}) {
  const el = h('div', { class: `dc dc-${d.k}`, style: { '--x': d.x, '--y': d.y, '--w': d.w, '--r': `${d.r}deg`, 'z-index': String(10 + (d.z || 0)) } });
  if (d.k === 'st') { const s = sticker(d.v); s.classList.add('dc-st-img'); s.draggable = false; el.append(s); }
  else if (d.k === 'em') el.append(h('span', { class: 'dc-em-t', 'aria-hidden': 'true' }, d.v));
  else if (d.k === 'tp') el.append(h('span', { class: `dc-tape tape-${d.v}` }));
  else if (d.k === 'sp') { const [a, b] = STAMPS[d.v] || ['', '']; el.append(h('span', { class: `dc-stamp stamp-${d.v}` }, h('b', null, a), h('b', null, b))); }
  else if (d.k === 'ph') {
    const p = photos[d.v];
    el.append(h('span', { class: 'dc-polaroid' }, h('span', { class: 'dc-ph-tape' }),
      h('img', { src: photoSrc(d.v, u, false), alt: '붙인 사진', loading: 'lazy', draggable: 'false', style: p ? { 'aspect-ratio': `${p.w} / ${p.h}` } : null })));
  }
  return el;
}

/* 한 쪽(.pd-page)에 꾸미기 층 붙이기 (보기 전용) */
export function paintDecos(pages, decos, opts) {
  pages.forEach((pg, i) => {
    let layer = pg.querySelector(':scope > .pd-deco');
    if (!layer) { layer = h('div', { class: 'pd-deco' }); pg.append(layer); }
    layer.replaceChildren(...decos.map((d, idx) => ({ d, idx })).filter((x) => x.d.p === i).map(({ d, idx }) => { const el = decoEl(d, opts); el.dataset.idx = idx; return el; }));
  });
}

/* 꾸미기 편집: 서랍(붙일 것 고르기) + 끌어서 옮기기 + 고른 것 돌리기·크기·삭제 */
export function decoEditor({ date, pages, decos, photos, onChange }) {
  let on = false, sel = -1, saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(async () => { try { const r = await api.post('planner.decos', { date, decos }); onChange && onChange(r.decos); } catch (e) { errToast(e); } }, 600); };
  const repaint = () => { paintDecos(pages, decos, { photos }); markSel(); };
  const markSel = () => pages.forEach((pg) => pg.querySelectorAll('.dc').forEach((el) => el.classList.toggle('sel', Number(el.dataset.idx) === sel)));
  const topZ = () => decos.reduce((m, d) => Math.max(m, d.z || 0), 0);

  /* 고른 것 도구 */
  const tools = h('div', { class: 'dc-tools', hidden: true, role: 'toolbar', 'aria-label': '고른 꾸미기' },
    h('button', { type: 'button', 'aria-label': '왼쪽으로 돌리기', onclick: () => tweak({ r: -12 }) }, '↺'),
    h('button', { type: 'button', 'aria-label': '오른쪽으로 돌리기', onclick: () => tweak({ r: 12 }) }, '↻'),
    h('button', { type: 'button', 'aria-label': '작게', onclick: () => tweak({ s: 0.85 }) }, '−'),
    h('button', { type: 'button', 'aria-label': '크게', onclick: () => tweak({ s: 1.18 }) }, '+'),
    h('button', { type: 'button', 'aria-label': '맨 위로', onclick: () => { if (sel < 0) return; decos[sel].z = Math.min(99, topZ() + 1); repaint(); save(); } }, icon('pin')),
    h('button', { type: 'button', class: 'del', 'aria-label': '떼어 내기', onclick: remove }, icon('trash')));
  function tweak({ r = 0, s = 1 }) {
    if (sel < 0) return;
    const d = decos[sel];
    d.r = Math.max(-180, Math.min(180, Math.round(((d.r + r + 540) % 360) - 180)));
    d.w = Math.max(4, Math.min(90, Math.round(d.w * s * 10) / 10));
    repaint(); placeTools(); save();
  }
  async function remove() {
    if (sel < 0) return;
    const d = decos[sel];
    decos.splice(sel, 1); sel = -1; tools.hidden = true; repaint(); save();
    if (d.k === 'ph') { try { await api.post('planner.photo_del', { id: d.v }); delete photos[d.v]; } catch (e) {} }
  }
  function placeTools() {
    if (sel < 0) { tools.hidden = true; return; }
    const el = pages.map((pg) => pg.querySelector(`.dc[data-idx="${sel}"]`)).find(Boolean);
    if (!el) { tools.hidden = true; return; }
    const r = el.getBoundingClientRect();
    tools.hidden = false;
    tools.style.left = `${Math.max(8, Math.min(window.innerWidth - tools.offsetWidth - 8, r.left + r.width / 2 - tools.offsetWidth / 2))}px`;
    tools.style.top = `${Math.max(8, r.top - tools.offsetHeight - 10)}px`;
  }

  /* 끌어서 옮기기 (다른 쪽으로도 옮겨져요) */
  let drag = null;
  function onDown(e) {
    if (!on) return;
    const el = e.target.closest('.dc');
    if (!el) { sel = -1; markSel(); placeTools(); return; }
    e.preventDefault();
    sel = Number(el.dataset.idx); markSel(); tools.hidden = true;
    const d = decos[sel], pg = pages[d.p], rc = pg.getBoundingClientRect();
    drag = { id: e.pointerId, dx: e.clientX - (rc.left + (d.x / 100) * rc.width), dy: e.clientY - (rc.top + (d.y / 100) * rc.width), moved: false };
    el.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id || sel < 0) return;
    const d = decos[sel];
    const under = document.elementsFromPoint(e.clientX, e.clientY).map((n) => n.closest && n.closest('.pd-page')).find((n) => n && pages.includes(n));
    if (under) d.p = pages.indexOf(under);
    const rc = pages[d.p].getBoundingClientRect();
    d.x = Math.round(((e.clientX - drag.dx - rc.left) / rc.width) * 1000) / 10;
    d.y = Math.round(((e.clientY - drag.dy - rc.top) / rc.width) * 1000) / 10;
    d.x = Math.max(-10, Math.min(105, d.x)); d.y = Math.max(-10, Math.min(200, d.y));
    drag.moved = true;
    const el = pages.map((pg) => pg.querySelector(`.dc[data-idx="${sel}"]`)).find(Boolean);
    if (el && el.parentElement !== pages[d.p].querySelector('.pd-deco')) { repaint(); } else if (el) { el.style.setProperty('--x', d.x); el.style.setProperty('--y', d.y); }
  }
  function onUp(e) { if (!drag || e.pointerId !== drag.id) return; const moved = drag.moved; drag = null; if (moved) save(); placeTools(); }
  pages.forEach((pg) => { pg.addEventListener('pointerdown', onDown); pg.addEventListener('pointermove', onMove); pg.addEventListener('pointerup', onUp); pg.addEventListener('pointercancel', onUp); });
  window.addEventListener('scroll', () => { if (on) placeTools(); }, { passive: true });

  /* 새로 붙이기: 지금 화면 가운데 쪽에 */
  function add(k, v, w) {
    const vh = window.innerHeight / 2;
    let p = 0, best = Infinity;
    pages.forEach((pg, i) => { const r = pg.getBoundingClientRect(); const dist = Math.abs(r.top + r.height / 2 - vh); if (dist < best) { best = dist; p = i; } });
    const rc = pages[p].getBoundingClientRect();
    const y = Math.max(8, Math.min(130, ((vh - rc.top) / rc.width) * 100 - 6 + (Math.random() * 12 - 6)));
    if (decos.length >= 40) { toast('한 날에 40개까지 붙일 수 있어요'); return; }
    decos.push({ k, v, p, x: Math.round(50 + (Math.random() * 30 - 15)), y: Math.round(y), w: w || DEFAULT_W[k], r: Math.round(Math.random() * 16 - 8), z: topZ() + 1 });
    sel = decos.length - 1; repaint(); placeTools(); save();
  }

  /* 서랍 */
  let tab = 'st';
  const body = h('div', { class: 'dc-drawer-body' });
  const tabBtns = h('div', { class: 'dc-tabs', role: 'tablist' });
  const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
    const f = fileIn.files[0]; fileIn.value = '';
    if (!f) return;
    try {
      toast('사진을 붙이는 중…');
      const img = await loadImage(f);
      const r = await api.post('planner.photo_add', { date, image: toJpeg(img, 1400, 0.85), thumb: toJpeg(img, 560, 0.8) });
      photos[r.photo.id] = r.photo; add('ph', r.photo.id);
    } catch (e) { errToast(e); }
  } });
  function paintTab() {
    tabBtns.replaceChildren(...[['st', '캘린더 친구'], ['em', '이모지'], ['tp', '마스킹테이프'], ['sp', '도장'], ['ph', '사진']].map(([k, label]) =>
      h('button', { type: 'button', role: 'tab', class: tab === k ? 'on' : '', 'aria-selected': String(tab === k), onclick: () => { tab = k; paintTab(); } }, label)));
    if (tab === 'st') body.replaceChildren(h('div', { class: 'dc-grid st' }, PACKS.flatMap((pk) => pk.items.map((it) => {
      const key = `${pk.key}/${it.key}`;
      return h('button', { type: 'button', 'aria-label': it.t + ' 붙이기', onclick: () => add('st', key) }, sticker(key, 'sm'));
    }))));
    else if (tab === 'em') body.replaceChildren(h('div', { class: 'dc-grid em' }, EMOJIS.map((e) => h('button', { type: 'button', 'aria-label': e + ' 붙이기', onclick: () => add('em', e) }, e))));
    else if (tab === 'tp') body.replaceChildren(h('div', { class: 'dc-grid tp' }, TAPES.map(([k, label]) => h('button', { type: 'button', 'aria-label': label + ' 테이프 붙이기', onclick: () => add('tp', k) }, h('span', { class: `dc-tape tape-${k}` }), h('small', null, label)))));
    else if (tab === 'sp') body.replaceChildren(h('div', { class: 'dc-grid sp' }, Object.entries(STAMPS).map(([k, [a, b]]) => h('button', { type: 'button', 'aria-label': `${a}${b} 도장 찍기`, onclick: () => add('sp', k) }, h('span', { class: `dc-stamp stamp-${k}` }, h('b', null, a), h('b', null, b))))));
    else body.replaceChildren(h('div', { class: 'dc-photo' }, h('p', { class: 'small muted' }, '사진은 폴라로이드처럼 테이프로 붙어요. 하루 8장까지, 플래너를 볼 수 있는 사람만 보여요.'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => fileIn.click() }, icon('plus'), '사진 붙이기'), fileIn));
  }
  const drawer = h('div', { class: 'dc-drawer', hidden: true, role: 'dialog', 'aria-label': '꾸미기' },
    h('div', { class: 'dc-drawer-head' }, tabBtns, h('button', { type: 'button', class: 'btn sm', onclick: () => toggle(false) }, '다 꾸몄어요')), body);
  document.body.append(drawer, tools);
  packsReady.then(paintTab);
  paintTab();

  function toggle(v = !on) {
    on = v; drawer.hidden = !on; sel = -1; tools.hidden = true;
    pages.forEach((pg) => pg.classList.toggle('decorating', on));
    document.body.classList.toggle('dc-open', on);
    markSel();
    return on;
  }
  repaint();
  return { toggle, isOn: () => on, repaint, destroy: () => { drawer.remove(); tools.remove(); document.body.classList.remove('dc-open'); } };
}
