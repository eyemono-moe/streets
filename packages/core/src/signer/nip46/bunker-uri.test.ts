import { describe, expect, it } from "vitest";
import { InvalidBunkerUriError, parseBunkerUri } from "./bunker-uri";

const PUBKEY = "a".repeat(64);

describe("parseBunkerUri", () => {
  it("複数relayとsecretを読む", () => {
    expect(
      parseBunkerUri(
        `bunker://${PUBKEY}?relay=wss%3A%2F%2Fone.example&relay=ws%3A%2F%2Flocalhost%3A8080&secret=once`,
      ),
    ).toEqual({
      remoteSignerPubkey: PUBKEY,
      relays: ["wss://one.example/", "ws://localhost:8080/"],
      secret: "once",
    });
  });

  it("正規化後に重複するrelayを1本にする", () => {
    expect(
      parseBunkerUri(
        `bunker://${PUBKEY}?relay=wss%3A%2F%2FONE.example&relay=wss%3A%2F%2Fone.example%2F`,
      ).relays,
    ).toEqual(["wss://one.example/"]);
  });

  it.each([
    "nsec1not-a-bunker",
    `https://${PUBKEY}?relay=wss%3A%2F%2Fone.example`,
    `bunker://${"g".repeat(64)}?relay=wss%3A%2F%2Fone.example`,
    `bunker://${PUBKEY}`,
    `bunker://${PUBKEY}?relay=https%3A%2F%2Fone.example`,
    `bunker://${PUBKEY}?relay=wss%3A%2F%2Fone.example&secret=`,
  ])("不正な入力 %s を拒否する", (input) => {
    expect(() => parseBunkerUri(input)).toThrow(InvalidBunkerUriError);
  });

  it("正規化後に6本あるrelayを黙って切らない", () => {
    // 捕まえる変異: 上限判定を削除して全リレーをConnectionPoolへ渡す。
    const query = Array.from(
      { length: 6 },
      (_, index) => `relay=wss%3A%2F%2Fr${index}.example`,
    ).join("&");
    expect(() => parseBunkerUri(`bunker://${PUBKEY}?${query}`)).toThrow(
      "relay は5本まで",
    );
  });
});
