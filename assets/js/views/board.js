/* 보드판: 나와 친구들이 같이 보는 글과 댓글 */
import { state, api, h, icon, avatar, toast, errToast, confirmBtn, every, setTitle, pageHead, ago } from '../core.js';

export default async function mount(view) {
  setTitle('보드');
  let posts = [], hasMore = false;
  const ta = h('textarea', { class: 'input', rows: '3', maxlength: '3000', placeholder: '친구들에게 공유할 내용: 시험 범위, 공지, 정리 링크, 오늘 한 줄 다짐…', 'aria-label': '새 글' });
  const postBtn = h('button', { class: 'btn primary', type: 'submit' }, '올리기');
  const feed = h('div', { class: 'feed' });
  const moreBtn = h('button', { class: 'btn', type: 'button', hidden: true, onclick: loadMore }, '이전 글 더 보기');
  view.append(
    pageHead('보드', '글은 나와 내 친구들에게만 보여요'),
    h('div', { class: 'feed' },
      h('form', { class: 'card', onsubmit: async (e) => {
        e.preventDefault(); if (!ta.value.trim()) return; postBtn.disabled = true;
        try { await api.post('board.post', { body: ta.value }); ta.value = ''; toast('올렸어요'); await refresh(true); } catch (ex) { errToast(ex); } finally { postBtn.disabled = false; }
      } }, h('div', { class: 'row', style: { 'align-items': 'flex-start' } }, avatar(state.me), h('div', { class: 'grow' }, ta)),
        h('div', { class: 'row', style: { 'justify-content': 'flex-end', 'margin-top': '10px' } }, postBtn))),
    h('div', { style: { height: '14px' } }), feed, h('div', { style: { 'margin-top': '14px' } }, moreBtn));

  function postCard(p) {
    const cin = h('input', { class: 'input', maxlength: '1000', placeholder: '댓글 달기', 'aria-label': '댓글' });
    const comments = h('div', { class: 'comments' });
    for (const c of p.comments) {
      comments.append(h('div', { class: 'cmt' }, avatar(c.author, 'sm'),
        h('div', { style: { 'min-width': '0' } }, h('span', { class: 'who' }, c.author ? c.author.name : '알 수 없음'), h('span', { class: 'txt' }, c.body), h('span', { class: 'tiny muted' }, ' · ' + ago(c.at))),
        c.canDelete ? confirmBtn('지우기', '정말?', async () => { try { await api.post('board.uncomment', { id: c.id }); await refresh(true); } catch (e) { errToast(e); } }, 'link') : h('span')));
    }
    comments.append(h('form', { class: 'cmt-in', onsubmit: async (e) => {
      e.preventDefault(); if (!cin.value.trim()) return;
      try { await api.post('board.comment', { postId: p.id, body: cin.value }); cin.value = ''; await refresh(true); } catch (ex) { errToast(ex); }
    } }, cin, h('button', { class: 'btn sm', type: 'submit' }, '등록')));
    return h('article', { class: 'card', 'data-id': p.id },
      h('div', { class: 'post-head' }, avatar(p.author), h('div', { class: 'grow' }, h('b', null, p.author.name), h('div', { class: 'tiny muted' }, ago(p.at))),
        p.mine ? confirmBtn('삭제', '한 번 더 누르면 삭제', async () => { try { await api.post('board.delete', { id: p.id }); toast('지웠어요'); await refresh(true); } catch (e) { errToast(e); } }, 'btn ghost sm') : null),
      h('div', { class: 'post-body' }, p.body), comments);
  }
  function paint() {
    feed.replaceChildren();
    if (!posts.length) feed.append(h('div', { class: 'card empty' }, '아직 글이 없어요. 첫 글을 올려 보세요'));
    for (const p of posts) feed.append(postCard(p));
    moreBtn.hidden = !hasMore;
  }
  /* 댓글을 쓰는 중이면 자동 새로고침은 건너뛰어요 */
  function busy() { const a = document.activeElement; return [...feed.querySelectorAll('input')].some((i) => i.value.trim()) || (a && feed.contains(a) && a.tagName === 'INPUT'); }
  async function refresh(force) {
    if (!force && busy()) return;
    const r = await api.get('board.list');
    const older = posts.filter((p) => r.posts.length && p.id < r.posts[r.posts.length - 1].id);
    posts = [...r.posts, ...older]; if (!older.length) hasMore = r.hasMore;
    const y = scrollY; paint(); scrollTo(0, y);
  }
  async function loadMore() {
    if (!posts.length) return;
    moreBtn.disabled = true;
    try { const r = await api.get('board.list', { before: posts[posts.length - 1].id }); posts = [...posts, ...r.posts]; hasMore = r.hasMore; paint(); }
    catch (e) { errToast(e); } finally { moreBtn.disabled = false; }
  }
  await refresh(true).catch(errToast);
  return every(30000, () => refresh(false));
}
