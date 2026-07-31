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
 * 1 著者あたり何本の write relay を使うか。
 * NIP-65 は「各カテゴリ 2-4 本に保て」と案内しているので大半の著者は 4 本以下。
 * 最小リレー被覆 (greedy set cover) は後続 #3 の担当であり、ここでは
 * 決定的に先頭から採るだけにする。
 */
export const MAX_RELAYS_PER_AUTHOR = 3;
