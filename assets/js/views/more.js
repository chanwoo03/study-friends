/* 휴대폰 '더보기' 메뉴 */
import { state, h, icon, avatar, setTitle, pageHead, app } from '../core.js';

export default function mount(view) {
  setTitle('더보기');
  const item = (href, ic, label, sub) => h('a', { class: 'li', href }, h('span', { class: 'btn icon', 'aria-hidden': 'true' }, icon(ic)),
    h('div', { class: 'grow' }, h('div', { class: 't' }, label), sub ? h('div', { class: 's' }, sub) : null), icon('next'));
  view.append(pageHead('더보기'),
    h('div', { class: 'card' }, h('ul', { class: 'list' },
      h('li', null, item('#/rank', 'trophy', '친구 등수', '공부 시간·할 일·연속 공부 순위')),
      h('li', null, item('#/draw', 'draw', '그림판', '친구와 같이 그리기')),
      h('li', null, item('#/notes', 'note', '메모장', '같이 쓰는 메모')),
      h('li', null, item('#/friends', 'users', '친구', '초대 코드로 친구 추가')),
      h('li', null, item('#/notifs', 'bell', '알림', '알림 목록 · 받을 알림 고르기')),
      h('li', null, item('#/settings', 'gear', '설정', '프로필 · 로그인 방법')))),
    h('div', { class: 'card' }, h('div', { class: 'row' }, avatar(state.me, 'lg'), h('div', { class: 'grow' }, h('b', null, state.me.name), h('div', { class: 'small muted' }, state.me.username ? '@' + state.me.username : '소셜 로그인')),
      h('button', { class: 'btn', type: 'button', onclick: app.toggleTheme }, icon('moon'), '테마'))));
}
