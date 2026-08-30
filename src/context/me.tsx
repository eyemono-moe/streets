import {
  type ParentComponent,
  createContext,
  createSignal,
  useContext,
} from "solid-js";

type MeState = {
  myPubkey: () => string | undefined;
  isLogged: () => boolean;
};

const MeContext = createContext<[state: MeState]>([
  {
    myPubkey: () => undefined,
    isLogged: () => false,
  },
]);

/**
 * **旧実装のログインは削除済み (2026-08-05)。** `myPubkey` は常に `undefined`
 * であり、`isLogged()` は常に `false` を返す。
 *
 * 以前は `nostr-login` が `init()` で `window.nostr` を差し替え、その
 * `nlAuth` イベントからここへ pubkey が流れ込んでいた。そのライブラリを
 * 依存ごと削除したので、旧実装 (`/`) は恒久的にログアウト状態になる。
 * 各所に元からある `if (!isLogged()) return;` というガードはそのまま効くので、
 * 書き込み系の操作は実行されずに止まる。
 *
 * **この Provider を残しているのは、旧実装の広範なコードが `useMe()` を
 * 呼んでいるためだけである。** 認証を復活させる先はここではなく v1 の署名器
 * seam (`src/core/signer/`、ADR-0008) であり、旧実装そのものは後続の計画で
 * 削除する。
 */
export const MeProvider: ParentComponent = (props) => {
  const [myPubkey] = createSignal<string | undefined>();

  const isLogged = () => myPubkey() !== undefined;

  return (
    <MeContext.Provider
      value={[
        {
          myPubkey,
          isLogged,
        },
      ]}
    >
      {props.children}
    </MeContext.Provider>
  );
};

export const useMe = () => {
  const ctx = useContext(MeContext);
  if (!ctx) {
    throw new Error("[context provider not found] MeProvider is not found");
  }
  return ctx;
};
