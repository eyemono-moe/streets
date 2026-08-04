import { FALLBACK_RELAYS } from "../read/default-relays";
import type { NostrSource } from "../read/source";
import type { RelayFilter } from "../relay/relay-connection";

export type ColumnDef = { id: string; title: string; source: NostrSource };

/**
 * `version` は今すぐ増える予定はないが、外さない。デッキの正が localStorage
 * から NIP-78 (kind:30078, ADR-0013) へ移るとき、古い形 (このバージョン) を
 * 新しい形として誤って読み込まないための足場がこれしかない —
 * バージョンを持たない形式は「今の形と違う」ことしか言えず「壊れている」と
 * 区別できない。
 */
export type Deck = { version: 1; columns: ColumnDef[] };

export const DECK_STORAGE_KEY = "streets.v1.deck";

/**
 * 初回起動時 (localStorage に何も無い、または壊れている) の既定デッキ。
 *
 * 3 本の設計意図が違う:
 * - `home`: Outbox ルーティング (`relays` を指定しない)。フォローの投稿を
 *   ルーティング表に任せて集める、このスライスの主目的。
 * - `mine`: 単一著者。フォロー 0 人でも自分の投稿だけは必ず映る、
 *   ルーティングの成否を切り分けるための対照群。
 * - `global`: 明示リレー。Outbox をバイパスして `FALLBACK_RELAYS` へ直接繋ぐ
 *   経路が実際に機能することを見せる (ADR-0016 の fallback は「著者ごとの
 *   経路が引けないときの保険」だが、ここでは意図的に常時使う)。
 */
export const defaultDeck = (
  viewerPubkey: string,
  followees: string[],
): Deck => ({
  version: 1,
  columns: [
    {
      id: "home",
      title: "ホーム",
      source: {
        type: "nostr",
        filters: [{ kinds: [1], authors: followees }],
      },
    },
    {
      id: "mine",
      title: "自分の投稿",
      source: {
        type: "nostr",
        filters: [{ kinds: [1], authors: [viewerPubkey] }],
      },
    },
    {
      id: "global",
      title: "グローバル",
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: [...FALLBACK_RELAYS],
      },
    },
  ],
});

export const saveDeck = (deck: Deck): string => JSON.stringify(deck);

/**
 * `raw` は外部入力 —— `EventStore` がリレーからの値を `isNostrEvent` で
 * 確かめているのと同じ理由で、localStorage の値も信用しない。
 * ユーザーが手で書き換える、旧バージョンの形が残る、別のスクリプトが
 * 同じキーを使う、のどれが起きても JSON.parse の結果をそのままキャスト
 * せず、構造を実際に確かめてから返す。壊れていれば例外を投げず
 * `undefined` を返す (呼び出し側が既定デッキへ落ちられるように)。
 */
export const loadDeck = (raw: string | null): Deck | undefined => {
  if (raw === null) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  return isDeck(parsed) ? parsed : undefined;
};

const isDeck = (value: unknown): value is Deck => {
  if (typeof value !== "object" || value === null) return false;
  const deck = value as Record<string, unknown>;

  // NIP-78 へ移行したとき、version の無い (または違う) 古い形を新しい形
  // として読んでしまうと、存在しないフィールドへのアクセスで壊れるか、
  // 悪くすると意味の変わったフィールドを正しい値として使ってしまう。
  if (deck.version !== 1) return false;
  if (!Array.isArray(deck.columns)) return false;
  return deck.columns.every(isColumnDef);
};

const isColumnDef = (value: unknown): value is ColumnDef => {
  if (typeof value !== "object" || value === null) return false;
  const column = value as Record<string, unknown>;

  if (typeof column.id !== "string" || column.id.length === 0) return false;
  if (typeof column.title !== "string" || column.title.length === 0)
    return false;
  return isNostrSource(column.source);
};

const isNostrSource = (value: unknown): value is NostrSource => {
  if (typeof value !== "object" || value === null) return false;
  const source = value as Record<string, unknown>;

  if (source.type !== "nostr") return false;
  if (!Array.isArray(source.filters)) return false;
  if (!source.filters.every(isRelayFilter)) return false;
  if (source.relays !== undefined) {
    if (!Array.isArray(source.relays)) return false;
    if (!source.relays.every((url) => typeof url === "string")) return false;
  }
  return true;
};

/**
 * `RelayFilter` は `#<tag>` の任意キーを許すので、フィールドを列挙して
 * 網羅的に確かめることはしない。「オブジェクトである」ところまでで十分 ——
 * ここでの目的は形の壊れたデッキで描画時に落ちないことであって、
 * リレーへ送るフィルタとしての妥当性はリレー自身がエラーで教えてくれる。
 */
const isRelayFilter = (value: unknown): value is RelayFilter =>
  typeof value === "object" && value !== null && !Array.isArray(value);
