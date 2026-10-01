import { describe, expect, it } from "vite-plus/test";
import { formatEventAddress, parseEventAddress } from "./address";

const PUBKEY = "a".repeat(64);

describe("parseEventAddress", () => {
  it("`d` に `:` が入っていても、3 つ目以降を繋いで読む", () => {
    // 捕まえる変異: split の 3 つ目だけを identifier にする
    expect(parseEventAddress(`30023:${PUBKEY}:a:b`)).toEqual({
      kind: 30_023,
      pubkey: PUBKEY,
      identifier: "a:b",
    });
  });

  it("空の `d` も住所として読む", () => {
    expect(parseEventAddress(`30000:${PUBKEY}:`)?.identifier).toBe("");
  });

  it("住所で指せない kind や壊れた形は読まない", () => {
    expect(parseEventAddress(`1:${PUBKEY}:x`)).toBeUndefined();
    expect(parseEventAddress(`10002:${PUBKEY}:`)).toBeUndefined();
    expect(parseEventAddress(`30023:${PUBKEY}`)).toBeUndefined();
    expect(parseEventAddress(`30023:xyz:post`)).toBeUndefined();
    expect(parseEventAddress(`030023:${PUBKEY}:post`)).toBeUndefined();
    expect(parseEventAddress(undefined)).toBeUndefined();
  });

  it("書き出した形を読み戻せる", () => {
    const address = { kind: 30_030, pubkey: PUBKEY, identifier: "ねこ" };
    expect(parseEventAddress(formatEventAddress(address))).toEqual(address);
  });
});
