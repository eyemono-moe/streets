import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";

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
