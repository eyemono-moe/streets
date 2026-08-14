import {
  For,
  Match,
  Show,
  Switch,
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

/**
 * v0 の `ReactionButton.tsx` の反応内容表示を写す (仕様 2 節)。送信もピッカー
 * も無いここでは、絵文字画像が壊れたときのショートコードへのフォールバック
 * までは持ち込まない —— 表示専用の一覧が画像 1 枚の 404 で崩れるわけでは
 * なく、単に alt テキストが出るだけで実害が無い。
 */
const ReactionMark: Component<{ content: ReactionContent }> = (props) => {
  const emoji = () =>
    props.content.type === "emoji" ? props.content : undefined;
  const text = () =>
    props.content.type === "text" ? props.content : undefined;

  return (
    <Switch>
      <Match when={props.content.type === "like"}>
        <div class="i-material-symbols:favorite-rounded c-accent-5 aspect-square h-5 w-auto shrink-0" />
      </Match>
      <Match when={emoji()}>
        {(e) => (
          <img
            src={e().url}
            alt={e().name}
            title={e().name}
            class="inline-block h-5 w-auto shrink-0"
          />
        )}
      </Match>
      <Match when={text()}>
        {(t) => <span class="h-5 truncate leading-5">{t().content}</span>}
      </Match>
    </Switch>
  );
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
