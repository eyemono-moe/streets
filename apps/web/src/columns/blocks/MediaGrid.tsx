import { columnHidesMuted } from "@streets/core/deck/column-kinds";
import { MEDIA_TILE_MAX_EDGE } from "@streets/core/media/display-size";
import type { NostrEvent } from "@streets/core/nostr/event";
import {
  type NostrSource,
  PAGE_SIZE,
  type Paging,
} from "@streets/core/read/source";
import { type MediaTile, mediaTilesOf } from "@streets/core/view/media-grid";
import type { NoteMedia } from "@streets/core/view/note-layout";
import {
  type Accessor,
  type Component,
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  on,
} from "solid-js";
import { useListsUnderWarning } from "../../content-warning-setting";
import OlderLoader from "../../deck/OlderLoader";
import { lazyPart } from "../../lazy-part";
import {
  createDisplayImage,
  createNearViewport,
} from "../../media/display-image";
import { createVideoPoster } from "../../media/video-poster";
import {
  hiddenUnderWarning,
  revealWarning,
  warningLabel,
} from "../../note/ContentWarningGate";
import { BlurhashCanvas } from "../../note/NoteMedia";
import { useMutes } from "../../settings/MuteMediator";
import { createBlockSection, useColumnScope } from "../column-scope";

const MediaViewer = lazyPart(() => import("../../note/MediaViewer"));

/** 投稿ごとのマス。取り足すたびに全部の投稿の本文を読み直さない。 */
const tilesByEvent = new WeakMap<NostrEvent, MediaTile[]>();
const tilesOf = (event: NostrEvent): MediaTile[] => {
  const cached = tilesByEvent.get(event);
  if (cached) return cached;
  const tiles = mediaTilesOf(event);
  tilesByEvent.set(event, tiles);
  return tiles;
};

const TILE_CLASS =
  "relative block aspect-square cursor-pointer overflow-hidden bg-secondary p-0 outline-none focus-visible:ring-2 focus-visible:ring-accent-5 focus-visible:ring-inset";

/** 閲覧注意の付いた投稿のマス。押すまで画像を読みにいかない。 */
const WarningTile: Component<{ event: NostrEvent }> = (props) => (
  <button
    type="button"
    class={`${TILE_CLASS} c-secondary flex flex-col items-center justify-center gap-1 p-2`}
    title={warningLabel(props.event)}
    onClick={() => revealWarning(props.event.id)}
  >
    <span
      class="i-material-symbols:warning-outline-rounded size-6"
      aria-hidden="true"
    />
    <span class="font-600 text-caption">閲覧注意</span>
    <span class="sr-only">。押すと表示します</span>
  </button>
);

const BrokenMark: Component = () => (
  <span
    class="i-material-symbols:broken-image-outline-rounded c-secondary absolute inset-0 m-auto size-6"
    aria-hidden="true"
  />
);

const TileImage: Component<{
  media: NoteMedia;
  near: Accessor<boolean>;
  onLoad: () => void;
  onBroken: () => void;
}> = (props) => {
  const [loaded, setLoaded] = createSignal(false);
  const src = createDisplayImage(
    () => props.media.url,
    MEDIA_TILE_MAX_EDGE,
    props.near,
  );
  return (
    <Show when={src()}>
      {(url) => (
        <img
          src={url()}
          alt=""
          decoding="async"
          draggable={false}
          class="absolute inset-0 size-full object-cover transition-opacity duration-100"
          classList={{ "opacity-0": !loaded() }}
          onLoad={() => {
            setLoaded(true);
            props.onLoad();
          }}
          onError={props.onBroken}
        />
      )}
    </Show>
  );
};

/** 動画は最初の絵だけを出す。再生は押して開いた拡大表示で行う。 */
const TileVideo: Component<{
  media: NoteMedia;
  near: Accessor<boolean>;
  onLoad: () => void;
  onBroken: () => void;
}> = (props) => {
  const poster = createVideoPoster(
    () => props.media.url,
    MEDIA_TILE_MAX_EDGE,
    props.near,
  );
  createEffect(
    on(poster, (current) => {
      if (current.state === "ready") props.onLoad();
      if (current.state === "failed") props.onBroken();
    }),
  );
  return (
    <>
      <Show
        when={(() => {
          const current = poster();
          return current.state === "ready" ? current.canvas : undefined;
        })()}
      >
        {(canvas) => {
          const element = canvas();
          element.setAttribute("aria-hidden", "true");
          element.className =
            "pointer-events-none absolute inset-0 size-full object-cover";
          return element;
        }}
      </Show>
      {/* 絵を取れなくても、拡大表示では再生できることがある。印だけ残す。 */}
      <span class="absolute inset-0 m-auto flex size-8 items-center justify-center rounded-full bg-ui-950/60">
        <span
          class="i-material-symbols:play-arrow-rounded c-white size-5"
          aria-hidden="true"
        />
      </span>
    </>
  );
};

const Tile: Component<{ tile: MediaTile; onOpen: () => void }> = (props) => {
  const [element, setElement] = createSignal<HTMLButtonElement>();
  const near = createNearViewport(element);
  const [loaded, setLoaded] = createSignal(false);
  const media = () => props.tile.media;
  const [kind, setKind] = createSignal(media().type);
  const [triedOther, setTriedOther] = createSignal(false);
  const [broken, setBroken] = createSignal(false);
  createEffect(() => {
    const current = media();
    setKind(current.type);
    setTriedOther(false);
    setBroken(false);
  });
  const tryOther = () => {
    if (triedOther()) {
      setBroken(true);
      return;
    }
    setTriedOther(true);
    setKind(kind() === "image" ? "video" : "image");
  };
  const ratio = () => {
    const dimensions = media().dimensions;
    return dimensions ? dimensions.width / dimensions.height : 1;
  };
  return (
    <button
      ref={setElement}
      type="button"
      class={TILE_CLASS}
      aria-label={kind() === "image" ? "画像を開く" : "動画を開く"}
      onClick={() => props.onOpen()}
    >
      <Show when={!loaded() && media().blurhash}>
        {(hash) => <BlurhashCanvas hash={hash()} ratio={ratio()} />}
      </Show>
      <Show when={!broken()} fallback={<BrokenMark />}>
        <Show
          when={kind() === "image"}
          fallback={
            <TileVideo
              media={media()}
              near={near}
              onLoad={() => setLoaded(true)}
              onBroken={tryOther}
            />
          }
        >
          <TileImage
            media={media()}
            near={near}
            onLoad={() => setLoaded(true)}
            onBroken={tryOther}
          />
        </Show>
      </Show>
    </button>
  );
};

/**
 * 画像・動画を正方形のマスで 3 列に並べる。押すと拡大表示で開き、閲覧注意で隠して
 * いないものを左右に送れる。
 */
export const MediaGridView: Component<{
  tiles: readonly MediaTile[];
  /** 最初のページが揃ったか。 */
  settled: boolean;
  paging: Paging;
  onLoadMore: () => void;
}> = (props) => {
  // 位置でなく key で持つ。開いている間に新しい投稿が先頭に届いても、見ている 1 枚がずれない。
  const [viewing, setViewing] = createSignal<string>();
  const viewable = createMemo(() =>
    props.tiles.filter((tile) => !hiddenUnderWarning(tile.event)),
  );
  const index = () => {
    const key = viewing();
    if (key === undefined) return undefined;
    const found = viewable().findIndex((tile) => tile.key === key);
    return found === -1 ? undefined : found;
  };
  const empty = () => props.tiles.length === 0;

  return (
    <Switch
      fallback={
        <>
          <div class="grid grid-cols-3 gap-0.5">
            <For each={props.tiles}>
              {(tile) => (
                <Show
                  when={!hiddenUnderWarning(tile.event)}
                  fallback={<WarningTile event={tile.event} />}
                >
                  <Tile tile={tile} onOpen={() => setViewing(tile.key)} />
                </Show>
              )}
            </For>
          </div>
          {/* リレーは添付の有無で絞れないので、マスが無くても古いページを取り足していく。 */}
          <OlderLoader paging={props.paging} onReach={props.onLoadMore} />
          <Show when={index() !== undefined}>
            <MediaViewer
              media={viewable().map((tile) => tile.media)}
              index={index()}
              onIndexChange={(next) => setViewing(viewable()[next]?.key)}
              onClose={() => setViewing(undefined)}
              origin={(at) => viewable()[at]?.event}
            />
          </Show>
        </>
      }
    >
      <Match when={empty() && !props.settled}>
        <p class="c-secondary p-4 text-caption">読み込み中…</p>
      </Match>
      <Match when={empty() && props.paging === "exhausted"}>
        <p class="c-secondary p-4 text-caption">
          画像や動画を添えた投稿はまだありません。
        </p>
      </Match>
    </Switch>
  );
};

/**
 * 取ったイベントのうち、画像・動画を添えたものだけを格子にする。添付の無い投稿は
 * 落とし、1 つの投稿に何枚もあれば 1 枚ずつ並べる。
 */
const MediaGrid: Component<{
  source: () => NostrSource | undefined;
  name?: string;
}> = (props) => {
  const scope = useColumnScope();
  const section = createBlockSection({
    source: () => props.source(),
    pageSize: PAGE_SIZE,
    name: props.name,
  });
  const mutes = useMutes();
  const listsUnderWarning = useListsUnderWarning();
  const tiles = createMemo(() => {
    const received = section.items().filter(listsUnderWarning);
    const visible =
      mutes && columnHidesMuted(scope.column())
        ? received.filter((event) => !mutes.hides(event))
        : received;
    return visible.flatMap(tilesOf);
  });
  return (
    <MediaGridView
      tiles={tiles()}
      settled={section.status().phase === "settled"}
      paging={section.paging()}
      onLoadMore={section.loadMore}
    />
  );
};

export default MediaGrid;
