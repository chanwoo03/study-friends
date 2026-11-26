/* 친구: 내 초대 코드, 코드로 친구 추가, 친구 목록 */
import { state, api, h, icon, avatar, toast, errToast, confirmBtn, setTitle, pageHead, loadFriends, fmtDur, ago, every } from '../core.js';

export default async function mount(view, route) {
  setTitle('친구');
  const codeEl = h('span', { class: 'code' }, '········');
  const list = h('ul', { class: 'list' });
  const codeIn = h('input', { class: 'input', maxlength: '9', placeholder: '친구의 초대 코드 8자리', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', 'aria-label': '친구 초대 코드',
    style: { 'text-transform': 'uppercase', 'letter-spacing': '.08em', 'font-weight': '700' } });
  const addErr = h('div', { class: 'err', role: 'alert' });
  const addBtn = h('button', { class: 'btn primary', type: 'submit' }, icon('plus'), '친구 추가');

  view.append(
    pageHead('친구', '친구가 된 사람끼리만 일정·계획·메시지를 나눠요'),
    route.query.welcome ? h('div', { class: 'banner ok', style: { 'margin-bottom': '14px' } }, '가입을 축하해요! 친구에게 내 초대 코드를 알려 주거나, 친구의 코드를 아래에 넣어 친구를 맺으세요.') : null,
    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('h2', null, '내 초대 코드'),
        h('div', { class: 'code-box' }, codeEl,
          h('button', { class: 'btn', type: 'button', onclick: copyCode }, icon('copy'), '복사')),
        h('p', { class: 'small muted' }, '이 코드를 아는 사람은 나와 바로 친구가 될 수 있어요. 아무에게나 알려졌다면 새 코드로 바꾸세요.'),
        confirmBtn('새 코드 만들기', '한 번 더 누르면 예전 코드는 못 써요', async () => {
          try { const r = await api.post('friends.regen'); codeEl.textContent = r.inviteCode; toast('새 초대 코드를 만들었어요'); } catch (e) { errToast(e); }
        }, 'btn sm')),
      h('form', { class: 'card', onsubmit: add }, h('h2', null, '친구 추가'),
        h('div', { class: 'form' }, codeIn, addErr, addBtn))),
    h('div', { class: 'card' }, h('h2', null, '내 친구'), list));

  async function copyCode() {
    const text = codeEl.textContent;
    try { await navigator.clipboard.writeText(text); toast('초대 코드를 복사했어요'); }
    catch (e) { const r = document.createRange(); r.selectNodeContents(codeEl); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('선택된 코드를 복사하세요'); }
  }
  async function add(e) {
    e.preventDefault(); addErr.textContent = ''; addBtn.disabled = true;
    try {
      const r = await api.post('friends.add', { code: codeIn.value });
      codeIn.value = '';
      toast(r.already ? `${r.friend.name}님은 이미 친구예요` : `${r.friend.name}님과 친구가 됐어요`);
      await load(true);
    } catch (ex) { addErr.textContent = ex.message; } finally { addBtn.disabled = false; }
  }
  async function load(force) {
    const [fr] = await Promise.all([loadFriends(force)]);
    const r = await api.get('friends.list');
    codeEl.textContent = r.inviteCode;
    list.replaceChildren();
    if (!fr.length) { list.append(h('li', { class: 'empty' }, '아직 친구가 없어요. 친구의 초대 코드를 넣어 보세요')); return; }
    for (const f of r.friends) {
      const st = f.studyingSince ? h('span', { class: 'pill live' }, h('span', { class: 'live-dot' }), '공부 중') : h('span', { class: 'pill' }, '오늘 ' + fmtDur(f.todaySeconds));
      list.append(h('li', { class: 'li' }, avatar(f),
        h('div', { class: 'grow' }, h('div', { class: 't' }, f.name), h('div', { class: 's' }, f.lastSeen ? '최근 접속 ' + ago(f.lastSeen) : '')),
        st,
        h('a', { class: 'btn icon sm', href: '#/messages/' + f.id, 'aria-label': f.name + '님에게 메시지' }, icon('chat')),
        confirmBtn('끊기', '정말 끊기', async () => {
          try { await api.post('friends.remove', { id: f.id }); toast(`${f.name}님과 친구를 끊었어요`); await load(true); } catch (ex) { errToast(ex); }
        }, 'btn ghost sm')));
    }
  }
  await load(true);
  setTimeout(() => { if (!state.friends.length) codeIn.focus(); }, 50);
  return every(30000, () => load(true));
}
