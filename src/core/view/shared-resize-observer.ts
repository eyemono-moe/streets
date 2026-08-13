/**
 * 1 つの `ResizeObserver` を全購読者で共有する。
 *
 * **なぜ共有するのか。** カラムは最大 200 件を保持し (`MAX_ITEMS_PER_SECTION`)、
 * `render-window.ts` が先頭 40 件だけを描いて番兵で段階的に増やすが、
 * 読み進めれば窓は上限まで伸びうる。返信は親も描くので実際のノート数は
 * 描画中の件数の 1.5 倍、カラムを複数本開けばノートは容易に数百件を超える。
 * ノート 1 件ごとに `ResizeObserver` を作ると、そのままインスタンス数が
 * 積み上がる —— ブラウザはレイアウトのたびに全インスタンスの監視対象を
 * 突き合わせるので、インスタンス数がそのままスクロール中の 1 フレームの
 * コストに乗る。1 つの `ResizeObserver` は複数の要素を監視できるので、
 * インスタンスは 1 個で足りる。
 *
 * `undefined` を渡せる (`observeHeight(() => el(), cb)` の el がまだ
 * 無い) —— Solid の `ref` はマウント後に埋まるため。
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
      // `borderBoxSize` はレイアウト計算済みの値を配列で運ぶ。取れない
      // ブラウザ向けに `contentRect` へ落とす。
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
