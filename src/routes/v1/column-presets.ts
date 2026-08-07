import type { ColumnDef } from "../../core/deck/deck";
import { decodeNpub, encodeBech32 } from "../../core/nostr/nip19";
import { FALLBACK_RELAYS } from "../../core/read/default-relays";

export type ColumnPresetKind = "home" | "user" | "hashtag" | "global";

/**
 * 追加フォームの入力から `ColumnDef` を作る。**UI から分けてあるのは、
 * 4 種別が正しい `ColumnSource` を作るかどうかをブラウザ無しで固定する
 * ため。** 種別ごとに読み取り層の別々の経路を通す (仕様 4 節) ので、
 * ここを間違えると「カラムは出来たが何も来ない」という、原因の遠い
 * 壊れ方になる。
 *
 * 入力が不正なら `undefined`。呼び出し側はフォームを閉じずにエラーを
 * 出す —— 黙って「誰にもマッチしないカラム」を作らない。
 */
export const buildColumn = (
  kind: ColumnPresetKind,
  input: string,
): ColumnDef | undefined => {
  // id は種別ではなく呼び出しごとに振る。種別から作ると、同じ種別を
  // 2 本足した瞬間に id が衝突し、<For> のキーと削除の対象指定が壊れる。
  const id = crypto.randomUUID();

  switch (kind) {
    case "home":
      return {
        id,
        title: "ホーム",
        source: { kind: "followees", kinds: [1] },
      };

    case "user": {
      const pubkey = decodeNpub(input);
      if (!pubkey) return undefined;
      return {
        id,
        // hex の先頭 8 文字は人が見て区別できない。npub のほうを見せる。
        title: `@${encodeBech32("npub", pubkey).slice(0, 12)}`,
        source: {
          kind: "literal",
          filters: [{ kinds: [1], authors: [pubkey] }],
        },
      };
    }

    case "hashtag": {
      // NIP-12 のタグ値に `#` は含まれない。ユーザーは `#nostr` と打つ
      // ほうが自然なので、ここで落とす。
      const tag = input.trim().replace(/^#/, "");
      if (tag.length === 0) return undefined;
      return {
        id,
        title: `#${tag}`,
        source: { kind: "literal", filters: [{ kinds: [1], "#t": [tag] }] },
      };
    }

    case "global":
      return {
        id,
        title: "グローバル",
        source: {
          kind: "literal",
          filters: [{ kinds: [1] }],
          relays: [...FALLBACK_RELAYS],
        },
      };
  }
};
