import { ScrollArea } from "@ark-ui/solid/scroll-area";
import { useToc } from "@ark-ui/solid/toc";
import {
  type SearchableEmoji,
  searchEmojis,
} from "@streets/core/view/emoji-search";
import {
  type Component,
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  createUniqueId,
} from "solid-js";
import {
  type PickerEmoji,
  type PickerGroup,
  loadUnicodeEmojis,
} from "./emoji-data";
import { emojiKey, recentEmojis } from "./recent-emoji";

const COLUMNS = 8;
const CELL = 32;
const RECENT_GROUP_ID = "recent";
const RESULT_GROUP_ID = "result";

/** 絵文字 1 つ。Unicode は文字のまま、カスタム絵文字は画像で出す。 */
const Cell: Component<{
  emoji: PickerEmoji;
  onSelect: (emoji: PickerEmoji) => void;
}> = (props) => {
  const label = () =>
    props.emoji.kind === "unicode"
      ? props.emoji.label
      : `:${props.emoji.shortcode}:`;
  return (
    <button
      type="button"
      title={label()}
      aria-label={label()}
      class="grid size-8 cursor-pointer place-items-center rounded-1.5 bg-transparent text-[20px] leading-none hover:bg-secondary"
      onClick={() => props.onSelect(props.emoji)}
    >
      <Show
        when={props.emoji.kind === "custom" ? props.emoji : undefined}
        fallback={
          <span aria-hidden="true">
            {props.emoji.kind === "unicode" ? props.emoji.char : ""}
          </span>
        }
      >
        {(custom) => (
          <img
            src={custom().url}
            alt=""
            loading="lazy"
            class="size-6 object-contain"
          />
        )}
      </Show>
    </button>
  );
};

/** 引く手がかり。カスタム絵文字は、自分の名前が英語のショートコードに当たる。 */
const searchable = (
  emoji: PickerEmoji,
): SearchableEmoji & { emoji: PickerEmoji } =>
  emoji.kind === "unicode"
    ? {
        emoji,
        label: emoji.label,
        tags: emoji.tags,
        shortcodes: emoji.shortcodes,
      }
    : { emoji, shortcodes: [emoji.shortcode] };

/**
 * 見出しで分けた本体と、その上の帯。目次（Ark UI の Toc）は**作られたときの
 * 見出しの一覧しか見張らない**ので、かたまりの顔ぶれが変わったら作り直す。
 * そのため、ここは呼ぶ側で `keyed` にして丸ごと差し替える。
 */
const PickerList: Component<{
  groups: readonly PickerGroup[];
  /** 帯を出すか。探している間は、見出しが 1 つしか無いので出さない。 */
  tabs: boolean;
  onSelect: (emoji: PickerEmoji) => void;
}> = (props) => {
  // 見出しの id は画面の中で 1 つでなければならない（目次が id で探すため）。
  const uid = createUniqueId();
  const headingId = (id: string) => `${uid}-${id}`;
  let scrollEl: HTMLDivElement | undefined;
  let strip: HTMLDivElement | undefined;

  const toc = useToc({
    items: props.groups.map((group) => ({
      value: headingId(group.id),
      depth: 2,
    })),
    scrollEl: () => scrollEl ?? null,
    // 帯は自分で送るので、目次側の自動スクロールは使わない。
    autoScroll: false,
    // 見出しが上の方に来たものを「いま見ている」とみなす。
    rootMargin: "0px 0px -75% 0px",
  });

  const active = () => {
    const id = toc().activeIds[0];
    return id === undefined ? undefined : id.slice(uid.length + 1);
  };

  // いま見ている見出しのタブを、帯の中に見えるように送る。
  createEffect(() => {
    const value = active();
    if (value === undefined) return;
    strip
      ?.querySelector(`[data-group="${CSS.escape(value)}"]`)
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  });

  return (
    <>
      <Show when={props.tabs}>
        {/* 横に送れる帯。スクロールバーは触っている間だけ出す。 */}
        <ScrollArea.Root
          ref={strip}
          class="b-b-1 relative shrink-0 border-primary"
        >
          <ScrollArea.Viewport class="overflow-x-auto">
            <ScrollArea.Content
              class="flex w-max"
              role="tablist"
              aria-label="絵文字の種類"
            >
              <For each={props.groups}>
                {(group) => (
                  <button
                    type="button"
                    role="tab"
                    data-group={group.id}
                    aria-selected={active() === group.id}
                    title={group.title}
                    class="flex h-9 shrink-0 cursor-pointer flex-col items-center justify-between gap-1 whitespace-nowrap bg-transparent px-2.5 pt-1.5 text-caption"
                    classList={{
                      "c-primary font-600": active() === group.id,
                      "c-secondary hover:c-primary": active() !== group.id,
                    }}
                    onClick={() => toc().scrollTo(headingId(group.id))}
                  >
                    <span>{group.title}</span>
                    {/* 狭い画面のカラムの帯と同じ、下の線で今いる場所を出す。 */}
                    <span
                      class="h-0.5 w-full rounded-full"
                      classList={{
                        "bg-accent-primary": active() === group.id,
                      }}
                    />
                  </button>
                )}
              </For>
            </ScrollArea.Content>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar
            orientation="horizontal"
            // 帯の上に重ねる。列に場所を取らせると、今いる場所を出す下線と
            // 並んでしまう。
            class="absolute inset-x-0 bottom-0 flex h-1 touch-none select-none opacity-0 transition-opacity data-[dragging]:opacity-100 data-[hover]:opacity-100 data-[scrolling]:opacity-100"
          >
            <ScrollArea.Thumb class="rounded-full bg-tertiary" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      </Show>
      <div ref={scrollEl} class="h-64 overflow-y-auto">
        <For each={props.groups}>
          {(group) => (
            <section>
              {/* 見出しは下の箱の外に置く。中に入れると、描画を省いている間は
                  位置を持たず、いま見ている見出しが分からなくなる。 */}
              {/* 下のグリッドは `content-visibility` で重ね順のかたまりになる。
                  z を持たせないと、送ったときに見出しがその裏へ回る。 */}
              <h3
                id={headingId(group.id)}
                class="c-secondary sticky top-0 z-1 bg-primary py-1 font-600 text-caption"
              >
                {group.title}
              </h3>
              <div
                class="grid grid-cols-8"
                style={{
                  "content-visibility": "auto",
                  "contain-intrinsic-size": `auto ${Math.ceil(group.emojis.length / COLUMNS) * CELL}px`,
                }}
              >
                <For each={group.emojis}>
                  {(emoji) => <Cell emoji={emoji} onSelect={props.onSelect} />}
                </For>
              </div>
            </section>
          )}
        </For>
        {/* 最後のかたまりも上まで送れるようにする。無いと、帯で最後のかたまりを
            押しても、その手前の見出しが上に残る。 */}
        <Show when={props.groups.length > 1}>
          <div class="h-56 shrink-0" aria-hidden="true" />
        </Show>
      </div>
    </>
  );
};

/**
 * 絵文字を選ぶ。見出しで分け、上の帯を押すとその見出しへ飛ぶ。いま見ている
 * 見出しは帯の上でも色が付く（Ark UI の目次を、横向きに使っている）。
 */
const EmojiPicker: Component<{
  /** 自分の絵文字（kind:10030 から作ったかたまり）。 */
  customGroups: readonly PickerGroup[];
  onSelect: (emoji: PickerEmoji) => void;
}> = (props) => {
  const [query, setQuery] = createSignal("");
  const [unicode] = createResource(loadUnicodeEmojis);

  const groups = createMemo<PickerGroup[]>(() => {
    const all: PickerGroup[] = [];
    if (recentEmojis().length > 0) {
      all.push({
        id: RECENT_GROUP_ID,
        title: "よく使う",
        emojis: [...recentEmojis()],
      });
    }
    all.push(...(unicode() ?? []), ...props.customGroups);
    return all;
  });

  /** 探している間は見出しで分けず、近い順に 1 つのかたまりで出す。 */
  const shown = createMemo<PickerGroup[]>(() => {
    if (query().trim() === "") return groups();
    const seen = new Set<string>();
    const all = groups().flatMap((group) =>
      group.emojis.flatMap((emoji) => {
        const key = emojiKey(emoji);
        if (seen.has(key)) return [];
        seen.add(key);
        return [searchable(emoji)];
      }),
    );
    return [
      {
        id: RESULT_GROUP_ID,
        title: "検索結果",
        emojis: searchEmojis(all, query()).map((entry) => entry.emoji),
      },
    ];
  });

  /** 見出しの顔ぶれ。変わったら本体を作り直す（目次を作り直すため）。 */
  const signature = () =>
    shown()
      .map((group) => group.id)
      .join("|");

  return (
    <div class="flex w-88 flex-col gap-2 rounded-2 border border-primary bg-primary p-2 shadow-lg">
      <input
        class="c-primary placeholder:c-secondary h-8.5 w-full rounded-full border border-primary bg-primary px-3.5 text-body outline-none focus-visible:border-accent-5"
        placeholder="絵文字を探す（ねこ / cat）"
        aria-label="絵文字を探す"
        value={query()}
        onInput={(event) => setQuery(event.currentTarget.value)}
      />
      <Show
        when={signature() !== ""}
        fallback={
          <p class="c-secondary p-4 text-center text-caption">
            {unicode.loading ? "読み込み中…" : "見つかりませんでした"}
          </p>
        }
      >
        {/* 見出しの顔ぶれが変わったら、本体を丸ごと作り直す。 */}
        <For each={[signature()]}>
          {() => (
            <PickerList
              groups={shown()}
              tabs={query().trim() === ""}
              onSelect={props.onSelect}
            />
          )}
        </For>
      </Show>
    </div>
  );
};

export default EmojiPicker;
