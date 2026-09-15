import { type Component, For, Show, createMemo, createSignal } from "solid-js";
import type { ContentToken } from "../../core/nostr/content";
import { isProbablyImageUrl, parseContent } from "../../core/nostr/content";
import { relayOf } from "../../core/nostr/event-refs";
import type { Nip19Ref } from "../../core/nostr/nip19";
import { useRender } from "../../core/view/render-context";
import type { EventVariant } from "../../core/view/renderer-registry";
import EventView from "./EventView";
import NestedEventCard from "./NestedEventCard";
import Profile from "./Profile";

export type NoteContentProps = {
  content: string;
  tags: readonly string[][];
  variant: EventVariant;
  /**
   * イベント参照の描き方。**省略可能にしない** —— 決めずに書けると
   * `nostr:note` が黙って消え、文が途中で切れる。
   */
  eventRefs: "text" | "embed";
};

/**
 * 画像 URL は `full` でだけインライン展開する —— `compact` の入れ子で
 * 原寸画像を並べると元の投稿が見えなくなる。失敗時は URL リンクへ落とす。
 */
const UrlToken: Component<{ url: string; variant: EventVariant }> = (props) => {
  const [broken, setBroken] = createSignal(false);
  const showImage = () =>
    props.variant === "full" && isProbablyImageUrl(props.url) && !broken();

  return (
    <Show
      when={showImage()}
      fallback={
        <a
          href={props.url}
          target="_blank"
          rel="noopener noreferrer"
          class="break-anywhere text-link"
        >
          {props.url}
        </a>
      }
    >
      <a
        href={props.url}
        target="_blank"
        rel="noopener noreferrer"
        class="block"
      >
        <img
          data-testid="content-image"
          src={props.url}
          alt=""
          loading="lazy"
          class="b-1 h-auto w-full rounded bg-secondary object-cover"
          onError={() => setBroken(true)}
        />
      </a>
    </Show>
  );
};

/**
 * NIP-30 の絵文字。読み込み失敗時は `:shortcode:` のテキストへ戻す ——
 * 画像が 404 でも本文が空白になったりショートコードが消えたりしない。
 */
const EmojiToken: Component<{ shortcode: string; url: string }> = (props) => {
  const [broken, setBroken] = createSignal(false);

  return (
    <Show when={!broken()} fallback={<span>{`:${props.shortcode}:`}</span>}>
      <img
        data-testid="content-emoji"
        src={props.url}
        alt={`:${props.shortcode}:`}
        title={`:${props.shortcode}:`}
        loading="lazy"
        class="inline-block h-6 w-auto max-w-full object-contain"
        onError={() => setBroken(true)}
      />
    </Show>
  );
};

/**
 * イベント参照を短縮したテキスト。狭い枠が埋まらないよう先頭 12 桁だけ
 * 見せる (元の文字列は `title` で読める)。押せる先のカラムはまだ無い。
 */
const EventRefText: Component<{ raw: string }> = (props) => {
  const label = () => {
    const entity = props.raw.replace(/^nostr:/, "");
    return entity.length > 12 ? `${entity.slice(0, 12)}…` : entity;
  };

  return (
    <span data-testid="event-ref-text" class="c-secondary" title={props.raw}>
      {label()}
    </span>
  );
};

/**
 * `npub`/`nprofile` は `<Profile>` に、イベント参照は `eventRefs` で
 * `"embed"`/`"text"` を決める。`naddr` は座標解決が無いので固定文言にする。
 */
const MentionToken: Component<{
  mention: Nip19Ref;
  raw: string;
  eventRefs: "text" | "embed";
}> = (props) => {
  const ctx = useRender();
  // "ref" という prop 名は Solid の JSX で特別扱いされうるので避ける
  // (ネイティブ要素の DOM ref 転送と紛らわしい)。
  const ref = props.mention;

  switch (ref.kind) {
    case "npub":
    case "nprofile":
      return (
        <Profile
          pubkey={ref.pubkey}
          store={ctx.store}
          requests={ctx.profiles}
        />
      );
    case "note":
    case "nevent":
      return (
        <Show
          when={props.eventRefs === "embed"}
          fallback={<EventRefText raw={props.raw} />}
        >
          {/* 枠を描くのは置く側という規則 —— 最下部の引用と揃えないと、同じ「引用」が 2 通りの見た目になる。 */}
          <NestedEventCard>
            <EventView
              id={ref.id}
              variant="compact"
              relayHint={
                ref.kind === "nevent" ? relayOf(ref.relays[0]) : undefined
              }
            />
          </NestedEventCard>
        </Show>
      );
    case "naddr":
      return (
        <Show
          when={props.eventRefs === "embed"}
          fallback={<EventRefText raw={props.raw} />}
        >
          <span data-testid="unsupported-ref" class="c-secondary text-caption">
            未対応の参照です
          </span>
        </Show>
      );
  }
};

const Token: Component<{
  token: ContentToken;
  variant: EventVariant;
  eventRefs: "text" | "embed";
}> = (props) => {
  const token = props.token;
  switch (token.type) {
    case "text":
      return <span>{token.text}</span>;
    case "url":
      return <UrlToken url={token.url} variant={props.variant} />;
    case "emoji":
      return <EmojiToken shortcode={token.shortcode} url={token.url} />;
    case "hashtag":
      // 検索カラムが無く押しても何も起きない。リンクの見た目にすると
      // 「まだ無い」と「壊れている」の区別が付かなくなる。`raw` は元の
      // 大文字小文字を保った表記。
      return <span>{token.raw}</span>;
    case "mention":
      return (
        <MentionToken
          mention={token.ref}
          raw={token.raw}
          eventRefs={props.eventRefs}
        />
      );
  }
};

/**
 * 本文をトークン列として描く。`parseContent` を `createMemo` で包み、
 * 同じ id への参照は**最初の出現だけ埋め込み**、以降は短縮テキストへ落とす。
 */
const NoteContent: Component<NoteContentProps> = (props) => {
  const tokens = createMemo(() => {
    const seenEventIds = new Set<string>();
    return parseContent(props.content, props.tags).map((token) => {
      if (token.type !== "mention") return { token, embed: true };
      const ref = token.ref;
      if (ref.kind !== "note" && ref.kind !== "nevent") {
        return { token, embed: true };
      }
      if (seenEventIds.has(ref.id)) return { token, embed: false };
      seenEventIds.add(ref.id);
      return { token, embed: true };
    });
  });

  return (
    <div
      data-testid="note-content"
      class="break-anywhere whitespace-pre-wrap [line-break:strict] [word-break:normal]"
    >
      <For each={tokens()}>
        {(entry) => (
          <Token
            token={entry.token}
            variant={props.variant}
            eventRefs={entry.embed ? props.eventRefs : "text"}
          />
        )}
      </For>
    </div>
  );
};

export default NoteContent;
