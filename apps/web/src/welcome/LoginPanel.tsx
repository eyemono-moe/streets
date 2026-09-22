import { type Component, Show, createSignal } from "solid-js";
import Button from "../ui/Button";
import { textInputClass } from "../ui/TextField";

const GUIDE = "https://welcome.nostr-jp.org";

export type LoginState = {
  pending: boolean;
  error?: string;
  /** 署名器が承認のために開いてほしいページ。 */
  authUrl?: URL;
};

const ExternalLink: Component<{ href: string; children: string }> = (props) => (
  <a
    href={props.href}
    target="_blank"
    rel="noopener noreferrer"
    class="text-link"
  >
    {props.children}
  </a>
);

/** 秘密鍵を貼られたときに、受け付けない理由を出す（ADR-0008）。 */
const looksLikeSecretKey = (input: string) =>
  /^nsec1/i.test(input.trim()) || /^[0-9a-f]{64}$/i.test(input.trim());

/** 既に Nostr のアカウントを持っている人のための入口。 */
const LoginPanel: Component<{
  state: LoginState;
  onExtension: () => void;
  onBunker: (uri: string) => void;
  /** 入力欄の最初の値。ストーリーで貼り付けた後の見た目を出すため。 */
  initialBunkerUri?: string;
}> = (props) => {
  const [bunkerUri, setBunkerUri] = createSignal(props.initialBunkerUri ?? "");
  const secretKey = () => looksLikeSecretKey(bunkerUri());

  return (
    <section class="flex flex-col gap-4" aria-labelledby="login-heading">
      <h2 id="login-heading" class="font-600 text-body">
        Nostr のアカウントを持っている方
      </h2>

      <Show when={props.state.error}>
        {(message) => (
          <p
            role="alert"
            class="c-danger rounded-2 bg-danger-subtle px-3 py-2 text-caption"
          >
            {message()}
          </p>
        )}
      </Show>

      <div class="flex flex-col gap-1.5">
        <Button
          variant="primary"
          shape="rounded"
          block
          icon="i-material-symbols:extension-outline-rounded"
          disabled={props.state.pending}
          onClick={() => props.onExtension()}
        >
          拡張機能でログイン
        </Button>
        <p class="c-secondary text-caption">
          nos2x や Alby など、Nostr の鍵を預かるブラウザ拡張機能を使います。
          <ExternalLink href={`${GUIDE}/tutorial/nip-07.html`}>
            拡張機能の入れ方
          </ExternalLink>
        </p>
      </div>

      <form
        class="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!secretKey()) props.onBunker(bunkerUri().trim());
        }}
      >
        <label for="bunker-uri" class="font-600 text-caption">
          リモート署名器でログイン
        </label>
        <div class="flex gap-2">
          <input
            id="bunker-uri"
            type="password"
            autocomplete="off"
            spellcheck={false}
            placeholder="bunker://…"
            class={`${textInputClass} min-w-0 flex-1`}
            aria-invalid={secretKey()}
            aria-describedby="bunker-uri-note"
            value={bunkerUri()}
            onInput={(event) => setBunkerUri(event.currentTarget.value)}
          />
          <Button
            type="submit"
            shape="rounded"
            class="h-9"
            disabled={props.state.pending || !bunkerUri().trim() || secretKey()}
          >
            接続
          </Button>
        </div>
        <Show
          when={secretKey()}
          fallback={
            <p id="bunker-uri-note" class="c-secondary text-caption">
              nsec.app や Amber などの署名器が表示する、bunker://
              で始まる文字列を貼り付けます。
            </p>
          }
        >
          <p id="bunker-uri-note" class="c-danger text-caption">
            これは秘密鍵です。Streets
            は秘密鍵を受け付けません。秘密鍵が一度でも漏れると、アカウントを取り戻す方法がないためです。拡張機能か署名器に秘密鍵を預けてから、そちらでログインしてください。
            <ExternalLink href={`${GUIDE}/faq.html#why-is-nsec-confidential`}>
              秘密鍵を人に渡してはいけない理由
            </ExternalLink>
          </p>
        </Show>
      </form>

      <Show when={props.state.authUrl}>
        {(url) => (
          <a
            class="text-caption text-link"
            href={url().href}
            target="_blank"
            rel="noopener noreferrer"
          >
            署名器で接続を承認する
          </a>
        )}
      </Show>
    </section>
  );
};

export default LoginPanel;
