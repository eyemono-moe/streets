import type { Component } from "solid-js";

/**
 * ログインボタンは削除済み (2026-08-05)。押す先だった `nostr-login` を依存ごと
 * 落としたため、旧実装にはログインする手段自体が無い —— 押しても何も起きない
 * ボタンを残すより、出さない方が正直である (`src/context/me.tsx` 参照)。
 */
const NeedLoginPlaceholder: Component<{
  message?: string;
}> = (props) => {
  return (
    <div class="flex h-full w-full flex-col items-center justify-center gap-2">
      <div>{props.message}</div>
    </div>
  );
};

export default NeedLoginPlaceholder;
