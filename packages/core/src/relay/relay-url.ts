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

const LOCAL_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home.arpa",
];

const isLocalIpv4 = (host: string): boolean => {
  const parts = host.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) {
    return false;
  }
  const [a, b] = parts.map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
};

const isLocalIpv6 = (host: string): boolean => {
  if (host === "::" || host === "::1") return true;
  // URL は IPv4 射影を ::ffff:7f00:1 の形に直すので、16 進の 2 組から戻して見る。
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (mapped) {
    const high = Number.parseInt(mapped[1], 16);
    const low = Number.parseInt(mapped[2], 16);
    return isLocalIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  // fc00::/7（ユニークローカル）と fe80::/10（リンクローカル）。
  return /^f[cd][0-9a-f]{0,2}:/.test(host) || /^fe[89ab][0-9a-f]?:/.test(host);
};

/**
 * 手元の機械や家の中のネットワークを指すリレーか。公開のページからここへ繋ぐと、
 * ブラウザがローカルネットワークへの接続の許可を求める。名前を引いた先が
 * プライベートな IP になる公開ドメインは、ここでは見分けられない。
 */
export const isLocalNetworkRelay = (url: RelayUrl): boolean => {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  if (host.startsWith("[") && host.endsWith("]")) {
    return isLocalIpv6(host.slice(1, -1));
  }
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host === "localhost") return true;
  if (LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  return isLocalIpv4(host);
};
