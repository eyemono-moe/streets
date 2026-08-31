/**
 * 1 つの `ResizeObserver` を全購読者で共有する。カラムは最大 200 件
 * (`MAX_ITEMS_PER_SECTION`)、返信の親描画で実際は 1.5 倍、複数カラムで
 * 数百件を超えうる —— ノートごとに作るとインスタンス数がレイアウトごとの
 * 監視コストに乗るので、複数要素を監視できる 1 個を共有する。`undefined`
 * を渡せるのは Solid の `ref` がマウント後にしか埋まらないため。
 */
type HeightListener = (height: number) => void;

let observer: ResizeObserver | undefined;
const listeners = new WeakMap<Element, HeightListener>();

const ensureObserver = (): ResizeObserver | undefined => {
  if (observer) return observer;
  // jsdom には ResizeObserver が無い。テスト環境で落とさない。
  if (typeof ResizeObserver === "undefined") return undefined;
  observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      // `borderBoxSize` はレイアウト済み配列だが、取れないブラウザ向けに `contentRect` へ落とす。
      const height =
        entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      listeners.get(entry.target)?.(height);
    }
  });
  return observer;
};

export const observeHeight = (
  target: Element,
  listener: HeightListener,
): (() => void) => {
  const shared = ensureObserver();
  if (!shared) return () => {};
  listeners.set(target, listener);
  shared.observe(target);
  return () => {
    listeners.delete(target);
    shared.unobserve(target);
  };
};
