/* 하루 기록: 날짜마다 메모와 사진. 사진은 즉석 사진처럼, 메모는 줄 노트에 손글씨로 */
import { api, h, icon, toast, errToast, modal } from './core.js';

export const photoUrl = (id, full) => 'api.php?a=journal.photo&id=' + id + (full ? '&size=full' : '');
const TILT = [-2.2, 1.6, -0.8, 2.4];   // 사진마다 살짝 다르게 기울여요

/* 사진 파일 → 긴 변 max px 이하 JPEG data URL (비율 유지) */
function toJpeg(img, max, quality) {
  const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * r)); c.height = Math.max(1, Math.round(img.naturalHeight * r));
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이 사진 형식은 읽을 수 없어요. JPG나 PNG로 해 주세요')); };
    img.src = url;
  });
}

/* 사진 크게 보기 (좌우로 넘기기) */
export function lightbox(photos, start = 0) {
  let i = start;
  const img = h('img', { class: 'lb-img', alt: '' });
  const count = h('span', { class: 'small muted' });
  function show() { img.src = photoUrl(photos[i].id, true); count.textContent = photos.length > 1 ? `${i + 1} / ${photos.length}` : ''; }
  const prev = h('button', { class: 'btn icon', type: 'button', 'aria-label': '이전 사진', onclick: () => { i = (i + photos.length - 1) % photos.length; show(); } }, icon('back'));
  const next = h('button', { class: 'btn icon', type: 'button', 'aria-label': '다음 사진', onclick: () => { i = (i + 1) % photos.length; show(); } }, icon('next'));
  const m = modal([h('div', { class: 'lb' }, img),
    h('div', { class: 'actions', style: { 'align-items': 'center' } }, photos.length > 1 ? prev : null, photos.length > 1 ? next : null, count, h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', type: 'button', onclick: () => m.close() }, '닫기'))], { wide: true });
  m.box.addEventListener('keydown', (e) => { if (photos.length > 1 && e.key === 'ArrowLeft') prev.click(); if (photos.length > 1 && e.key === 'ArrowRight') next.click(); });
  show();
}

/* 즉석 사진 한 장 */
function polaroid(p, i, all, onRemove) {
  const fig = h('figure', { class: 'polaroid', style: { '--tilt': TILT[i % TILT.length] + 'deg' } },
    h('button', { class: 'pic', type: 'button', 'aria-label': '사진 크게 보기', onclick: () => lightbox(all, i) },
      h('img', { src: photoUrl(p.id), alt: '', loading: 'lazy' })));
  if (onRemove) {
    let armed = false, t;
    const x = h('button', { class: 'pol-x', type: 'button', 'aria-label': '사진 지우기', onclick: async (e) => {
      e.stopPropagation();
      if (!armed) { armed = true; x.classList.add('armed'); x.textContent = '지울까요?'; t = setTimeout(() => { armed = false; x.classList.remove('armed'); x.replaceChildren(icon('x')); }, 3000); return; }
      clearTimeout(t); x.disabled = true; await onRemove(p);
    } }, icon('x'));
    fig.append(x);
  }
  return fig;
}

/* 다른 사람(친구) 기록 보기 */
export function journalView(note) {
  if (!note) return null;
  const wrap = h('div', { class: 'jr-view' });
  if (note.photos.length) wrap.append(h('div', { class: 'pol-row' }, note.photos.map((p, i) => polaroid(p, i, note.photos))));
  if (note.memo.trim()) wrap.append(h('div', { class: 'jr-paper read' }, note.memo));
  return wrap;
}

/* 내 하루 기록 카드. note 는 journal.get 의 mine (없으면 null) */
export function journalCard(date, note, { onChanged } = {}) {
  let cur = note ? { ...note } : { memo: '', visibility: 'friends', photos: [] };
  let saveT = null, saving = false, dirty = false;
  const card = h('section', { class: 'card journal', 'aria-label': '하루 기록' });
  const status = h('span', { class: 'small muted', 'aria-live': 'polite' });
  const visBtn = h('button', { type: 'button', class: 'pill vis-chip', onclick: () => { cur.visibility = cur.visibility === 'private' ? 'friends' : 'private'; paintVis(); queueSave(true); } });
  const memo = h('textarea', { class: 'jr-paper', maxlength: '3000', rows: '5', placeholder: '오늘 공부한 것, 기분, 내일 할 것…', 'aria-label': '하루 메모', value: cur.memo });
  const row = h('div', { class: 'pol-row' });
  const fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: () => addFiles([...fileIn.files]) });

  function paintVis() {
    const priv = cur.visibility === 'private';
    visBtn.replaceChildren(icon(priv ? 'lock' : 'users'), priv ? '나만 봐요' : '친구에게 보여요');
    visBtn.setAttribute('aria-label', priv ? '공개 범위: 나만 보기. 누르면 친구에게 보여요' : '공개 범위: 친구에게 보여요. 누르면 나만 보기');
    visBtn.classList.toggle('accent', !priv);
  }
  function paintPhotos(uploading = 0) {
    row.replaceChildren();
    cur.photos.forEach((p, i) => row.append(polaroid(p, i, cur.photos, removePhoto)));
    for (let k = 0; k < uploading; k++) row.append(h('div', { class: 'polaroid loading', style: { '--tilt': '0deg' } }, h('div', { class: 'pic' }, h('span', { class: 'small muted' }, '올리는 중…'))));
    if (cur.photos.length + uploading < 4) row.append(h('button', { type: 'button', class: 'pol-add', onclick: () => fileIn.click() }, icon('camera'), h('span', null, '사진 넣기'), h('small', null, `${cur.photos.length}/4`)));
  }
  async function addFiles(files) {
    fileIn.value = '';
    files = files.slice(0, 4 - cur.photos.length);
    if (!files.length) { toast('사진은 하루에 4장까지예요'); return; }
    let left = files.length;
    paintPhotos(left);
    for (const f of files) {
      try {
        if (f.size > 30 * 1024 * 1024) throw new Error('30MB 이하 사진을 골라 주세요');
        const img = await loadImage(f);
        const r = await api.post('journal.photo_add', { date, image: toJpeg(img, 1600, 0.82), thumb: toJpeg(img, 480, 0.8), visibility: cur.visibility });
        cur.photos = r.note.photos; cur.id = r.note.id;
      } catch (e) { errToast(e); }
      left--; paintPhotos(left);
    }
    if (onChanged) onChanged();
  }
  async function removePhoto(p) {
    try {
      const r = await api.post('journal.photo_remove', { id: p.id });
      cur.photos = r.note ? r.note.photos : [];
      paintPhotos(); toast('사진을 지웠어요'); if (onChanged) onChanged();
    } catch (e) { errToast(e); paintPhotos(); }
  }
  function queueSave(now) {
    dirty = true; status.textContent = '쓰는 중…';
    clearTimeout(saveT); saveT = setTimeout(save, now ? 0 : 900);
  }
  async function save() {
    if (saving) { saveT = setTimeout(save, 400); return; }
    saving = true; const sent = memo.value;
    try {
      await api.post('journal.save', { date, memo: sent, visibility: cur.visibility });
      dirty = memo.value !== sent; status.textContent = dirty ? '쓰는 중…' : '저장했어요';
      if (onChanged) onChanged();
    } catch (e) { status.textContent = '저장하지 못했어요'; errToast(e); }
    finally { saving = false; if (dirty) { clearTimeout(saveT); saveT = setTimeout(save, 600); } }
  }
  memo.addEventListener('input', () => queueSave(false));

  card.append(
    h('div', { class: 'row', style: { 'justify-content': 'space-between', 'margin-bottom': '4px' } },
      h('h2', { style: { margin: 0 } }, '하루 기록'), h('div', { class: 'row' }, status, visBtn)),
    h('p', { class: 'small muted', style: { margin: '0 0 14px' } }, '사진과 메모로 이날을 남겨요. 캘린더에 사진이 붙어요'),
    h('div', { class: 'jr-grid' }, row, memo), fileIn);
  paintVis(); paintPhotos();
  card.flush = () => { if (dirty) { clearTimeout(saveT); return save(); } };
  return card;
}

/* ===== 공부 인증 (선택) =====
   공부를 끝낸 뒤 사진 한 장과 한 줄 메모를 남겨요. 건너뛰어도 돼요 */
export const proofUrl = (id, full) => 'api.php?a=study.proof&id=' + id + (full ? '&size=full' : '');
export function proofModal(session, { onDone } = {}) {
  const sid = session.id;
  let file = null, vis = (session.proof && session.proof.visibility) || 'friends';
  const preview = h('div', { class: 'proof-pic' });
  const note = h('input', { class: 'input', maxlength: '200', placeholder: '한 줄 메모 (예: DB 3단원 끝!)', value: (session.proof && session.proof.note) || '' });
  const fileIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: async () => {
    const f = fileIn.files[0]; fileIn.value = ''; if (!f) return;
    try { file = await loadImage(f); paintPic(); } catch (e) { errToast(e); }
  } });
  function paintPic() {
    preview.replaceChildren();
    if (file) preview.append(h('img', { src: toJpeg(file, 800, 0.8), alt: '고른 인증 사진' }));
    else if (session.proof && session.proof.photo) preview.append(h('img', { src: proofUrl(sid), alt: '지금 인증 사진' }));
    preview.append(h('button', { type: 'button', class: 'btn sm', onclick: () => fileIn.click() }, icon('camera'), file || (session.proof && session.proof.photo) ? '사진 바꾸기' : '사진 찍기·고르기'));
  }
  const visSeg = h('div', { class: 'seg' });
  function paintVis() {
    visSeg.replaceChildren(...[['friends', '친구에게 보여요'], ['private', '나만 봐요']].map(([k, l]) =>
      h('button', { type: 'button', 'aria-pressed': String(vis === k), onclick: () => { vis = k; paintVis(); } }, l)));
  }
  const err = h('div', { class: 'err' });
  const save = h('button', { class: 'btn primary', type: 'submit' }, icon('badge'), '인증 남기기');
  const mins = Math.round((session.seconds || 0) / 60);
  const m = modal([
    h('h2', null, '공부 인증 남기기'),
    h('p', { class: 'lead' }, `${mins >= 60 ? Math.floor(mins / 60) + '시간 ' : ''}${mins % 60}분 공부했어요. 책상이나 노트 사진을 남기면 친구 화면과 등수에 '인증'이 붙어요. 안 해도 괜찮아요`),
    h('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      if (!file && !(session.proof && session.proof.photo) && !note.value.trim()) { err.textContent = '사진이나 한 줄 메모 중 하나는 남겨 주세요'; return; }
      save.disabled = true;
      try {
        const body = { id: sid, note: note.value, visibility: vis };
        if (file) { body.image = toJpeg(file, 1600, 0.82); body.thumb = toJpeg(file, 480, 0.8); }
        const r = await api.post('study.verify', body);
        m.close(); toast('공부 인증을 남겼어요'); if (onDone) onDone(r.session);
      } catch (ex) { err.textContent = ex.message; } finally { save.disabled = false; }
    } }, preview, fileIn, note, h('div', { class: 'field' }, '누가 볼까요?', visSeg), err,
      h('div', { class: 'actions' },
        session.proof ? h('span', { class: 'left' }, h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
          try { await api.post('study.unverify', { id: sid }); m.close(); toast('인증을 지웠어요'); if (onDone) onDone(null); } catch (ex) { errToast(ex); }
        } }, '인증 지우기')) : null,
        h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, session.proof ? '닫기' : '건너뛰기'), save)),
  ]);
  paintPic(); paintVis();
}

/* 인증 카드 (사진 + 공부 시간 + 한 줄 메모) */
export function proofCard(s, { mine = false, onChanged } = {}) {
  const mins = Math.round(s.seconds / 60);
  const dur = `${mins >= 60 ? Math.floor(mins / 60) + '시간 ' : ''}${mins % 60}분`;
  const time = s.start.slice(11, 16) + (s.end ? '–' + s.end.slice(11, 16) : '');
  if (!s.proof) {
    return h('div', { class: 'sess' }, h('span', { class: 'small' }, time, ' · ', dur, s.live ? ' · 공부 중' : ''),
      mine && !s.live ? h('button', { class: 'btn sm', type: 'button', onclick: () => proofModal(s, { onDone: onChanged }) }, icon('badge'), '인증하기') : null);
  }
  return h('div', { class: 'proof' + (s.proof.photo ? '' : ' no-pic') },
    s.proof.photo ? h('button', { type: 'button', class: 'proof-thumb', 'aria-label': '인증 사진 크게 보기', onclick: () => lightboxUrl(proofUrl(s.id, true)) }, h('img', { src: proofUrl(s.id), alt: '', loading: 'lazy' })) : null,
    h('div', { class: 'proof-body' },
      h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'pill accent' }, icon('badge'), '인증'), h('b', null, dur), h('span', { class: 'small muted' }, time),
        mine && s.proof.visibility === 'private' ? h('span', { class: 'pill' }, icon('lock'), '나만') : null),
      s.proof.note ? h('div', { class: 'proof-note' }, s.proof.note) : null,
      mine ? h('button', { class: 'link', type: 'button', onclick: () => proofModal(s, { onDone: onChanged }) }, '고치기') : null));
}
function lightboxUrl(url) {
  const m = modal([h('div', { class: 'lb' }, h('img', { class: 'lb-img', src: url, alt: '' })),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => m.close() }, '닫기'))], { wide: true });
}
