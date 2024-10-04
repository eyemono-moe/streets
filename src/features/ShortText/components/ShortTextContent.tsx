import {
  type Component,
  For,
  Match,
  Show,
  SuspenseList,
  Switch,
} from "solid-js";
import { hex2bech32 } from "../../../libs/bech32";
import type {
  ImageContent,
  LinkContent,
  MentionContent,
  ParsedContent,
  QuoteContent,
  TextContent,
} from "../../../libs/parseTextContent";
import EmbedUser from "./EmbedUser";
import Link from "./Link";
import Quote from "./Quote";

const ShortTextContent: Component<{
  contents: ParsedContent[];
  showLinkEmbeds?: boolean;
  showQuoteEmbeds?: boolean;
}> = (props) => {
  return (
    <SuspenseList revealOrder="forwards">
      <For each={props.contents}>
        {(content) => (
          <Switch>
            <Match when={content.type === "text"}>
              <span class="break-anywhere whitespace-pre-wrap">
                {(content as TextContent).content}
              </span>
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
                  class="b-1 b-zinc-2 h-full max-h-50vh w-auto max-w-full rounded object-contain"
                  src={(content as ImageContent).src}
                  alt={(content as ImageContent).alt ?? ""}
                  width={(content as ImageContent).size?.width}
                  height={(content as ImageContent).size?.height}
                  loading="lazy"
                />
              </a>
            </Match>
            <Match when={content.type === "link"}>
              <Show
                when={props.showLinkEmbeds}
                fallback={
                  <a
                    href={(content as LinkContent).href}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="c-blue-5 visited:c-violet-7 break-anywhere whitespace-pre-wrap underline"
                  >
                    {(content as LinkContent).content}
                  </a>
                }
              >
                <Link
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
            <Match when={content.type === "quote"}>
              <Show
                when={props.showQuoteEmbeds}
                fallback={
                  // TODO: 隣のカラムでリプライツリーを表示する
                  <span class="c-blue-5 break-anywhere whitespace-pre-wrap underline">
                    {hex2bech32((content as QuoteContent).id)}
                  </span>
                }
              >
                <div class="b-1 b-zinc-2 overflow-hidden rounded p-1">
                  <Quote id={(content as QuoteContent).id} />
                </div>
              </Show>
            </Match>
          </Switch>
        )}
      </For>
    </SuspenseList>
  );
};

export default ShortTextContent;
