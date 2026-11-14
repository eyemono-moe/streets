import { describe, expect, it } from "vite-plus/test";
import { encodeBech32, encodeNprofile } from "../nostr/nip19";
import {
  commonProfileData,
  commonReaction,
  decodeCommonNip19,
  encodeCommonNip19,
  profileTarget,
} from "./common";

const PUBKEY = "a".repeat(64);

describe("NIP-19 の変換", () => {
  it("npub を作り、読み戻すと hex になる", () => {
    const encoded = encodeCommonNip19({ type: "npub", hex: PUBKEY });
    expect(encoded).toEqual({
      ok: true,
      value: encodeBech32("npub", PUBKEY),
      nip19Type: "npub",
    });
    expect(decodeCommonNip19(encoded.ok ? encoded.value : "")).toEqual({
      ok: true,
      nip19Type: "npub",
      hex: PUBKEY,
      pubkey: PUBKEY,
    });
  });

  // > MUST reject `nsec`.
  it("nsec は作りも読みもしない", () => {
    expect(encodeCommonNip19({ type: "nsec", hex: PUBKEY }).ok).toBe(false);
    expect(decodeCommonNip19(encodeBech32("nsec", PUBKEY))).toEqual({
      ok: false,
      error: "unsupported-nip19-type",
    });
  });

  // > SHOULD reject strings longer than 5000 chars.
  it("長すぎる文字列は読まない", () => {
    expect(decodeCommonNip19(`npub1${"q".repeat(5000)}`).ok).toBe(false);
  });
});

describe("profileTarget", () => {
  // > Accepts hex pubkey, `npub`, or `nprofile`. Normalizes to hex, treats `nprofile`
  // > relay TLVs as hints
  it("hex・npub・nprofile を hex にし、nprofile のリレーをヒントにする", () => {
    expect(profileTarget(PUBKEY)).toEqual({ pubkey: PUBKEY, relays: [] });
    expect(profileTarget(encodeBech32("npub", PUBKEY))).toEqual({
      pubkey: PUBKEY,
      relays: [],
    });
    expect(
      profileTarget(
        encodeNprofile({ pubkey: PUBKEY, relays: ["wss://r.example/"] }) ?? "",
      ),
    ).toEqual({ pubkey: PUBKEY, relays: ["wss://r.example/"] });
    expect(profileTarget("alice")).toBeUndefined();
  });
});

describe("commonProfileData", () => {
  it("display_name を displayName に直し、知らない欄は残す", () => {
    expect(
      commonProfileData('{"name":"alice","display_name":"Alice","x":1}'),
    ).toEqual({ name: "alice", displayName: "Alice", x: 1 });
    expect(commonProfileData("not json")).toBeNull();
  });
});

describe("commonReaction", () => {
  // > `reaction` is `+`, `-`, one Unicode emoji, or one NIP-30 shortcode.
  // > `customEmojiHref` requires one matching `emoji` tag.
  it("+ はいいね、絵文字と - はそのまま、ショートコードは画像の URL と組にする", () => {
    expect(commonReaction("+", undefined)).toEqual({ type: "like" });
    expect(commonReaction("-", undefined)).toEqual({
      type: "text",
      content: "-",
    });
    expect(commonReaction("🔥", undefined)).toEqual({
      type: "text",
      content: "🔥",
    });
    expect(commonReaction(":soapbox:", "https://example.com/s.png")).toEqual({
      type: "emoji",
      shortcode: "soapbox",
      url: "https://example.com/s.png",
    });
  });

  it("画像の無いショートコードや、ショートコードでない画像は断る", () => {
    expect(commonReaction(":soapbox:", undefined)).toBeUndefined();
    expect(commonReaction(":soapbox:", "javascript:alert(1)")).toBeUndefined();
    expect(commonReaction("🔥", "https://example.com/s.png")).toBeUndefined();
    expect(commonReaction("", undefined)).toBeUndefined();
  });
});
