import { type Component, For, Show, createMemo, createSignal } from "solid-js";
import type { ContentToken } from "../../core/nostr/content";
import { isProbablyImageUrl, parseContent } from "../../core/nostr/content";
import { relayOf } from "../../core/nostr/event-refs";
import type { Nip19Ref } from "../../core/nostr/nip19";
import { useRender } from "../../core/view/render-context";
import type { EventVariant } from "../../core/view/renderer-registry";
import EventView from "./EventView";
import Profile from "./Profile";

export type NoteContentProps = {
  content: string;
  tags: readonly string[][];
  variant: EventVariant;
  /**
   * イベントへの参照 (`note`/`nevent`/`naddr`) をどう描くか。**省略可能に
   * しない** —— 決めずに書けると、本文の `nostr:note` が黙って消えて文が
   * 途中で切れる形が再発する。
   */
  eventRefs: "text" | "embed";
};

/**
 * 画像 URL は `full` でだけインライン展開する。`compact` は引用先・返信先・
 * リポスト対象として置かれる (design 4 節) —— 原寸画像を並べるとカラームが
 * 画像で埋まり、元の投稿が見えなくなる (v0 の `showEmbeddings={!props.small}`
 * と同じ判断)。読み込みに失敗したら通常の URL リンクへ落とす —— 本文から
 * このトークンが消えるわけではない (design 6 節)。
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
 * NIP-30 の絵文字。読み込みに失敗したら `:shortcode:` のテキストへ戻す
 * (design 6 節) —— 画像が 404 でも本文がそこだけ空白になったり、書いた
 * ショートコードが跡形もなく消えたりしない。
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
 * イベント参照を短縮したテキスト。`nostr:` を落として bech32 の先頭 12 桁
 * だけを見せる —— 60 桁を丸ごと出すと、`about` のような狭い枠では本文が
 * それだけで埋まる。元の文字列は `title` で丸ごと読める。
 *
 * **押せそうには見せない** (ADR-0026)。押して開く先のカラムがまだ無い。
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
 * `npub`/`nprofile` は名前解決 (`<Profile>` が担う)。
 *
 * イベントへの参照は `eventRefs` で決まる (仕様 4.1 節):
 * `"embed"` はその位置に対象を `compact` で描き、`"text"` は短縮した
 * テキストで残す。**捨てる選択肢は無い** —— 捨てると「この投稿
 * nostr:note1… が面白い」のような文が途中で切れる。
 *
 * `naddr` は座標 (kind:pubkey:d) の解決経路がまだ無いので `"embed"` でも
 * 埋め込めない。落として本文を欠けさせるのではなく固定文言を残す。
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
          <EventView
            id={ref.id}
            variant="compact"
            relayHint={
              ref.kind === "nevent" ? relayOf(ref.relays[0]) : undefined
            }
          />
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
      // 検索カラムが無く押しても何も起きない (#203/#204)。リンクの見た目
      // (下線・アクセントカラー) にすると「まだ無い」と「壊れている」の
      // 区別が付かなくなる —— relay 診断で採った判断と同じ (押せない要素は
      // 押せそうに見せない)。`raw` は元の大文字小文字を保った表記
      // (`content.ts` 側のコメント参照)。
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
 * 本文をトークン列として描く (design 4 節の表)。kind:1 の本文とプロフィールの
 * 自己紹介文の両方がここを通る。`content`/`tags` は呼び出し側 (プロパティ)
 * が再描画のあいだ安定していれば、`parseContent` を `createMemo` で包む
 * ことでトークン化を都度やり直さずに済む。
 */
const NoteContent: Component<NoteContentProps> = (props) => {
  const tokens = createMemo(() => parseContent(props.content, props.tags));

  return (
    <div
      data-testid="note-content"
      class="break-anywhere whitespace-pre-wrap [line-break:strict] [word-break:normal]"
    >
      <For each={tokens()}>
        {(token) => (
          <Token
            token={token}
            variant={props.variant}
            eventRefs={props.eventRefs}
          />
        )}
      </For>
    </div>
  );
};

export default NoteContent;
