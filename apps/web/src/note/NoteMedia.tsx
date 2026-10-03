import { MEDIA_MAX_EDGE } from "@streets/core/media/display-size";
import type { NoteMedia } from "@streets/core/view/note-layout";
import { decode, isBlurhashValid } from "blurhash";
import {
  type Component,
  type JSX,
  Show,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { createDisplayImage, createNearViewport } from "../media/display-image";
import IconButton from "../ui/IconButton";
import type { EventSize } from "./Event";

type Dimensions = { width: number; height: number };

const MediaLink: Component<{ url: string }> = (props) => (
  <a
    href={props.url}
    target="_blank"
    rel="noopener noreferrer"
    class="break-all text-caption text-link"
  >
    {props.url}
  </a>
);

/** 小さい画素だけを描き、実物が届くまで枠に拡大して置く。 */
export const BlurhashCanvas: Component<{ hash: string; ratio: number }> = (
  props,
) => {
  let canvas!: HTMLCanvasElement;
  onMount(() => {
    if (!isBlurhashValid(props.hash).result) return;
    try {
      const ratio = props.ratio;
      const width = Math.max(4, Math.round(32 * Math.min(1, ratio)));
      const height = Math.max(4, Math.round(32 / Math.max(1, ratio)));
      const pixels = decode(props.hash, width, height);
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = width;
      canvas.height = height;
      const image = context.createImageData(width, height);
      image.data.set(pixels);
      context.putImageData(image, 0, 0);
    } catch {
      // 壊れた Blurhash は無視し、画像・動画の読み込みを続ける。
    }
  });
  return (
    <canvas
      ref={canvas}
      class="pointer-events-none absolute inset-0 size-full"
    />
  );
};

const MediaFrame: Component<{
  media: NoteMedia;
  size: EventSize;
  loaded: boolean;
  actual?: Dimensions;
  children: JSX.Element;
}> = (props) => {
  const maxHeight = () => (props.size === "normal" ? 320 : 240);
  const ratio = () => {
    const dimensions = props.actual ?? props.media.dimensions;
    return dimensions ? dimensions.width / dimensions.height : 16 / 9;
  };
  return (
    <div
      class="relative max-w-full overflow-hidden rounded-2 bg-secondary"
      style={{
        width: `min(100%, ${maxHeight() * ratio()}px)`,
        "aspect-ratio": `${ratio()}`,
        "max-height": `${maxHeight()}px`,
      }}
    >
      <Show when={!props.loaded && props.media.blurhash}>
        {(hash) => <BlurhashCanvas hash={hash()} ratio={ratio()} />}
      </Show>
      {props.children}
    </div>
  );
};

type MediaViewProps = {
  media: NoteMedia;
  size: EventSize;
  /**
   * 拡大表示を開く。画像はそれ自体を押したとき、動画は角の拡大のボタンを押したとき。
   * 無ければ、画像は URL を新しいタブで開き、動画には拡大のボタンを出さない。
   */
  onOpen?: () => void;
};

const MediaImage: Component<MediaViewProps> = (props) => {
  const [broken, setBroken] = createSignal(false);
  const [loadedSrc, setLoadedSrc] = createSignal<string>();
  const [revealedSrc, setRevealedSrc] = createSignal<string>();
  const [actual, setActual] = createSignal<Dimensions>();
  const [anchor, setAnchor] = createSignal<HTMLAnchorElement>();
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(revealTimer));
  // 表示の大きさに縮めてから読む。押して開いたときは、ビューアが元の画像を読む。
  const src = createDisplayImage(
    () => props.media.url,
    MEDIA_MAX_EDGE,
    createNearViewport(anchor),
  );
  const loaded = () => src() !== undefined && src() === loadedSrc();
  return (
    <Show when={!broken()} fallback={<MediaLink url={props.media.url} />}>
      <a
        ref={setAnchor}
        href={props.media.url}
        target="_blank"
        rel="noopener noreferrer"
        class="block max-w-full"
        aria-label="画像を開く"
        onClick={(event) => {
          // 修飾キー付きのクリックは、ブラウザの「新しいタブで開く」に任せる。
          if (
            !props.onOpen ||
            event.button !== 0 ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          props.onOpen();
        }}
      >
        <MediaFrame
          media={props.media}
          size={props.size}
          loaded={loaded() && revealedSrc() === src()}
          actual={actual()}
        >
          <Show when={src()}>
            {(url) => (
              <img
                src={url()}
                alt=""
                decoding="async"
                class="absolute inset-0 size-full object-contain transition-opacity duration-100"
                classList={{ "opacity-0": !loaded() }}
                onLoad={(event) => {
                  // 縮めた画像でも縦横の比は元と同じ。
                  const { naturalWidth: width, naturalHeight: height } =
                    event.currentTarget;
                  if (width > 0 && height > 0) setActual({ width, height });
                  const url = event.currentTarget.getAttribute("src");
                  setLoadedSrc(url ?? undefined);
                  clearTimeout(revealTimer);
                  // フェード中は Blurhash を下に残す。終わってから Canvas を外す。
                  revealTimer = setTimeout(
                    () => setRevealedSrc(url ?? undefined),
                    140,
                  );
                }}
                onError={() => setBroken(true)}
              />
            )}
          </Show>
        </MediaFrame>
      </a>
    </Show>
  );
};

const MediaVideo: Component<MediaViewProps> = (props) => {
  let video: HTMLVideoElement | undefined;
  const [broken, setBroken] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  const [actual, setActual] = createSignal<Dimensions>();
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(fallbackTimer));
  const source = () =>
    props.media.url.includes("#")
      ? props.media.url
      : `${props.media.url}#t=0.1`;
  return (
    <Show when={!broken()} fallback={<MediaLink url={props.media.url} />}>
      <MediaFrame
        media={props.media}
        size={props.size}
        loaded={loaded()}
        actual={actual()}
      >
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- 外部の投稿に字幕が添えられていない場合も再生する。 */}
        <video
          ref={video}
          src={source()}
          controls
          playsinline
          preload="metadata"
          class="absolute inset-0 size-full object-contain"
          classList={{ "opacity-0": !loaded() }}
          onLoadedMetadata={(event) => {
            const { videoWidth: width, videoHeight: height } =
              event.currentTarget;
            if (width > 0 && height > 0) setActual({ width, height });
            // フレームを取得できない動画でも操作を隠したままにしない。
            fallbackTimer = setTimeout(() => setLoaded(true), 1500);
          }}
          onLoadedData={() => {
            clearTimeout(fallbackTimer);
            setLoaded(true);
          }}
          onError={() => setBroken(true)}
        />
        {/*
          ブラウザの再生バー（全画面のボタンを含む）は下の端に出るので、上の角に置く。
          押す場所で動きを分けないよう、動画そのものを押したときはその場で再生する。
        */}
        <Show when={props.onOpen}>
          {(open) => (
            <IconButton
              variant="overlay"
              size="sm"
              circle
              icon="i-material-symbols:open-in-full-rounded"
              label="拡大して見る"
              class="absolute top-2 right-2"
              onClick={() => {
                // 拡大表示でも再生するので、音が重ならないよう止める。
                video?.pause();
                open()();
              }}
            />
          )}
        </Show>
      </MediaFrame>
    </Show>
  );
};

/** 音声には絵が無いので、枠を取らずにブラウザの再生バーを本文の幅で置く。 */
export const NoteAudio: Component<{ url: string }> = (props) => {
  const [broken, setBroken] = createSignal(false);
  return (
    <Show when={!broken()} fallback={<MediaLink url={props.url} />}>
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- 外部の投稿に字幕が添えられていない場合も再生する。 */}
      <audio
        src={props.url}
        controls
        preload="metadata"
        class="block h-10 w-full max-w-120"
        onError={() => setBroken(true)}
      />
    </Show>
  );
};

const NoteMediaView: Component<MediaViewProps> = (props) => (
  <Show
    when={props.media.type === "image"}
    fallback={
      <MediaVideo media={props.media} size={props.size} onOpen={props.onOpen} />
    }
  >
    <MediaImage media={props.media} size={props.size} onOpen={props.onOpen} />
  </Show>
);

export default NoteMediaView;
