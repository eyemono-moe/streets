import { type Component, Show, createSignal } from "solid-js";
import {
  createNip07Signer,
  isNip07Available,
} from "../core/signer/nip07-signer";
import { SignerUnavailableError } from "../core/signer/signer";
import Button from "../shared/components/UI/Button";

/**
 * v1 の垂直スライス最初の一歩。「自分の pubkey が画面に出る」ところまで。
 *
 * NIP-07 拡張の有無はマウント時に一度だけ確認する。拡張機能は content
 * script としてページ本体より先に window.nostr を注入するのが通例なので
 * (src/shared/libs/useNIP07.ts も同じ前提)、ここで再確認のポーリング等は
 * 行わない。ログイン後の署名要求では nip07-signer.ts 側が毎回 window.nostr
 * を読み直すので、後から入った拡張はそちらで拾える (ADR-0008)。
 */
const V1Preview: Component = () => {
  const [available] = createSignal(isNip07Available());
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
          ? "拡張機能が見つかりません。NIP-07 対応の拡張機能 (nos2x, Alby 等) を導入してから開き直してください。"
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
        when={available()}
        fallback={
          <p
            data-testid="signer-error"
            class="rounded-2 border border-alpha-300 bg-alpha-50 p-3 text-sm"
          >
            拡張機能が見つかりません。NIP-07 対応の拡張機能 (nos2x, Alby 等)
            を導入してから開き直してください。
            {/* TODO: NIP-46 (bunker) の導線 (ADR-0008 の Consequences) は後続タスク */}
          </p>
        }
      >
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
      </Show>
    </div>
  );
};

export default V1Preview;
