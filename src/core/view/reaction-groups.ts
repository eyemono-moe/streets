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
 * 鍵に**種別を含める**。カスタム絵文字 `:smile:` とテキストの "smile" は
 * 別物であり、文字列だけで引くと同じ山になる。逆に URL は含めない ——
 * 同じショートコードを別ドメインの画像で送る人がいるだけで山が割れ、
 * 数が読めなくなる。
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
