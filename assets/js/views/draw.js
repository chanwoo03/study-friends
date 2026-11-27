/* 그림판: 친구와 같이 그리기. 획을 하나씩 서버에 저장하고 1.5초마다 다른 사람 획을 받아 와요 */
import { state, api, h, icon, avatar, toast, errToast, modal, confirmBtn, visibilityPicker, every, setTitle, pageHead, ago, VIS_LABEL, visIcon, app } from '../core.js';
import { TEMPLATES } from '../templates.js';

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
const NOTE_COLORS = ['#fff3bf', '#d3f9d8', '#d0ebff', '#ffe3e3', '#f3d9fa'];
const TOOLS = [
  ['select', 'cursor', '선택·옮기기 (V)'], ['pen', 'draw', '펜 (P)'], ['eraser', 'eraser', '지우개 (E)'],
  ['line', 'line', '선 (L)'], ['arrow', 'arrow', '화살표 (A)'], ['rect', 'rect', '네모 (R)'], ['ellipse', 'circle', '동그라미 (O)'], ['diamond', 'diamond', '마름모 (D)'],
  ['text', 'text', '글자 (T)'], ['note', 'sticky', '포스트잇 (N)'],
];
const KEYS = { v: 'select', p: 'pen', e: 'eraser', l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', d: 'diamond', t: 'text', n: 'note' };
const SHAPES = ['rect', 'ellipse', 'diamond'];
const FONT = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

/* ===== 그림 조각 계산 (좌표는 1600×1000 기준) ===== */
const measureCtx = document.createElement('canvas').getContext('2d');
function textLines(s) { return String(s || '').split('\n'); }
/* 포스트잇 안 글자를 너비에 맞게 줄바꿈 */
function wrapLines(ctx, s, maxW) {
  const out = [];
  for (const para of textLines(s)) {
    let line = '';
    for (const ch of Array.from(para)) {
      if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch;
    }
    out.push(line);
  }
  return out;
}
function bbox(d) {
  const p = d.p;
  if (d.t === 'text') {
    measureCtx.font = `600 ${d.z}px ${FONT}`;
    const lines = textLines(d.s);
    const w = Math.max(...lines.map((l) => measureCtx.measureText(l).width), 10);
    return [p[0], p[1], p[0] + w, p[1] + lines.length * d.z * 1.3];
  }
  if (d.t === 'note') return [p[0], p[1], p[0] + p[2], p[1] + p[3]];
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (let i = 0; i < p.length; i += 2) { x1 = Math.min(x1, p[i]); y1 = Math.min(y1, p[i + 1]); x2 = Math.max(x2, p[i]); y2 = Math.max(y2, p[i + 1]); }
  const m = (d.w || 2) / 2;
  return [x1 - m, y1 - m, x2 + m, y2 + m];
}
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
/* (x,y) 를 눌렀을 때 이 조각이 잡히는지 */
function hits(d, x, y) {
  const tol = 10;
  if (d.t === 'pen' || d.t === 'eraser') {
    const p = d.p;
    if (p.length === 2) return Math.hypot(x - p[0], y - p[1]) <= d.w / 2 + tol;
    for (let i = 2; i < p.length; i += 2) if (segDist(x, y, p[i - 2], p[i - 1], p[i], p[i + 1]) <= d.w / 2 + tol) return true;
    return false;
  }
  if (d.t === 'line' || d.t === 'arrow') return segDist(x, y, d.p[0], d.p[1], d.p[2], d.p[3]) <= (d.w || 2) / 2 + tol;
  if (d.t === 'curve') {
    const q = curvePoints(d.p, 24);
    for (let i = 2; i < q.length; i += 2) if (segDist(x, y, q[i - 2], q[i - 1], q[i], q[i + 1]) <= (d.w || 2) / 2 + tol) return true;
    return false;
  }
  const [x1, y1, x2, y2] = bbox(d);
  return x >= x1 - tol && x <= x2 + tol && y >= y1 - tol && y <= y2 + tol;
}
/* 곡선 위 점들 (2차 베지어) */
function curvePoints(p, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    out.push(a * p[0] + b * p[2] + c * p[4], a * p[1] + b * p[3] + c * p[5]);
  }
  return out;
}
/* 조각을 dx, dy 만큼 옮긴 새 조각 */
function moved(d, dx, dy) {
  const n = JSON.parse(JSON.stringify(d));
  if (d.t === 'note' || d.t === 'text') { n.p[0] += dx; n.p[1] += dy; }
  else for (let i = 0; i < n.p.length; i += 2) { n.p[i] += dx; n.p[i + 1] += dy; }
  n.p = n.p.map((v) => Math.round(v));
  return n;
}
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
/* 조각 하나 그리기. ctx 는 이미 1600×1000 좌표로 맞춰져 있어요 */
function drawObj(ctx, d) {
  const p = d.p;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = d.t === 'eraser' ? '#ffffff' : d.c; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = d.w || 2;
  switch (d.t) {
    case 'pen': case 'eraser':
      // 부분 지우개(eraser)는 잉크 층에서 그 자리를 투명하게 파내요 (배경·모눈은 그대로)
      if (d.t === 'eraser') ctx.globalCompositeOperation = 'destination-out';
      if (p.length === 2) { ctx.beginPath(); ctx.arc(p[0], p[1], d.w / 2, 0, Math.PI * 2); ctx.fill(); break; }
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.stroke(); break;
    case 'curve': {
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.quadraticCurveTo(p[2], p[3], p[4], p[5]); ctx.stroke();
      if (d.a) {
        const a = Math.atan2(p[5] - p[3], p[4] - p[2]), L = Math.max(16, d.w * 4.5);
        ctx.beginPath(); ctx.moveTo(p[4], p[5]);
        ctx.lineTo(p[4] - L * Math.cos(a - 0.45), p[5] - L * Math.sin(a - 0.45));
        ctx.lineTo(p[4] - L * Math.cos(a + 0.45), p[5] - L * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'line': case 'arrow': {
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.stroke();
      if (d.t === 'arrow') {
        const a = Math.atan2(p[3] - p[1], p[2] - p[0]), L = Math.max(16, d.w * 4.5);
        ctx.beginPath(); ctx.moveTo(p[2], p[3]);
        ctx.lineTo(p[2] - L * Math.cos(a - 0.45), p[3] - L * Math.sin(a - 0.45));
        ctx.lineTo(p[2] - L * Math.cos(a + 0.45), p[3] - L * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'rect': case 'ellipse': case 'diamond': {
      const x = Math.min(p[0], p[2]), y = Math.min(p[1], p[3]), w = Math.abs(p[2] - p[0]), hh = Math.abs(p[3] - p[1]);
      if (d.t === 'rect') roundRect(ctx, x, y, w, hh, d.r !== undefined ? d.r : Math.min(16, hh / 4));
      else if (d.t === 'ellipse') { ctx.beginPath(); ctx.ellipse(x + w / 2, y + hh / 2, Math.max(1, w / 2), Math.max(1, hh / 2), 0, 0, Math.PI * 2); }
      else { ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + hh / 2); ctx.lineTo(x + w / 2, y + hh); ctx.lineTo(x, y + hh / 2); ctx.closePath(); }
      const fillMode = d.f === true ? 1 : (d.f || 0);
      if (d.sh) {
        // 부드러운 그림자: 흰 바탕을 한 번 깔고 그 그림자만 남겨요
        ctx.save(); ctx.shadowColor = 'rgba(20, 30, 60, .16)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8;
        ctx.fillStyle = fillMode === 2 ? d.c : '#ffffff'; ctx.fill(); ctx.restore();
      }
      if (fillMode === 2) { ctx.fill(); }
      else { if (fillMode === 1) { ctx.globalAlpha = 0.14; ctx.fill(); ctx.globalAlpha = 1; } ctx.stroke(); }
      if (d.s) {
        // 도형 안 글자: 가운데 정렬, 너비에 맞게 줄바꿈. 진하게 채우면 흰 글자
        const z = d.z || 28, inner = d.t === 'rect' ? w - 24 : w * 0.68;
        ctx.font = `700 ${z}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = fillMode === 2 ? '#ffffff' : '#191f28';
        const lines = wrapLines(ctx, d.s, Math.max(20, inner));
        const lh = z * 1.25, top = y + hh / 2 - (lines.length - 1) * lh / 2;
        lines.forEach((l, i) => ctx.fillText(l, x + w / 2, top + i * lh));
      }
      break;
    }
    case 'text':
      ctx.font = `600 ${d.z}px ${FONT}`; ctx.textBaseline = 'top';
      textLines(d.s).forEach((l, i) => ctx.fillText(l, p[0], p[1] + i * d.z * 1.3)); break;
    case 'note': {
      ctx.shadowColor = 'rgba(0,0,0,.12)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
      ctx.fillStyle = d.c; roundRect(ctx, p[0], p[1], p[2], p[3], 8); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#191f28'; ctx.font = `500 22px ${FONT}`; ctx.textBaseline = 'top';
      const lines = wrapLines(ctx, d.s, p[2] - 28);
      const max = Math.floor((p[3] - 24) / 29);
      lines.slice(0, max).forEach((l, i) => ctx.fillText(l, p[0] + 14, p[1] + 14 + i * 29));
      break;
    }
  }
  ctx.restore();
}

async function editor(view, id) {
  let W = 1600, H = 1000;
  let meta = null, strokes = [], lastId = 0, version = 0;
  let tool = 'pen', color = PALETTE[0], width = 4, fill = 0, eraseMode = 'object';
  try { if (localStorage.getItem('sf-erase-mode') === 'pixel') eraseMode = 'pixel'; } catch (e) {}
  let grid = false;
  try { grid = localStorage.getItem('sf-grid-' + id) === '1'; } catch (e) {}
  let selected = null;   // 선택한 조각의 id
  const canvas = h('canvas', { class: 'board-canvas', tabindex: '0', 'aria-label': '그림판. 도구를 고르고 마우스나 손가락으로 그려요' });
  const ctx = canvas.getContext('2d');
  const titleEl = h('h1');
  const metaEl = h('div', { class: 'row small muted' });
  const ownerBox = h('span', { class: 'row' });

  const toolBtns = TOOLS.map(([k, ic, label]) => h('button', { type: 'button', class: 'btn icon sm tool', title: label, 'aria-label': label, onclick: () => setTool(k) }, icon(ic)));
  const swatches = PALETTE.map((c) => h('button', { type: 'button', class: 'swatch', style: { '--c': c }, 'aria-label': '색 ' + c, onclick: () => { color = c; paintTools(); recolorSelected(); } }));
  const widthIn = h('input', { type: 'range', min: '1', max: '20', value: String(width), class: 'width-in', 'aria-label': '굵기', oninput: (e) => { width = Number(e.target.value); } });
  const FILL_LABEL = ['채우기 없음', '옅게 채우기', '진하게 채우기'];
  const fillBtn = h('button', { type: 'button', class: 'btn sm tool', title: '도형 안 채우기 (누를 때마다 바뀌어요)', onclick: () => { fill = (fill + 1) % 3; paintTools(); } });
  /* 지우개 두 종류: 통째로(누른 그림 하나를 지움) / 부분(문지른 곳만 지움) */
  const eraseSeg = h('div', { class: 'seg', role: 'group', 'aria-label': '지우개 종류' },
    h('button', { type: 'button', 'data-m': 'object', onclick: () => setErase('object') }, '통째로'),
    h('button', { type: 'button', 'data-m': 'pixel', onclick: () => setErase('pixel') }, '부분'));
  function setErase(m) { eraseMode = m; try { localStorage.setItem('sf-erase-mode', m); } catch (e) {} paintTools(); }
  const gridBtn = h('button', { type: 'button', class: 'btn icon sm tool', title: '모눈 배경', 'aria-label': '모눈 배경', onclick: () => { grid = !grid; try { localStorage.setItem('sf-grid-' + id, grid ? '1' : '0'); } catch (e) {} paintTools(); redraw(); } }, icon('grid'));
  const tplBtn = h('button', { type: 'button', class: 'btn sm', onclick: templates }, icon('mindmap'), '템플릿');
  const undoBtn = h('button', { type: 'button', class: 'btn icon sm', title: '내가 마지막으로 그린 것 되돌리기', 'aria-label': '되돌리기', onclick: undo }, icon('undo'));
  const selBar = h('div', { class: 'selbar', hidden: true },
    h('span', { class: 'small muted' }, '선택됨'),
    h('button', { type: 'button', class: 'btn sm', 'data-edit': '1', onclick: () => editTextOf(selected) }, icon('edit'), '글자 고치기'),
    h('button', { type: 'button', class: 'btn sm', onclick: () => duplicateSelected() }, icon('copy'), '복제'),
    h('button', { type: 'button', class: 'btn danger sm', onclick: () => removeIds([selected]) }, icon('trash'), '삭제'),
    h('button', { type: 'button', class: 'btn ghost sm', onclick: () => select(null) }, '선택 해제'));
  const hint = h('p', { class: 'tiny muted', style: { margin: 0 } });

  function setTool(k) { tool = k; if (k !== 'select') select(null); paintTools(); }
  function paintTools() {
    toolBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(TOOLS[i][0] === tool)));
    swatches.forEach((s, i) => s.setAttribute('aria-pressed', String(PALETTE[i] === color)));
    fillBtn.setAttribute('aria-pressed', String(fill > 0));
    fillBtn.textContent = FILL_LABEL[fill];
    fillBtn.hidden = !SHAPES.includes(tool);
    eraseSeg.hidden = tool !== 'eraser';
    [...eraseSeg.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === eraseMode)));
    gridBtn.setAttribute('aria-pressed', String(grid));
    canvas.style.cursor = tool === 'select' ? 'default' : tool === 'text' ? 'text' : tool === 'eraser' ? (eraseMode === 'pixel' ? 'crosshair' : 'cell') : 'crosshair';
    hint.textContent = {
      select: '그림을 눌러 고르고 끌어서 옮겨요. 글자·포스트잇·도형은 두 번 누르면 글자를 고쳐요. Delete 키로 지워요',
      pen: '자유롭게 그려요', eraser: eraseMode === 'pixel' ? '누른 채로 문지른 곳만 지워요 (굵기로 지우개 크기를 바꿔요)' : '누른 채로 문지르면 지나간 그림이 통째로 모두 지워져요',
      diamond: '끌어서 마름모를 그려요 (순서도의 판단)',
      line: '끌어서 선을 그어요', arrow: '끌어서 화살표를 그려요 (끝나는 쪽에 화살촉)',
      rect: '끌어서 네모를 그려요. 두 번 누르면 안에 글자를 쓸 수 있어요', ellipse: '끌어서 동그라미를 그려요',
      text: '글자를 넣을 곳을 눌러요', note: '포스트잇을 붙일 곳을 눌러요',
    }[tool] + ' · 친구 그림은 1~2초 안에 나타나요';
  }
  view.append(h('a', { class: 'btn ghost sm', href: '#/draw', style: { 'margin-bottom': '8px' } }, icon('back'), '그림판 목록'),
    h('div', { class: 'head' }, h('div', null, titleEl, metaEl), ownerBox),
    h('div', { class: 'draw-wrap' },
      h('div', { class: 'toolbar' }, toolBtns, h('span', { class: 'sep' }), swatches, h('span', { class: 'sep' }),
        h('label', { class: 'row small muted' }, '굵기', widthIn), fillBtn, eraseSeg, h('span', { class: 'grow' }), gridBtn, tplBtn, undoBtn),
      selBar, canvas, hint));
  paintTools();

  /* ===== 화면 그리기 ===== */
  let cur = null;          // 지금 그리는 중인 조각
  let drag = null;         // 옮기는 중: {id, x0, y0, d0, d}
  let erasing = null;      // 지우개로 문지르는 중: Set(id)
  let eraseAt = null;      // 지우개가 마지막으로 지난 자리
  function fit() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.width * (H / W) * dpr));
    redraw();
  }
  /* 그리기는 두 층: 흰 종이(+모눈) 위에 잉크 층을 얹어요. 부분 지우개는 잉크 층만 파내요 */
  const ink = document.createElement('canvas');
  const ictx = ink.getContext('2d');
  function redraw() {
    if (ink.width !== canvas.width || ink.height !== canvas.height) { ink.width = canvas.width; ink.height = canvas.height; }
    ictx.setTransform(1, 0, 0, 1, 0, 0); ictx.clearRect(0, 0, ink.width, ink.height);
    ictx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    for (const s of strokes) {
      if (erasing && erasing.has(s.id)) continue;
      drawObj(ictx, drag && drag.id === s.id ? drag.d : s.d);
    }
    if (cur) drawObj(ictx, cur);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    if (grid) {
      ctx.save(); ctx.strokeStyle = '#e9edf2'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 40; x < W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = 40; y < H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(ink, 0, 0); ctx.restore();
    const sel = selected && strokes.find((s) => s.id === selected);
    if (sel) {
      const [x1, y1, x2, y2] = bbox(drag && drag.id === sel.id ? drag.d : sel.d);
      ctx.save(); ctx.strokeStyle = '#3182f6'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      ctx.strokeRect(x1 - 8, y1 - 8, x2 - x1 + 16, y2 - y1 + 16); ctx.restore();
    }
  }
  function select(sid) {
    selected = sid;
    const s = sid && strokes.find((x) => x.id === sid);
    selBar.hidden = !s;
    if (s) selBar.querySelector('[data-edit]').hidden = !(s.d.t === 'text' || s.d.t === 'note' || SHAPES.includes(s.d.t));
    redraw();
  }

  /* ===== 좌표·찾기 ===== */
  function pt(e) {
    const r = canvas.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) / r.width * W), Math.round((e.clientY - r.top) / r.height * H)];
  }
  function findAt(x, y) {
    for (let i = strokes.length - 1; i >= 0; i--) { const s = strokes[i]; if (s.id && s.d.t !== 'eraser' && hits(s.d, x, y)) return s; }
    return null;
  }

  /* ===== 서버에 저장 ===== */
  async function addObj(d) {
    const local = { id: 0, by: state.me.id, d, pending: true };
    strokes.push(local); redraw();
    try { const r = await api.post('canvas.stroke', { id, d }); local.id = r.id; local.pending = false; return local; }
    catch (ex) { strokes = strokes.filter((s) => s !== local); redraw(); errToast(ex); return null; }
  }
  async function editObj(sid, d) {
    const s = strokes.find((x) => x.id === sid); if (!s) return;
    const old = s.d; s.d = d; redraw();
    try { const r = await api.post('canvas.edit', { id, sid, d }); version = r.version; s.d = r.d; redraw(); }
    catch (ex) { s.d = old; redraw(); errToast(ex); }
  }
  async function removeIds(ids) {
    ids = ids.filter(Boolean); if (!ids.length) return;
    const keep = strokes; strokes = strokes.filter((s) => !ids.includes(s.id)); if (ids.includes(selected)) select(null); else redraw();
    try { const r = await api.post('canvas.remove', { id, sids: ids }); version = r.version; }
    catch (ex) { strokes = keep; redraw(); errToast(ex); }
  }
  function recolorSelected() {
    const s = selected && strokes.find((x) => x.id === selected);
    if (!s || s.d.t === 'note' || s.d.t === 'eraser') return;
    editObj(s.id, { ...s.d, c: color });
  }
  async function duplicateSelected() {
    const s = selected && strokes.find((x) => x.id === selected); if (!s) return;
    const n = await addObj(moved(s.d, 30, 30)); if (n) select(n.id);
  }

  /* ===== 글자·포스트잇 입력 창 ===== */
  function textModal({ title, value = '', note = false, size = 36, noteColor = NOTE_COLORS[0], allowEmpty = false, sizes: sizeOpts = [['작게', 24], ['보통', 36], ['크게', 56], ['제목', 80]] }, onOk) {
    const ta = h('textarea', { class: 'input', rows: note ? '4' : '2', maxlength: note ? '300' : '200', value, placeholder: note ? '포스트잇에 적을 내용' : '넣을 글자' });
    let z = size, nc = noteColor;
    const sizes = h('div', { class: 'seg' }, sizeOpts.map(([l, v]) =>
      h('button', { type: 'button', 'aria-pressed': String(v === z), onclick: (e) => { z = v; [...sizes.children].forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, l)));
    const ncs = h('div', { class: 'colors' }, NOTE_COLORS.map((c) => h('button', { type: 'button', style: { '--c': c }, 'aria-label': '종이 색', 'aria-pressed': String(c === nc),
      onclick: (e) => { nc = c; [...ncs.children].forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } })));
    const m = modal([h('h2', null, title), h('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      if (!note && !allowEmpty && !ta.value.trim()) { ta.focus(); return; }
      m.close(); onOk({ s: ta.value, z, c: nc });
    } }, ta, note ? h('div', { class: 'field' }, '종이 색', ncs) : h('div', { class: 'field' }, '크기', sizes),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, '취소'), h('button', { class: 'btn primary', type: 'submit' }, '확인')))]);
  }
  function editTextOf(sid) {
    const s = strokes.find((x) => x.id === sid); if (!s) return;
    if (s.d.t === 'text') textModal({ title: '글자 고치기', value: s.d.s, size: s.d.z }, ({ s: text, z }) => editObj(s.id, { ...s.d, s: text, z }));
    else if (s.d.t === 'note') textModal({ title: '포스트잇 고치기', value: s.d.s, note: true, noteColor: s.d.c }, ({ s: text, c }) => editObj(s.id, { ...s.d, s: text, c }));
    else if (SHAPES.includes(s.d.t)) textModal({ title: '도형 안 글자', value: s.d.s || '', size: s.d.z || 28, allowEmpty: true, sizes: [['작게', 22], ['보통', 28], ['크게', 40]] },
      ({ s: text, z }) => { const n = { ...s.d }; if (text.trim()) { n.s = text.trim(); n.z = z; } else { delete n.s; delete n.z; } editObj(s.id, n); });
  }

  /* ===== 마우스·손가락 ===== */
  let pointerId = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (pointerId !== null) return;
    const [x, y] = pt(e);
    canvas.focus({ preventScroll: true });
    if (tool === 'text') {
      textModal({ title: '글자 넣기' }, ({ s, z }) => addObj({ t: 'text', c: color, z, s, p: [x, y - Math.round(z / 2)] }));
      return;
    }
    if (tool === 'note') {
      textModal({ title: '포스트잇 붙이기', note: true }, ({ s, c }) => addObj({ t: 'note', c, s, p: [x - 110, y - 70, 220, 140] }));
      return;
    }
    pointerId = e.pointerId; canvas.setPointerCapture(e.pointerId); e.preventDefault();
    if (tool === 'select') {
      const s = findAt(x, y);
      select(s ? s.id : null);
      if (s) drag = { id: s.id, x0: x, y0: y, d0: s.d, d: s.d, movedBy: 0 };
      return;
    }
    if (tool === 'eraser' && eraseMode === 'object') { erasing = new Set(); eraseAt = [x, y]; const s = findAt(x, y); if (s) erasing.add(s.id); redraw(); return; }
    if (tool === 'eraser') cur = { t: 'eraser', c: '#000000', w: Math.min(60, Math.max(12, width * 3)), p: [x, y] };
    else if (tool === 'pen') cur = { t: 'pen', c: color, w: width, p: [x, y] };
    else cur = { t: tool, c: color, w: Math.min(20, width), f: SHAPES.includes(tool) ? fill : 0, p: [x, y, x, y] };
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    const [x, y] = pt(e);
    if (drag) { drag.d = moved(drag.d0, x - drag.x0, y - drag.y0); drag.movedBy = Math.abs(x - drag.x0) + Math.abs(y - drag.y0); redraw(); return; }
    if (erasing) {
      // 빨리 움직여도 지나간 길 위의 그림을 놓치지 않게 6칸마다 확인해요
      const [x0, y0] = eraseAt || [x, y], dist = Math.hypot(x - x0, y - y0), n = Math.max(1, Math.ceil(dist / 6));
      let changed = false;
      for (let i = 1; i <= n; i++) {
        const s = findAt(x0 + (x - x0) * i / n, y0 + (y - y0) * i / n);
        if (s && !erasing.has(s.id)) { erasing.add(s.id); changed = true; }
      }
      eraseAt = [x, y];
      if (changed) redraw();
      return;
    }
    if (!cur) return;
    if (cur.t === 'pen' || cur.t === 'eraser') {
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of events) {
        const [px, py] = pt(ev), n = cur.p.length;
        if (Math.abs(cur.p[n - 2] - px) + Math.abs(cur.p[n - 1] - py) < 2) continue;
        if (n >= 7998) break;
        cur.p.push(px, py);
      }
    } else {
      let [px, py] = [x, y];
      if (e.shiftKey && SHAPES.includes(cur.t)) { const s = Math.max(Math.abs(px - cur.p[0]), Math.abs(py - cur.p[1])); px = cur.p[0] + Math.sign(px - cur.p[0] || 1) * s; py = cur.p[1] + Math.sign(py - cur.p[1] || 1) * s; }
      cur.p[2] = px; cur.p[3] = py;
    }
    redraw();
  });
  async function finish(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (drag) {
      const dr = drag; drag = null;
      if (dr.movedBy > 3) await editObj(dr.id, dr.d); else redraw();
      return;
    }
    if (erasing) { const ids = [...erasing]; erasing = null; await removeIds(ids); return; }
    if (!cur) return;
    const d = cur; cur = null;
    if (d.t !== 'pen' && d.t !== 'eraser' && Math.hypot(d.p[2] - d.p[0], d.p[3] - d.p[1]) < 6) { redraw(); return; }   // 너무 작으면 무시
    await addObj(d);
  }
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  canvas.addEventListener('dblclick', (e) => {
    const [x, y] = pt(e); const s = findAt(x, y);
    if (s && (s.d.t === 'text' || s.d.t === 'note' || SHAPES.includes(s.d.t))) { select(s.id); editTextOf(s.id); }
  });
  /* 단축키: V P E L A R O T N, Delete 로 선택한 것 지우기, Esc 선택 해제 */
  function onKey(e) {
    if (document.querySelector('.modal-bg')) return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); removeIds([selected]); return; }
    if (e.key === 'Escape') { select(null); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = KEYS[e.key.toLowerCase()]; if (k) setTool(k);
  }
  document.addEventListener('keydown', onKey);

  /* ===== 템플릿 (미리보기를 보고 골라요) ===== */
  function templates() {
    const grid = h('div', { class: 'tpl-grid' });
    for (const t of TEMPLATES) {
      const c = h('canvas', { class: 'tpl-prev', width: '480', height: '300', 'aria-hidden': 'true' });
      const x = c.getContext('2d');
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, 480, 300);
      x.setTransform(480 / W, 0, 0, 300 / H, 0, 0);
      for (const d of t.build()) drawObj(x, d);
      grid.append(h('button', { type: 'button', class: 'tpl-card', onclick: () => { m.close(); insert(t.build()); } },
        c, h('b', null, t.name), h('span', null, t.desc)));
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
      // 글꼴이 늦게 오면 미리보기를 다시 그려요
      [...grid.querySelectorAll('canvas')].forEach((c, i) => {
        const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 480, 300);
        x.setTransform(480 / W, 0, 0, 300 / H, 0, 0); for (const d of TEMPLATES[i].build()) drawObj(x, d);
      });
    });
    const m = modal([h('h2', null, '템플릿 넣기'), h('p', { class: 'lead' }, '정리하기 좋은 틀을 골라 그림판에 넣어요. 넣은 뒤 상자를 두 번 눌러 글자를 고치세요'),
      grid, h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, '닫기'))], { wide: true });
  }
  async function insert(list) {
    try {
      const r = await api.post('canvas.bulk', { id, list });
      for (const st of r.strokes) if (!strokes.some((x) => x.id === st.id)) strokes.push(st);
      strokes.sort((a, b) => (a.id || 1e15) - (b.id || 1e15));
      redraw(); setTool('select');
      toast('템플릿을 넣었어요. 상자를 두 번 눌러 글자를 고쳐 보세요');
    } catch (e) { errToast(e); }
  }

  async function undo() {
    undoBtn.disabled = true;
    try {
      const r = await api.post('canvas.undo', { id });
      strokes = strokes.filter((s) => s.id !== r.removed); version = r.version;
      if (selected === r.removed) select(null); else redraw();
    } catch (e) { errToast(e); } finally { undoBtn.disabled = false; }
  }
  async function clearAll() {
    try { const r = await api.post('canvas.clear', { id }); strokes = []; version = r.version; select(null); toast('모두 지웠어요'); } catch (e) { errToast(e); }
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
    if (selected && !strokes.some((s) => s.id === selected)) select(null);
    paintMeta(); redraw();
  }
  async function poll() {
    if (cur || drag || erasing) return;
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
    metaEl.replaceChildren(...[avatar(meta.owner, 'sm'), meta.mine ? '내 그림판' : meta.owner.name + '님의 그림판', meta.mine ? h('span', { class: 'pill' }, visIcon(meta.visibility), VIS_LABEL[meta.visibility]) : null].filter(Boolean));
    ownerBox.replaceChildren(...(meta.mine ? [confirmBtn('모두 지우기', '한 번 더 누르면 모두 지워져요', clearAll, 'btn danger sm'),
      h('button', { class: 'btn sm', type: 'button', onclick: () => settingsModal(meta, loadAll) }, icon('gear'), '설정')] : []));
  }

  try { await loadAll(); } catch (e) { view.replaceChildren(h('div', { class: 'card empty' }, e.message, h('br'), h('a', { href: '#/draw' }, '목록으로'))); return; }
  fit();
  const ro = new ResizeObserver(() => fit());
  ro.observe(canvas);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => redraw());
  const stop = every(1500, poll);
  return () => { stop(); ro.disconnect(); document.removeEventListener('keydown', onKey); };
}
