import { type Component, Show, createSignal } from "solid-js";
import type { EventSize } from "./Event";
import type { LinkCard } from "./link-card";

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export type LinkCardViewProps = {
  /** 投稿に書かれていた URL。押したときに開くのはこれ（リダイレクト前の、書いた人の意図）。 */
  url: string;
  /** 無ければ取得中。 */
  card?: LinkCard;
  mode: "compact" | "large";
  size: EventSize;
};

/**
 * 本文のリンクを、題名・説明・画像のカードにする。取得中は枠とサイト名だけを
 * 出し、取れなかったカードはこの部品を描かない（本文のリンクは残っている）。
 */
const LinkCardView: Component<LinkCardViewProps> = (props) => {
  const [imageFailed, setImageFailed] = createSignal(false);
  const image = () => (imageFailed() ? undefined : props.card?.image);
  const large = () => props.mode === "large";
  const site = () =>
    props.card?.siteName ?? hostOf(props.card?.url ?? props.url);

  return (
    <a
      href={props.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-busy={props.card === undefined}
      class="flex w-full min-w-0 overflow-hidden rounded-2 border border-primary bg-primary transition-colors hover:bg-secondary"
      classList={{ "flex-col": large(), "flex-row": !large() }}
    >
      <Show when={image()}>
        {(src) => (
          <img
            src={src()}
            alt=""
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
            onError={() => setImageFailed(true)}
            class="shrink-0 bg-secondary object-cover"
            classList={{
              "aspect-[1.91/1] w-full border-primary border-b": large(),
              "size-20 border-primary border-r":
                !large() && props.size === "normal",
              "size-14 border-primary border-r":
                !large() && props.size === "compact",
            }}
          />
        )}
      </Show>
      <div
        class="flex min-w-0 flex-1 flex-col justify-center gap-0.5"
        classList={{
          "px-3 py-2": props.size === "normal",
          "px-2 py-1.5": props.size === "compact",
        }}
      >
        <span class="c-secondary truncate text-caption">{site()}</span>
        <Show
          when={props.card}
          fallback={
            <span
              class="h-3.5 w-3/4 rounded-1 bg-secondary"
              aria-label="リンクの情報を読み込んでいます"
            />
          }
        >
          {(card) => (
            <>
              <span
                class="c-primary break-anywhere font-600"
                classList={{
                  "line-clamp-2 text-body": large() && props.size === "normal",
                  "line-clamp-2 text-caption":
                    !large() || props.size === "compact",
                }}
              >
                {card().title}
              </span>
              <Show when={card().description}>
                {(description) => (
                  <span
                    class="c-secondary break-anywhere text-caption"
                    classList={{
                      "line-clamp-2": large(),
                      "line-clamp-1": !large(),
                    }}
                  >
                    {description()}
                  </span>
                )}
              </Show>
            </>
          )}
        </Show>
      </div>
    </a>
  );
};

export default LinkCardView;
