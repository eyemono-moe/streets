import { encodeBech32 } from "@streets/core/nostr/nip19";
import { FakeRelayConnection } from "@streets/core/relay/fake-relay-connection";
import { createFakeSigner } from "@streets/core/signer/fake-signer";
import { describe, expect, it, vi } from "vite-plus/test";
import { entityPage } from "./entity-page";

const ORIGIN = "https://streets.example";
const BOT = { "user-agent": "Twitterbot/1.0" };
const HUMAN = { "user-agent": "Mozilla/5.0 Chrome/140.0 Safari/537.36" };
const APP_HTML =
  '<html><head><title>Streets</title></head><body><div id="root"></div></body></html>';

const signer = createFakeSigner(new Uint8Array(32).fill(9));

/** 繋いだらすぐ、持っているイベントのうち条件に合うものを返して終えるリレー。 */
const answering =
  (events: Awaited<ReturnType<typeof signer.signEvent>>[]) => (url: string) => {
    const connection = new FakeRelayConnection(url);
    const subscribe = connection.subscribe.bind(connection);
    connection.subscribe = (filters, handlers) => {
      const subscription = subscribe(filters, handlers);
      queueMicrotask(() => {
        for (const event of events) handlers.onEvent(event);
        handlers.onEose();
      });
      return subscription;
    };
    return connection;
  };

const assets = () =>
  ({ fetch: vi.fn(async () => new Response(APP_HTML)) }) as unknown as {
    fetch: typeof fetch;
  };

describe("entityPage", () => {
  it("ボットには、投稿の中身を入れたカードを返す", async () => {
    const note = await signer.signEvent({
      kind: 1,
      pubkey: "",
      content: "こんにちは",
      tags: [],
      created_at: 1,
    });
    const response = await entityPage(
      new Request(`${ORIGIN}/${encodeBech32("note", note.id)}`, {
        headers: BOT,
      }),
      { assets: assets(), connect: answering([note]) },
    );
    const html = await response.text();
    expect(html).toContain(
      '<meta property="og:description" content="こんにちは" />',
    );
  });

  it("人には、リレーを待たずにアプリをそのまま返す", async () => {
    const connect = vi.fn();
    const files = assets();
    const response = await entityPage(
      new Request(`${ORIGIN}/${encodeBech32("note", "e".repeat(64))}`, {
        headers: HUMAN,
      }),
      { assets: files, connect },
    );
    expect(await response.text()).toBe(APP_HTML);
    expect(connect).not.toHaveBeenCalled();
  });

  it("見つからなければ、アプリの既定のカードのまま返す", async () => {
    const response = await entityPage(
      new Request(`${ORIGIN}/${encodeBech32("note", "e".repeat(64))}`, {
        headers: BOT,
      }),
      { assets: assets(), connect: answering([]) },
    );
    expect(await response.text()).toBe(APP_HTML);
    expect(response.headers.get("cache-control")).toBe("public, max-age=600");
  });

  it("作ったカードは覚えておき、次はリレーへ聞かない", async () => {
    const store = new Map<string, Response>();
    // 鍵は文字列で渡している（entity-page.ts）。
    const cache = {
      match: async (key: string) => store.get(key)?.clone(),
      put: async (key: string, value: Response) => {
        store.set(key, value);
      },
    } as unknown as Pick<Cache, "match" | "put">;
    const note = await signer.signEvent({
      kind: 1,
      pubkey: "",
      content: "覚える",
      tags: [],
      created_at: 1,
    });
    const url = `${ORIGIN}/${encodeBech32("note", note.id)}`;
    await entityPage(new Request(url, { headers: BOT }), {
      assets: assets(),
      connect: answering([note]),
      cache,
    });
    const connect = vi.fn();
    const again = await entityPage(new Request(url, { headers: BOT }), {
      assets: assets(),
      connect,
      cache,
    });
    expect(await again.text()).toContain("覚える");
    expect(connect).not.toHaveBeenCalled();
  });
});
