import { type Component, Show, createSignal } from "solid-js";
import type { Session } from "./session";

const button =
  "rounded-2 bg-accent-primary px-4 py-2 font-bold text-white hover:bg-accent-hover disabled:opacity-50";

const LoginScreen: Component<{ session: Session }> = (props) => {
  const [bunkerUri, setBunkerUri] = createSignal("");

  return (
    <main class="grid min-h-dvh place-items-center p-4">
      <div class="flex w-full max-w-sm flex-col gap-6">
        <h1 class="text-center font-bold text-h3">Streets</h1>

        <button
          type="button"
          class={button}
          disabled={props.session.pending()}
          onClick={() => void props.session.loginWithExtension()}
        >
          拡張機能でログイン
        </button>

        <form
          class="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void props.session
              .loginWithBunker(bunkerUri())
              .then(() => setBunkerUri(""));
          }}
        >
          <label for="bunker-uri" class="c-secondary text-caption">
            リモート署名器の bunker:// URI
          </label>
          <input
            id="bunker-uri"
            type="password"
            autocomplete="off"
            spellcheck={false}
            class="rounded-2 border border-primary bg-secondary px-3 py-2"
            value={bunkerUri()}
            onInput={(event) => setBunkerUri(event.currentTarget.value)}
          />
          <button
            type="submit"
            class={button}
            disabled={props.session.pending() || !bunkerUri()}
          >
            接続
          </button>
        </form>

        <Show when={props.session.authUrl()}>
          {(url) => (
            <a
              class="text-center text-link"
              href={url().href}
              target="_blank"
              rel="noreferrer"
            >
              署名器で接続を承認する
            </a>
          )}
        </Show>
        <Show when={props.session.error()}>
          {(message) => (
            <p role="alert" class="text-caption text-red-500">
              {message()}
            </p>
          )}
        </Show>
      </div>
    </main>
  );
};

export default LoginScreen;
