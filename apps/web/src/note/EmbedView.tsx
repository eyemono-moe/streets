import {
  type Component,
  type JSX,
  Show,
  createSignal,
  onCleanup,
} from "solid-js";
import Button from "../ui/Button";
import type { EventSize } from "./Event";
import LinkCardView from "./LinkCardView";
import type { LinkCard } from "./link-card";

/**
 * YouTube。押すまではサムネイル（i.ytimg.com の画像）だけを出し、Google の
 * プレイヤーは読み込まない。押したら youtube-nocookie.com の iframe に替える。
 */
export const YouTubeEmbed: Component<{
  id: string;
  start?: number;
  /** リンクのカードから取れた題名。まだ無ければ出さない。 */
  title?: string;
}> = (props) => {
  const [playing, setPlaying] = createSignal(false);
  const src = () => {
    const params = new URLSearchParams({ autoplay: "1", rel: "0" });
    if (props.start) params.set("start", String(props.start));
    return `https://www.youtube-nocookie.com/embed/${props.id}?${params}`;
  };
  return (
    <div class="relative aspect-video w-full overflow-hidden rounded-2 border border-primary bg-black">
      <Show
        when={playing()}
        fallback={
          <button
            type="button"
            class="group absolute inset-0 size-full cursor-pointer bg-transparent p-0"
            aria-label={
              props.title ? `YouTube で再生: ${props.title}` : "YouTube で再生"
            }
            onClick={() => setPlaying(true)}
          >
            <img
              src={`https://i.ytimg.com/vi/${props.id}/hqdefault.jpg`}
              alt=""
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              class="absolute inset-0 size-full object-cover"
            />
            <Show when={props.title}>
              {(title) => (
                <span class="c-white absolute inset-x-0 top-0 line-clamp-2 bg-black/60 px-3 py-2 text-left font-600 text-caption">
                  {title()}
                </span>
              )}
            </Show>
            <span
              class="-translate-1/2 absolute top-1/2 left-1/2 grid h-10 w-14 place-items-center rounded-3 bg-[#ff0033] shadow transition-transform group-hover:scale-105"
              aria-hidden="true"
            >
              <span class="i-material-symbols:play-arrow-rounded c-white size-8" />
            </span>
          </button>
        }
      >
        <iframe
          src={src()}
          title={props.title ?? "YouTube の動画"}
          class="absolute inset-0 size-full border-0"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowfullscreen
          // YouTube は埋め込み元（Referer）が無いと再生を断る。
          referrerpolicy="strict-origin-when-cross-origin"
        />
      </Show>
    </div>
  );
};

type TwitterResize = { height: number };

/** platform.twitter.com の埋め込みが知らせてくる高さを読む。 */
const resizeOf = (data: unknown): TwitterResize | undefined => {
  let value = data;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  const embed = (value as { "twttr.embed"?: unknown } | null)?.["twttr.embed"];
  const message = embed as
    | { method?: string; params?: { height?: unknown }[] }
    | undefined;
  const height = message?.params?.[0]?.height;
  return message?.method === "twttr.private.resize" &&
    typeof height === "number" &&
    height > 0
    ? { height }
    : undefined;
};

const XFrame: Component<{ id: string }> = (props) => {
  const [height, setHeight] = createSignal(320);
  let frame: HTMLIFrameElement | undefined;
  const dark = document.documentElement.classList.contains("dark");
  const params = new URLSearchParams({
    id: props.id,
    theme: dark ? "dark" : "light",
    dnt: "true",
    lang: "ja",
  });
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== "https://platform.twitter.com") return;
    if (event.source !== frame?.contentWindow) return;
    const resize = resizeOf(event.data);
    if (resize) setHeight(Math.ceil(resize.height));
  };
  window.addEventListener("message", onMessage);
  onCleanup(() => window.removeEventListener("message", onMessage));
  return (
    <iframe
      ref={frame}
      src={`https://platform.twitter.com/embed/Tweet.html?${params}`}
      title="X の投稿"
      class="w-full rounded-3 border-0"
      style={{ height: `${height()}px` }}
      // 高さは中から知らせてくるまで分からない。広がるまでの間の見た目を落ち着かせる。
      loading="lazy"
    />
  );
};

/**
 * X の投稿。押すまでは、取得口が取れたリンクのカード（投稿者と本文）を出し、X の
 * スクリプトは読み込まない。押したら platform.twitter.com の iframe に替える。
 */
export const XEmbed: Component<{
  id: string;
  url: string;
  /** undefined は取得中、null は取れなかった。 */
  card: LinkCard | null | undefined;
  mode: "compact" | "large";
  size: EventSize;
}> = (props) => {
  const [loaded, setLoaded] = createSignal(false);
  const facade = (): JSX.Element => (
    <div class="flex flex-col items-start gap-1.5">
      <Show when={props.card !== null}>
        <LinkCardView
          url={props.url}
          card={props.card ?? undefined}
          mode={props.mode}
          size={props.size}
        />
      </Show>
      <Button
        size="sm"
        icon="i-material-symbols:open-in-full-rounded"
        onClick={() => setLoaded(true)}
      >
        X の埋め込みで表示
      </Button>
    </div>
  );
  return (
    <Show when={loaded()} fallback={facade()}>
      <XFrame id={props.id} />
    </Show>
  );
};
