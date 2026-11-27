/* 브라우저 푸시 (아이폰은 '홈 화면에 추가'한 웹앱에서만, iOS 16.4 이상)
   - https 이고 서버에 Firebase 설정이 있을 때만 켤 수 있어요.
   - 앱(안드로이드 APK)에서는 앱이 따로 푸시를 받으니 여기서는 안 써요. */
import { state, api, inApp } from './core.js';

const FB = '10.12.2';
const KEY = 'sf-webpush';
const get = () => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
const set = (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) {} };

export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

/* 'unavailable'(서버 설정 없음·http·앱) | 'ios-home'(아이폰인데 홈 화면 웹앱이 아님) | 'unsupported' | 'denied' | 'on' | 'off' */
export function pushStatus() {
  if (inApp() || !state.webPush || !window.isSecureContext || !('serviceWorker' in navigator)) return 'unavailable';
  if (isIOS() && !isStandalone()) return 'ios-home';
  if (!('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return get() && Notification.permission === 'granted' ? 'on' : 'off';
}
export const webPushOn = () => pushStatus() === 'on';

async function messaging() {
  const { initializeApp, getApps } = await import(`https://www.gstatic.com/firebasejs/${FB}/firebase-app.js`);
  const m = await import(`https://www.gstatic.com/firebasejs/${FB}/firebase-messaging.js`);
  if (!(await m.isSupported())) throw new Error('이 브라우저는 푸시를 지원하지 않아요');
  const c = state.webPush;
  const app = getApps()[0] || initializeApp({ apiKey: c.apiKey, appId: c.appId, projectId: c.projectId, messagingSenderId: c.messagingSenderId });
  return { m, msg: m.getMessaging(app) };
}

/* 버튼을 눌렀을 때만 불러요 (아이폰은 사용자가 눌러야 허락 창이 떠요) */
export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('알림이 허용되지 않았어요. 휴대폰·브라우저 설정에서 알림을 허용해 주세요');
  const reg = await navigator.serviceWorker.ready;
  const { m, msg } = await messaging();
  const token = await m.getToken(msg, { vapidKey: state.webPush.vapidKey, serviceWorkerRegistration: reg });
  if (!token) throw new Error('푸시 주소를 받지 못했어요. 잠시 후 다시 해 주세요');
  await api.post('notif.webpush', { fcm: token });
  set(token);
}
export async function disablePush() {
  const token = get();
  set('');
  try { await api.post('notif.webpush_off', { fcm: token }); } catch (e) {}
  try { const { m, msg } = await messaging(); await m.deleteToken(msg); } catch (e) {}
}
/* 로그아웃할 때: 이 브라우저 푸시 표시만 지워요 (서버 등록은 로그아웃이 지워요) */
export function forgetPush() { set(''); }
