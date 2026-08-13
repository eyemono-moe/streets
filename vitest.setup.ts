/**
 * jsdom は `ResizeObserver` を実装しない。`Note.tsx` の本文高さ制限
 * (note-rendering spec 3 節) は `observeHeight`
 * (`src/core/view/shared-resize-observer.ts`) 経由で `new ResizeObserver(...)`
 * を呼ぶため、これが無いと kind:1 を描くテストが軒並み
 * "ResizeObserver is not defined" で落ちる —— kind:1 は引用・リポスト対象・
 * 返信先としてほぼ全レンダラのテストに現れるので、個々のテストファイルで
 * 都度スタブするより、ここで一度だけ用意する。
 *
 * **`observe()` で 1 回コールバックを撃つ。** 実際の `ResizeObserver` は
 * 監視を始めた要素について初回の観測を必ず配信する仕様であり、製品コードは
 * その初回配信で高さを知る (同期的な `getBoundingClientRect()` を読まない
 * —— ノート 1 件ごとに強制リフローを起こさないため)。撃たない no-op に
 * すると、高さを主張したいテストだけが永久に 0 のままになる。
 * 高さは `getBoundingClientRect()` から取るので、テスト側はそこを差し替えれば
 * 任意の高さを与えられる。
 */
class ResizeObserverStub {
  readonly #callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
  }

  observe(target: Element): void {
    const rect = target.getBoundingClientRect();
    this.#callback(
      [
        {
          target,
          contentRect: rect,
          borderBoxSize: [{ blockSize: rect.height, inlineSize: rect.width }],
          contentBoxSize: [{ blockSize: rect.height, inlineSize: rect.width }],
          devicePixelContentBoxSize: [
            { blockSize: rect.height, inlineSize: rect.width },
          ],
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }

  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}
