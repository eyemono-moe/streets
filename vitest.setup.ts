/**
 * jsdom は `ResizeObserver` を実装しない。`@solid-primitives/resize-observer`
 * (`Note.tsx` の本文高さ制限、note-rendering spec 3 節) は `new
 * ResizeObserver(...)` を無条件に呼ぶため、これが無いと kind:1 を描く
 * テストが軒並み "ResizeObserver is not defined" で落ちる —— kind:1 は
 * 引用・リポスト対象・返信先としてほぼ全レンダラのテストに現れるので、
 * 個々のテストファイルで都度スタブするより、ここで一度だけ用意する。
 *
 * 実際のリサイズ通知 (callback 発火) は使わない —— `createElementSize` は
 * ref 到着時に `getBoundingClientRect()` を同期的に一度読んで初期値を
 * 得るため、高さを主張したいテストは `getBoundingClientRect` を直接
 * 差し替えれば足りる。construct 可能な no-op であれば十分。
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}
