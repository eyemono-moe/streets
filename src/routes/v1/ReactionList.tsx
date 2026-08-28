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
 * `groups` の `createMemo` に渡す `equals`。集計 (`groupReactions`) は
 * 呼ぶたびに新しい配列・新しいオブジェクトを返すので、素の参照比較では
 * 中身が同じでも「変わった」とみなされる。バッチ通知は「マウント中の
 * *どれか* のノートにリアクションが届いた」としか教えないので、無関係な
 * 通知のたびに全 `ReactionList` の `groups` が引き直され、`<For>` が参照
 * 同一性でキーを取る以上、中身が同じでも枠の DOM が作り直される。副作用
 * として `ReactionMark` の「画像が壊れた」フラグが毎回リセットされ、404
 * のカスタム絵文字が通知のたびに点滅する。
 *
 * 比較するのは並び・鍵・件数・押した人 (`ReactionGroup.key`/`count`/
 * `users`) —— 表示に使う全て。`content` は鍵から一意に決まるので比較に
 * 含めなくてよい。
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
  // コアレッサの完了と EventStore の直接変更を同じ再計算契機へまとめる。
  // ここで setVersion するのは「groups() を引き直すきっかけ」を作るため
  // だけで、その値自体を effect の中で読み返さない
  // (無限ループの罠、profile-data.ts と同じ注意)。
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
                {/*
                  角丸は 6px。ノート本体・画像の 8px の内側に入る部品なので
                  一段小さくする。**丸ピル (`rounded-full`) にはしない** ——
                  絵文字は字面が四角く、丸で囲うと左右の余白だけが増えて
                  1 列に入る数が減る。
                  高さは追加ボタンと揃えるため `h-6` で固定する。
                */}
                <div
                  data-testid="reaction-group"
                  class="b-1 flex h-6 w-fit shrink-0 items-center gap-1 rounded-1.5 px-1.5"
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
                    class="c-secondary text-caption leading-5"
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
