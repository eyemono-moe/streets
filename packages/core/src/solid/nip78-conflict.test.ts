import { describe, expect, it } from "vite-plus/test";
import { isRemoteChange } from "./nip78-conflict";

const known = { id: "known", createdAt: 100 };
const event = (id: string, created_at: number) => ({ id, created_at });

describe("isRemoteChange", () => {
  it("知っている版そのものなら、変更ではない", () => {
    expect(isRemoteChange(event("known", 100), known, new Set())).toBe(false);
  });

  it("自分が書いた版なら、変更ではない", () => {
    expect(isRemoteChange(event("mine", 120), known, new Set(["mine"]))).toBe(
      false,
    );
  });

  it("知っている版より古ければ、変更ではない（追いついていないリレー）", () => {
    expect(isRemoteChange(event("old", 90), known, new Set())).toBe(false);
  });

  it("知らない新しい版なら、別の端末の変更として扱う", () => {
    expect(isRemoteChange(event("theirs", 120), known, new Set())).toBe(true);
  });

  it("まだ何も知らないときに版があれば、別の端末の変更として扱う", () => {
    expect(isRemoteChange(event("theirs", 120), undefined, new Set())).toBe(
      true,
    );
  });

  it("版が消えていれば、変更ではない（手元の版で復旧してよい）", () => {
    expect(isRemoteChange(undefined, known, new Set())).toBe(false);
  });
});
