import type { RelayUrl } from "../../core/relay/relay-connection";

/**
 * `?relays=` を接続先の配列に変換する e2e 専用の抜け道。未指定・空文字・
 * 区切っても 0 件になる入力はすべて `undefined` (上書きしない) に丸める。
 */
export const parseRelays = (param: string | null): RelayUrl[] | undefined => {
  if (param === null) return undefined;

  const urls = param
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

  return urls.length > 0 ? urls : undefined;
};
