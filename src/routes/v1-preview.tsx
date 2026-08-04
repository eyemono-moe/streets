import { type Component, Show, createSignal } from "solid-js";
import { createNip07Signer } from "../core/signer/nip07-signer";
import { SignerUnavailableError } from "../core/signer/signer";
import Button from "../shared/components/UI/Button";

/**
 * v1 の垂直スライス最初の一歩。「自分の pubkey が画面に出る」ところまで。
 *
 * **拡張機能の有無をマウント時に一度だけ確認して結果を保持する、という
 * ことはしない。** NIP-07 拡張は content script としてページ本体より
 * *後に* window.nostr を注入することがあり (nip07-signer.ts のコメント
 * 参照)、確認結果をシグナルに固定すると「後から入った拡張」を永久に
 * 見失う — signer-error が「拡張機能が見つかりません」を出したまま、
 * 実際には拡張が入っていても永久に更新されない、という壊れ方をする。
 * ログインボタンは常に表示し、クリックのたびに
 * createNip07Signer().getPublicKey() を呼んで、そのとき初めて拡張の
 * 有無を確かめる (SignerUnavailableError なら「見つからない」)。
 * nip07-signer.ts が「呼び出しのたびに読み直す」という同じ原則を、
 * ここでも UI 側で踏襲している。
 */
const V1Preview: Component = () => {
  const [pubkey, setPubkey] = createSignal<string>();
  const [errorMessage, setErrorMessage] = createSignal<string>();
  const [loading, setLoading] = createSignal(false);

  const login = async () => {
    setLoading(true);
    setErrorMessage(undefined);
    try {
      const signer = createNip07Signer();
      setPubkey(await signer.getPublicKey());
    } catch (error) {
      setErrorMessage(
        error instanceof SignerUnavailableError
          ? // TODO: NIP-46 (bunker) の導線 (ADR-0008 の Consequences) は後続タスク
            "拡張機能が見つかりません。NIP-07 対応の拡張機能 (nos2x, Alby 等) を導入してから、もう一度ログインボタンを押してください。"
          : `ログインに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="mx-auto max-w-md space-y-4 p-6">
      <h1 class="font-bold text-lg">v1 プレビュー</h1>

      <Show
        when={!pubkey()}
        fallback={
          <p
            data-testid="viewer-pubkey"
            class="break-all rounded-2 border border-alpha-300 bg-alpha-50 p-3 text-sm"
          >
            {pubkey()}
          </p>
        }
      >
        <Button data-testid="login" disabled={loading()} onClick={login}>
          {loading() ? "確認中…" : "NIP-07 でログイン"}
        </Button>

        <Show when={errorMessage()}>
          {(message) => (
            <p
              data-testid="signer-error"
              class="rounded-2 border border-red-6 bg-red-4/10 p-3 text-red-8 text-sm dark:text-red-4"
            >
              {message()}
            </p>
          )}
        </Show>
      </Show>
    </div>
  );
};

export default V1Preview;
