import { describe, expect, it } from "vite-plus/test";
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
  theme: { onChanged(handler: (theme: unknown) => void): unknown };
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
  it("head の先頭に CSP を置き、その直後に window.napplet を作るスクリプトを置く", () => {
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

  // NIP-5D: > connect-src 'none' … an opaque sandbox origin does not by itself prevent `fetch`
  it("napplet が外へ直に通信できない CSP にする", () => {
    expect(NAPPLET_CSP).toContain("connect-src 'none'");
    expect(NAPPLET_CSP).toContain("default-src 'none'");
  });
});

describe("nappletPrelude", () => {
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
});
