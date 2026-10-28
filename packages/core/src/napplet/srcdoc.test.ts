import { describe, expect, it, vi } from "vite-plus/test";
import { encodeNaddr } from "../nostr/nip19";
import { nappletPrelude } from "./prelude";
import { NAPPLET_CSP, prepareNappletSrcdoc } from "./srcdoc";

type Listener = (event: { source: unknown; data: unknown }) => void;

/** テストで呼ぶ分だけの `window.napplet` の形。 */
type TestNapplet = {
  shell: { supports(domain: string): boolean; ready(): Promise<unknown> };
  storage: { instance: { getItem(key: string): Promise<string | null> } };
  relay: {
    publish(event: unknown): Promise<unknown>;
    subscribe(
      filters: unknown,
      onEvent: (result: unknown) => void,
      onEose: () => void,
    ): { close(): void };
  };
  identity: { getPublicKey(): Promise<string> };
  resource: {
    bytes(url: string, options?: { signal?: AbortSignal }): Promise<Blob>;
  };
  theme: { onChanged(handler: (theme: unknown) => void): unknown };
  intent: {
    invoke(uri: string, options?: Record<string, unknown>): Promise<unknown>;
    open(uri: string, options?: Record<string, unknown>): Promise<unknown>;
    onDelivery(handler: (delivery: unknown) => void): unknown;
  };
  inc: {
    emit(topic: string, payload?: unknown): void;
    on(topic: string, handler: (event: unknown) => void): { close(): void };
  };
  outbox: {
    query(filters: unknown): Promise<unknown>;
    subscribe(filters: unknown): {
      on(kind: string, callback: (value: unknown) => void): void;
      close(): void;
    };
  };
};

/** iframe の中の window の代わり。親へ送ったものを `sent` に溜め、親からの返事を `deliver` で渡す。 */
const fakeNappletWindow = () => {
  const sent: Record<string, unknown>[] = [];
  const listeners: Listener[] = [];
  const parent = {
    postMessage: (message: Record<string, unknown>, target: string) => {
      expect(target).toBe("*");
      sent.push(message);
    },
  };
  const win = {
    parent,
    addEventListener: (_: string, listener: Listener) =>
      listeners.push(listener),
  } as unknown as Window & {
    napplet: TestNapplet;
  };
  const deliver = (data: unknown, source: unknown = parent) => {
    for (const listener of listeners) listener({ source, data });
  };
  return { win, sent, deliver };
};

const run = (domains: string[]) => {
  const napplet = fakeNappletWindow();
  // oxlint-disable-next-line no-implied-eval -- 本番でも文字列として iframe に入れるものを、そのまま動かして確かめる
  new Function("window", nappletPrelude(domains))(napplet.win);
  return napplet;
};

describe("prepareNappletSrcdoc", () => {
  // NIP-5D: > shells SHOULD inject a CSP `meta` element as the first element in `head`
  it("本体より先に CSP を置き、その直後に window.napplet を作るスクリプトを置く", () => {
    const srcdoc = prepareNappletSrcdoc(
      '<!doctype html><html><head lang="en"><script>app()</script></head></html>',
      ["relay"],
    );
    const head = srcdoc.indexOf('<head lang="en">') + '<head lang="en">'.length;
    expect(srcdoc.slice(head)).toMatch(
      /^<meta http-equiv="Content-Security-Policy" content="[^"]+"><script>\(function/,
    );
    expect(srcdoc).toContain(`content="${NAPPLET_CSP}"`);
    expect(srcdoc.indexOf("app()")).toBeGreaterThan(
      srcdoc.indexOf("installNapplet"),
    );
  });

  it("head の無い本体には head を作り、doctype より前には置かない", () => {
    const srcdoc = prepareNappletSrcdoc("<!DOCTYPE html><p>hi</p>", []);
    expect(srcdoc.startsWith("<!DOCTYPE html><head><meta")).toBe(true);
  });

  it("先頭の html と head の属性や間のコメントを残す", () => {
    const prefix =
      '<!doctype html><html lang="ja" data-text=">"><!-- <head> --><head id="app-head" data-text=">">';
    const srcdoc = prepareNappletSrcdoc(`${prefix}<title>app</title>`, []);
    expect(srcdoc.startsWith(`${prefix}<meta`)).toBe(true);
  });

  it("不正な属性の引用符を追って本体のスクリプトを飛ばさない", () => {
    const body = '<html "><script>app()</script>"><head>';
    const srcdoc = prepareNappletSrcdoc(body, []);
    expect(srcdoc.startsWith("<head><meta")).toBe(true);
    expect(srcdoc.endsWith(`</head>${body}`)).toBe(true);
  });

  it.each(["\u000b", "\u00a0", "\u2028", "\ufeff"])(
    "HTML の空白ではない文字をタグの区切りとみなさない: %j",
    (space) => {
      const body = `<html${space}data-x="x"><head>`;
      const srcdoc = prepareNappletSrcdoc(body, []);
      expect(srcdoc.startsWith("<head><meta")).toBe(true);
      expect(srcdoc.endsWith(`</head>${body}`)).toBe(true);
    },
  );

  it("巨大な属性列は保持の探索をやめ、本体より前に初期化を置く", () => {
    const body = `<head ${"a=a ".repeat(1_000_000)}><script>app()</script>`;
    const srcdoc = prepareNappletSrcdoc(body, []);
    expect(srcdoc.startsWith("<head><meta")).toBe(true);
    expect(srcdoc.endsWith(`</head>${body}`)).toBe(true);
  });

  it("巨大なコメント列でも初期化を差し込める", () => {
    const body = `${"<!-- -->".repeat(500_000)}<script>app()</script>`;
    const srcdoc = prepareNappletSrcdoc(body, []);
    expect(srcdoc.indexOf("<meta")).toBeLessThan(128 * 1024);
    expect(srcdoc.endsWith("<script>app()</script>")).toBe(true);
  });

  it.each([
    "<!-- <head> -->",
    '<script>const text = "<head>";</script>',
    "<template><head></head></template>",
  ])("本体にあるタグ風の文字列へ起動コードを差し込まない: %s", (body) => {
    const srcdoc = prepareNappletSrcdoc(`<!doctype html>${body}`, []);
    expect(srcdoc.startsWith("<!doctype html><head><meta")).toBe(true);
    expect(srcdoc.endsWith(`</head>${body}`)).toBe(true);
  });

  it("doctype の前にコメントがあっても描画モードを保つ", () => {
    const prefix = "<!-- document -- > -->\n<!DOCTYPE html>";
    const srcdoc = prepareNappletSrcdoc(`${prefix}<html lang="ja">`, []);
    expect(srcdoc.startsWith(`${prefix}<head><meta`)).toBe(true);
  });

  it.each(["<!-->", "<!--->"])(
    "ブラウザがすぐ閉じるコメントの後のスクリプトより先に初期化する: %s",
    (comment) => {
      const body = `${comment}<script>app()</script><!-- end --><head>`;
      const srcdoc = prepareNappletSrcdoc(body, []);
      expect(srcdoc.startsWith("<head><meta")).toBe(true);
      expect(srcdoc.endsWith(`</head>${body}`)).toBe(true);
    },
  );

  // NIP-5D: > connect-src 'none' … an opaque sandbox origin does not by itself prevent `fetch`
  it("napplet が外へ直に通信できない CSP にする", () => {
    expect(NAPPLET_CSP).toContain("connect-src 'none'");
    expect(NAPPLET_CSP).toContain("default-src 'none'");
  });
});

describe("nappletPrelude", () => {
  it("書き込みの確認が 30 秒を超えても、承認後の結果を返す", async () => {
    vi.useFakeTimers();
    try {
      const { win, sent, deliver } = run(["relay"]);
      const result = win.napplet.relay.publish({
        kind: 1,
        content: "hello",
        tags: [],
      });
      let settled = false;
      void result.then(
        () => (settled = true),
        () => (settled = true),
      );
      await vi.advanceTimersByTimeAsync(60_000);
      expect(settled).toBe(false);
      const event = { id: "written" };
      deliver({ type: "relay.publish.result", id: sent[0]?.id, event });
      await expect(result).resolves.toEqual(event);
    } finally {
      vi.useRealTimers();
    }
  });

  it("開く先を 30 秒より長く選んでいても、選んだ結果を返す", async () => {
    vi.useFakeTimers();
    try {
      const { win, sent, deliver } = run(["intent"]);
      const result = win.napplet.intent.open("napplet:profile/open");
      let settled = false;
      void result.then(
        () => (settled = true),
        () => (settled = true),
      );
      await vi.advanceTimersByTimeAsync(60_000);
      expect(settled).toBe(false);
      deliver({
        type: "intent.invoke.result",
        id: sent[0]?.id,
        result: { ok: true, handler: "streets" },
      });
      await expect(result).resolves.toEqual({ ok: true, handler: "streets" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("利用者の確認を待たない読み取りは 30 秒で時間切れにする", async () => {
    vi.useFakeTimers();
    try {
      const { win } = run(["identity"]);
      const result = win.napplet.identity.getPublicKey();
      const timedOut = expect(result).rejects.toThrow(
        "identity.getPublicKey timed out",
      );
      await vi.advanceTimersByTimeAsync(30_000);
      await timedOut;
    } finally {
      vi.useRealTimers();
    }
  });

  it("同じ URL の取得でも、中止した呼び出しだけを止める", async () => {
    const { win, sent, deliver } = run(["resource"]);
    const controller = new AbortController();
    const first = win.napplet.resource.bytes("https://example.invalid/avatar", {
      signal: controller.signal,
    });
    const aborted = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = win.napplet.resource.bytes("https://example.invalid/avatar");
    controller.abort();
    await aborted;
    const requests = sent.filter(
      (message) => message.type === "resource.bytes",
    );
    expect(requests).toHaveLength(2);
    expect(sent.at(-1)).toMatchObject({
      type: "resource.cancel",
      id: requests[0]?.id,
    });
    const blob = new Blob(["avatar"]);
    deliver({ type: "resource.bytes.result", id: requests[1]?.id, blob });
    await expect(second).resolves.toBe(blob);
  });

  it("中止した取得のタイマーを片付け、同じ URL をすぐに取り直せる", async () => {
    vi.useFakeTimers();
    try {
      const { win, sent, deliver } = run(["resource"]);
      const controller = new AbortController();
      const first = win.napplet.resource.bytes(
        "https://example.invalid/avatar",
        {
          signal: controller.signal,
        },
      );
      const aborted = expect(first).rejects.toMatchObject({
        name: "AbortError",
      });
      controller.abort();
      await aborted;
      expect(vi.getTimerCount()).toBe(0);
      const retried = win.napplet.resource.bytes(
        "https://example.invalid/avatar",
      );
      const requests = sent.filter(
        (message) => message.type === "resource.bytes",
      );
      expect(requests).toHaveLength(2);
      const blob = new Blob(["avatar"]);
      deliver({ type: "resource.bytes.result", id: requests[1]?.id, blob });
      await expect(retried).resolves.toBe(blob);
    } finally {
      vi.useRealTimers();
    }
  });

  it("取得が終わったら中止の監視を外し、後から中止を送らない", async () => {
    const { win, sent, deliver } = run(["resource"]);
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const work = win.napplet.resource.bytes("https://example.invalid/avatar", {
      signal: controller.signal,
    });
    const blob = new Blob(["avatar"]);
    deliver({ type: "resource.bytes.result", id: sent[0]?.id, blob });
    await expect(work).resolves.toBe(blob);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    controller.abort();
    expect(sent).toHaveLength(1);
  });

  it("中止の指定がない同じ URL の取得はまとめる", async () => {
    const { win, sent, deliver } = run(["resource"]);
    const first = win.napplet.resource.bytes("https://example.invalid/avatar");
    const second = win.napplet.resource.bytes("https://example.invalid/avatar");
    expect(sent).toHaveLength(1);
    const blob = new Blob(["avatar"]);
    deliver({ type: "resource.bytes.result", id: sent[0]?.id, blob });
    await expect(Promise.all([first, second])).resolves.toEqual([blob, blob]);
  });

  // NIP-5D: > The namespace MUST contain only the NAP domain objects the shell exposes
  it("渡した機能だけを window.napplet に生やす", () => {
    const { win } = run(["theme", "storage"]);
    expect(Object.keys(win.napplet).sort()).toEqual(["storage", "theme"]);
  });

  it("shell を渡したときは準備ができた合図を送り、shell.init の中身を ready で返す", async () => {
    const { win, sent, deliver } = run(["shell", "relay"]);
    expect(sent).toEqual([{ type: "shell.ready" }]);
    expect(win.napplet.shell.supports("relay")).toBe(true);
    expect(win.napplet.shell.supports("storage")).toBe(false);
    deliver({
      type: "shell.init",
      capabilities: { domains: ["shell", "relay"] },
      services: [],
    });
    await expect(win.napplet.shell.ready()).resolves.toEqual({
      capabilities: { domains: ["shell", "relay"] },
      services: [],
    });
  });

  it("要求に id を付けて送り、同じ id の結果で解決する", async () => {
    const { win, sent, deliver } = run(["storage"]);
    const value = win.napplet.storage.instance.getItem("draft");
    expect(sent[0]).toMatchObject({
      type: "storage.get",
      key: "draft",
      scope: "instance",
    });
    deliver({ type: "storage.get.result", id: sent[0]?.id, value: "hello" });
    await expect(value).resolves.toBe("hello");
  });

  it("結果に error があれば reject する", async () => {
    const { win, sent, deliver } = run(["relay"]);
    const published = win.napplet.relay.publish({
      kind: 1,
      content: "",
      tags: [],
    });
    deliver({
      type: "relay.publish.result",
      id: sent[0]?.id,
      ok: false,
      error: "unsupported",
    });
    await expect(published).rejects.toThrow("unsupported");
  });

  // NIP-5D: > Messages from unknown sources … MUST be silently dropped.
  it("親以外から届いた結果は受け取らない", async () => {
    const { win, sent, deliver } = run(["identity"]);
    const pubkey = win.napplet.identity.getPublicKey();
    deliver(
      { type: "identity.getPublicKey.result", id: sent[0]?.id, pubkey: "evil" },
      {},
    );
    deliver({
      type: "identity.getPublicKey.result",
      id: sent[0]?.id,
      pubkey: "abc",
    });
    await expect(pubkey).resolves.toBe("abc");
  });

  // @napplet/shim と同じく、subscribe はコールバックを引数で受け、subId で配り分ける。
  it("購読ごとにイベントと EOSE を配り、close で relay.close を送る", () => {
    const { win, sent, deliver } = run(["relay"]);
    const events: unknown[] = [];
    let eose = 0;
    const subscription = win.napplet.relay.subscribe(
      { kinds: [1] },
      (result: unknown) => events.push(result),
      () => (eose += 1),
    ) as { close: () => void };
    const request = sent[0] as { subId: string; filters: unknown };
    expect(request).toMatchObject({
      type: "relay.subscribe",
      filters: [{ kinds: [1] }],
    });
    deliver({
      type: "relay.event",
      subId: request.subId,
      result: { event: { id: "1" } },
    });
    deliver({
      type: "relay.event",
      subId: "other",
      result: { event: { id: "2" } },
    });
    deliver({ type: "relay.eose", subId: request.subId });
    expect(events).toEqual([{ event: { id: "1" } }]);
    expect(eose).toBe(1);
    subscription.close();
    expect(sent[1]).toMatchObject({
      type: "relay.close",
      subId: request.subId,
    });
  });

  // @napplet/shim の outbox は、結果の error を reject せず欄として返す。
  it("outbox.query は error があっても reject せず、結果の欄として返す", async () => {
    const { win, sent, deliver } = run(["outbox"]);
    const result = win.napplet.outbox.query({ kinds: [1] });
    deliver({
      type: "outbox.query.result",
      id: sent[0]?.id,
      events: [],
      error: "boom",
    });
    await expect(result).resolves.toEqual({ events: [], error: "boom" });
  });

  it("outbox.subscribe は on('event') に結果を渡し、close で outbox.close を送る", () => {
    const { win, sent, deliver } = run(["outbox"]);
    const results: unknown[] = [];
    const subscription = win.napplet.outbox.subscribe({ kinds: [1] });
    subscription.on("event", (result) => results.push(result));
    const subId = (sent[0] as { subId: string }).subId;
    deliver({ type: "outbox.event", subId, result: { event: { id: "1" } } });
    subscription.close();
    expect(results).toEqual([{ event: { id: "1" } }]);
    expect(sent[1]).toMatchObject({ type: "outbox.close", subId });
  });

  it("テーマが変わったら onChanged に渡す", () => {
    const { win, deliver } = run(["theme"]);
    const themes: unknown[] = [];
    win.napplet.theme.onChanged((theme: unknown) => themes.push(theme));
    deliver({
      type: "theme.changed",
      theme: { colors: { background: "#000" } },
    });
    expect(themes).toEqual([{ colors: { background: "#000" } }]);
  });

  it("window.napplet を napplet から書き換えられない", () => {
    const { win } = run(["theme"]);
    expect(() => {
      (win as unknown as { napplet: unknown }).napplet = {};
    }).toThrow();
    expect(Object.isFrozen(win.napplet)).toBe(true);
  });

  // NAP-INTENT: > 4. Each unique, percent-decoded `name=value` query pair becomes a text payload
  // > field. The binding MUST NOT coerce query values to boolean, number, or null.
  // > A `+` is a literal plus sign, not a space.
  it("intent の URI を、役割・依頼・慣習の名前と中身に分けて送る", () => {
    const { win, sent } = run(["intent"]);
    void win.napplet.intent.invoke("napplet:profile/open?pubkey=a%2Bb+c&n=1");
    expect(sent.at(-1)).toMatchObject({
      type: "intent.invoke",
      request: {
        archetype: "profile",
        action: "open",
        convention: "napplet:profile/open",
        payload: { pubkey: "a+b+c", n: "1" },
      },
    });
  });

  // > A URI with ... malformed percent-encoding, a repeated query name, or an explicit payload
  // > alongside query parameters MUST be rejected before invocation.
  it("読めない URI は送らずに断る", () => {
    const { win, sent } = run(["intent"]);
    for (const [uri, options] of [
      ["napplet:profile/open?pubkey=%zz", undefined],
      ["napplet:profile/open?a=1&a=2", undefined],
      ["napplet:profile/open?a=1", { payload: { a: "1" } }],
      ["profile/open", undefined],
    ] as const) {
      expect(() => win.napplet.intent.invoke(uri, options)).toThrow();
    }
    expect(() => win.napplet.intent.open("napplet:profile/edit")).toThrow();
    expect(sent).toEqual([]);
  });

  // > Absent `handler` ... The hint ... `IntentHandlerHint` accepts kind `35129` only.
  it("URI の断片の naddr を、勧める受け手として送る", () => {
    const { win, sent } = run(["intent"]);
    const naddr = encodeNaddr({
      identifier: "map",
      pubkey: "c".repeat(64),
      eventKind: 35129,
      relays: ["wss://relay.example/"],
    });
    void win.napplet.intent.open(`napplet:map/open#${naddr}`);
    expect(sent.at(-1)).toMatchObject({
      request: {
        convention: "napplet:map/open",
        handlerHint: {
          address: `35129:${"c".repeat(64)}:map`,
          relays: ["wss://relay.example/"],
        },
      },
    });
  });

  // > The runtime-provided binding MUST retain an incoming delivery until an `onDelivery`
  // > handler is registered.
  it("onDelivery を登録する前に届いた依頼を取っておく", () => {
    const { win, deliver } = run(["intent"]);
    deliver({ type: "intent.deliver", delivery: { payload: 1 } });
    const received: unknown[] = [];
    win.napplet.intent.onDelivery((delivery) => received.push(delivery));
    deliver({ type: "intent.deliver", delivery: { payload: 2 } });
    expect(received).toEqual([{ payload: 1 }, { payload: 2 }]);
  });

  // NAP-INC: > When `emit` receives a convention URI with a query, the runtime MUST:
  // > 1. Remove the query from the routed topic.
  // > 2. Percent-decode each unique `name=value` pair as text.
  it("inc.emit は URI の問い合わせを中身に移して送る", () => {
    const { win, sent } = run(["inc"]);
    win.napplet.inc.emit("napplet:profile/open?pubkey=abc123...");
    expect(sent).toEqual([
      {
        type: "inc.emit",
        topic: "napplet:profile/open",
        payload: { pubkey: "abc123..." },
      },
    ]);
  });

  // NAP-INTENT が INC から分かれる前の napplet は、依頼を inc.on の話題で受ける。
  it("onDelivery の無い napplet には、依頼を同じ話題の inc.on へ渡す", () => {
    const { win, deliver, sent } = run(["intent", "inc"]);
    const delivery = {
      sender: "streets",
      archetype: "article",
      action: "open",
      convention: "napplet:article/open",
      payload: { naddr: "naddr1..." },
    };
    // 起動の途中で届き、inc.on を登録するまで待つ。
    deliver({ type: "intent.deliver", delivery });
    const received: unknown[] = [];
    win.napplet.inc.on("napplet:article/open", (event) => received.push(event));
    expect(sent).toMatchObject([
      { type: "inc.subscribe", topic: "napplet:article/open" },
    ]);
    deliver({ type: "intent.deliver", delivery });
    const event = {
      topic: "napplet:article/open",
      sender: "streets",
      payload: { naddr: "naddr1..." },
    };
    expect(received).toEqual([event, event]);
  });

  it("onDelivery があれば、依頼は inc.on へ渡さない", () => {
    const { win, deliver } = run(["intent", "inc"]);
    const viaInc: unknown[] = [];
    const viaIntent: unknown[] = [];
    win.napplet.inc.on("napplet:note/open", (event) => viaInc.push(event));
    win.napplet.intent.onDelivery((delivery) => viaIntent.push(delivery));
    deliver({
      type: "intent.deliver",
      delivery: { convention: "napplet:note/open", payload: 1 },
    });
    expect(viaIntent).toHaveLength(1);
    expect(viaInc).toEqual([]);
  });

  // NAP-KEYS の Smart Forwarding:
  // > 1. If the event target is a text input ..., do not forward.
  // > 2. If the key is a bare modifier ..., do not forward.
  // > 6. If the combo does not match: Send `keys.forward` to the shell.
  it("入力欄の外で押したキーだけを Streets へ送る", () => {
    const napplet = fakeNappletWindow();
    const keydown: ((event: unknown) => void)[] = [];
    const win = napplet.win as unknown as {
      addEventListener: (
        type: string,
        listener: (event: unknown) => void,
      ) => void;
    };
    const original = win.addEventListener;
    win.addEventListener = (type, listener) => {
      if (type === "keydown") keydown.push(listener);
      else original(type, listener);
    };
    // oxlint-disable-next-line no-implied-eval -- 本番でも文字列として iframe に入れるものを、そのまま動かして確かめる
    new Function("window", nappletPrelude(["keys"]))(napplet.win);
    const press = (key: string, target: unknown = { closest: () => null }) =>
      keydown[0]?.({
        key,
        code: `Key${key.toUpperCase()}`,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        isComposing: false,
        target,
        preventDefault: () => {},
      });
    press("j");
    press("Shift");
    press("k", { closest: () => ({}) });
    expect(napplet.sent).toEqual([
      {
        type: "keys.forward",
        key: "j",
        code: "KeyJ",
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
      },
    ]);
  });

  // 前の版の書き方: open(archetype, payload, { convention })（Noris・Chronofeed が使う）。
  it("前の版の open(役割, 中身, { convention }) も、URI の形に直して送る", () => {
    const { win, sent } = run(["intent"]);
    void (
      win.napplet.intent.open as unknown as (
        archetype: string,
        payload: unknown,
        options: unknown,
      ) => Promise<unknown>
    )("article", { pubkey: "abc" }, { convention: "napplet:article/author" });
    expect(sent.at(-1)).toMatchObject({
      type: "intent.invoke",
      request: {
        archetype: "article",
        action: "author",
        convention: "napplet:article/author",
        payload: { pubkey: "abc" },
      },
    });
  });
});
