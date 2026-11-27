/* 앱 전용 공부 스티커와 메시지 반응. 서버의 STICKERS·REACTIONS 와 같은 이름이어야 해요 */
import { h } from './core.js';

export const STICKERS = {
  fighting: { e: '💪', t: '화이팅', c: '#ff6b6b' },
  allnight: { e: '🌙', t: '밤샘 각', c: '#5c7cfa' },
  coffee:   { e: '☕', t: '커피 수혈', c: '#b7773a' },
  pass:     { e: '🍀', t: '합격 기원', c: '#20c997' },
  good:     { e: '👍', t: '잘했어', c: '#3182f6' },
  focus:    { e: '🎧', t: '집중 모드', c: '#845ef7' },
  rest:     { e: '🛋️', t: '쉬는 중', c: '#8b95a1' },
  wow:      { e: '🤩', t: '대박', c: '#ff9f43' },
  thanks:   { e: '🙏', t: '고마워', c: '#f2638a' },
  together: { e: '📚', t: '같이 공부', c: '#0ca5b0' },
  sleepy:   { e: '😴', t: '졸려…', c: '#6b7684' },
  done:     { e: '✅', t: '오늘 끝!', c: '#12b886' },
};
export const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'];
export const EMOJIS = ['😀', '😆', '😂', '🥲', '😊', '😍', '🥰', '😎', '🤓', '🧐', '🤔', '😮', '😴', '😭', '😤', '🥳', '🤯', '😱',
  '👍', '👏', '🙌', '💪', '🙏', '✌️', '👀', '❤️', '🧡', '💛', '💚', '💙', '💜', '🔥', '✨', '⭐', '🎉', '💯',
  '📚', '📝', '✏️', '📖', '💻', '☕', '🍀', '🏆', '⏰', '📅', '✅', '❌'];

/* 그림 이모티콘 묶음 (assets/stickers/packs.json). 메시지 화면을 열 때 한 번 읽어요 */
export let PACKS = [];
const PACK_ITEMS = new Map();   // '묶음/이름' → { src, t }
export const packsReady = fetch('assets/stickers/packs.json', { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : []))
  .then((list) => {
    PACKS = (Array.isArray(list) ? list : []).filter((p) => p && p.key && Array.isArray(p.items));
    for (const p of PACKS) for (const it of p.items) PACK_ITEMS.set(p.key + '/' + it.key, { src: `assets/stickers/${p.key}/${it.file}`, t: it.t || it.key });
  })
  .catch(() => {});

/* 칼선 스티커 한 장 (또는 그림 이모티콘) */
export function sticker(key, size = '') {
  const img = PACK_ITEMS.get(key);
  if (img) return h('img', { class: 'sticker-img ' + size, src: img.src, alt: img.t + ' 이모티콘', loading: 'lazy', draggable: 'false' });
  if (key.includes('/')) return h('span', { class: 'sticker-img gone ' + size, role: 'img', 'aria-label': '없어진 이모티콘' }, '🙂');
  const s = STICKERS[key];
  if (!s) return h('span', { class: 'b' }, '(알 수 없는 스티커)');
  return h('span', { class: 'sticker ' + size, style: { '--c': s.c }, role: 'img', 'aria-label': s.t + ' 스티커' },
    h('span', { class: 'st-e', 'aria-hidden': 'true' }, s.e), h('span', { class: 'st-t' }, s.t));
}
export const stickerLabel = (key) => (STICKERS[key] ? STICKERS[key].t + ' 스티커' : PACK_ITEMS.has(key) ? PACK_ITEMS.get(key).t + ' 이모티콘' : '이모티콘');
