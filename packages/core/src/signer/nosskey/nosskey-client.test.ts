import { describe, expect, it, vi } from "vite-plus/test";
import {
  type NosskeyFrame,
  NosskeyError,
  createNosskeyClient,
} from "./nosskey-client";

const ORIGIN = "https://nosskey.app";

const setup = (options: { loaded?: boolean } = {}) => {
  let handler: ((data: unknown, origin: string) => void) | undefined;
  const posted: { message: unknown; origin: string }[] = [];
  const setVisible = vi.fn((_visible: boolean) => {});
  const frame: NosskeyFrame = {
    post: (message, origin) => {
      if (options.loaded === false) return false;
      posted.push({ message, origin });
      return true;
    },
    listen: (next) => {
      handler = next;
      return () => {
        handler = undefined;
      };
    },
    setVisible,
  };
  let id = 0;
  const client = createNosskeyClient({
    frame,
    createId: () => `req-${++id}`,
  });
  return {
    client,
    setVisible,
    posted,
    receive: (data: unknown, origin = ORIGIN) => handler?.(data, origin),
  };
};

describe("createNosskeyClient", () => {
  it("nosskey.app のオリジンへ依頼を送り、同じ id の返事で解決する", async () => {
    const base = setup();
    const pending = base.client.request("getPublicKey");
    expect(base.posted).toEqual([
      {
        message: {
          type: "nosskey:request",
          id: "req-1",
          method: "getPublicKey",
        },
        origin: ORIGIN,
      },
    ]);
    base.receive({ type: "nosskey:response", id: "req-1", result: "pk" });
    await expect(pending).resolves.toBe("pk");
  });

  it("別のオリジンからの返事は受け取らない", async () => {
    // 捕まえる変異: オリジンを確かめない（iframe を別のサイトへ遷移させれば署名を偽れる）
    vi.useFakeTimers();
    const base = setup();
    const pending = base.client.request("getPublicKey");
    base.receive(
      { type: "nosskey:response", id: "req-1", result: "forged" },
      "https://evil.example",
    );
    const rejected = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.runAllTimersAsync();
    await rejected;
    vi.useRealTimers();
  });

  it("断られたら、断った理由のコードで失敗させる", async () => {
    const base = setup();
    const pending = base.client.request("signEvent", { event: {} });
    base.receive({
      type: "nosskey:response",
      id: "req-1",
      error: { code: "USER_REJECTED", message: "rejected" },
    });
    await expect(pending).rejects.toEqual(
      new NosskeyError("USER_REJECTED", "rejected"),
    );
  });

  it("準備ができた合図で ready を解決し、見せる・隠すの合図を iframe へ伝える", async () => {
    const base = setup();
    base.receive({ type: "nosskey:ready" });
    await expect(base.client.ready).resolves.toBeUndefined();
    base.receive({ type: "nosskey:visibility", visible: true });
    expect(base.setVisible).toHaveBeenCalledWith(true);
  });

  it("iframe がまだ読み込まれていなければ、すぐ失敗させる", async () => {
    const base = setup({ loaded: false });
    await expect(base.client.request("getPublicKey")).rejects.toMatchObject({
      code: "NOT_READY",
    });
  });

  it("閉じたら、待っている依頼を失敗させる", async () => {
    const base = setup();
    const pending = base.client.request("getPublicKey");
    base.client.close();
    await expect(pending).rejects.toMatchObject({ code: "CLOSED" });
  });
});
