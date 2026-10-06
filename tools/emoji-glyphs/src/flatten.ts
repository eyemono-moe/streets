import type { PathCommand } from "opentype.js";

/** 1000 単位の枠で、折れ線が元の曲線から離れてよい距離。描くときの 1 単位はおおむね 0.25px 以下。 */
const TOLERANCE = 1;

/**
 * 輪郭の曲線を、整数の座標の閉じた折れ線にする。曲線を分ける数は、曲がり具合（2 階差分）から
 * 誤差が TOLERANCE に収まるように決める。点が 3 つ未満の輪郭は面を持たないので捨てる。
 */
export const flatten = (commands: readonly PathCommand[]): number[][] => {
  const contours: number[][] = [];
  let current: number[] = [];
  let px = 0;
  let py = 0;
  const push = (x: number, y: number) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const n = current.length;
    if (n >= 2 && current[n - 2] === rx && current[n - 1] === ry) return;
    current.push(rx, ry);
  };
  for (const c of commands) {
    switch (c.type) {
      case "M":
        current = [];
        contours.push(current);
        push(c.x, c.y);
        break;
      case "L":
        push(c.x, c.y);
        break;
      case "Q": {
        const bend = Math.hypot(px - 2 * c.x1 + c.x, py - 2 * c.y1 + c.y);
        const steps = Math.max(1, Math.ceil(Math.sqrt(bend / (4 * TOLERANCE))));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const u = 1 - t;
          push(
            u * u * px + 2 * u * t * c.x1 + t * t * c.x,
            u * u * py + 2 * u * t * c.y1 + t * t * c.y,
          );
        }
        break;
      }
      case "C": {
        const bend = Math.max(
          Math.hypot(px - 2 * c.x1 + c.x2, py - 2 * c.y1 + c.y2),
          Math.hypot(c.x1 - 2 * c.x2 + c.x, c.y1 - 2 * c.y2 + c.y),
        );
        const steps = Math.max(
          1,
          Math.ceil(Math.sqrt((bend * 0.75) / TOLERANCE)),
        );
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const u = 1 - t;
          push(
            u * u * u * px +
              3 * u * u * t * c.x1 +
              3 * u * t * t * c.x2 +
              t * t * t * c.x,
            u * u * u * py +
              3 * u * u * t * c.y1 +
              3 * u * t * t * c.y2 +
              t * t * t * c.y,
          );
        }
        break;
      }
      case "Z":
        // 閉じた折れ線として読むので、始点に戻る点は要らない。
        if (
          current.length >= 4 &&
          current[0] === current[current.length - 2] &&
          current[1] === current[current.length - 1]
        ) {
          current.splice(-2, 2);
        }
        break;
    }
    if (c.type !== "Z") {
      px = c.x;
      py = c.y;
    }
  }
  return contours.filter((points) => points.length >= 6);
};

/** JIS X 0208（EUC-JP の 2 バイトで書ける字）と ASCII の、文字コードの一覧。 */
export const charset = (): number[] => {
  const decoder = new TextDecoder("euc-jp", { fatal: true });
  const set = new Set<number>();
  for (let c = 0x20; c < 0x7f; c++) set.add(c);
  for (let a = 0xa1; a <= 0xfe; a++) {
    for (let b = 0xa1; b <= 0xfe; b++) {
      try {
        const ch = decoder.decode(new Uint8Array([a, b]));
        const codePoint = ch.codePointAt(0);
        if (codePoint !== undefined && String.fromCodePoint(codePoint) === ch) {
          set.add(codePoint);
        }
      } catch {
        // その 2 バイトに字が割り当てられていない。
      }
    }
  }
  return [...set].sort((x, y) => x - y);
};
