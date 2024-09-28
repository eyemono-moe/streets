import { type Component, For, Match, Switch } from "solid-js";
import type {
  ImageContent,
  LinkContent,
  MentionContent,
  ParsedContent,
  QuoteContent,
  TextContent,
} from "../../../libs/parseTextContent";
import EmbedUser from "./EmbedUser";
import Quote from "./Quote";

const ShortTextContent: Component<{ contents: ParsedContent[] }> = (props) => {
  return (
    <div>
      <For each={props.contents}>
        {(content) => (
          <Switch>
            <Match when={content.type === "text"}>
              <span class="whitespace-pre-wrap break-anywhere">
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
                  class="w-auto max-w-full h-full max-h-50vh object-contain b-1 b-zinc-2 rounded"
                  src={(content as ImageContent).src}
                  alt={(content as ImageContent).alt ?? ""}
                  loading="lazy"
                />
              </a>
            </Match>
            <Match when={content.type === "link"}>
              <a
                href={(content as LinkContent).href}
                target="_blank"
                rel="noopener noreferrer"
                class="c-blue-5 underline visited:c-violet-7 whitespace-pre-wrap break-anywhere"
              >
                {(content as LinkContent).content}
              </a>
            </Match>
            <Match when={content.type === "mention"}>
              <EmbedUser pubkey={(content as MentionContent).pubkey} />
            </Match>
            <Match when={content.type === "quote"}>
              <div class="rounded b-1 b-zinc-2 overflow-hidden p-1">
                <Quote id={(content as QuoteContent).id} />
              </div>
            </Match>
          </Switch>
        )}
      </For>
    </div>
  );
};

export default ShortTextContent;
