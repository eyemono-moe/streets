import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import type { Component } from "solid-js";
import {
  type ParsedReaction,
  type ReactionContent,
  parseReaction,
} from "../../core/nostr/reaction";
import {
  type ReactionGroup,
  groupReactions,
} from "../../core/view/reaction-groups";
import { useRender } from "../../core/view/render-context";
import Profile from "./Profile";
import ReactionMark from "./ReactionMark";

/**
 * `groups` の `equals`。参照比較のままだと無関係な通知のたびに `<For>` が
 * DOM を作り直し、`ReactionMark` の「壊れた」フラグがリセットされ絵文字が点滅する。
 */
const groupsEqual = (a: ReactionGroup[], b: ReactionGroup[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ga = a[i];
    const gb = b[i];
    if (!ga || !gb) return false;
    if (ga.key !== gb.key || ga.count !== gb.count) return false;
    if (ga.users.size !== gb.users.size) return false;
    for (const [pubkey, count] of ga.users) {
      if (gb.users.get(pubkey) !== count) return false;
    }
  }
  return true;
};

/**
 * 枠自体に反応内容のタイトルを持たせる —— `truncate` で切れた長文の
 * text リアクションをホバーで読めるようにするため。
 */
const groupTitle = (content: ReactionContent): string | undefined => {
  switch (content.type) {
    case "emoji":
      return content.name;
    case "text":
      return content.content;
    case "like":
      return undefined;
  }
};

/**
 * ノートに付いたリアクションの一覧。`targetId` を別途確かめるのは、
 * 返信の**祖先**として並ぶだけの kind:7 を反応として数えないため。
 */
const ReactionList: Component<{ eventId: string }> = (props) => {
  const ctx = useRender();
  const [expand, setExpand] = createSignal(false);
  // setVersion は「groups() を引き直すきっかけ」を作るためだけで、その
  // 値自体は読み返さない (無限ループの罠、profile-data.ts と同じ注意)。
  const [version, setVersion] = createSignal(0);

  createEffect(() => {
    const id = props.eventId;
    ctx.engagements.request(id);
    const offRequests = ctx.engagements.subscribe(() => {
      setVersion((v) => v + 1);
    });
    const offStore = ctx.store.subscribe((change) => {
      if (change.event.tags.some((tag) => tag[0] === "e" && tag[1] === id)) {
        setVersion((v) => v + 1);
      }
    });
    onCleanup(() => {
      offRequests();
      offStore();
    });
  });

  const groups = createMemo(
    (): ReactionGroup[] => {
      version();
      const reactions = ctx.store
        .eventsByTag("e", props.eventId)
        .map((event) => {
          const parsed = parseReaction(event);
          if (!parsed || parsed.targetId !== props.eventId) return undefined;
          return { pubkey: event.pubkey, parsed };
        })
        .filter(
          (r): r is { pubkey: string; parsed: ParsedReaction } =>
            r !== undefined,
        );
      return groupReactions(reactions);
    },
    undefined,
    { equals: groupsEqual },
  );

  return (
    <Show when={groups().length > 0}>
      <div data-testid="reaction-list" class="relative">
        <button
          type="button"
          data-testid="reaction-expand"
          class="absolute top-0.25 left-0 flex aspect-square h-6 w-auto translate-x--100% appearance-none items-center gap-1 rounded bg-transparent group-not-hover/event:hidden"
          onClick={(event) => {
            event.stopPropagation();
            setExpand((prev) => !prev);
          }}
        >
          <div
            class="i-material-symbols:arrow-drop-down-rounded c-secondary h-full w-full transition-transform"
            classList={{ "rotate-180deg": expand() }}
          />
        </button>
        <div class="flex flex-wrap gap-1" classList={{ "flex-col": expand() }}>
          <For each={groups()}>
            {(group) => (
              <div class="flex items-start gap-1">
                {/* **丸ピルにはしない** —— 絵文字は字面が四角く、丸で囲うと余白だけ増えて 1 列に入る数が減る。 */}
                {/* biome-ignore lint/a11y/useKeyWithClickEvents: 非対話要素が親の委譲 click を止めるだけ */}
                <div
                  data-testid="reaction-group"
                  class="b-1 flex h-6 w-fit shrink-0 items-center gap-1 rounded-1.5 px-1.5"
                  classList={{
                    // 自分が押していれば強調する。
                    "b-accent-5 bg-accent-5/10":
                      ctx.viewerPubkey !== undefined &&
                      group.users.has(ctx.viewerPubkey),
                  }}
                  title={groupTitle(group.content)}
                  // グループ自身は操作部品ではない。親ノートの「スレッドを
                  // 開く」だけを止め、内容確認のクリックを別画面遷移にしない。
                  onClick={(event) => event.stopPropagation()}
                >
                  <ReactionMark content={group.content} />
                  <span
                    data-testid="reaction-count"
                    class="c-secondary text-caption leading-5"
                  >
                    {group.count}
                  </span>
                </div>
                {/* 展開時だけ「@name, @name (2)」を右に出す。 */}
                <Show when={expand()}>
                  <span class="c-secondary text-caption">
                    <For each={[...group.users.entries()]}>
                      {([pubkey, count], i) => (
                        <>
                          <Show when={i() !== 0}>
                            <span>, </span>
                          </Show>
                          <Profile
                            pubkey={pubkey}
                            store={ctx.store}
                            requests={ctx.profiles}
                          />
                          <Show when={count > 1}> ({count})</Show>
                        </>
                      )}
                    </For>
                  </span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
};

export default ReactionList;
