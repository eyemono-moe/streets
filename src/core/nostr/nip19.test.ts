import { describe, expect, it } from "vitest";
import { decodeNpub, encodeBech32 } from "./nip19";

const HEX = "a".repeat(64);

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
