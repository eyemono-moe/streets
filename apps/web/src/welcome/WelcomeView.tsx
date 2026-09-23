import type { Component, JSX } from "solid-js";
import type { ConnectAttempt } from "../session";
import LoginPanel, { type LoginState, type LoginStep } from "./LoginPanel";

const REPOSITORY = "https://github.com/eyemono-moe/streets";

/**
 * ログインしていない人に出す入口。狭い画面では紹介とログインを上に、流れている
 * 投稿を下に置く。
 */
const WelcomeView: Component<{
  login: LoginState;
  onExtension: () => void;
  onBunker: (uri: string) => void;
  onNostrConnect: () => ConnectAttempt;
  initialStep?: LoginStep;
  initialRemoteOpen?: boolean;
  initialBunkerUri?: string;
  /** 流しているリレーの名前。 */
  feedTitle: string;
  feed: JSX.Element;
}> = (props) => (
  <main class="c-primary min-h-dvh bg-secondary md:grid md:h-dvh md:grid-cols-[minmax(0,26rem)_minmax(0,36rem)] md:justify-center md:gap-6 md:p-6">
    <div class="flex flex-col gap-8 bg-primary px-4 py-8 md:overflow-y-auto md:rounded-3 md:px-8">
      <header class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <img src="/favicon.svg" alt="" class="size-10" />
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
        onNostrConnect={props.onNostrConnect}
        initialStep={props.initialStep}
        initialRemoteOpen={props.initialRemoteOpen}
        initialBunkerUri={props.initialBunkerUri}
      />

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
