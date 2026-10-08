/**
 * ハンドル型を `typeof setTimeout` の戻り値にしているのは、DOM lib (`number`) でも
 * Node lib (`NodeJS.Timeout`) でも通すため。
 */
export type Scheduler = {
  setTimeout: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  /** 鮮度判定は分岐に使うので、タイマーと同じく注入できないとテストが時間を決められない。 */
  now: () => number;
};

export const defaultScheduler: Scheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
  now: () => Date.now(),
};
