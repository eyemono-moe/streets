/**
 * 1 つの `ResizeObserver` を全購読者で共有する。カラムは最大 200 件
 * (`MAX_ITEMS_PER_SECTION`)、返信の親描画で実際は 1.5 倍、複数カラムで
 * 数百件を超えうる —— ノートごとに作るとインスタンス数がレイアウトごとの
 * 監視コストに乗るので、複数要素を監視できる 1 個を共有する。`undefined`
 * を渡せるのは Solid の `ref` がマウント後にしか埋まらないため。
 */
type SizeListener = (size: number) => void;

let observer: ResizeObserver | undefined;
const heightListeners = new WeakMap<Element, SizeListener>();
const widthListeners = new WeakMap<Element, SizeListener>();

const ensureObserver = (): ResizeObserver | undefined => {
  if (observer) return observer;
  // jsdom には ResizeObserver が無い。テスト環境で落とさない。
  if (typeof ResizeObserver === "undefined") return undefined;
  observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      // `borderBoxSize` はレイアウト済み配列だが、取れないブラウザ向けに `contentRect` へ落とす。
      const box = entry.borderBoxSize?.[0];
      heightListeners.get(entry.target)?.(
        box?.blockSize ?? entry.contentRect.height,
      );
      widthListeners.get(entry.target)?.(
        box?.inlineSize ?? entry.contentRect.width,
      );
    }
  });
  return observer;
};

const observeWith =
  (listeners: WeakMap<Element, SizeListener>) =>
  (target: Element, listener: SizeListener): (() => void) => {
    const shared = ensureObserver();
    if (!shared) return () => {};
    listeners.set(target, listener);
    shared.observe(target);
    return () => {
      listeners.delete(target);
      // 高さと幅の両方を見ている要素は、片方を外しても監視を続ける。
      if (!heightListeners.has(target) && !widthListeners.has(target)) {
        shared.unobserve(target);
      }
    };
  };

export const observeHeight = observeWith(heightListeners);

/** 幅に合わせて並べる数を変える部品（アイコンの列など）が使う。 */
export const observeWidth = observeWith(widthListeners);
