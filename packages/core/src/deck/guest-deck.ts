import type { RelayUrl } from "../relay/relay-connection";
import { columnNeedsAccount } from "./column-kinds";
import {
  buildHashtagColumn,
  buildRelayColumn,
  buildUserColumn,
} from "./column-presets";
import {
  type ColumnDef,
  type DeckSet,
  FIRST_DECK_ID,
  FIRST_DECK_NAME,
} from "./deck";

/**
 * ログインしていない人のデッキを置く localStorage のキー。この端末にだけ置き、
 * アカウントのデッキ（`deckStorageKey`）とは混ぜない —— ログインしたら、その人の
 * デッキを開く。
 */
export const GUEST_DECK_STORAGE_KEY = "streets.v1.deck.guest";

/** Streets の公式アカウント（`_@streets.eyemono.moe`）。 */
export const STREETS_PUBKEY =
  "82c79cae097b3ec63524910352be0a8e9c3f8a40cf2a2176429ec4a19eac86ad";

/** 既定のハッシュタグ。写真の投稿が多く、日本語の投稿も流れる。 */
const GUEST_HASHTAG = "foodstr";

export const welcomeColumn = (): ColumnDef => ({
  id: crypto.randomUUID(),
  title: "Streets へようこそ",
  source: { kind: "welcome" },
  // 紹介を兼ねて図や説明が多いので、ほかのカラムより広く取る。
  width: "l",
});

/**
 * ログインしていない人に最初に見せるデッキ。紹介とログインのカラムに続けて、
 * ログインせずに読めるカラムを種類を変えて並べ、組み合わせられることを見せる。
 */
export const guestDeckSet = (relays: readonly RelayUrl[]): DeckSet => {
  const relayColumn = buildRelayColumn(relays);
  return {
    version: 3,
    decks: [
      {
        id: FIRST_DECK_ID,
        name: FIRST_DECK_NAME,
        columns: [
          welcomeColumn(),
          ...(relayColumn ? [relayColumn] : []),
          buildHashtagColumn(GUEST_HASHTAG)!,
          { ...buildUserColumn(STREETS_PUBKEY), id: crypto.randomUUID() },
        ],
      },
    ],
  };
};

/**
 * 「ログインせずに見てみる」で移る先。紹介の後ろにある、ログインせずに読める最初の
 * カラム。1 本も無ければ undefined で、呼ぶ側がリレーのカラムを足す。
 */
export const browseTargetIn = (
  columns: readonly ColumnDef[],
): string | undefined =>
  columns.find(
    (column) => column.source.kind !== "welcome" && !columnNeedsAccount(column),
  )?.id;
