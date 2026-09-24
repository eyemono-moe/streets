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

/**
 * NIP-50 の検索に答えるリレー。検索は Outbox で行き先を決められない
 * （著者を指定しないフィルタなので）ため、対応しているリレーを明示する。
 */
export const SEARCH_RELAYS: readonly RelayUrl[] = [
  "wss://search.nos.today/",
  "wss://relay.ditto.pub/",
];

/**
 * 絵文字セット（kind:30030）を探しに行く既定のリレー。著者を指定しない
 * 問い合わせなので Outbox では行き先を決められず、検索に答えるリレーも
 * 少ない。カスタム絵文字は日本語圏でよく使われているので、その周辺を既定に
 * 置く。自分が読んでいるリレーと合わせて問い合わせる。
 */
export const EMOJI_SET_RELAYS: readonly RelayUrl[] = [
  "wss://yabu.me/",
  "wss://relay-jp.nostr.wirednet.jp/",
  "wss://r.kojira.io/",
  "wss://nostr.compile-error.net/",
];
