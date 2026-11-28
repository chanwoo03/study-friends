/* 휴대폰 '더보기' 메뉴 */
import { state, h, icon, avatar, setTitle, pageHead, app } from '../core.js';

export default function mount(view) {
  setTitle('더보기');
  const item = (href, ic, label, sub) => h('a', { class: 'li', href }, h('span', { class: 'btn icon', 'aria-hidden': 'true' }, icon(ic)),
    h('div', { class: 'grow' }, h('div', { class: 't' }, label), sub ? h('div', { class: 's' }, sub) : null), icon('next'));
  view.append(pageHead('더보기'),
    h('div', { class: 'card' }, h('ul', { class: 'list' },
      h('li', null, item('#/planner', 'planner', '학습 플래너', '타임테이블 · 오늘 할 일 · D-day · 한 달 플래너 북')),
      h('li', null, item('#/grapes', 'grape', '포도알 판', '목표를 이룰 때마다 한 알씩, 다 채우면 배지')),
      h('li', null, item('#/rank', 'trophy', '친구 등수', '공부 시간·할 일·연속 공부 순위')))),
    h('div', { class: 'card' }, h('ul', { class: 'list' },
      h('li', null, item('#/settings', 'gear', '내 정보', '프로필 · 로그인 방법')),
      h('li', null, item('#/friends', 'users', '친구', '초대 코드로 친구 추가 · 친구 목록')),
      h('li', null, item('#/notifset', 'bell', '알림 설정', '받을 알림 고르기 · 푸시 켜기')))),
    h('div', { class: 'card' }, h('div', { class: 'row' }, avatar(state.me, 'lg'), h('div', { class: 'grow' }, h('b', null, state.me.name), h('div', { class: 'small muted' }, state.me.username ? '@' + state.me.username : '소셜 로그인')),
      h('button', { class: 'btn', type: 'button', onclick: app.toggleTheme }, icon('moon'), '테마'))));
}
