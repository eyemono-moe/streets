import { Image } from "@kobalte/core/image";
import {
  type Component,
  For,
  Match,
  Show,
  SuspenseList,
  Switch,
} from "solid-js";
import { useDeck } from "../../features/Column/context/deck";
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
import Blurhash from "./Blurhash";
import EventByID from "./EventByID";

const RichContent: Component<{
  contents: ParsedContent[];
  showLinkEmbeds?: boolean;
  showQuoteEmbeds?: boolean;
}> = (props) => {
  const [, { addColumn }] = useDeck();
  const handleOpenHashtagCol = (hashtag: string) => {
    addColumn({
      content: {
        type: "search",
        query: `#${hashtag}`,
      },
      size: "medium",
    });
  };

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
                  class="block"
                >
                  <Image
                    as="div"
                    fallbackDelay={100}
                    class="b-1 h-auto w-full overflow-hidden rounded"
                    style={{
                      "aspect-ratio":
                        (content as ImageContent).size?.width &&
                        (content as ImageContent).size?.height
                          ? `${
                              // biome-ignore lint/style/noNonNullAssertion: width and height are defined
                              (content as ImageContent).size!.width
                              // biome-ignore lint/style/noNonNullAssertion: width and height are defined
                            }/${(content as ImageContent).size!.height}`
                          : "auto",
                    }}
                  >
                    <Image.Img
                      class="aspect-ratio-[auto_16/9] h-full w-full rounded bg-secondary [image-orientation:from-image]"
                      src={(content as ImageContent).src}
                      alt={(content as ImageContent).alt ?? ""}
                      width={(content as ImageContent).size?.width}
                      height={(content as ImageContent).size?.height}
                      loading="lazy"
                    />
                    <Image.Fallback as="div" class="h-full w-full bg-secondary">
                      <Show when={(content as ImageContent).blurhash} keyed>
                        {(nonNullBlurhash) => (
                          <Blurhash
                            blurhash={nonNullBlurhash}
                            class="h-full w-full"
                          />
                        )}
                      </Show>
                    </Image.Fallback>
                  </Image>
                </a>
              </Match>
              <Match when={content.type === "video"}>
                {/* TODO: 動画の拡大表示 */}
                {/* biome-ignore lint/a11y/useMediaCaption: キャプションの投稿手段が無い */}
                <video
                  class="b-1 h-auto w-full rounded object-contain"
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
                      class="break-anywhere line-clamp-4 text-ellipsis whitespace-pre-wrap text-link"
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
                    <span
                      class="break-anywhere whitespace-pre-wrap text-link"
                      data-embed // see: project://src/features/Event/Reaction/components/Reaction.tsx
                    >
                      nostr:
                      {hex2bech32((content as QuoteByIDContent).id, "nevent")}
                    </span>
                  }
                >
                  <div class="b-1 group/quote overflow-hidden rounded">
                    <EventByID id={(content as QuoteByIDContent).id} small />
                  </div>
                </Show>
              </Match>
              <Match when={content.type === "hashtag"}>
                <button
                  class="break-anywhere inline max-w-full appearance-none whitespace-pre-wrap bg-transparent text-start text-link"
                  data-hashtag // see: project://src/features/Event/Reaction/components/Reaction.tsx
                  type="button"
                  onClick={() =>
                    handleOpenHashtagCol((content as HashtagContent).tag)
                  }
                >
                  #{(content as HashtagContent).tag}
                </button>
              </Match>
              <Match when={content.type === "relay"}>
                {/* TODO: 隣のカラムでリレー内投稿一覧を表示する */}
                <span
                  class="break-anywhere whitespace-pre-wrap text-link"
                  data-relay // see: project://src/features/Event/Reaction/components/Reaction.tsx
                >
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
