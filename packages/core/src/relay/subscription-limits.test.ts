import { describe, expect, it, vi } from "vite-plus/test";
import { createSubscriptionLimits } from "./subscription-limits";

describe("createSubscriptionLimits", () => {
  it("取れるまでは枠なしで、取れたら max_subscriptions を返し、取るのは URL ごとに一度だけ", async () => {
    const fetcher = vi.fn(async () => ({
      limitation: { maxSubscriptions: 20 },
    }));
    const limitOf = createSubscriptionLimits(fetcher);

    expect(limitOf("wss://a/")).toBeUndefined();
    await Promise.resolve();
    expect(limitOf("wss://a/")).toBe(20);
    expect(limitOf("wss://a/")).toBe(20);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("上限が書いていなければ null（枠なし）、取れなかったリレーは undefined のまま", async () => {
    const limitOf = createSubscriptionLimits(async (url) =>
      url === "wss://silent/" ? undefined : { name: "no limits" },
    );

    limitOf("wss://silent/");
    limitOf("wss://plain/");
    await Promise.resolve();

    expect(limitOf("wss://silent/")).toBeUndefined();
    expect(limitOf("wss://plain/")).toBeNull();
  });
});
