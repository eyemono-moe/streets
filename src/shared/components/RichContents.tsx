import {
  type Component,
  For,
  Match,
  Show,
  SuspenseList,
  Switch,
} from "solid-js";
import RichLink from "../../features/Event/ShortText/components/RichLink";
import EmbedUser from "../../features/User/components/EmbedUser";
import { hex2bech32 } from "../libs/format";
import type {
  EmojiContent,
  HashtagContent,
  ImageContent,
  LinkContent,
  MentionContent,
  ParsedContent,
  QuoteByIDContent,
  RelayContent,
  TextContent,
  VideoContent,
} from "../libs/parseTextContent";
import EventByID from "./EventByID";

const RichContent: Component<{
  contents: ParsedContent[];
  showLinkEmbeds?: boolean;
  showQuoteEmbeds?: boolean;
}> = (props) => {
  return (
    <SuspenseList revealOrder="forwards">
      <div class="break-anywhere whitespace-pre-wrap [line-break:strict] [word-break:normal]">
        <For each={props.contents}>
          {(content) => (
            <Switch>
              <Match when={content.type === "text"}>
                <span>{(content as TextContent).content}</span>
              </Match>
              <Match when={content.type === "image"}>
                {/* TODO: 画像の拡大表示 */}
                <a
                  href={(content as ImageContent).src}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block w-fit"
                >
                  {/* TODO: display blurhash */}
                  <img
                    class="b-1 h-full max-h-50vh w-auto max-w-full rounded object-contain"
                    src={(content as ImageContent).src}
                    alt={(content as ImageContent).alt ?? ""}
                    width={(content as ImageContent).size?.width}
                    height={(content as ImageContent).size?.height}
                    loading="lazy"
                  />
                </a>
              </Match>
              <Match when={content.type === "video"}>
                {/* TODO: 動画の拡大表示 */}
                {/* biome-ignore lint/a11y/useMediaCaption: キャプションの投稿手段が無い */}
                <video
                  class="b-1 h-full max-h-50vh w-auto max-w-full rounded object-contain"
                  controls
                  preload="metadata"
                  src={(content as VideoContent).href}
                />
              </Match>
              <Match when={content.type === "emoji"}>
                <img
                  class="inline-block h-6 w-auto max-w-full object-contain"
                  src={(content as EmojiContent).url}
                  alt={(content as EmojiContent).tag}
                  title={(content as EmojiContent).tag}
                  loading="lazy"
                />
              </Match>
              <Match when={content.type === "link"}>
                <Show
                  when={props.showLinkEmbeds}
                  fallback={
                    <a
                      href={(content as LinkContent).href}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="break-anywhere whitespace-pre-wrap text-link underline"
                    >
                      {(content as LinkContent).content}
                    </a>
                  }
                >
                  <RichLink
                    href={(content as LinkContent).href}
                    content={(content as LinkContent).content}
                  />
                </Show>
              </Match>
              <Match when={content.type === "mention"}>
                <EmbedUser
                  pubkey={(content as MentionContent).pubkey}
                  relay={(content as MentionContent).relay}
                />
              </Match>
              <Match when={content.type === "quoteByID"}>
                <Show
                  when={props.showQuoteEmbeds}
                  fallback={
                    // TODO: 隣のカラムでリプライツリーを表示する
                    <span class="break-anywhere whitespace-pre-wrap text-link underline">
                      {hex2bech32((content as QuoteByIDContent).id, "nevent")}
                    </span>
                  }
                >
                  <div class="b-1 overflow-hidden rounded p-1">
                    <EventByID id={(content as QuoteByIDContent).id} small />
                  </div>
                </Show>
              </Match>
              <Match when={content.type === "hashtag"}>
                {/* TODO: 隣のカラムでハッシュタグ検索結果を表示する */}
                <span class="break-anywhere whitespace-pre-wrap text-link underline">
                  #{(content as HashtagContent).tag}
                </span>
              </Match>
              <Match when={content.type === "relay"}>
                {/* TODO: 隣のカラムでリレー内投稿一覧を表示する */}
                <span class="break-anywhere whitespace-pre-wrap text-link underline">
                  {(content as RelayContent).url}
                </span>
              </Match>
            </Switch>
          )}
        </For>
      </div>
    </SuspenseList>
  );
};

export default RichContent;
