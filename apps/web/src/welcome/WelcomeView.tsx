import { StreetSign } from "@streets/sign";
import type { Component, JSX } from "solid-js";
import LoginPanel, { type LoginState } from "./LoginPanel";

const REPOSITORY = "https://github.com/eyemono-moe/streets";
const GUIDE = "https://welcome.nostr-jp.org";

/**
 * ログインしていない人に出す入口。狭い画面では紹介とログインを上に、流れている
 * 投稿を下に置く。
 */
const WelcomeView: Component<{
  login: LoginState;
  onExtension: () => void;
  onBunker: (uri: string) => void;
  initialBunkerUri?: string;
  /** 流しているリレーの名前。 */
  feedTitle: string;
  feed: JSX.Element;
}> = (props) => (
  <main class="c-primary min-h-dvh bg-secondary md:grid md:h-dvh md:grid-cols-[minmax(0,26rem)_minmax(0,36rem)] md:justify-center md:gap-6 md:p-6">
    <div class="flex flex-col gap-8 bg-primary px-4 py-8 md:overflow-y-auto md:rounded-3 md:px-8">
      <header class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <StreetSign name="streets" class="size-10 rounded-2" />
          <h1 class="font-700 text-h3">Streets</h1>
        </div>
        <p class="text-body">
          Nostr
          のクライアントです。カラムを並べて、フォロー中の投稿や通知、気になる話題を同時に見られます。
        </p>
      </header>

      <LoginPanel
        state={props.login}
        onExtension={props.onExtension}
        onBunker={props.onBunker}
        initialBunkerUri={props.initialBunkerUri}
      />

      <section class="flex flex-col gap-2" aria-labelledby="new-heading">
        <h2 id="new-heading" class="font-600 text-body">
          はじめての方
        </h2>
        <p class="c-secondary text-caption">
          Nostr のアカウントは、鍵を預かる拡張機能か署名器で作ります。Streets
          は鍵を預からず、署名をそれらに頼みます。
          <a
            href={GUIDE}
            target="_blank"
            rel="noopener noreferrer"
            class="text-link"
          >
            Nostr のはじめかた
          </a>
        </p>
      </section>

      <footer class="c-secondary mt-auto text-caption">
        <a
          href={REPOSITORY}
          target="_blank"
          rel="noopener noreferrer"
          class="text-link"
        >
          ソースコード
        </a>
      </footer>
    </div>

    <section
      class="flex h-[80dvh] flex-col overflow-hidden border-primary border-t bg-primary md:h-auto md:rounded-3 md:border"
      aria-labelledby="feed-heading"
    >
      <header class="flex h-11.25 shrink-0 items-center gap-2.5 border-primary border-b bg-primary px-3">
        <span
          class="i-material-symbols:globe c-secondary size-4.5 shrink-0"
          aria-hidden="true"
        />
        <div class="flex min-w-0 flex-col">
          <h2 id="feed-heading" class="font-600 text-body">
            いま流れている投稿
          </h2>
          <p class="c-secondary truncate text-caption">{props.feedTitle}</p>
        </div>
      </header>
      <div
        data-scroll-container
        class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
      >
        {props.feed}
      </div>
    </section>
  </main>
);

export default WelcomeView;
