import type { RelayUrl } from "./relay-connection";

/**
 * リレー URL を比較可能な形に正規化する。
 * kind:10002 の URL は末尾スラッシュの有無や大文字小文字が揺れるため、
 * 接続の重複排除はこの正規化後の値を基準にする。
 * websocket スキーム以外と、パースできないものは undefined を返す。
 */
export const normalizeRelayUrl = (url: string): RelayUrl | undefined => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "wss:" && parsed.protocol !== "ws:") return undefined;
  // URL はホストを小文字化し、空パスを "/" にする。
  // 検索文字列とフラグメントはリレー URL には意味を持たないため落とす。
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
};
