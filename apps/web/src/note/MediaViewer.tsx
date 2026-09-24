import { Carousel } from "@ark-ui/solid/carousel";
import { Dialog as ArkDialog } from "@ark-ui/solid/dialog";
import type { NoteMedia } from "@streets/core/view/note-layout";
import {
  type Component,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
} from "solid-js";
import Button, { ButtonLink } from "../ui/Button";
import { DialogPortal, DialogRoot } from "../ui/Dialog";

const ViewerSlide: Component<{
  media: NoteMedia;
  active: boolean;
  onClose: () => void;
}> = (props) => {
  const [broken, setBroken] = createSignal(false);
  let video: HTMLVideoElement | undefined;
  // 送った先で前の動画の音が鳴り続けないようにする。
  createEffect(() => {
    if (!props.active) video?.pause();
  });
  return (
    // 画像の外の余白を押したら閉じる。画像そのものを押しても閉じない。
    // biome-ignore lint/a11y/useKeyWithClickEvents: キーボードでは Esc と閉じるボタンで閉じる。
    <div
      class="absolute inset-0 flex items-center justify-center p-4 sm:px-16 sm:py-14"
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
            // biome-ignore lint/a11y/useMediaCaption: 外部の投稿に字幕が添えられていない場合も再生する。
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
 * 1 つの投稿に添えられた画像・動画を、画面いっぱいに 1 枚ずつ出す。
 * 左右キー・スワイプ・前後のボタンで、同じ投稿の中だけを送る。
 */
const MediaViewer: Component<{
  media: NoteMedia[];
  /** 開いている位置。`undefined` なら閉じている。 */
  index: number | undefined;
  onIndexChange: (index: number) => void;
  onClose: () => void;
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
                    />
                  </Carousel.Item>
                )}
              </For>
            </Carousel.ItemGroup>
            <Show when={count() > 1}>
              <Carousel.PrevTrigger
                asChild={(triggerProps) => (
                  <Button
                    {...triggerProps()}
                    variant="overlay"
                    icon="i-material-symbols:chevron-left-rounded"
                    aria-label="前へ"
                    class="-translate-y-1/2 absolute top-1/2 left-3 disabled:invisible"
                  />
                )}
              />
              <Carousel.NextTrigger
                asChild={(triggerProps) => (
                  <Button
                    {...triggerProps()}
                    variant="overlay"
                    icon="i-material-symbols:chevron-right-rounded"
                    aria-label="次へ"
                    class="-translate-y-1/2 absolute top-1/2 right-3 disabled:invisible"
                  />
                )}
              />
            </Show>
          </Carousel.Root>
          <div class="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
            <ArkDialog.CloseTrigger
              asChild={(closeProps) => (
                <Button
                  {...closeProps()}
                  variant="overlay"
                  icon="i-material-symbols:close-rounded"
                  aria-label="閉じる"
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
        </ArkDialog.Content>
      </DialogPortal>
    </DialogRoot>
  );
};

export default MediaViewer;
