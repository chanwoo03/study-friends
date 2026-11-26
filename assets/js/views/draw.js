/* 그림판: 친구와 같이 그리기. 획을 하나씩 서버에 저장하고 1.5초마다 다른 사람 획을 받아 와요 */
import { state, api, h, icon, avatar, toast, errToast, modal, confirmBtn, visibilityPicker, every, setTitle, pageHead, ago, VIS_LABEL, visIcon, app } from '../core.js';

export default function mount(view, route) {
  return route.params[0] ? editor(view, Number(route.params[0])) : listPage(view);
}

function settingsModal(c, onSaved) {
  const isNew = !c;
  c = c || { title: '', visibility: 'friends', shares: [] };
  const title = h('input', { maxlength: '60', value: c.title, placeholder: '예: 스터디 마인드맵' });
  const vis = visibilityPicker(c.visibility, c.shares);
  const err = h('div', { class: 'err' });
  const m = modal([h('h2', null, isNew ? '새 그림판' : '그림판 설정'), h('p', { class: 'lead' }, '공유받은 친구는 같이 그릴 수 있어요'),
    h('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      try {
        const r = await api.post('canvas.save', { id: c.id, title: title.value, ...vis.value() });
        m.close();
        if (isNew) app.go('draw/' + r.id); else { toast('저장했어요'); onSaved && onSaved(); }
      } catch (ex) { err.textContent = ex.message; }
    } }, h('label', { class: 'field' }, '이름', title), vis.el, err,
      h('div', { class: 'actions' },
        isNew ? null : h('span', { class: 'left' }, confirmBtn('그림판 삭제', '한 번 더 누르면 삭제', async () => {
          try { await api.post('canvas.delete', { id: c.id }); m.close(); toast('지웠어요'); app.go('draw'); } catch (ex) { errToast(ex); }
        })),
        h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, '취소'), h('button', { class: 'btn primary', type: 'submit' }, isNew ? '만들기' : '저장')))]);
}

async function listPage(view) {
  setTitle('그림판');
  const box = h('div', { class: 'thumbs' });
  view.append(pageHead('그림판', '친구와 같은 그림판에 동시에 그릴 수 있어요', h('button', { class: 'btn primary', type: 'button', onclick: () => settingsModal(null) }, icon('plus'), '새 그림판')), box);
  const r = await api.get('canvas.list');
  if (!r.canvases.length) box.append(h('div', { class: 'card empty', style: { 'grid-column': '1/-1' } }, '아직 그림판이 없어요. ‘새 그림판’을 눌러 시작하세요'));
  for (const c of r.canvases) box.append(h('a', { class: 'plan-card', href: '#/draw/' + c.id },
    h('div', { class: 't' }, icon('draw'), h('span', null, c.title)),
    h('div', { class: 'row small muted' }, avatar(c.owner, 'sm'), c.mine ? '나' : c.owner.name, c.mine ? h('span', { class: 'pill' }, visIcon(c.visibility), VIS_LABEL[c.visibility]) : null),
    h('div', { class: 'meta' }, h('span', null, '마지막 수정 ' + ago(c.updatedAt)))));
}

const PALETTE = ['#191f28', '#f04452', '#ff9f43', '#ffd43b', '#20c997', '#3182f6', '#845ef7', '#f2638a', '#8b95a1'];

async function editor(view, id) {
  let W = 1600, H = 1000;
  let meta = null, strokes = [], lastId = 0, version = 0;
  let tool = 'pen', color = PALETTE[0], width = 4;
  const canvas = h('canvas', { class: 'board-canvas', 'aria-label': '그림판. 마우스나 손가락으로 그려요' });
  const ctx = canvas.getContext('2d');
  const titleEl = h('h1');
  const metaEl = h('div', { class: 'row small muted' });
  const swatches = PALETTE.map((c) => h('button', { type: 'button', class: 'swatch', style: { '--c': c }, 'aria-label': '색 ' + c, 'aria-pressed': String(c === color), onclick: () => { color = c; tool = 'pen'; paintTools(); } }));
  const penBtn = h('button', { type: 'button', class: 'btn icon sm tool', 'aria-label': '펜', onclick: () => { tool = 'pen'; paintTools(); } }, icon('draw'));
  const eraserBtn = h('button', { type: 'button', class: 'btn icon sm tool', 'aria-label': '지우개', onclick: () => { tool = 'eraser'; paintTools(); } }, icon('eraser'));
  const widthIn = h('input', { type: 'range', min: '1', max: '40', value: String(width), class: 'width-in', 'aria-label': '굵기', oninput: (e) => { width = Number(e.target.value); } });
  const undoBtn = h('button', { type: 'button', class: 'btn sm', onclick: undo }, icon('undo'), '내 획 되돌리기');
  const ownerBox = h('span', { class: 'row' });
  function paintTools() {
    swatches.forEach((s, i) => s.setAttribute('aria-pressed', String(tool === 'pen' && PALETTE[i] === color)));
    penBtn.setAttribute('aria-pressed', String(tool === 'pen'));
    eraserBtn.setAttribute('aria-pressed', String(tool === 'eraser'));
  }
  view.append(h('a', { class: 'btn ghost sm', href: '#/draw', style: { 'margin-bottom': '8px' } }, icon('back'), '그림판 목록'),
    h('div', { class: 'head' }, h('div', null, titleEl, metaEl), ownerBox),
    h('div', { class: 'draw-wrap' },
      h('div', { class: 'toolbar' }, penBtn, eraserBtn, h('span', { class: 'sep' }), swatches, h('span', { class: 'sep' }), h('label', { class: 'row small muted' }, '굵기', widthIn), h('span', { class: 'grow' }), undoBtn),
      canvas,
      h('p', { class: 'tiny muted', style: { margin: 0 } }, '같이 보는 친구의 그림은 1~2초 안에 나타나요. 되돌리기는 내가 그린 마지막 획만 지워요')));
  paintTools();

  /* 화면 크기에 맞게 캔버스 해상도 맞추기 */
  function fit() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.width * (H / W) * dpr));
    redraw();
  }
  function drawStroke(d) {
    const sx = canvas.width / W, sy = canvas.height / H, p = d.p;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = d.t === 'eraser' ? '#ffffff' : d.c;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = d.w * sx;
    if (p.length === 2) { ctx.beginPath(); ctx.arc(p[0] * sx, p[1] * sy, d.w * sx / 2, 0, Math.PI * 2); ctx.fill(); }
    else {
      ctx.beginPath(); ctx.moveTo(p[0] * sx, p[1] * sy);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * sx, p[i + 1] * sy);
      ctx.stroke();
    }
    ctx.restore();
  }
  function redraw() {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes) drawStroke(s.d);
    if (cur) drawStroke(cur);
  }

  /* 그리기 */
  let cur = null, pointerId = null;
  function pt(e) {
    const r = canvas.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) / r.width * W), Math.round((e.clientY - r.top) / r.height * H)];
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (pointerId !== null) return;
    pointerId = e.pointerId; canvas.setPointerCapture(e.pointerId);
    cur = { t: tool, c: color, w: tool === 'eraser' ? Math.max(12, width * 3) : width, p: pt(e) };
    drawStroke(cur); e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId || !cur) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) {
      const [x, y] = pt(ev), n = cur.p.length;
      if (Math.abs(cur.p[n - 2] - x) + Math.abs(cur.p[n - 1] - y) < 2) continue;
      if (n >= 7998) break;
      cur.p.push(x, y);
    }
    redraw();
  });
  async function finish(e) {
    if (e.pointerId !== pointerId || !cur) return;
    pointerId = null;
    const d = cur; cur = null;
    const local = { id: 0, by: state.me.id, d, pending: true };
    strokes.push(local); redraw();
    try { const r = await api.post('canvas.stroke', { id, d }); local.id = r.id; local.pending = false; }
    catch (ex) { strokes = strokes.filter((s) => s !== local); redraw(); errToast(ex); }
  }
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  async function undo() {
    undoBtn.disabled = true;
    try {
      const r = await api.post('canvas.undo', { id });
      strokes = strokes.filter((s) => s.id !== r.removed); version = r.version; redraw();
    } catch (e) { errToast(e); } finally { undoBtn.disabled = false; }
  }
  async function clearAll() {
    try { const r = await api.post('canvas.clear', { id }); strokes = []; version = r.version; redraw(); toast('모두 지웠어요'); } catch (e) { errToast(e); }
  }

  async function loadAll() {
    let after = 0, all = [];
    for (;;) {
      const r = await api.get('canvas.get', { id, after });
      meta = r.canvas; [W, H] = r.size;
      all = all.concat(r.strokes);
      if (!r.more || !r.strokes.length) break;
      after = r.strokes[r.strokes.length - 1].id;
    }
    strokes = all.concat(strokes.filter((s) => s.pending));
    lastId = all.length ? all[all.length - 1].id : 0;
    version = meta.version;
    paintMeta(); redraw();
  }
  async function poll() {
    if (cur) return;
    const r = await api.get('canvas.get', { id, after: lastId });
    if (r.canvas.version !== version) { await loadAll(); return; }
    meta = r.canvas;
    const fresh = r.strokes.filter((s) => !strokes.some((x) => x.id === s.id));
    if (r.strokes.length) lastId = r.strokes[r.strokes.length - 1].id;
    if (fresh.length) { strokes = strokes.filter((s) => s.id || s.pending).concat(fresh); strokes.sort((a, b) => (a.id || 1e15) - (b.id || 1e15)); redraw(); }
  }
  function paintMeta() {
    setTitle(meta.title);
    titleEl.textContent = meta.title;
    metaEl.replaceChildren(avatar(meta.owner, 'sm'), meta.mine ? '내 그림판' : meta.owner.name + '님의 그림판', meta.mine ? h('span', { class: 'pill' }, visIcon(meta.visibility), VIS_LABEL[meta.visibility]) : null);
    ownerBox.replaceChildren(...(meta.mine ? [confirmBtn('모두 지우기', '한 번 더 누르면 모두 지워져요', clearAll, 'btn danger sm'),
      h('button', { class: 'btn sm', type: 'button', onclick: () => settingsModal(meta, loadAll) }, icon('gear'), '설정')] : []));
  }

  try { await loadAll(); } catch (e) { view.replaceChildren(h('div', { class: 'card empty' }, e.message, h('br'), h('a', { href: '#/draw' }, '목록으로'))); return; }
  fit();
  const ro = new ResizeObserver(() => fit());
  ro.observe(canvas);
  const stop = every(1500, poll);
  return () => { stop(); ro.disconnect(); };
}
