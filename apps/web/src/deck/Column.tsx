import { Collapsible } from "@ark-ui/solid/collapsible";
import { Drawer } from "@ark-ui/solid/drawer";
import { columnAlerts } from "@streets/core/deck/column-alerts";
import { columnFacets } from "@streets/core/deck/column-facets";
import { type ColumnDef, columnShow } from "@streets/core/deck/deck";
import { resolveSource } from "@streets/core/deck/resolve-source";
import { followeesFrom, followersFrom } from "@streets/core/nostr/follow-list";
import type { ReadLayer } from "@streets/core/read/read-layer";
import type { RelayListState } from "@streets/core/settings/relay-list-state";
import { createSection } from "@streets/core/solid/create-section";
import { visibleColumnItems } from "@streets/core/view/column-items";
import {
  type Accessor,
  type Component,
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createSignal,
} from "solid-js";
import { setDiagnostics } from "../devtools/diagnostics";
import Event from "../note/Event";
import ProfileHeader from "../profile/ProfileHeader";
import ProfileList from "../profile/ProfileList";
import ColumnSettings, { type ColumnPatch } from "./ColumnSettings";
import ColumnTitle from "./ColumnTitle";
import ThreadView from "./ThreadView";
import { columnMeta } from "./column-meta";
import { ColumnStackProvider } from "./column-stack";

/** 重ねられたカラムが、下の段へ戻るための配線。 */
export type StackedColumn = {
  onBack: () => void;
  /** デッキの正規のカラムとして開き直す。 */
  onOpenAsColumn: () => void;
  /** 戻った先の名前。ヘッダーの説明に出す。 */
  backTo: string;
};

/** 重ねた 1 段。閉じても、閉じる動きが終わるまでは配列に残る。 */
type StackLayer = {
  column: ColumnDef;
  open: Accessor<boolean>;
  close: () => void;
};

export type ColumnProps = {
  column: ColumnDef;
  readLayer: ReadLayer;
  viewer: string;
  followees: () => readonly string[];
  relayList: () => RelayListState;
  bookmarks: () => readonly string[];
  onPatch: (patch: ColumnPatch) => void;
  onRemove: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  /** ヘッダーを掴んで並べ替えるための配線。 */
  onDragStart?: (event: DragEvent) => void;
  /** URL から開いたカラム。保存されていないので、残すか閉じるかを選ばせる。 */
  temporary?: { onKeep: () => void; onClose: () => void };
  /** モバイルでは題名をタブが持つので、アクセント線とヘッダーを出さない。 */
  chrome?: boolean;
  /** 重ねられている間だけ渡る。ヘッダーが「戻る」側に変わる。 */
  stacked?: StackedColumn;
  /** 重なりから、デッキの正規のカラムとして開き直す。 */
  onOpenAsColumn?: (column: ColumnDef) => void;
};

const Header: Component<{
  column: ColumnDef;
  open: boolean;
  onToggle: () => void;
  onDragStart?: (event: DragEvent) => void;
  temporary?: { onKeep: () => void; onClose: () => void };
}> = (props) => {
  const meta = () => columnMeta(props.column);
  return (
    // ヘッダーを掴んでカラムを並べ替える。本文まで draggable にすると本文を選べなくなる。
    <header
      class="flex h-11.25 shrink-0 items-center gap-2.5 bg-primary px-3"
      classList={{ "cursor-grab": props.onDragStart !== undefined }}
      draggable={props.onDragStart !== undefined}
      onDragStart={(event) => props.onDragStart?.(event)}
    >
      <span
        class={`c-secondary size-4.5 shrink-0 ${meta().icon}`}
        aria-hidden="true"
      />
      <div class="flex min-w-0 flex-1 flex-col">
        <h2 class="truncate font-600 text-body">
          <ColumnTitle column={props.column} />
        </h2>
        <p class="c-secondary truncate text-caption">{meta().subtitle}</p>
      </div>
      <Show when={props.temporary}>
        {(temporary) => (
          <>
            <button
              type="button"
              class="c-secondary flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-secondary px-2.5 font-600 text-caption"
              onClick={() => temporary().onKeep()}
            >
              <span
                class="i-material-symbols:bookmark-outline-rounded size-3.5"
                aria-hidden="true"
              />
              カラムに残す
            </button>
            <button
              type="button"
              aria-label="閉じる"
              class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
              onClick={() => temporary().onClose()}
            >
              <span
                class="i-material-symbols:close-rounded size-4.5"
                aria-hidden="true"
              />
            </button>
          </>
        )}
      </Show>
      <Show when={!props.temporary}>
        <button
          type="button"
          aria-label="カラムの設定"
          aria-expanded={props.open}
          class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
          onClick={() => props.onToggle()}
        >
          <span
            class="size-4.5"
            classList={{
              "i-material-symbols:more-horiz": !props.open,
              "i-material-symbols:close-rounded": props.open,
            }}
            aria-hidden="true"
          />
        </button>
      </Show>
    </header>
  );
};

/** 重ねられたカラムのヘッダー。戻る操作と、正規のカラムとして開く導線を持つ。 */
const StackedHeader: Component<{
  column: ColumnDef;
  stacked: StackedColumn;
}> = (props) => (
  <header class="flex h-11.25 shrink-0 items-center gap-2.5 bg-primary px-3">
    <button
      type="button"
      aria-label="戻る"
      class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
      onClick={() => props.stacked.onBack()}
    >
      <span
        class="i-material-symbols:chevron-left-rounded size-5.5"
        aria-hidden="true"
      />
    </button>
    <div class="flex min-w-0 flex-1 flex-col">
      <h2 class="truncate font-600 text-body">
        <ColumnTitle column={props.column} />
      </h2>
      <p class="c-secondary truncate text-caption">
        {props.stacked.backTo}に戻る
      </p>
    </div>
    <button
      type="button"
      aria-label="デッキのカラムとして開く"
      title="デッキのカラムとして開く"
      class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
      onClick={() => props.stacked.onOpenAsColumn()}
    >
      <span
        class="i-material-symbols:open-in-new-rounded size-4.5"
        aria-hidden="true"
      />
    </button>
  </header>
);

/**
 * デッキの 1 列。カラムの上にはカラムを重ねられる（スタック）。重ねるものは
 * ただのカラム定義で、スレッドもユーザー詳細も外から見れば同じ「カラム」。
 */
const Column: Component<ColumnProps> = (props) => {
  // スレッドのカラムは `ThreadView` が自分で購読する（根は store から決まる）。
  const threadFocus = () =>
    props.column.source.kind === "thread"
      ? props.column.source.focus
      : undefined;
  // ユーザーのカラムは、投稿の上にプロフィールを出す。
  const profilePubkey = () =>
    props.column.source.kind === "user"
      ? props.column.source.pubkey
      : undefined;
  /** フォロー・フォロワーのカラムが並べる人。kind:3 から取り出す。 */
  const people = (): readonly string[] | undefined => {
    const source = props.column.source;
    if (source.kind === "followees-list") {
      return followeesFrom(section.items()[0]);
    }
    if (source.kind === "followers-list") return followersFrom(section.items());
    return undefined;
  };
  const section = createSection({
    manager: props.readLayer.manager,
    // ウォームアップの結果を memo の外で読むと、settle のたびに全カラムの購読が張り直される。
    source: () =>
      resolveSource(props.column.source, {
        followees: props.followees,
        viewer: props.viewer,
        relayList: props.relayList,
        bookmarks: props.bookmarks,
      }),
  });
  const show = () => columnShow(props.column);
  const facets = () => columnFacets(props.column);
  const items = () => visibleColumnItems(section.items(), show(), facets());
  const alerts = () =>
    columnAlerts(props.column, section.status(), props.relayList());
  const size = () =>
    props.column.density === "compact" ? "compact" : ("normal" as const);
  const expandMedia = () => props.column.expandMedia !== false;

  // 重ねたカラム。いちばん下のカラムだけが持ち、デッキには保存しない。
  // 開閉は段ごとの Drawer（Ark UI）が状態機械として持つ。閉じた段は、閉じる動きが
  // 終わってから配列から外す（すぐ外すと消える動きが見えない）。
  const [stack, setStack] = createSignal<StackLayer[]>([]);
  const openLayers = () => stack().filter((layer) => layer.open());
  const push = (column: ColumnDef) =>
    setStack((current) => {
      const top = current.filter((layer) => layer.open()).at(-1);
      if (top?.column.id === column.id) return current;
      const [open, setOpen] = createSignal(true);
      return [...current, { column, open, close: () => setOpen(false) }];
    });
  const back = () => openLayers().at(-1)?.close();
  /** 自分より上に、開いている段があるか。 */
  const coveredBy = (layer: StackLayer) =>
    layer.open() && layer !== openLayers().at(-1);
  const closeAbove = (layer: StackLayer) => {
    const layers = openLayers();
    for (const above of layers.slice(layers.indexOf(layer) + 1)) above.close();
  };
  const remove = (layer: StackLayer) =>
    setStack((current) => current.filter((entry) => entry !== layer));

  createEffect(() =>
    setDiagnostics("sections", props.column.id, {
      ...section.status(),
      items: section.items().length,
    }),
  );

  // 中身は関数にして、下の provider の中で作る。Solid の context は
  // 「要素を作った場所」で決まるので、外で組み立てると provider が届かない。
  const events = () => (
    <Switch>
      <Match when={items().length > 0}>
        {/* 投稿の間の 1px を背景色で見せる。最後の投稿の下にも線を引く。 */}
        <div class="flex flex-col gap-px bg-tertiary pb-px">
          <For each={items()}>
            {(event) => (
              <Event event={event} size={size()} expandMedia={expandMedia()} />
            )}
          </For>
        </div>
      </Match>
      <Match when={section.status().phase === "settled"}>
        <p class="c-secondary p-4 text-caption">まだ投稿がありません。</p>
      </Match>
      <Match when={true}>
        <p class="c-secondary p-4 text-caption">読み込み中…</p>
      </Match>
    </Switch>
  );

  const body = () => (
    <div class="min-h-0 flex-1 overflow-y-auto">
      <Switch fallback={events()}>
        <Match when={threadFocus()}>
          {(focus) => (
            <ThreadView
              focus={focus()}
              readLayer={props.readLayer}
              expandMedia={expandMedia()}
            />
          )}
        </Match>
        <Match when={profilePubkey()}>
          {(pubkey) => (
            <>
              <ProfileHeader pubkey={pubkey()} readLayer={props.readLayer} />
              {events()}
            </>
          )}
        </Match>
        <Match when={people()}>
          {(people) => (
            <ProfileList
              people={people()}
              settled={section.status().phase === "settled"}
              empty={
                props.column.source.kind === "followers-list"
                  ? "フォロワーを取得できませんでした。"
                  : "まだ誰もフォローしていません。"
              }
            />
          )}
        </Match>
      </Switch>
    </div>
  );

  const chrome = () => (
    <>
      <Show when={props.chrome !== false && !props.stacked}>
        <div class="h-0.75 shrink-0 bg-accent-primary" />
      </Show>
      <Show
        when={props.stacked}
        fallback={
          <Show when={props.chrome !== false}>
            {/*
              重なっている間は、下のカラムのヘッダーを押しても 1 段戻る
              （ダイアログの外側を押した扱い）。
            */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: キーボードからはヘッダーの「戻る」ボタンで戻る */}
            <div
              onClick={(event) => {
                if (openLayers().length === 0) return;
                const target = event.target;
                if (target instanceof Element && target.closest("button")) {
                  return;
                }
                back();
              }}
            >
              <Header
                column={props.column}
                open={props.settingsOpen}
                onToggle={props.onToggleSettings}
                onDragStart={props.onDragStart}
                temporary={props.temporary}
              />
            </div>
          </Show>
        }
      >
        {(stacked) => (
          <StackedHeader column={props.column} stacked={stacked()} />
        )}
      </Show>
      {/* 閉じている間は中身を作らない（lazyMount）。カラムの数だけ設定の DOM を持たないため。 */}
      <Collapsible.Root
        open={props.settingsOpen}
        lazyMount
        unmountOnExit
        class="shrink-0"
      >
        <Collapsible.Content class="motion-collapse">
          <ColumnSettings
            column={props.column}
            facets={facets()}
            onPatch={props.onPatch}
            onRemove={props.onRemove}
          />
        </Collapsible.Content>
      </Collapsible.Root>
      <For each={alerts()}>
        {(alert) => (
          <p
            role="alert"
            class="c-secondary bg-secondary px-3 py-2 text-caption"
          >
            {alert.message}
            {alert.action ? `。${alert.action}` : ""}
          </p>
        )}
      </For>
    </>
  );

  // 重ねられた側は自分でスタックを持たない。押されたものは下のカラムのスタックへ積む。
  const inner = () => (
    <section
      // 重なりの影が隣のカラムまで伸びないように、カラムの中で切る。
      class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-primary"
      // 保存されていないことを枠で示す。
      classList={{
        "outline outline-2 -outline-offset-2 outline-accent-5":
          props.temporary !== undefined,
      }}
    >
      {chrome()}
      <Show when={!props.stacked} fallback={body()}>
        {/*
          重ねても下のカラムを取り外さない。取り外すとスクロール位置が失われ、
          戻ったときに読んでいた場所が分からなくなる。
        */}
        <div class="relative min-h-0 flex-1">
          {/*
            重ね順は z-index ではなく DOM の順で決める：下のカラム → 外側 → 重ねたカラム。
            中の重ね順（sticky なアイコンなど）が外へ漏れないよう、段ごとに isolate する。
          */}
          <div class="absolute inset-0 isolate flex flex-col">{body()}</div>
          <Show when={stack().length > 0}>
            {/* 覗いている部分＝重なりの外側。押したら 1 段戻る（ダイアログと同じ勘）。 */}
            <button
              type="button"
              aria-label="重ねた表示を閉じる"
              class="motion-fade absolute inset-0 w-full cursor-pointer bg-ui-950/25"
              data-state={openLayers().length > 0 ? "open" : "closed"}
              onClick={back}
            />
          </Show>
          <For each={stack()}>
            {(layer, index) => (
              <Drawer.Root
                open={layer.open()}
                onOpenChange={(details) => {
                  if (!details.open) layer.close();
                }}
                onExitComplete={() => remove(layer)}
                lazyMount
                unmountOnExit
                // カラムの中の重なりなので、デッキの他のカラムは触れたままにする。
                modal={false}
                trapFocus={false}
                preventScroll={false}
                // 外側は上の暗幕が受ける。他のカラムを押しただけで閉じないように切る。
                closeOnInteractOutside={false}
                swipeDirection="down"
              >
                {/* 下の段も隠さない。段ごとにずらして重ね、深さが見えるようにする。 */}
                <Drawer.Positioner class="absolute inset-0 isolate">
                  <Drawer.Content
                    aria-label={layer.column.title}
                    // 影だけではダークモードで沈むので、上辺の枠線でも縁を見せる。
                    class="motion-stack absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-3 border-primary border-t bg-primary shadow-[0_-10px_30px_rgba(0,0,0,0.28)] outline-none transition-transform duration-180 ease-out dark:shadow-[0_-10px_30px_rgba(0,0,0,0.7)]"
                    // 段ごとに少しずつ下げて、下のカラムが覗くようにする（上限 3 段ぶん）。
                    style={{ top: `${Math.min(index() + 1, 3) * 8}px` }}
                  >
                    <Column
                      {...props}
                      column={layer.column}
                      settingsOpen={false}
                      onToggleSettings={() => {}}
                      onDragStart={undefined}
                      temporary={undefined}
                      stacked={{
                        onBack: back,
                        onOpenAsColumn: () =>
                          props.onOpenAsColumn?.(layer.column),
                        backTo:
                          index() > 0
                            ? (stack()[index() - 1]?.column.title ??
                              props.column.title)
                            : props.column.title,
                      }}
                    />
                    {/*
                      上に段が重なっている間は、この段も暗くする。下の段と上の段は見た目が
                      似ているので、暗くしないと上の段を引き下げたときに区別が付かない。
                      押すと、この段まで戻る（下のカラムの暗幕と同じ勘）。
                      出し入れは transition にする。keyframes だと、段を積んだ瞬間に
                      消える動きが一度走って暗くちらつく。
                    */}
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label="この段まで戻る"
                      class="absolute inset-0 cursor-pointer bg-ui-950/25 transition-opacity duration-150 ease-out"
                      classList={{
                        "pointer-events-none opacity-0": !coveredBy(layer),
                      }}
                      onClick={() => closeAbove(layer)}
                    />
                  </Drawer.Content>
                </Drawer.Positioner>
              </Drawer.Root>
            )}
          </For>
        </div>
      </Show>
    </section>
  );

  // 重ねられた側は自分のスタックを持たず、下のカラムの provider をそのまま使う。
  return props.stacked ? (
    inner()
  ) : (
    <ColumnStackProvider value={{ push }}>{inner()}</ColumnStackProvider>
  );
};

export default Column;
