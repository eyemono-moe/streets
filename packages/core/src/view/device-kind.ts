export type DeviceKind = "android" | "ios" | "pc";

/**
 * はじめての人に勧める署名器を選ぶための、おおよその端末の種類。外れても
 * 画面で選び直せるので、細かく見分けない。
 */
export const deviceKind = (
  userAgent: string,
  maxTouchPoints = 0,
): DeviceKind => {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  // iPadOS の Safari は Mac と同じ UA を名乗る。触れる画面かどうかで見分ける。
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  return "pc";
};
