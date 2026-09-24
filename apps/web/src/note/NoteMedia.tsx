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
  /** 画像を押したとき。無ければ、画像の URL を新しいタブで開く。 */
  onOpen?: () => void;
};

const MediaImage: Component<MediaViewProps> = (props) => {
  const [broken, setBroken] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  const [actual, setActual] = createSignal<Dimensions>();
  return (
    <Show when={!broken()} fallback={<MediaLink url={props.media.url} />}>
      <a
        href={props.media.url}
        target="_blank"
        rel="noopener noreferrer"
        class="block max-w-full"
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
          loaded={loaded()}
          actual={actual()}
        >
          <img
            src={props.media.url}
            alt=""
            loading="lazy"
            decoding="async"
            class="absolute inset-0 size-full object-contain"
            classList={{ "opacity-0": !loaded() }}
            onLoad={(event) => {
              const { naturalWidth: width, naturalHeight: height } =
                event.currentTarget;
              if (width > 0 && height > 0) setActual({ width, height });
              setLoaded(true);
            }}
            onError={() => setBroken(true)}
          />
        </MediaFrame>
      </a>
    </Show>
  );
};

const MediaVideo: Component<{ media: NoteMedia; size: EventSize }> = (
  props,
) => {
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
        {/* biome-ignore lint/a11y/useMediaCaption: 外部の投稿に字幕が添えられていない場合も再生する。 */}
        <video
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
      </MediaFrame>
    </Show>
  );
};

const NoteMediaView: Component<MediaViewProps> = (props) => (
  <Show
    when={props.media.type === "image"}
    fallback={<MediaVideo media={props.media} size={props.size} />}
  >
    <MediaImage media={props.media} size={props.size} onOpen={props.onOpen} />
  </Show>
);

export default NoteMediaView;
