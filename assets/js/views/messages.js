/* 친구와 1:1 메시지. 열려 있는 동안 3초마다 새 메시지를 확인해요 */
import { state, api, h, icon, avatar, errToast, every, setTitle, hm, ago, mdw, today, app } from '../core.js';
import { STICKERS, REACTIONS, EMOJIS, PACKS, packsReady, sticker, stickerLabel } from '../stickers.js';
import { download, modal, toast } from '../core.js';

const QUICK = ['화이팅!', '지금 공부 중이야', '같이 공부할래?', '수고했어'];
/* 메시지로는 사진·동영상을 보내지 않아요 (문서·압축·소리 파일만) */
const MEDIA_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|svg|avif|mp4|mov|avi|mkv|webm|wmv|m4v|3gp|flv)$/i;
const isMedia = (f) => /^(image|video)\//.test(f.type || '') || MEDIA_EXT.test(f.name || '');
const FILE_ACCEPT = '.pdf,.hwp,.hwpx,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.zip,.mp3,.m4a,.wav,.key,.pages,.numbers';

export default async function mount(view, route) {
  await packsReady;
  const withId = route.params[0] ? Number(route.params[0]) : null;
  setTitle('메시지');
  const layout = h('div', { class: 'chat-layout' + (withId ? ' has-chat' : '') });
  const threadsEl = h('div', { class: 'threads' });
  const listPane = h('div', { class: 'card list-pane' }, h('h2', { style: { margin: '4px 4px 10px' } }, '메시지'), threadsEl);
  const chatPane = h('div', { class: 'card chat-pane' });
  layout.append(listPane, chatPane);
  view.append(layout);

  let threads = [];
  async function loadThreads() {
    const r = await api.get('messages.threads');
    threads = r.threads;
    state.unread = threads.reduce((a, t) => a + (t.friend.id === withId ? 0 : t.unread), 0);
    app.paintBadges();
    threadsEl.replaceChildren();
    if (!threads.length) { threadsEl.append(h('div', { class: 'empty' }, '친구를 추가하면 메시지를 보낼 수 있어요', h('br'), h('a', { href: '#/friends' }, '친구 추가'))); return; }
    for (const t of threads) {
      threadsEl.append(h('a', { class: 'thread' + (t.friend.id === withId ? ' on' : ''), href: '#/messages/' + t.friend.id },
        avatar(t.friend),
        h('div', { style: { 'min-width': '0' } }, h('div', { class: 't' }, t.friend.name),
          h('div', { class: 's' }, t.last ? (t.last.mine ? '나: ' : '') + (t.last.kind === 'sticker' ? stickerLabel(t.last.body) : t.last.kind === 'image' ? '사진' : t.last.kind === 'file' ? '파일: ' + t.last.body : t.last.body) : '아직 대화가 없어요')),
        h('div', { style: { display: 'grid', 'justify-items': 'end', gap: '4px' } },
          t.last ? h('span', { class: 'tiny muted' }, ago(t.last.at)) : null,
          t.unread && t.friend.id !== withId ? h('span', { class: 'badge-n', style: { margin: 0 } }, t.unread) : null)));
    }
  }

  if (!withId) {
    chatPane.append(h('div', { class: 'empty', style: { margin: 'auto' } }, '왼쪽에서 친구를 골라 대화를 시작하세요'));
    await loadThreads().catch(errToast);
    return every(10000, loadThreads);
  }

  /* ===== 대화창 ===== */
  const msgsEl = h('div', { class: 'msgs', 'aria-live': 'polite' });
  const input = h('textarea', { class: 'input', rows: '1', maxlength: '2000', placeholder: '메시지 보내기', 'aria-label': '메시지' });
  const sendBtn = h('button', { class: 'btn primary icon', type: 'submit', 'aria-label': '보내기' }, icon('send'));
  /* 이모지·스티커 서랍 */
  let drawer = null;
  const drawerEl = h('div', { class: 'drawer', hidden: true });
  const emojiBtn = h('button', { class: 'btn ghost icon', type: 'button', 'aria-label': '이모지', 'aria-expanded': 'false', onclick: () => toggleDrawer('emoji') }, h('span', { class: 'em-ico', 'aria-hidden': 'true' }, '😊'));
  const stickerBtn = h('button', { class: 'btn ghost icon', type: 'button', 'aria-label': '스티커', 'aria-expanded': 'false', onclick: () => toggleDrawer('sticker') }, icon('sticky'));
  /* 파일 보내기 (사진·동영상 제외): 클립 버튼, 끌어다 놓기, 붙여넣기 */
  const fileIn = h('input', { type: 'file', multiple: true, hidden: true, accept: FILE_ACCEPT, onchange: () => { const fs = [...fileIn.files]; fileIn.value = ''; sendFiles(fs); } });
  const clipBtn = h('button', { class: 'btn ghost icon', type: 'button', 'aria-label': '파일 보내기 (사진·동영상 제외)', onclick: () => fileIn.click() }, icon('clip'));
  let stickerTab = 'basic';
  function toggleDrawer(kind) {
    drawer = drawer === kind ? null : kind;
    emojiBtn.setAttribute('aria-expanded', String(drawer === 'emoji'));
    stickerBtn.setAttribute('aria-expanded', String(drawer === 'sticker'));
    drawerEl.hidden = !drawer;
    if (drawer === 'emoji') drawerEl.replaceChildren(h('div', { class: 'emoji-grid' }, EMOJIS.map((e) => h('button', { type: 'button', 'aria-label': e, onclick: () => insertEmoji(e) }, e))));
    if (drawer === 'sticker') paintStickers();
  }
  /* 스티커 서랍: 기본 스티커 + 그림 이모티콘 묶음마다 탭 하나 */
  function paintStickers() {
    const tabs = [{ key: 'basic', name: '기본' }, ...PACKS];
    if (!tabs.some((t) => t.key === stickerTab)) stickerTab = 'basic';
    const keys = stickerTab === 'basic' ? Object.keys(STICKERS) : PACKS.find((p) => p.key === stickerTab).items.map((it) => stickerTab + '/' + it.key);
    drawerEl.replaceChildren(
      tabs.length > 1 ? h('div', { class: 'st-tabs', role: 'tablist' }, tabs.map((t) =>
        h('button', { type: 'button', role: 'tab', class: 'st-tab' + (t.key === stickerTab ? ' on' : ''), 'aria-selected': String(t.key === stickerTab),
          onclick: () => { stickerTab = t.key; paintStickers(); } },
          t.key === 'basic' ? '기본' : [t.items[0] ? sticker(t.key + '/' + t.items[0].key, 'tab') : null, h('span', null, t.name)]))) : null,
      h('div', { class: 'sticker-grid' + (stickerTab === 'basic' ? '' : ' pack') }, keys.map((k) =>
        h('button', { type: 'button', 'aria-label': stickerLabel(k) + ' 보내기', onclick: () => { sendSticker(k); toggleDrawer('sticker'); } }, sticker(k, 'sm')))));
  }
  function insertEmoji(e) {
    const a = input.selectionStart ?? input.value.length, b = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, a) + e + input.value.slice(b);
    input.focus(); input.setSelectionRange(a + e.length, a + e.length);
    input.dispatchEvent(new Event('input'));
  }
  const headName = h('b');
  const headAv = h('span');
  chatPane.append(
    h('div', { class: 'chat-head' }, h('a', { class: 'btn ghost icon sm', href: '#/messages', 'aria-label': '목록으로' }, icon('back')), headAv, headName),
    msgsEl,
    h('div', { class: 'quick' }, QUICK.map((q) => h('button', { type: 'button', onclick: () => send(q) }, q))),
    drawerEl,
    h('form', { class: 'composer', onsubmit: (e) => { e.preventDefault(); send(input.value); } }, clipBtn, emojiBtn, stickerBtn, input, sendBtn, fileIn));
  chatPane.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); chatPane.classList.add('drop'); } });
  chatPane.addEventListener('dragleave', (e) => { if (e.target === chatPane) chatPane.classList.remove('drop'); });
  chatPane.addEventListener('drop', (e) => { chatPane.classList.remove('drop'); if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); sendFiles([...e.dataTransfer.files]); } });
  input.addEventListener('paste', (e) => { const fs = [...(e.clipboardData ? e.clipboardData.files : [])]; if (fs.length) { e.preventDefault(); sendFiles(fs); } });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(input.value); }
  });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight) + 'px'; });

  let msgs = [], lastId = 0, readUpTo = 0, hasMore = false, sending = false, reactions = {}, reactKey = '', openReact = null;
  function nearBottom() { return msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 80; }
  function paint(stick) {
    const keep = stick || nearBottom();
    const prevTop = msgsEl.scrollTop;
    msgsEl.replaceChildren();
    if (hasMore) msgsEl.append(h('button', { class: 'btn sm', type: 'button', style: { 'align-self': 'center' }, onclick: older }, '이전 메시지 더 보기'));
    if (!msgs.length) msgsEl.append(h('div', { class: 'empty', style: { margin: 'auto' } }, '첫 메시지를 보내 보세요'));
    let lastDay = '';
    const lastMineRead = [...msgs].reverse().find((m) => m.mine && m.id <= readUpTo);
    for (const m of msgs) {
      const day = m.at.slice(0, 10);
      if (day !== lastDay) { msgsEl.append(h('div', { class: 'day-sep' }, mdw(day))); lastDay = day; }
      const body = m.kind === 'sticker' ? h('div', { class: 'b sticker-b' }, sticker(m.body))
        : m.kind === 'image' ? imageBubble(m) : m.kind === 'file' ? fileBubble(m) : h('div', { class: 'b' }, m.body);
      const rs = reactions[m.id] || [];
      const chips = rs.length ? h('div', { class: 'reacts' }, groupReactions(rs).map(([e, n, mine]) =>
        h('button', { type: 'button', class: 'react-chip' + (mine ? ' mine' : ''), 'aria-label': `${e} ${n}명${mine ? ', 내 반응 취소' : ''}`, onclick: () => react(m, e) }, e, n > 1 ? h('span', null, n) : null))) : null;
      const bar = !m.pending && openReact === m.id ? h('div', { class: 'react-bar', role: 'group', 'aria-label': '반응 고르기' },
        REACTIONS.map((e) => h('button', { type: 'button', 'aria-label': e + ' 반응', onclick: () => react(m, e) }, e))) : null;
      const row = h('div', { class: 'msg' + (m.mine ? ' mine' : '') + (m.kind === 'sticker' ? ' is-sticker' : '') },
        h('div', { class: 'bwrap' }, bar, body, chips),
        h('div', { class: 'm' }, m === lastMineRead ? h('span', null, '읽음') : null, h('span', null, m.pending ? '보내는 중' : hm(m.at)),
          m.pending ? null : h('button', { type: 'button', class: 'react-btn', 'aria-label': '반응 달기', onclick: () => { openReact = openReact === m.id ? null : m.id; paint(false); } }, '☺︎')));
      body.addEventListener('dblclick', () => { if (!m.pending) react(m, '❤️'); });
      msgsEl.append(row);
    }
    if (keep) msgsEl.scrollTop = msgsEl.scrollHeight;
    else msgsEl.scrollTop = prevTop;
  }
  const fileUrl = (m, q = '') => 'api.php?a=messages.file&id=' + m.id + q;
  const sizeLabel = (b) => b >= 1048576 ? (b / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';
  function imageBubble(m) {
    if (m.pending) return h('div', { class: 'b img-b pending' }, m.preview ? h('img', { src: m.preview, alt: '' }) : null, h('span', { class: 'prog' }, m.progress || '보내는 중'));
    return h('button', { type: 'button', class: 'b img-b', 'aria-label': '사진 크게 보기', onclick: () => photoView(m) }, h('img', { src: fileUrl(m, '&thumb=1'), alt: '보낸 사진', loading: 'lazy' }));
  }
  function photoView(m) {
    const md = modal([h('div', { class: 'lb' }, h('img', { class: 'lb-img', src: fileUrl(m), alt: '' })),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => download(fileUrl(m, '&dl=1'), m.file.name).catch(errToast) }, icon('download'), '저장'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => md.close() }, '닫기'))], { wide: true });
  }
  function fileBubble(m) {
    const f = m.file || { name: m.body, size: 0 };
    const ext = (f.name.split('.').pop() || '').slice(0, 4).toUpperCase();
    return h('div', { class: 'b file-b' + (m.pending ? ' pending' : '') },
      h('span', { class: 'file-ico' }, icon('file'), h('i', null, ext)),
      h('span', { class: 'file-meta' }, h('b', null, f.name), h('small', null, m.pending ? (m.progress || '보내는 중') : sizeLabel(f.size))),
      m.pending ? null : h('button', { type: 'button', class: 'btn sm', 'aria-label': f.name + ' 받기', onclick: () => download(fileUrl(m, '&dl=1'), f.name).catch(errToast) }, icon('download'), '받기'));
  }
  let limits = null;
  async function sendFiles(files) {
    if (!limits) { try { limits = await api.get('messages.limits'); } catch (e) { limits = { maxBytes: 8 * 1048576, maxLabel: '8MB', ext: [] }; } }
    const media = files.filter(isMedia);
    if (media.length) toast('사진·동영상은 보낼 수 없어요. 대신 이모티콘을 써 보세요');
    for (const f of files.filter((x) => !isMedia(x)).slice(0, 10)) {
      const temp = { id: Number.MAX_SAFE_INTEGER - Math.floor(Math.random() * 1e6), mine: true, kind: 'file', body: f.name, at: today() + ' 00:00:00', pending: true, file: { name: f.name, size: f.size } };
      try {
        if (f.size > limits.maxBytes) throw new Error(`파일이 너무 커요. ${limits.maxLabel} 이하로 보내 주세요`);
        const form = new FormData();
        form.append('to', String(withId));
        form.append('kind', 'file'); form.append('file', f, f.name);
        msgs.push(temp); paint(true);
        const r = await api.upload('messages.upload', form, (p) => { temp.progress = `보내는 중 ${Math.round(p * 100)}%`; paint(false); });
        msgs = msgs.filter((m) => m !== temp);
        if (!msgs.some((x) => x.id === r.message.id)) msgs.push(r.message);
        msgs.sort((a, b) => a.id - b.id); paint(true);
      } catch (e) { msgs = msgs.filter((m) => m !== temp); paint(false); errToast(e); }
    }
    loadThreads().catch(() => {});
  }
  function groupReactions(rs) {
    const map = new Map();
    for (const r of rs) { const x = map.get(r.e) || [r.e, 0, false]; x[1]++; if (r.u === state.me.id) x[2] = true; map.set(r.e, x); }
    return [...map.values()];
  }
  function setReactions(r) { const k = JSON.stringify(r || {}); if (k === reactKey) return false; reactKey = k; reactions = r || {}; return true; }
  async function react(m, e) {
    openReact = null;
    try { const r = await api.post('messages.react', { id: m.id, emoji: e }); setReactions(r.reactions); paint(false); } catch (ex) { errToast(ex); }
  }
  async function sendSticker(key) {
    try {
      const r = await api.post('messages.send', { to: withId, kind: 'sticker', body: key });
      if (!msgs.some((x) => x.id === r.message.id)) msgs.push(r.message);
      msgs.sort((a, b) => a.id - b.id); paint(true); loadThreads().catch(() => {});
    } catch (e) { errToast(e); }
  }
  async function first() {
    const r = await api.get('messages.list', { with: withId });
    msgs = r.messages; readUpTo = r.readUpTo; hasMore = r.hasMore; setReactions(r.reactions);
    lastId = msgs.length ? msgs[msgs.length - 1].id : 0;
    paint(true);
  }
  async function poll() {
    const r = await api.get('messages.list', { with: withId, after: lastId });
    const changed = setReactions(r.reactions) || r.messages.length || r.readUpTo !== readUpTo;
    for (const m of r.messages) if (!msgs.some((x) => x.id === m.id)) msgs.push(m);
    if (r.messages.length) lastId = r.messages[r.messages.length - 1].id;
    readUpTo = r.readUpTo;
    if (changed) paint(false);
  }
  async function older() {
    if (!msgs.length) return;
    const r = await api.get('messages.list', { with: withId, before: msgs[0].id });
    const prevH = msgsEl.scrollHeight;
    msgs = [...r.messages, ...msgs]; hasMore = r.hasMore;
    paint(false);
    msgsEl.scrollTop = msgsEl.scrollHeight - prevH;
  }
  async function send(text) {
    text = (text || '').trim();
    if (!text || sending) return;
    sending = true; sendBtn.disabled = true;
    const temp = { id: Number.MAX_SAFE_INTEGER, mine: true, body: text, at: today() + ' 00:00:00', pending: true };
    msgs.push(temp); input.value = ''; input.style.height = 'auto'; paint(true);
    try {
      const r = await api.post('messages.send', { to: withId, body: text });
      msgs = msgs.filter((m) => m !== temp);
      if (!msgs.some((x) => x.id === r.message.id)) msgs.push(r.message);
      msgs.sort((a, b) => a.id - b.id);
      paint(true);
      loadThreads().catch(() => {});
    } catch (e) {
      msgs = msgs.filter((m) => m !== temp); paint(true);
      input.value = text; errToast(e);
    } finally { sending = false; sendBtn.disabled = false; input.focus(); }
  }

  try {
    await Promise.all([loadThreads(), first()]);
  } catch (e) {
    chatPane.replaceChildren(h('div', { class: 'empty', style: { margin: 'auto' } }, e.message, h('br'), h('a', { href: '#/messages' }, '목록으로')));
    return every(10000, loadThreads);
  }
  const t = threads.find((x) => x.friend.id === withId);
  const friend = t ? t.friend : { name: '친구', color: '#888' };
  headName.textContent = friend.name;
  headAv.replaceChildren(avatar(friend));
  setTitle(friend.name);
  if (matchMedia('(min-width: 900px)').matches) input.focus();
  const s1 = every(3000, poll);
  const s2 = every(15000, loadThreads);
  return () => { s1(); s2(); };
}
