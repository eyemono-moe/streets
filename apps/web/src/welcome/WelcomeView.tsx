import type { ColumnDef } from "@streets/core/deck/deck";
import type { DeviceKind } from "@streets/core/view/device-kind";
import { type Component, For, type JSX, Show } from "solid-js";
import { columnView } from "../columns/column-views";
import ColumnIcon from "../deck/ColumnIcon";
import ColumnTitle from "../deck/ColumnTitle";
import type { ConnectAttempt } from "../session";
import LoginDrawer, { DRAWER_PEEK } from "./LoginDrawer";
import LoginPanel, { type LoginState, type LoginStep } from "./LoginPanel";

/** 入口に並べるカラム 1 本。中身は呼ぶ側が読み取り層に繋いで渡す。 */
export type WelcomeColumn = { column: ColumnDef; content: () => JSX.Element };

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
  /** 狭い画面の組み方にする。カラムを全面に出し、ログインは下から引き上げる。 */
  narrow: boolean;
  /** 狭い画面で、ログインのシートを最初から引き上げておく。 */
  initialExpanded?: boolean;
  columns: WelcomeColumn[];
};

/** デッキのカラムの見出しと同じ形。設定や並べ替えは無いので、操作は置かない。 */
const Header: Component<{ column: ColumnDef }> = (props) => (
  <header class="flex h-11.25 shrink-0 items-center gap-2.5 border-primary border-b bg-primary px-3">
    <ColumnIcon
      column={props.column}
      class="c-secondary size-4.5 shrink-0"
      avatarClass="size-5 shrink-0 rounded-1.5"
    />
    <div class="flex min-w-0 flex-col">
      <h2 class="truncate font-600 text-body">
        <ColumnTitle column={props.column} />
      </h2>
      <p class="c-secondary truncate text-caption">
        {columnView(props.column.source).meta(props.column.source).subtitle}
      </p>
    </div>
  </header>
);

const Columns: Component<{
  columns: WelcomeColumn[];
  /** 下に重なるシートの分だけ、最後の投稿の下を空ける。 */
  bottomInset?: string;
  class: string;
  /** 1 本の幅。狭い画面では隣のカラムが覗くように、画面より少し狭くする。 */
  columnClass: string;
}> = (props) => (
  <div
    class={`flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain bg-primary ${props.class}`}
  >
    <For each={props.columns}>
      {(item) => (
        <section
          class={`flex shrink-0 snap-start flex-col overflow-hidden border-primary border-r last:border-r-0 ${props.columnClass}`}
          aria-label={item.column.title}
        >
          <Header column={item.column} />
          <div
            data-scroll-container
            class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
            style={
              props.bottomInset
                ? { "padding-bottom": props.bottomInset }
                : undefined
            }
          >
            {item.content()}
          </div>
        </section>
      )}
    </For>
  </div>
);

/**
 * ログインしていない人に出す入口。広い画面では紹介とログインを左、種類の違う
 * カラムを右に並べる。狭い画面ではカラムを全面に出し、ログインは下のシートに置く。
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
        <main class="c-primary flex h-dvh justify-center gap-6 bg-secondary p-6">
          <div class="flex w-96 shrink-0 flex-col gap-8 overflow-y-auto rounded-3 bg-primary px-8 py-8">
            <header class="flex items-center gap-3">
              <img src="/favicon.svg" alt="" class="size-10" />
              <h1 class="font-700 text-h3">Streets</h1>
            </header>
            {panel()}
          </div>
          {/* デッキの S の幅。よくある画面の幅で 3 本並び、入りきらなければ横に流す。 */}
          <Columns
            columns={props.columns}
            class="min-w-0 max-w-[calc(3*20rem+2px)] rounded-3 border border-primary"
            columnClass="w-80"
          />
        </main>
      }
    >
      <main class="c-primary flex h-dvh flex-col bg-primary">
        <h1 class="sr-only">Streets</h1>
        <Columns
          columns={props.columns}
          bottomInset={DRAWER_PEEK}
          class="min-h-0 flex-1"
          columnClass="w-[88%]"
        />
        <LoginDrawer initialExpanded={props.initialExpanded}>
          {panel()}
        </LoginDrawer>
      </main>
    </Show>
  );
};

export default WelcomeView;
