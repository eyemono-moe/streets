import type { ParsedReaction, ReactionContent } from "../nostr/reaction";

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
const keyOf = (content: ReactionContent): string => {
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
    const key = keyOf(parsed.content);
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
