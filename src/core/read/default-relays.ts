import type { RelayUrl } from "../relay/relay-connection";

/**
 * kind:10002 と kind:0 を引く専用経路。
 * このリストは半年で腐る前提で扱うこと。既定リレーを触るときは測り直す。
 */
export const BOOTSTRAP_INDEXERS: readonly RelayUrl[] = [
  "wss://directory.yabu.me/",
  "wss://profiles.nostr1.com/",
  "wss://indexer.coracle.social/",
  "wss://purplepag.es/",
];

/** kind:10002 が引けない著者の投稿を取りに行く先 */
export const FALLBACK_RELAYS: readonly RelayUrl[] = [
  "wss://yabu.me/",
  "wss://nos.lol/",
  "wss://relay.damus.io/",
];

/**
 * アプリ全体で同時に開く WebSocket の上限。実測でフォロー 1300 人規模の
 * write リレーは 378〜1251 本あり、貪欲に 30 本選べば冗長度 2 を 96〜98% 達成できる。
 */
export const MAX_CONNECTIONS = 30;

/**
 * 1 著者あたり何本のリレーから取るか。1 本だと取りこぼしを検出できない
 * まま消える。2 本の代償は被覆低下 (99〜100%→96〜98%) と重複配信の増加。
 */
export const RELAY_REDUNDANCY = 2;
