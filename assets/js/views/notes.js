/* 메모장: 혼자 쓰거나 친구와 같이 쓰기. 자동 저장, 다른 사람이 동시에 고치면 알려 줘요 */
import { state, api, h, icon, avatar, toast, errToast, modal, confirmBtn, visibilityPicker, every, setTitle, ago, VIS_LABEL, visIcon, app } from '../core.js';

export default async function mount(view, route) {
  const noteId = route.params[0] ? Number(route.params[0]) : null;
  setTitle('메모장');
  const layout = h('div', { class: 'notes-layout' + (noteId ? ' has-note' : '') });
  const listEl = h('ul', { class: 'list' });
  const listPane = h('div', { class: 'card list-pane' },
    h('div', { class: 'row', style: { 'justify-content': 'space-between', 'margin-bottom': '8px' } }, h('h2', { style: { margin: 0 } }, '메모장'),
      h('button', { class: 'btn primary sm', type: 'button', onclick: create }, icon('plus'), '새 메모')), listEl);
  const pane = h('div', { class: 'card note-pane' });
  layout.append(listPane, pane);
  view.append(layout);

  async function create() {
    try { const r = await api.post('notes.create', { title: '새 메모', visibility: 'private' }); app.go('notes/' + r.id); } catch (e) { errToast(e); }
  }
  async function loadList() {
    const r = await api.get('notes.list');
    listEl.replaceChildren();
    if (!r.notes.length) listEl.append(h('li', { class: 'empty' }, '아직 메모가 없어요'));
    for (const n of r.notes) listEl.append(h('li', null, h('a', { class: 'li', href: '#/notes/' + n.id, style: n.id === noteId ? { background: 'var(--accent-bg)' } : null },
      h('div', { class: 'grow' }, h('div', { class: 't' }, n.title),
        h('div', { class: 's' }, (n.mine ? '' : n.owner.name + ' · ') + ago(n.updatedAt) + (n.preview ? ' · ' + n.preview : ''))),
      n.mine ? visIcon(n.visibility) : avatar(n.owner, 'sm'))));
  }

  if (!noteId) {
    pane.append(h('div', { class: 'empty' }, '왼쪽에서 메모를 고르거나 새로 만드세요'));
    await loadList().catch(errToast);
    return every(20000, loadList);
  }

  /* ===== 편집기 ===== */
  let note = null, dirty = false, saving = false, saveT = null, conflict = null;
  const titleIn = h('input', { class: 'note-title', maxlength: '100', 'aria-label': '제목' });
  const bodyIn = h('textarea', { class: 'note-body', maxlength: '100000', 'aria-label': '내용', placeholder: '여기에 적어요. 공유한 친구도 같이 고칠 수 있어요' });
  const status = h('span');
  const metaEl = h('div', { class: 'note-meta' });
  const banner = h('div', { class: 'banner', hidden: true });
  pane.append(h('a', { class: 'btn ghost sm', href: '#/notes' }, icon('back'), '목록'), metaEl, banner, titleIn, bodyIn);

  function paintMeta() {
    metaEl.replaceChildren(avatar(note.owner, 'sm'), note.mine ? '내 메모' : note.owner.name + '님의 메모',
      note.mine ? h('button', { class: 'pill', type: 'button', style: { border: 0 }, onclick: share }, visIcon(note.visibility), VIS_LABEL[note.visibility]) : null,
      h('span', { class: 'grow' }), status,
      note.mine ? confirmBtn('삭제', '한 번 더 누르면 삭제', async () => {
        try { await api.post('notes.delete', { id: note.id }); toast('메모를 지웠어요'); app.go('notes'); } catch (e) { errToast(e); }
      }, 'btn ghost sm') : null);
    paintStatus();
  }
  function paintStatus() {
    status.textContent = conflict ? '충돌' : saving ? '저장 중…' : dirty ? '입력 중…' :
      (note.updatedBy && note.updatedBy.id !== state.me.id ? `${note.updatedBy.name}님이 ${ago(note.updatedAt)} 고침` : '저장됨');
  }
  function share() {
    const vis = visibilityPicker(note.visibility, note.shares);
    const m = modal([h('h2', null, '메모 공유'), h('p', { class: 'lead' }, '공유받은 친구는 이 메모를 읽고 고칠 수 있어요'), vis.el,
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, '취소'),
        h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          try { const v = vis.value(); await api.post('notes.meta', { id: note.id, ...v }); Object.assign(note, v); m.close(); paintMeta(); toast('공유 설정을 바꿨어요'); loadList(); } catch (e) { errToast(e); }
        } }, '저장'))]);
  }
  function onInput() {
    if (conflict) return;
    dirty = true; paintStatus();
    clearTimeout(saveT); saveT = setTimeout(save, 900);
  }
  titleIn.addEventListener('input', onInput);
  bodyIn.addEventListener('input', onInput);

  async function save(force) {
    if (saving) { clearTimeout(saveT); saveT = setTimeout(save, 500); return; }
    if (!dirty && !force) return;
    saving = true; paintStatus();
    const sent = { title: titleIn.value, body: bodyIn.value };
    try {
      const r = await api.post('notes.save', { id: note.id, version: note.version, ...sent });
      note.version = r.version; note.title = sent.title; note.body = sent.body; note.updatedBy = state.me; note.updatedAt = null;
      dirty = titleIn.value !== sent.title || bodyIn.value !== sent.body;
      if (dirty) { clearTimeout(saveT); saveT = setTimeout(save, 500); }
    } catch (e) {
      if (e.status === 409 && e.data.note) showConflict(e.data.note);
      else errToast(e);
    } finally { saving = false; paintStatus(); }
  }
  function showConflict(theirs) {
    conflict = theirs;
    banner.hidden = false;
    banner.replaceChildren(h('div', null, h('b', null, (theirs.updatedBy ? theirs.updatedBy.name : '다른 사람') + '님이 먼저 고쳤어요. '), '어느 쪽으로 할까요? 내 내용은 아래에 그대로 있어요.'),
      h('div', { class: 'row', style: { 'margin-top': '8px' } },
        h('button', { class: 'btn sm', type: 'button', onclick: () => { copyMine(); } }, icon('copy'), '내 내용 복사'),
        h('button', { class: 'btn sm', type: 'button', onclick: () => resolve('theirs') }, '상대 내용 불러오기'),
        h('button', { class: 'btn primary sm', type: 'button', onclick: () => resolve('mine') }, '내 내용으로 덮어쓰기')));
    paintStatus();
  }
  async function copyMine() {
    try { await navigator.clipboard.writeText(bodyIn.value); toast('내 내용을 복사했어요'); } catch (e) { bodyIn.select(); toast('선택된 글을 복사하세요'); }
  }
  async function resolve(which) {
    const theirs = conflict; conflict = null; banner.hidden = true;
    if (which === 'theirs') { applyRemote(theirs); dirty = false; paintStatus(); return; }
    note.version = theirs.version; dirty = true; await save(true);
  }
  function applyRemote(n) {
    note = { ...note, ...n };
    if (document.activeElement !== titleIn) titleIn.value = n.title;
    if (bodyIn.value !== n.body) {
      const focused = document.activeElement === bodyIn, s = bodyIn.selectionStart, e = bodyIn.selectionEnd;
      bodyIn.value = n.body;
      if (focused) { try { bodyIn.setSelectionRange(Math.min(s, n.body.length), Math.min(e, n.body.length)); } catch (x) {} }
    }
    setTitle(n.title);
    paintMeta();
  }
  async function poll() {
    if (dirty || saving || conflict) return;
    const r = await api.get('notes.get', { id: note.id });
    if (r.note.version !== note.version) applyRemote(r.note);
    else { note.updatedAt = r.note.updatedAt; note.updatedBy = r.note.updatedBy; paintStatus(); }
  }

  try {
    const [r] = await Promise.all([api.get('notes.get', { id: noteId }), loadList()]);
    note = r.note;
  } catch (e) {
    pane.replaceChildren(h('div', { class: 'empty' }, e.message, h('br'), h('a', { href: '#/notes' }, '목록으로')));
    return every(20000, loadList);
  }
  titleIn.value = note.title; bodyIn.value = note.body;
  setTitle(note.title);
  paintMeta();
  if (!note.body && note.mine) titleIn.select();
  const s1 = every(4000, poll);
  const s2 = every(20000, loadList);
  const beforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  return () => { s1(); s2(); window.removeEventListener('beforeunload', beforeUnload); if (dirty && !conflict) save(); };
}
