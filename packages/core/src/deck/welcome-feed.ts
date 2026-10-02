import { contentWarning } from "../nostr/content-warning";
import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";
import { buildUserColumn } from "./column-presets";
import type { ColumnDef } from "./deck";

/** 日本語の投稿が見えて、流れが速すぎないところ。 */
export const DEFAULT_WELCOME_RELAYS: readonly RelayUrl[] = ["wss://yabu.me/"];

/**
 * 入口のカラムは明示リレーなので、接続の予算に関係なく必ず開かれる。ビルド時の
 * 指定を誤っても接続を食い潰さないよう上限を切る。
 */
const MAX_WELCOME_RELAYS = 3;

/**
 * ビルド時に渡されたリレーの指定（カンマか空白で区切る）を読む。読めるものが
 * 1 本も無ければ既定に戻す —— 空のまま返すと「0 本の明示指定」になり、入口に
 * 何も流れない。
 */
export const welcomeRelays = (raw: string | undefined): RelayUrl[] => {
  const relays = [
    ...new Set(
      (raw ?? "")
        .split(/[\s,]+/)
        .map((item) => normalizeRelayUrl(item))
        .filter((relay) => relay !== undefined),
    ),
  ].slice(0, MAX_WELCOME_RELAYS);
  return relays.length > 0 ? relays : [...DEFAULT_WELCOME_RELAYS];
};

/** 入口に流すカラム。デッキには入らないので id は固定でよい。 */
export const welcomeColumn = (relays: readonly RelayUrl[]): ColumnDef => ({
  id: "welcome",
  title: relays.map((relay) => relay.replace(/\/$/, "")).join("、"),
  source: {
    kind: "literal",
    filters: [{ kinds: [1] }],
    relays: [...relays],
  },
});

/** 入口のハッシュタグ。写真の投稿が多く、日本語の投稿も流れる。 */
const WELCOME_HASHTAG = "foodstr";

/** Streets の公式アカウント（`_@streets.eyemono.moe`）。 */
export const STREETS_PUBKEY =
  "82c79cae097b3ec63524910352be0a8e9c3f8a40cf2a2176429ec4a19eac86ad";

/**
 * 入口に並べるカラム。リレー・ハッシュタグ・人と、種類の違うカラムを並べて、
 * 組み合わせられることを見せる。
 */
export const welcomeColumns = (relays: readonly RelayUrl[]): ColumnDef[] => [
  welcomeColumn(relays),
  {
    id: "welcome-hashtag",
    title: `#${WELCOME_HASHTAG}`,
    // 著者を指定しないので、既定のリレーへ問い合わせる。
    source: {
      kind: "literal",
      filters: [{ kinds: [1], "#t": [WELCOME_HASHTAG] }],
    },
  },
  { ...buildUserColumn(STREETS_PUBKEY), id: "welcome-streets" },
];

/**
 * 入口ではミュートを持たない人が見る。投稿者が閲覧注意（NIP-36）にしたものは
 * 出さない。
 */
export const showsOnWelcome = (event: NostrEvent): boolean =>
  contentWarning(event) === undefined;
