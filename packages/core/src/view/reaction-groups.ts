import {
  type ParsedReaction,
  type ReactionContent,
  parseReaction,
} from "../nostr/reaction";
import type { EventStore } from "../read/event-store";

export type ReactionGroup = {
  /** まとめる鍵。テストが並びを主張できるよう安定した文字列にする。 */
  key: string;
  content: ReactionContent;
  /** 押した人 → 回数。展開表示で「@name (2)」を出すのに要る。 */
  users: Map<string, number>;
  count: number;
};

/**
 * 鍵に**種別を含める**（絵文字 `:smile:` とテキスト "smile" は別物)。URL は
 * 含めない —— 別ドメインの同じショートコードで山が割れ数が読めなくなるため。
 */
export const reactionKey = (content: ReactionContent): string => {
  switch (content.type) {
    case "like":
      return "like";
    case "emoji":
      return `emoji:${content.name}`;
    case "text":
      return `text:${content.content}`;
  }
};

/** 最初に現れた順を保つ (`Map` の挿入順)。並びが呼ぶたびに変わると、
 *  リアクションが 1 件届くだけで既存の山が横に飛ぶ。 */
export const groupReactions = (
  reactions: readonly { pubkey: string; parsed: ParsedReaction }[],
): ReactionGroup[] => {
  const groups = new Map<string, ReactionGroup>();
  for (const { pubkey, parsed } of reactions) {
    const key = reactionKey(parsed.content);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        key,
        content: parsed.content,
        users: new Map([[pubkey, 1]]),
        count: 1,
      });
      continue;
    }
    current.users.set(pubkey, (current.users.get(pubkey) ?? 0) + 1);
    current.count += 1;
  }
  return [...groups.values()];
};

/**
 * 投稿に付いたリアクションを並べる。`targetId` を確かめ直すのは、返信の祖先として
 * `e` タグに載っているだけの kind:7 を、この投稿への反応として数えないため。
 */
export const eventReactionGroups = (
  store: Pick<EventStore, "eventsByTag">,
  targetId: string,
): ReactionGroup[] =>
  groupReactions(
    store.eventsByTag("e", targetId).flatMap((event) => {
      const parsed = parseReaction(event);
      return parsed?.targetId === targetId
        ? [{ pubkey: event.pubkey, parsed }]
        : [];
    }),
  );

/**
 * 中身が同じなら true。無関係な通知のたびに新しい配列を渡すと、一覧の DOM が
 * 作り直され、絵文字画像が読み込み直されて点滅する。
 */
export const sameReactionGroups = (
  a: readonly ReactionGroup[],
  b: readonly ReactionGroup[],
): boolean =>
  a.length === b.length &&
  a.every((group, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      group.key === other.key &&
      group.count === other.count &&
      group.users.size === other.users.size &&
      [...group.users].every(
        ([pubkey, count]) => other.users.get(pubkey) === count,
      )
    );
  });
