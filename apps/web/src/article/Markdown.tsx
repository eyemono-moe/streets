import {
  buildThreadColumn,
  buildUserColumn,
} from "@streets/core/deck/column-presets";
import { columnForNaddr } from "@streets/core/deck/open-event";
import { parseContent } from "@streets/core/nostr/content";
import { decodeNip19 } from "@streets/core/nostr/nip19";
import type {
  Definition,
  Node,
  Nodes,
  Parent,
  Root,
  RootContent,
  Table,
} from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import {
  type Component,
  For,
  type JSX,
  Match,
  Switch,
  createContext,
  createMemo,
  useContext,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { ContentTokens } from "../note/NoteText";
import { useDispatch } from "../ui-events";

/**
 * 長文記事（NIP-23）の Markdown を描く。HTML を経ずに構文木から直接要素を作る ——
 * NIP-23 は Markdown に HTML を入れないと決めており、ここでも HTML は文字として出す。
 * 文の中の `nostr:` やカスタム絵文字は、投稿と同じ部品で描く。
 */
type MarkdownContextValue = {
  tags: readonly string[][];
  definitions: ReadonlyMap<string, Definition>;
};

const MarkdownContext = createContext<MarkdownContextValue>({
  tags: [],
  definitions: new Map(),
});

const isHttp = (url: string) => /^https?:\/\//i.test(url);

const Children: Component<{ node: Parent }> = (props) => (
  <For each={props.node.children as RootContent[]}>
    {(child) => <MarkdownNode node={child} />}
  </For>
);

/** 文。`nostr:` の参照・カスタム絵文字・ハッシュタグ・URL を投稿と同じに描く。 */
const Text: Component<{ value: string }> = (props) => {
  const context = useContext(MarkdownContext);
  const tokens = createMemo(() =>
    parseContent(props.value, context.tags as string[][]),
  );
  return <ContentTokens tokens={tokens()} />;
};

/** リンク。http(s) は新しいタブで、`nostr:` はカラムで開く。ほかの形式は文字だけ出す。 */
const Link: Component<{
  url: string;
  title?: string | null;
  children: JSX.Element;
}> = (props) => {
  const dispatch = useDispatch();
  const nostrColumn = () => {
    if (!props.url.startsWith("nostr:")) return undefined;
    const ref = decodeNip19(props.url.slice("nostr:".length));
    if (!ref) return undefined;
    switch (ref.kind) {
      case "npub":
      case "nprofile":
        return buildUserColumn(ref.pubkey);
      case "note":
      case "nevent":
        return buildThreadColumn(ref.id);
      case "naddr":
        return columnForNaddr(ref);
      default:
        return undefined;
    }
  };
  return (
    <Switch fallback={<span>{props.children}</span>}>
      <Match when={isHttp(props.url)}>
        <a
          href={props.url}
          title={props.title ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          class="break-words text-link"
        >
          {props.children}
        </a>
      </Match>
      <Match when={nostrColumn()}>
        {(column) => (
          <button
            type="button"
            class="cursor-pointer bg-transparent p-0 text-left text-link hover:underline"
            onClick={() => dispatch({ type: "stack/open", column: column() })}
          >
            {props.children}
          </button>
        )}
      </Match>
    </Switch>
  );
};

const Image: Component<{ url: string; alt?: string | null }> = (props) => (
  <Switch fallback={<span class="c-secondary">{props.alt}</span>}>
    <Match when={isHttp(props.url)}>
      <img
        src={props.url}
        alt={props.alt ?? ""}
        loading="lazy"
        decoding="async"
        class="my-1 block h-auto max-w-full rounded-2"
      />
    </Match>
  </Switch>
);

const HEADING_CLASS: Record<number, string> = {
  1: "text-h3 font-700 mt-6",
  2: "text-h3 font-700 mt-5",
  3: "text-body font-700 mt-4",
};

const TableView: Component<{ node: Table }> = (props) => (
  <div class="overflow-x-auto">
    <table class="border-collapse text-caption">
      <tbody>
        <For each={props.node.children}>
          {(row, rowIndex) => (
            <tr>
              <For each={row.children}>
                {(cell, cellIndex) => (
                  <Dynamic
                    component={rowIndex() === 0 ? "th" : "td"}
                    class="border border-primary px-2 py-1 text-left align-top"
                    classList={{ "font-600": rowIndex() === 0 }}
                    style={{
                      "text-align":
                        props.node.align?.[cellIndex()] ?? undefined,
                    }}
                  >
                    <Children node={cell} />
                  </Dynamic>
                )}
              </For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  </div>
);

const MarkdownNode: Component<{ node: Nodes }> = (props) => {
  const context = useContext(MarkdownContext);
  const node = props.node;
  switch (node.type) {
    case "paragraph":
      return (
        <p class="break-words">
          <Children node={node} />
        </p>
      );
    case "heading":
      return (
        <Dynamic
          component={`h${node.depth}`}
          class={`c-primary break-words ${HEADING_CLASS[node.depth] ?? "text-body font-700 mt-3"}`}
        >
          <Children node={node} />
        </Dynamic>
      );
    case "text":
      return <Text value={node.value} />;
    case "emphasis":
      return (
        <em>
          <Children node={node} />
        </em>
      );
    case "strong":
      return (
        <strong class="font-700">
          <Children node={node} />
        </strong>
      );
    case "delete":
      return (
        <del>
          <Children node={node} />
        </del>
      );
    case "inlineCode":
      return (
        <code class="break-words rounded-1 bg-secondary px-1 font-mono text-[0.9em]">
          {node.value}
        </code>
      );
    case "code":
      return (
        <pre class="overflow-x-auto rounded-2 bg-secondary p-3 text-caption">
          <code class="font-mono">{node.value}</code>
        </pre>
      );
    case "blockquote":
      return (
        <blockquote class="c-secondary m-0 flex flex-col gap-3 border-primary border-l-3 pl-3">
          <Children node={node} />
        </blockquote>
      );
    case "list":
      return (
        <Dynamic
          component={node.ordered ? "ol" : "ul"}
          start={node.ordered ? (node.start ?? undefined) : undefined}
          class="m-0 flex flex-col gap-1 pl-6"
          classList={{
            "list-decimal": !!node.ordered,
            "list-disc": !node.ordered,
          }}
        >
          <Children node={node} />
        </Dynamic>
      );
    case "listItem":
      return (
        <li class="[&>p]:inline">
          {node.checked !== null && node.checked !== undefined ? (
            <input
              type="checkbox"
              checked={node.checked}
              disabled
              class="mr-1.5 align-middle"
            />
          ) : null}
          <Children node={node} />
        </li>
      );
    case "thematicBreak":
      return <hr class="w-full border-primary border-t" />;
    case "break":
      return <br />;
    case "link":
      return (
        <Link url={node.url} title={node.title}>
          <Children node={node} />
        </Link>
      );
    case "linkReference": {
      const definition = context.definitions.get(node.identifier);
      return definition ? (
        <Link url={definition.url} title={definition.title}>
          <Children node={node} />
        </Link>
      ) : (
        <Children node={node} />
      );
    }
    case "image":
      return <Image url={node.url} alt={node.alt} />;
    case "imageReference": {
      const definition = context.definitions.get(node.identifier);
      return definition ? (
        <Image url={definition.url} alt={node.alt} />
      ) : (
        <span>{node.alt}</span>
      );
    }
    case "table":
      return <TableView node={node} />;
    // HTML は描かず、書かれた文字のまま出す（NIP-23 は HTML を認めない）。
    case "html":
      return <span class="break-words">{node.value}</span>;
    case "definition":
    case "footnoteDefinition":
    case "yaml":
      return null;
    default:
      return "children" in node ? <Children node={node as Parent} /> : null;
  }
};

const collectDefinitions = (root: Node, into: Map<string, Definition>) => {
  if (root.type === "definition") {
    const definition = root as Definition;
    into.set(definition.identifier, definition);
  }
  if ("children" in root) {
    for (const child of (root as Parent).children)
      collectDefinitions(child, into);
  }
  return into;
};

const Markdown: Component<{ content: string; tags: readonly string[][] }> = (
  props,
) => {
  const tree = createMemo<Root>(() =>
    fromMarkdown(props.content, {
      extensions: [gfm()],
      mdastExtensions: [gfmFromMarkdown()],
    }),
  );
  const definitions = createMemo(() => collectDefinitions(tree(), new Map()));
  return (
    <MarkdownContext.Provider
      value={{
        get tags() {
          return props.tags;
        },
        get definitions() {
          return definitions();
        },
      }}
    >
      <div class="c-primary flex flex-col gap-3 text-body leading-relaxed">
        <Children node={tree()} />
      </div>
    </MarkdownContext.Provider>
  );
};

export default Markdown;
