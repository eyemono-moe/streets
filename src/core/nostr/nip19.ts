import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { bech32 } from "@scure/base";

/** NIP-19 の bech32 は 5000 文字まで許容する（既定の 90 では naddr が入らない） */
const LIMIT = 5000;

export const encodeBech32 = (prefix: string, dataHex: string): string =>
  bech32.encode(prefix, bech32.toWords(hexToBytes(dataHex)), LIMIT);

/** TLV デコードはバイト列を要る。`decodeBech32` は hex 化して公開しているので
 * ここだけ bytes を返す形を内部に持つ。 */
const decodeBech32Bytes = (
  value: string,
): { prefix: string; bytes: Uint8Array } => {
  const { prefix, words } = bech32.decode(value, LIMIT);
  return { prefix, bytes: bech32.fromWords(words) };
};

export const decodeBech32 = (
  value: string,
): { prefix: string; dataHex: string } => {
  const { prefix, bytes } = decodeBech32Bytes(value);
  return { prefix, dataHex: bytesToHex(bytes) };
};

/** 小文字 hex のみ。NIP-01 の pubkey は 32 バイトの hex 表現である。 */
const HEX_PUBKEY = /^[0-9a-f]{64}$/;

/**
 * ユーザーが打ち込んだ文字列から pubkey (hex) を取り出す。npub と hex の
 * 両方を受ける。**不正な入力に対して例外を投げない** —— `decodeBech32` は
 * 投げるが、これはフォームの入力を受ける関数であり、呼び出し側が
 * try/catch を書く前提にすると書き忘れがそのまま画面の破壊になる。
 *
 * `npub` 以外の prefix は受け付けない。とくに `nsec` を弾くことには意味が
 * ある —— 貼り間違いを黙って著者フィルタとして扱うと、ADR-0008 の
 * 「秘密鍵をアプリに渡さない」を入力の側から破ることになる。
 */
export const decodeNpub = (input: string): string | undefined => {
  const trimmed = input.trim();
  if (HEX_PUBKEY.test(trimmed)) return trimmed;

  try {
    const { prefix, dataHex } = decodeBech32(trimmed);
    return prefix === "npub" && HEX_PUBKEY.test(dataHex) ? dataHex : undefined;
  } catch {
    return undefined;
  }
};

export type Nip19Ref =
  | { kind: "npub"; pubkey: string }
  | { kind: "note"; id: string }
  | { kind: "nprofile"; pubkey: string; relays: string[] }
  | {
      kind: "nevent";
      id: string;
      relays: string[];
      author?: string;
      eventKind?: number;
    }
  | {
      kind: "naddr";
      identifier: string;
      pubkey: string;
      eventKind: number;
      relays: string[];
    };

type Tlv = { type: number; value: Uint8Array };

/** `L` が残りを超えていたら中断して `undefined`。truncate された入力で範囲外
 * を読まない。 */
const readTlv = (bytes: Uint8Array): Tlv[] | undefined => {
  const out: Tlv[] = [];
  let i = 0;
  while (i + 2 <= bytes.length) {
    const type = bytes[i];
    const length = bytes[i + 1];
    const start = i + 2;
    const end = start + length;
    if (type === undefined || length === undefined || end > bytes.length) {
      return undefined;
    }
    out.push({ type, value: bytes.subarray(start, end) });
    i = end;
  }
  return i === bytes.length ? out : undefined;
};

const decodeAscii = (bytes: Uint8Array): string =>
  new TextDecoder().decode(bytes);

/** NIP-19 の kind (TLV type 3) はビッグエンディアンの 32 ビット符号なし整数。
 * リトルエンディアンで読むと kind 1 が 16777216 になる。 */
const readEventKind = (bytes: Uint8Array): number =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    0,
    false,
  );

const decodeNprofile = (bytes: Uint8Array): Nip19Ref | undefined => {
  const tlv = readTlv(bytes);
  if (!tlv) return undefined;

  let pubkey: string | undefined;
  const relays: string[] = [];
  for (const { type, value } of tlv) {
    // 未知の型は NIP-19 が明示的に無視を求めている —— 将来 NIP の追加で
    // ここが undefined を返すと、その型を含む全エンティティが読めなくなる。
    if (type === 0 && pubkey === undefined) pubkey = bytesToHex(value);
    else if (type === 1) relays.push(decodeAscii(value));
  }
  if (pubkey === undefined) return undefined;
  return { kind: "nprofile", pubkey, relays };
};

const decodeNevent = (bytes: Uint8Array): Nip19Ref | undefined => {
  const tlv = readTlv(bytes);
  if (!tlv) return undefined;

  let id: string | undefined;
  let author: string | undefined;
  let eventKind: number | undefined;
  const relays: string[] = [];
  for (const { type, value } of tlv) {
    if (type === 0 && id === undefined) id = bytesToHex(value);
    else if (type === 1) relays.push(decodeAscii(value));
    else if (type === 2 && author === undefined) author = bytesToHex(value);
    else if (type === 3 && eventKind === undefined) {
      eventKind = readEventKind(value);
    }
  }
  if (id === undefined) return undefined;
  return { kind: "nevent", id, relays, author, eventKind };
};

const decodeNaddr = (bytes: Uint8Array): Nip19Ref | undefined => {
  const tlv = readTlv(bytes);
  if (!tlv) return undefined;

  let identifier: string | undefined;
  let pubkey: string | undefined;
  let eventKind: number | undefined;
  const relays: string[] = [];
  for (const { type, value } of tlv) {
    // 空文字は通常の置換可能イベント (d タグ無し) の正しい値であり、欠損
    // ではない —— `identifier === undefined` でのみ「無い」を表す。
    if (type === 0 && identifier === undefined) identifier = decodeAscii(value);
    else if (type === 1) relays.push(decodeAscii(value));
    else if (type === 2 && pubkey === undefined) pubkey = bytesToHex(value);
    else if (type === 3 && eventKind === undefined) {
      eventKind = readEventKind(value);
    }
  }
  if (
    identifier === undefined ||
    pubkey === undefined ||
    eventKind === undefined
  ) {
    return undefined;
  }
  return { kind: "naddr", identifier, pubkey, eventKind, relays };
};

/**
 * `nostr:` の本文参照を構造化データへ。**不正な入力に対して例外を投げない**
 * —— レンダラの中から呼ばれ、1 件の壊れた参照でカラム全体を落とすわけには
 * いかない。
 *
 * `nsec` は常に `undefined` を返す。ADR-0008 はアプリが秘密鍵を一切保持しな
 * いと定めており、本文に貼られた nsec をデコードして構造化データとして持つ
 * のは、その方針を入力の側から破ることになる（`decodeNpub` も同じ理由で
 * nsec を弾いている）。`nrelay` は deprecated なので同様に扱わない。
 */
export const decodeNip19 = (value: string): Nip19Ref | undefined => {
  try {
    const { prefix, bytes } = decodeBech32Bytes(value);
    switch (prefix) {
      case "npub":
        return { kind: "npub", pubkey: bytesToHex(bytes) };
      case "note":
        return { kind: "note", id: bytesToHex(bytes) };
      case "nprofile":
        return decodeNprofile(bytes);
      case "nevent":
        return decodeNevent(bytes);
      case "naddr":
        return decodeNaddr(bytes);
      default:
        // nsec と nrelay を含む、上記以外すべて。
        return undefined;
    }
  } catch {
    return undefined;
  }
};
