import type { DeviceKind } from "@streets/core/view/device-kind";
import { type Component, type JSX, Show } from "solid-js";
import type { ConnectAttempt } from "../session";
import LoginDrawer, { DRAWER_PEEK } from "./LoginDrawer";
import LoginPanel, { type LoginState, type LoginStep } from "./LoginPanel";

const REPOSITORY = "https://github.com/eyemono-moe/streets";

type WelcomeViewProps = {
  login: LoginState;
  onExtension: () => void;
  onBunker: (uri: string) => void;
  onNostrConnect: () => ConnectAttempt;
  onRetryRestore: () => void;
  initialStep?: LoginStep;
  initialRemoteOpen?: boolean;
  initialDevice?: DeviceKind;
  initialBunkerUri?: string;
  /** 狭い画面の組み方にする。投稿を全面に出し、ログインは下から引き上げる。 */
  narrow: boolean;
  /** 狭い画面で、ログインのシートを最初から引き上げておく。 */
  initialExpanded?: boolean;
  /** 流しているリレーの名前。 */
  feedTitle: string;
  feed: JSX.Element;
};

const Intro: Component = () => (
  <p class="text-body">
    Nostr
    のクライアントです。カラムを並べて、フォロー中の投稿や通知、気になる話題を同時に見られます。
  </p>
);

const SourceLink: Component = () => (
  <footer class="c-secondary text-caption">
    <a
      href={REPOSITORY}
      target="_blank"
      rel="noopener noreferrer"
      class="text-link"
    >
      ソースコード
    </a>
  </footer>
);

const Feed: Component<{
  title: string;
  feed: JSX.Element;
  /** 下に重なるシートの分だけ、最後の投稿の下を空ける。 */
  bottomInset?: string;
  class: string;
}> = (props) => (
  <section
    class={`flex flex-col overflow-hidden bg-primary ${props.class}`}
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
        <p class="c-secondary truncate text-caption">{props.title}</p>
      </div>
    </header>
    <div
      data-scroll-container
      class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
      style={
        props.bottomInset ? { "padding-bottom": props.bottomInset } : undefined
      }
    >
      {props.feed}
    </div>
  </section>
);

/**
 * ログインしていない人に出す入口。広い画面では紹介とログインを左、流れている
 * 投稿を右に並べる。狭い画面では投稿を全面に出し、ログインは下のシートに置く。
 */
const WelcomeView: Component<WelcomeViewProps> = (props) => {
  const panel = () => (
    <LoginPanel
      state={props.login}
      onExtension={props.onExtension}
      onBunker={props.onBunker}
      onNostrConnect={props.onNostrConnect}
      onRetryRestore={props.onRetryRestore}
      initialStep={props.initialStep}
      initialRemoteOpen={props.initialRemoteOpen}
      initialDevice={props.initialDevice}
      initialBunkerUri={props.initialBunkerUri}
    />
  );
  return (
    <Show
      when={props.narrow}
      fallback={
        <main class="c-primary grid h-dvh grid-cols-[minmax(0,26rem)_minmax(0,36rem)] justify-center gap-6 bg-secondary p-6">
          <div class="flex flex-col gap-8 overflow-y-auto rounded-3 bg-primary px-8 py-8">
            <header class="flex flex-col gap-3">
              <div class="flex items-center gap-3">
                <img src="/favicon.svg" alt="" class="size-10" />
                <h1 class="font-700 text-h3">Streets</h1>
              </div>
              <Intro />
            </header>
            {panel()}
            <div class="mt-auto">
              <SourceLink />
            </div>
          </div>
          <Feed
            title={props.feedTitle}
            feed={props.feed}
            class="rounded-3 border border-primary"
          />
        </main>
      }
    >
      <main class="c-primary flex h-dvh flex-col bg-primary">
        <h1 class="sr-only">Streets</h1>
        <Feed
          title={props.feedTitle}
          feed={props.feed}
          bottomInset={DRAWER_PEEK}
          class="min-h-0 flex-1"
        />
        <LoginDrawer initialExpanded={props.initialExpanded}>
          <div class="flex flex-col gap-6">
            <Intro />
            {panel()}
            <SourceLink />
          </div>
        </LoginDrawer>
      </main>
    </Show>
  );
};

export default WelcomeView;
