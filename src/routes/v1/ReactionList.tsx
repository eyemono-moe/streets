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
 * v0 の `<button title=...>` と同じく、枠自体に反応内容のタイトルを持たせる
 * (仕様 5 節)。`truncate` で切れた長文の text リアクションをホバーで読める
 * ようにするため。
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
 * ノートに付いたリアクションの一覧 (仕様 5 節)。`+` の絵文字ピッカーと
 * 送信は範囲外 —— ここは `EventStore` に既にあるものを読んで並べるだけ。
 *
 * `ctx.store.eventsByTag("e", props.eventId)` は「このノートを `e` タグに
 * 持つイベント」を返す。返信も同じ `e` タグを使うが、`parseReaction` の
 * kind チェックでまず落ちる。それでも `targetId` (NIP-25 の最後の `e` タグ)
 * が `props.eventId` と一致するかを別途確かめるのは、リアクションが
 * NIP-10 のスレッド祖先を先に並べ、対象そのものを最後に置く形式のため ——
 * このノートが誰かの返信の**祖先**として並んでいるだけの kind:7 まで
 * 拾ってしまうと、そのノート自身への反応ではないものが数に混ざる。
 */
const ReactionList: Component<{ eventId: string }> = (props) => {
  const ctx = useRender();
  const [expand, setExpand] = createSignal(false);
  // `ReactionRequests.subscribe` はどの id が解決したかを通知しない
  // (コアレッサ全体で 1 種類の通知)。ここで setVersion するのは
  // 「groups() を引き直すきっかけ」を作るためだけで、その値自体を effect の
  // 中で読み返すことはしない (無限ループの罠、profile-data.ts と同じ注意)。
  const [version, setVersion] = createSignal(0);

  createEffect(() => {
    const id = props.eventId;
    ctx.reactions.request(id);
    const unsubscribe = ctx.reactions.subscribe(() => {
      setVersion((v) => v + 1);
    });
    onCleanup(unsubscribe);
  });

  const groups = createMemo((): ReactionGroup[] => {
    version();
    const reactions = ctx.store
      .eventsByTag("e", props.eventId)
      .map((event) => {
        const parsed = parseReaction(event);
        if (!parsed || parsed.targetId !== props.eventId) return undefined;
        return { pubkey: event.pubkey, parsed };
      })
      .filter(
        (r): r is { pubkey: string; parsed: ParsedReaction } => r !== undefined,
      );
    return groupReactions(reactions);
  });

  return (
    <Show when={groups().length > 0}>
      <div data-testid="reaction-list" class="relative">
        <button
          type="button"
          data-testid="reaction-expand"
          class="absolute top-0.25 left-0 flex aspect-square h-6 w-auto translate-x--100% appearance-none items-center gap-1 rounded bg-transparent group-not-hover/event:hidden"
          onClick={() => setExpand((prev) => !prev)}
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
                <div
                  data-testid="reaction-group"
                  class="b-1 flex w-fit shrink-0 items-center gap-1 rounded p-0.5"
                  classList={{
                    // 自分が押していれば強調する (仕様 5 節)。
                    "b-accent-5 bg-accent-5/10":
                      ctx.viewerPubkey !== undefined &&
                      group.users.has(ctx.viewerPubkey),
                  }}
                  title={groupTitle(group.content)}
                >
                  <ReactionMark content={group.content} />
                  <span
                    data-testid="reaction-count"
                    class="c-secondary h-5 leading-5"
                  >
                    {group.count}
                  </span>
                </div>
                {/* 展開時だけ「@name, @name (2)」を右に出す (仕様 5 節)。 */}
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
