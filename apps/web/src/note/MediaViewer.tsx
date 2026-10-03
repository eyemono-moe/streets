import { Carousel } from "@ark-ui/solid/carousel";
import { Dialog as ArkDialog } from "@ark-ui/solid/dialog";
import { columnForEvent } from "@streets/core/deck/open-event";
import type { NostrEvent } from "@streets/core/nostr/event";
import { type NoteMedia, layoutNote } from "@streets/core/view/note-layout";
import {
  type Component,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
} from "solid-js";
import { useDispatch } from "../ui-events";
import Button, { ButtonLink } from "../ui/Button";
import { DialogPortal, DialogRoot } from "../ui/Dialog";
import IconButton from "../ui/IconButton";
import Avatar from "./Avatar";
import Name from "./Name";
import { ContentTokens } from "./NoteText";

const ViewerSlide: Component<{
  media: NoteMedia;
  active: boolean;
  onClose: () => void;
  /** 下に投稿の帯を重ねるので、そのぶん絵を上に寄せる。 */
  footer: boolean;
}> = (props) => {
  const [broken, setBroken] = createSignal(false);
  let video: HTMLVideoElement | undefined;
  // 送った先で前の動画の音が鳴り続けないようにする。
  createEffect(() => {
    if (!props.active) video?.pause();
  });
  return (
    // 画像の外の余白を押したら閉じる。画像そのものを押しても閉じない。
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- キーボードでは Esc と閉じるボタンで閉じる。
    <div
      class="absolute inset-0 flex items-center justify-center px-4 sm:px-16"
      classList={{
        "py-4 sm:py-14": !props.footer,
        "pt-4 pb-26 sm:pt-14 sm:pb-28": props.footer,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <Show
        when={!broken()}
        fallback={
          <p class="c-white text-body">
            {props.media.type === "image" ? "画像" : "動画"}
            を読み込めませんでした
          </p>
        }
      >
        <Show
          when={props.media.type === "image"}
          fallback={
            // oxlint-disable-next-line jsx-a11y/media-has-caption -- 外部の投稿に字幕が添えられていない場合も再生する。
            <video
              ref={video}
              src={props.media.url}
              controls
              playsinline
              preload="metadata"
              class="max-h-full max-w-full"
              onError={() => setBroken(true)}
            />
          }
        >
          <img
            src={props.media.url}
            alt=""
            class="max-h-full max-w-full select-none object-contain"
            draggable={false}
            onError={() => setBroken(true)}
          />
        </Show>
      </Show>
    </div>
  );
};

/**
 * いま見ている 1 枚がどの投稿のものか。格子のように本文が見えない所から開いたとき、
 * 投稿へ戻る口にする。
 */
const ViewerOrigin: Component<{ event: NostrEvent; onOpen: () => void }> = (
  props,
) => {
  const dispatch = useDispatch();
  const text = createMemo(
    () => layoutNote(props.event, { quotes: false }).text,
  );
  return (
    <div class="c-white pointer-events-auto flex w-full max-w-160 items-center gap-3 rounded-3 bg-ui-950/60 p-3">
      <Avatar pubkey={props.event.pubkey} size="compact" static />
      <div class="min-w-0 flex-1">
        <p class="truncate font-600 text-caption">
          <Name pubkey={props.event.pubkey} />
        </p>
        <Show when={text().length > 0}>
          <p class="line-clamp-2 break-anywhere text-caption opacity-80">
            <ContentTokens tokens={text()} interactive={false} />
          </p>
        </Show>
      </div>
      <Button
        variant="overlay"
        size="sm"
        class="shrink-0"
        onClick={() => {
          props.onOpen();
          dispatch({ type: "stack/open", column: columnForEvent(props.event) });
        }}
      >
        投稿を開く
      </Button>
    </div>
  );
};

/**
 * 画像・動画を、画面いっぱいに 1 枚ずつ出す。左右キー・スワイプ・前後のボタンで、
 * 渡された並び（1 つの投稿の中、または格子の全体）を送る。
 */
const MediaViewer: Component<{
  media: NoteMedia[];
  /** 開いている位置。`undefined` なら閉じている。 */
  index: number | undefined;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** その位置の 1 枚を添えた投稿。渡すと、下にその投稿と「投稿を開く」を出す。 */
  origin?: (index: number) => NostrEvent | undefined;
}> = (props) => {
  const count = () => props.media.length;
  // 閉じる動きの間も、最後に開いていた位置に留める。0 に戻すと 1 枚目へ送られてから消える。
  const page = createMemo<number>((last) => props.index ?? last, 0);
  const current = () => props.media[page()];
  const move = (delta: number) => {
    const next = page() + delta;
    if (next >= 0 && next < count()) props.onIndexChange(next);
  };
  return (
    <DialogRoot open={props.index !== undefined} onClose={props.onClose}>
      <DialogPortal class="p-0" backdropClass="bg-ui-950/90">
        <ArkDialog.Content
          aria-label="添付の拡大表示"
          class="motion-fade fixed inset-0 outline-none"
          onKeyDown={(event) => {
            // 並びに焦点があるときはカルーセルが自分で送る。焦点が閉じるボタンなどに
            // あっても送れるよう、残りをここで拾う。動画の操作部は左右キーを早送り・巻き戻しに使う。
            if (
              event.defaultPrevented ||
              event.target instanceof HTMLVideoElement
            )
              return;
            if (event.key === "ArrowLeft") move(-1);
            else if (event.key === "ArrowRight") move(1);
            else return;
            event.preventDefault();
          }}
        >
          <Carousel.Root
            slideCount={count()}
            page={page()}
            onPageChange={(details) => props.onIndexChange(details.page)}
            class="size-full"
          >
            <Carousel.ItemGroup class="size-full">
              <For each={props.media}>
                {(item, index) => (
                  <Carousel.Item index={index()} class="relative h-full">
                    <ViewerSlide
                      media={item}
                      active={index() === page()}
                      onClose={props.onClose}
                      footer={props.origin !== undefined}
                    />
                  </Carousel.Item>
                )}
              </For>
            </Carousel.ItemGroup>
            <Show when={count() > 1}>
              <Carousel.PrevTrigger
                asChild={(triggerProps) => (
                  <IconButton
                    {...triggerProps()}
                    variant="overlay"
                    size="lg"
                    circle
                    icon="i-material-symbols:chevron-left-rounded"
                    label="前へ"
                    class="-translate-y-1/2 absolute top-1/2 left-3 disabled:invisible"
                  />
                )}
              />
              <Carousel.NextTrigger
                asChild={(triggerProps) => (
                  <IconButton
                    {...triggerProps()}
                    variant="overlay"
                    size="lg"
                    circle
                    icon="i-material-symbols:chevron-right-rounded"
                    label="次へ"
                    class="-translate-y-1/2 absolute top-1/2 right-3 disabled:invisible"
                  />
                )}
              />
            </Show>
          </Carousel.Root>
          <div class="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
            <ArkDialog.CloseTrigger
              asChild={(closeProps) => (
                <IconButton
                  {...closeProps()}
                  variant="overlay"
                  size="md"
                  circle
                  icon="i-material-symbols:close-rounded"
                  label="閉じる"
                  class="pointer-events-auto"
                />
              )}
            />
            <Show when={count() > 1}>
              <span class="c-white rounded-full bg-ui-950/60 px-3 py-1 text-caption tabular-nums">
                {page() + 1} / {count()}
              </span>
            </Show>
            <ButtonLink
              href={current()?.url}
              target="_blank"
              rel="noopener noreferrer"
              variant="overlay"
              icon="i-material-symbols:open-in-new-rounded"
              class="pointer-events-auto"
            >
              元の{current()?.type === "video" ? "動画" : "画像"}を開く
            </ButtonLink>
          </div>
          <Show when={props.origin?.(page())}>
            {(event) => (
              <div class="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
                <ViewerOrigin event={event()} onOpen={props.onClose} />
              </div>
            )}
          </Show>
        </ArkDialog.Content>
      </DialogPortal>
    </DialogRoot>
  );
};

export default MediaViewer;
