import type { RelayUrl } from "./relay-connection";

/**
 * リレー URL を比較可能な形に正規化する（kind:10002 の URL は末尾スラッシュや
 * 大文字小文字が揺れるため）。websocket 以外とパース不能は undefined を返す。
 */
export const normalizeRelayUrl = (url: string): RelayUrl | undefined => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "wss:" && parsed.protocol !== "ws:") return undefined;
  // URL はホストを小文字化・空パスを "/" にする。search/hash は無意味なので落とす。
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
};
