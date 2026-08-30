import type { RelayUrl } from "../relay/relay-connection";

/**
 * kind:10002 と kind:0 を引く専用経路 (ADR-0016 のブートストラップ)。
 * 選定根拠と 2026-08-01 の実測は
 * docs/research/2026-08-01-nip65-relay-selection.md を参照。
 * このリストは半年で腐る前提で扱うこと。既定リレーを触るときは測り直す。
 */
export const BOOTSTRAP_INDEXERS: readonly RelayUrl[] = [
  "wss://directory.yabu.me/",
  "wss://profiles.nostr1.com/",
  "wss://indexer.coracle.social/",
  "wss://purplepag.es/",
];

/** kind:10002 が引けない著者の投稿を取りに行く先 (ADR-0016) */
export const FALLBACK_RELAYS: readonly RelayUrl[] = [
  "wss://yabu.me/",
  "wss://nos.lol/",
  "wss://relay.damus.io/",
];

/**
 * アプリ全体で同時に開く WebSocket の上限 (ADR-0011)。
 *
 * 著者ごとの本数ではなく**大域の予算**である。実測ではフォロー 1300 人規模で
 * 378〜1251 本の write リレーが宣言されており、素朴に全部へ繋ぐことはできない。
 * 一方で貪欲に選べば 30 本で冗長度 2 を 96〜98% 達成できる
 * (docs/research/2026-08-01-outbox-connection-budget.md)。
 */
export const MAX_CONNECTIONS = 30;

/**
 * 1 著者あたり何本のリレーから取るか。
 *
 * 1 本にすると、そのリレーがイベントを取りこぼした時点でその著者が
 * タイムラインから消え、しかも消えたことを検出できない (リレーは生きている
 * ので unreachableRelays にも計上されない)。2 本にする代償は 30 本での被覆が
 * 99〜100% から 96〜98% に下がることと、重複配信が増えること。
 */
export const RELAY_REDUNDANCY = 2;
