import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { decodeBech32, decodeNip19, decodeNpub, encodeBech32 } from "./nip19";

const HEX = "a".repeat(64);

const pubkeyHex =
  "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

// `decodeNip19` の入力は TLV バイト列の bech32 表現なので、production の
// `encodeBech32`(hex しか受けない) だけではテストデータを作れない。ここだけの
// 小さな TLV エンコーダを組み立てる。
type TlvEntry = { type: number; value: Uint8Array };

const encodeTlv = (entries: TlvEntry[]): Uint8Array => {
  const chunks = entries.map(({ type, value }) => {
    const chunk = new Uint8Array(2 + value.length);
    chunk[0] = type;
    chunk[1] = value.length;
    chunk.set(value, 2);
    return chunk;
  });
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const asciiBytes = (value: string): Uint8Array =>
  new TextEncoder().encode(value);

/** NIP-19 の kind (TLV type 3) はビッグエンディアンの 32 ビット符号なし整数。 */
const kindBytes = (kind: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, kind, false);
  return bytes;
};

const encodeEntity = (prefix: string, entries: TlvEntry[]): string =>
  encodeBech32(prefix, bytesToHex(encodeTlv(entries)));

// `decodeNpub` を足した際に一度削除されたが復元した (A-1 Task 2 のレビュー、
// Minor 1)。`decodeBech32`/`encodeBech32` は npub 以外の TLV
// (`nevent`/`naddr`) でも使う前提で公開されており、**投げる**という契約を
// 持つ。`decodeNpub` 経由の間接的な網羅では、任意 prefix の往復も
// チェックサム不一致で投げることも確かめられない。
describe("nip19", () => {
  it("produces a value with the requested prefix", () => {
    const encoded = encodeBech32("npub", pubkeyHex);
    expect(encoded.startsWith("npub1")).toBe(true);
    expect(encoded).toMatch(/^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/);
  });

  it("round-trips a public key", () => {
    expect(decodeBech32(encodeBech32("npub", pubkeyHex))).toEqual({
      prefix: "npub",
      dataHex: pubkeyHex,
    });
  });

  it("round-trips an arbitrary prefix", () => {
    expect(decodeBech32(encodeBech32("note", pubkeyHex))).toEqual({
      prefix: "note",
      dataHex: pubkeyHex,
    });
  });

  it("throws on a value with a broken checksum", () => {
    const encoded = encodeBech32("npub", pubkeyHex);
    expect(() =>
      decodeBech32(
        `${encoded.slice(0, -1)}${encoded.at(-1) === "q" ? "p" : "q"}`,
      ),
    ).toThrow();
  });
});

describe("decodeNpub", () => {
  it("64 桁 hex はそのまま返す", () => {
    // 捕まえる変異: hex 経路を消して npub だけ受け付ける
    expect(decodeNpub(HEX)).toBe(HEX);
  });

  it("npub を hex へ変換する", () => {
    // 捕まえる変異: 成功時に dataHex ではなく prefix を返す (検証済み:
    // 「prefix を確かめずに dataHex を返す」という変異は実際にはここでは
    // なく次の「npub 以外の bech32 は undefined」のほうを落とす —— npub の
    // 入力では prefix チェックを外しても dataHex 自体は変わらず正しいまま
    // なので、このテストだけでは検出できない)
    expect(decodeNpub(encodeBech32("npub", HEX))).toBe(HEX);
  });

  it("npub 以外の bech32 は undefined", () => {
    // 捕まえる変異: prefix を見ない (nsec を貼られたら秘密鍵を著者フィルタ
    // として扱ってしまう —— ADR-0008 は秘密鍵をアプリに渡さないと決めて
    // いるので、受け付けた時点で方針違反になる)
    expect(decodeNpub(encodeBech32("nsec", HEX))).toBeUndefined();
  });

  it("壊れた入力は例外ではなく undefined", () => {
    // 捕まえる変異: try/catch を省く (decodeBech32 が投げ、フォームの
    // 送信ハンドラから例外が抜けて画面が壊れる)
    expect(decodeNpub("not-a-key")).toBeUndefined();
  });

  it("前後の空白を無視する", () => {
    // 捕まえる変異: trim しない (コピペに空白が混じるのは普通)
    expect(decodeNpub(` ${HEX} `)).toBe(HEX);
  });

  it("長さの違う hex は undefined", () => {
    // 捕まえる変異: 正規表現の長さ指定を外す
    expect(decodeNpub("a".repeat(63))).toBeUndefined();
  });
});

describe("decodeNip19", () => {
  it("npub が { kind: 'npub', pubkey } になる", () => {
    // 捕まえる変異: bare 形 (TLV 無し) を TLV として読む
    expect(decodeNip19(encodeBech32("npub", pubkeyHex))).toEqual({
      kind: "npub",
      pubkey: pubkeyHex,
    });
  });

  it("note が { kind: 'note', id } になる", () => {
    // 捕まえる変異: bare 形を TLV として読む
    expect(decodeNip19(encodeBech32("note", HEX))).toEqual({
      kind: "note",
      id: HEX,
    });
  });

  it("nprofile の pubkey と relays が取れる", () => {
    // 捕まえる変異: special (TLV type 0) を読まずに pubkey を undefined の
    // まま返す / relay (type 1) をまったく拾わない
    const value = encodeEntity("nprofile", [
      { type: 0, value: hexToBytes(pubkeyHex) },
      { type: 1, value: asciiBytes("wss://relay.example") },
    ]);
    expect(decodeNip19(value)).toEqual({
      kind: "nprofile",
      pubkey: pubkeyHex,
      relays: ["wss://relay.example"],
    });
  });

  it("relay が複数入る", () => {
    // 捕まえる変異: relays を最後の 1 件で上書きする (push ではなく代入)
    const value = encodeEntity("nprofile", [
      { type: 0, value: hexToBytes(pubkeyHex) },
      { type: 1, value: asciiBytes("wss://a.example") },
      { type: 1, value: asciiBytes("wss://b.example") },
    ]);
    expect(decodeNip19(value)).toEqual({
      kind: "nprofile",
      pubkey: pubkeyHex,
      relays: ["wss://a.example", "wss://b.example"],
    });
  });

  it("nevent の author / eventKind は省略可能", () => {
    // 捕まえる変異: 省略時に undefined ではなく 0 を入れる
    const value = encodeEntity("nevent", [{ type: 0, value: hexToBytes(HEX) }]);
    const decoded = decodeNip19(value);
    expect(decoded).toEqual({ kind: "nevent", id: HEX, relays: [] });
    expect((decoded as { author?: string }).author).toBeUndefined();
    expect((decoded as { eventKind?: number }).eventKind).toBeUndefined();
  });

  it("kind がビッグエンディアンで読まれる", () => {
    // 捕まえる変異: リトルエンディアンで読む (kind 1 が 16777216 になる)
    const value = encodeEntity("nevent", [
      { type: 0, value: hexToBytes(HEX) },
      { type: 3, value: kindBytes(1) },
    ]);
    expect(decodeNip19(value)).toEqual({
      kind: "nevent",
      id: HEX,
      relays: [],
      eventKind: 1,
    });
  });

  it("未知の TLV 型を無視して残りを読み続ける", () => {
    // 捕まえる変異: 未知の型で undefined を返す (将来 NIP が型を足すたびに
    // 全部読めなくなる)
    const value = encodeEntity("nprofile", [
      { type: 99, value: asciiBytes("future-field") },
      { type: 0, value: hexToBytes(pubkeyHex) },
      { type: 200, value: asciiBytes("another-future-field") },
    ]);
    expect(decodeNip19(value)).toEqual({
      kind: "nprofile",
      pubkey: pubkeyHex,
      relays: [],
    });
  });

  it("naddr の識別子が空文字でも成立する", () => {
    // 捕まえる変異: 空文字を欠損として undefined を返す (通常の置換可能
    // イベント (kind:0 / 10002 など) は d タグを持たないので、これを弾くと
    // それらが全部読めなくなる)
    const value = encodeEntity("naddr", [
      { type: 0, value: new Uint8Array(0) },
      { type: 2, value: hexToBytes(pubkeyHex) },
      { type: 3, value: kindBytes(10002) },
    ]);
    expect(decodeNip19(value)).toEqual({
      kind: "naddr",
      identifier: "",
      pubkey: pubkeyHex,
      eventKind: 10002,
      relays: [],
    });
  });

  it("nsec は undefined", () => {
    // 捕まえる変異: デコードして秘密鍵を構造化データとして持つ (ADR-0008
    // 違反)
    expect(decodeNip19(encodeBech32("nsec", HEX))).toBeUndefined();
  });

  it("nrelay は undefined", () => {
    // 捕まえる変異: deprecated な形を通す
    const value = encodeEntity("nrelay", [
      { type: 0, value: asciiBytes("wss://relay.example") },
    ]);
    expect(decodeNip19(value)).toBeUndefined();
  });

  it("壊れた bech32 が例外ではなく undefined", () => {
    // 捕まえる変異: try/catch を省く
    const encoded = encodeBech32("npub", pubkeyHex);
    expect(() =>
      decodeNip19(
        `${encoded.slice(0, -1)}${encoded.at(-1) === "q" ? "p" : "q"}`,
      ),
    ).not.toThrow();
    expect(
      decodeNip19(
        `${encoded.slice(0, -1)}${encoded.at(-1) === "q" ? "p" : "q"}`,
      ),
    ).toBeUndefined();
  });

  it("L が残りバイト数を超えているとき undefined", () => {
    // 捕まえる変異: 宣言された長さを検証せず、実際に読めた分 (subarray が
    // 自動で切り詰めた分) で妥協する。truncate された値を「正常に読めた
    // 短いエントリ」として受理してしまう
    // type=0, length=50 のはずが実際には 3 バイトしか続かない、壊れた TLV
    const truncated = new Uint8Array([0, 50, 1, 2, 3]);
    const value = encodeBech32("nprofile", bytesToHex(truncated));
    expect(decodeNip19(value)).toBeUndefined();
  });
});
