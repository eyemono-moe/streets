import { type Component, For, Show, createMemo, createSignal } from "solid-js";
import type { ContentToken } from "../../core/nostr/content";
import { isProbablyImageUrl, parseContent } from "../../core/nostr/content";
import type { NostrEvent } from "../../core/nostr/event";
import type { Nip19Ref } from "../../core/nostr/nip19";
import { useRender } from "../../core/view/render-context";
import type { EventVariant } from "../../core/view/renderer-registry";
import Profile from "./Profile";

export type NoteContentProps = {
  event: NostrEvent;
  variant: EventVariant;
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
 * `npub`/`nprofile` は名前解決 (`<Profile>` が担う)。`note`/`nevent` は
 * 何も描かない —— 引用として `NoteFull` が別に描く (下のコメント参照)。
 * `naddr` は座標 (kind:pubkey:d) の解決経路がまだ無いので、落として本文を
 * 欠けさせるのではなく固定文言を残す (design 6 節、`Note.tsx` の
 * `unsupported-ref` と同じ形)。
 */
const MentionToken: Component<{ mention: Nip19Ref }> = (props) => {
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
    // イベントへの参照は**ここでは何も描かない。** 引用を描く責務は
    // `NoteFull` に一本化してある —— 引用は `q` タグと本文の `nostr:` の
    // 両方に現れるのが普通なので、本文側でも埋め込むと同じイベントが
    // 二重に出る (枠付きのカードと枠なしの埋め込みが並ぶ)。加えてここは
    // `compact` でも通るため、埋め込むと「compact は関連イベントを一切
    // 要求しない」という規則も破れる (返信先のプレビューの中に、さらに
    // 引用が展開されてしまう)。
    case "note":
    case "nevent":
      return null;
    case "naddr":
      return (
        <span data-testid="unsupported-ref" class="c-secondary text-caption">
          未対応の参照です
        </span>
      );
  }
};

const Token: Component<{ token: ContentToken; variant: EventVariant }> = (
  props,
) => {
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
      return <MentionToken mention={token.ref} />;
  }
};

/**
 * kind:1 の本文をトークン列として描く (design 4 節の表)。イベントは不変
 * なので、`parseContent` を `createMemo` で包んで再描画のたびのトークン化を
 * 避ける。
 */
const NoteContent: Component<NoteContentProps> = (props) => {
  const tokens = createMemo(() => parseContent(props.event));

  return (
    <div
      data-testid="note-content"
      class="break-anywhere whitespace-pre-wrap [line-break:strict] [word-break:normal]"
    >
      <For each={tokens()}>
        {(token) => <Token token={token} variant={props.variant} />}
      </For>
    </div>
  );
};

export default NoteContent;
