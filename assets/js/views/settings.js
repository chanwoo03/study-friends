/* 설정: 프로필, 로그인 방법(아이디·카카오·구글), 테마, 로그아웃, 탈퇴 */
import { state, api, h, icon, avatar, toast, errToast, confirmBtn, setTitle, pageHead, colorPicker, app } from '../core.js';

const PROVIDER = { kakao: '카카오', google: 'Google' };

export default function mount(view, route) {
  setTitle('설정');
  const me = state.me;
  const notice = route.query.ok === 'linked' ? h('div', { class: 'banner ok', style: { 'margin-bottom': '14px' } }, '로그인 방법을 연결했어요')
    : route.query.err ? h('div', { class: 'banner', style: { 'margin-bottom': '14px' } }, route.query.err) : null;

  /* 프로필 */
  const name = h('input', { maxlength: '20', value: me.name });
  const color = colorPicker(me.color);
  const profErr = h('div', { class: 'err' });
  const profile = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault(); profErr.textContent = '';
    try { const r = await api.post('me.update', { name: name.value, color: color.value() }); state.me = r.me; app.paintMe(); toast('저장했어요'); }
    catch (ex) { profErr.textContent = ex.message; }
  } }, h('h2', null, '프로필'), h('div', { class: 'form' }, h('label', { class: 'field' }, '친구들에게 보일 이름', name), color.el, profErr,
    h('div', null, h('button', { class: 'btn primary', type: 'submit' }, '저장'))));

  /* 아이디·비밀번호 */
  const cur = h('input', { type: 'password', autocomplete: 'current-password' });
  const uname = h('input', { autocomplete: 'username', autocapitalize: 'none', maxlength: '20', placeholder: '영문 소문자·숫자 4~20자' });
  const npw = h('input', { type: 'password', autocomplete: 'new-password', placeholder: '8자 이상' });
  const npw2 = h('input', { type: 'password', autocomplete: 'new-password' });
  const pwErr = h('div', { class: 'err' });
  const pw = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault(); pwErr.textContent = '';
    if (npw.value !== npw2.value) { pwErr.textContent = '새 비밀번호가 서로 달라요'; return; }
    try {
      const r = await api.post('me.password', { current: cur.value, username: uname.value, password: npw.value });
      state.me = r.me; toast(me.hasPassword ? '비밀번호를 바꿨어요' : '아이디·비밀번호를 만들었어요'); app.render();
    } catch (ex) { pwErr.textContent = ex.message; }
  } }, h('h2', null, me.hasPassword ? '비밀번호 바꾸기' : '아이디·비밀번호 만들기'),
    h('div', { class: 'form' },
      me.username ? h('div', { class: 'small muted' }, '아이디 ', h('b', null, me.username)) : h('p', { class: 'small muted', style: { margin: 0 } }, '소셜 로그인으로 가입했어요. 아이디를 만들어 두면 카카오·구글 없이도 로그인할 수 있어요.'),
      me.hasPassword ? h('label', { class: 'field' }, '지금 비밀번호', cur) : null,
      me.username ? null : h('label', { class: 'field' }, '새 아이디', uname),
      h('div', { class: 'two' }, h('label', { class: 'field' }, '새 비밀번호', npw), h('label', { class: 'field' }, '새 비밀번호 확인', npw2)), pwErr,
      h('div', null, h('button', { class: 'btn primary', type: 'submit' }, '저장'))));

  /* 소셜 연결 */
  const social = h('div', { class: 'card' }, h('h2', null, '소셜 로그인 연결'));
  const ul = h('ul', { class: 'list' });
  for (const p of ['kakao', 'google']) {
    if (!state.providers[p]) continue;
    const linked = me.linked.includes(p);
    ul.append(h('li', { class: 'li' }, h('div', { class: 'grow' }, h('div', { class: 't' }, PROVIDER[p]), h('div', { class: 's' }, linked ? '연결됨 · 이 방법으로도 로그인할 수 있어요' : '연결 안 됨')),
      linked ? confirmBtn('연결 끊기', '정말 끊기', async () => {
        try { const r = await api.post('me.unlink', { provider: p }); state.me = r.me; toast('연결을 끊었어요'); app.render(); } catch (e) { errToast(e); }
      }, 'btn sm') : h('a', { class: 'btn sm', href: `oauth/${p}.php?start=link` }, '연결하기')));
  }
  if (!ul.children.length) ul.append(h('li', { class: 'small muted' }, '서버에 카카오·구글 로그인이 아직 설정되지 않았어요 (config.php)'));
  social.append(ul);

  /* 기타 */
  const del = h('input', { class: 'input', placeholder: '탈퇴', 'aria-label': '탈퇴 확인' });
  const etc = h('div', { class: 'card' }, h('h2', null, '기타'),
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: app.toggleTheme }, icon('moon'), '라이트/다크 바꾸기'),
      h('button', { class: 'btn', type: 'button', onclick: () => app.logout() }, icon('logout'), '로그아웃')),
    h('details', { style: { 'margin-top': '18px' } }, h('summary', { class: 'small muted', style: { cursor: 'pointer' } }, '회원 탈퇴'),
      h('div', { class: 'form', style: { 'margin-top': '10px' } },
        h('p', { class: 'small muted', style: { margin: 0 } }, '일정·계획·메시지·글·그림·메모가 모두 지워지고 되돌릴 수 없어요. 아래 칸에 ‘탈퇴’라고 적고 버튼을 누르세요.'),
        del, h('div', null, confirmBtn('탈퇴하기', '한 번 더 누르면 탈퇴', async () => {
          try { await api.post('me.delete', { confirm: del.value.trim() }); state.me = null; app.go('login'); app.render(); } catch (e) { errToast(e); }
        })))));

  view.append(pageHead('설정', null), notice,
    h('div', { class: 'grid2' }, profile, pw), h('div', { class: 'grid2', style: { 'margin-top': '14px' } }, social, etc));
}
