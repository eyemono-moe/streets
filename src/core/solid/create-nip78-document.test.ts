import { createRoot, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { createFakeClock } from "../read/fake-clock";
import type { RelayUrl } from "../relay/relay-connection";
import type { Signer } from "../signer/signer";
import type { WriteResult } from "../write/writer";
import {
  NIP78_KIND,
  type Nip78Document,
  type Nip78DocumentDefinition,
  createNip78Document,
} from "./create-nip78-document";

type Value = { text: string };
const PUBKEY_A = "a".repeat(64);
const PUBKEY_B = "b".repeat(64);

const definition = (
  identifier = "streets/test",
): Nip78DocumentDefinition<Value> => ({
  identifier,
  cacheKey: (pubkey) => `${identifier}:${pubkey}`,
  initial: () => ({ text: "default" }),
  serialize: (value) => JSON.stringify(value),
  parse(raw) {
    try {
      const value: unknown = JSON.parse(raw);
      return typeof value === "object" &&
        value !== null &&
        "text" in value &&
        typeof value.text === "string"
        ? { text: value.text }
        : undefined;
    } catch {
      return undefined;
    }
  },
  equals: (left, right) => left.text === right.text,
  migrateLegacy(raw) {
    return this.parse(raw);
  },
});

const event = (
  value: Value,
  options: { id?: string; createdAt?: number; identifier?: string } = {},
): NostrEvent => ({
  id: options.id ?? "1".repeat(64),
  pubkey: PUBKEY_A,
  created_at: options.createdAt ?? 100,
  kind: NIP78_KIND,
  tags: [["d", options.identifier ?? "streets/test"]],
  content: `enc:${JSON.stringify(value)}`,
  sig: "2".repeat(128),
});

const memoryStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const createHarness = (options: {
  initialStorage?: Record<string, string>;
  initialRemote?: NostrEvent;
  fetchLatest?: () => Promise<NostrEvent | undefined>;
  storage?: ReturnType<typeof memoryStorage>;
  identifier?: string;
}) => {
  const clock = createFakeClock();
  const storage = options.storage ?? memoryStorage(options.initialStorage);
  const [pubkey, setPubkey] = createSignal<string | undefined>(PUBKEY_A);
  const [settled, setSettled] = createSignal(true);
  let remote = options.initialRemote;
  let eventCounter = 3;
  const replacements: { kind: number; identifier: string | undefined }[] = [];
  const encrypt = vi.fn(
    async (_peer: string, plaintext: string) => `enc:${plaintext}`,
  );
  const decrypt = vi.fn(async (_peer: string, ciphertext: string) => {
    if (!ciphertext.startsWith("enc:")) throw new Error("invalid cipher");
    return ciphertext.slice(4);
  });
  const signer: Signer = {
    getPublicKey: async () => pubkey() ?? "",
    signEvent: async () => {
      throw new Error("このテストでは Writer adapter が署名を隠す");
    },
    nip44: { encrypt, decrypt },
  };
  const writer = {
    async replace(
      kind: number,
      identifier: string | undefined,
      mutate: Parameters<
        Parameters<typeof createNip78Document<Value>>[0]["writer"]["replace"]
      >[2],
    ): Promise<WriteResult> {
      replacements.push({ kind, identifier });
      const previous = remote;
      const draft = await mutate(previous);
      const next: NostrEvent = {
        ...draft,
        id: String(eventCounter++).repeat(64),
        pubkey: pubkey() ?? PUBKEY_A,
        created_at: (previous?.created_at ?? 100) + 1,
        sig: "f".repeat(128),
      };
      remote = next;
      return {
        event: next,
        replaced: previous,
        accepted: ["wss://relay/" as RelayUrl],
        rejected: [],
      };
    },
  };

  let document!: Nip78Document<Value>;
  let dispose!: () => void;
  createRoot((rootDispose) => {
    dispose = rootDispose;
    document = createNip78Document({
      definition: definition(options.identifier),
      pubkey,
      routingSettled: settled,
      signer,
      writer,
      fetchLatest: options.fetchLatest ?? (async () => remote),
      storage,
      scheduler: clock,
    });
  });

  return {
    clock,
    storage,
    document,
    dispose,
    setPubkey,
    setSettled,
    replacements,
    encrypt,
    decrypt,
    get remote() {
      return remote;
    },
    setRemote(next: NostrEvent | undefined) {
      remote = next;
    },
  };
};

const waitForState = async (
  document: Nip78Document<Value>,
  phase: ReturnType<Nip78Document<Value>["state"]>["phase"],
) => {
  await vi.waitFor(() => expect(document.state().phase).toBe(phase));
};

describe("createNip78Document", () => {
  it("旧cacheを即時表示し、remote待ちの間も値を失わない", async () => {
    const pending = deferred<NostrEvent | undefined>();
    const key = definition().cacheKey(PUBKEY_A);
    const harness = createHarness({
      initialStorage: { [key]: JSON.stringify({ text: "legacy" }) },
      fetchLatest: () => pending.promise,
    });

    // 捕まえる変異: remote の完了まで local cache を読まない。起動直後の
    // カラムが空になり、local-first の意味が失われる。
    await vi.waitFor(() =>
      expect(harness.document.value()).toEqual({ text: "legacy" }),
    );
    expect(harness.document.state()).toEqual({
      phase: "loading",
      cached: true,
    });

    pending.resolve(undefined);
    await waitForState(harness.document, "ready");
    harness.dispose();
  });

  it("cacheが無い新端末ではremote確定前に既定値を出さない", async () => {
    const pending = deferred<NostrEvent | undefined>();
    const harness = createHarness({ fetchLatest: () => pending.promise });

    // 捕まえる変異: activate 時点で initial() を表示する。後からremoteが
    // 届くとデッキ全体が差し替わり、間にした操作も競合する。
    await vi.waitFor(() =>
      expect(harness.document.state()).toEqual({
        phase: "loading",
        cached: false,
      }),
    );
    expect(harness.document.value()).toBeUndefined();

    pending.resolve(undefined);
    await vi.waitFor(() =>
      expect(harness.document.value()).toEqual({ text: "default" }),
    );
    expect(harness.document.state()).toMatchObject({
      phase: "ready",
      sync: "pending",
    });
    harness.dispose();
  });

  it("remoteを自分自身宛てに復号して復元する", async () => {
    const remote = event({ text: "remote" });
    const harness = createHarness({ initialRemote: remote });

    await vi.waitFor(() =>
      expect(harness.document.value()).toEqual({ text: "remote" }),
    );
    // 捕まえる変異: peer にremote signer等の別鍵を渡す。
    expect(harness.decrypt).toHaveBeenCalledWith(PUBKEY_A, remote.content);
    expect(harness.document.state()).toEqual({
      phase: "ready",
      sync: "synced",
      remoteCreatedAt: 100,
    });
    harness.dispose();
  });

  it("2秒内の複数変更を最後のsnapshot 1回で保存する", async () => {
    const harness = createHarness({
      initialRemote: event({ text: "base" }),
    });
    await waitForState(harness.document, "ready");

    harness.document.update(() => ({ text: "one" }));
    harness.document.update(() => ({ text: "two" }));
    harness.document.update(() => ({ text: "three" }));
    expect(harness.replacements).toHaveLength(0);
    harness.clock.advance(1_999);
    expect(harness.replacements).toHaveLength(0);
    harness.clock.advance(1);

    await vi.waitFor(() => expect(harness.replacements).toHaveLength(1));
    await vi.waitFor(() =>
      expect(harness.document.state()).toMatchObject({
        phase: "ready",
        sync: "synced",
      }),
    );
    // 捕まえる変異: 最初の変更をsnapshotして後続を落とす。
    expect(harness.encrypt).toHaveBeenLastCalledWith(
      PUBKEY_A,
      JSON.stringify({ text: "three" }),
    );
    expect(harness.replacements).toEqual([
      { kind: NIP78_KIND, identifier: "streets/test" },
    ]);
    harness.dispose();
  });

  it("dirty localと別のremote版があれば自動上書きせず競合にする", async () => {
    const key = definition().cacheKey(PUBKEY_A);
    const localCache = JSON.stringify({
      cacheVersion: 1,
      serialized: JSON.stringify({ text: "local" }),
      dirty: true,
      remote: { id: "1".repeat(64), createdAt: 90 },
    });
    const harness = createHarness({
      initialStorage: { [key]: localCache },
      initialRemote: event(
        { text: "remote" },
        { id: "2".repeat(64), createdAt: 100 },
      ),
    });

    await waitForState(harness.document, "conflict");
    // 捕まえる変異: dirtyを無視してremoteを採用する。未送信localが消える。
    expect(harness.document.value()).toEqual({ text: "local" });
    expect(harness.replacements).toHaveLength(0);

    harness.document.useRemote();
    expect(harness.document.value()).toEqual({ text: "remote" });
    expect(harness.document.state()).toMatchObject({
      phase: "ready",
      sync: "synced",
    });
    harness.dispose();
  });

  it("競合でlocalを選ぶと確認済みremoteをbaseにして保存する", async () => {
    const key = definition().cacheKey(PUBKEY_A);
    const harness = createHarness({
      initialStorage: {
        [key]: JSON.stringify({
          cacheVersion: 1,
          serialized: JSON.stringify({ text: "local" }),
          dirty: true,
          remote: { id: "1".repeat(64), createdAt: 90 },
        }),
      },
      initialRemote: event(
        { text: "remote" },
        { id: "2".repeat(64), createdAt: 100 },
      ),
    });
    await waitForState(harness.document, "conflict");

    await harness.document.keepLocal();

    // 捕まえる変異: 古いbase idのまま再試行し、同じ競合を繰り返す。
    expect(harness.document.value()).toEqual({ text: "local" });
    expect(harness.document.state()).toMatchObject({
      phase: "ready",
      sync: "synced",
    });
    expect(harness.remote?.content).toBe(
      `enc:${JSON.stringify({ text: "local" })}`,
    );
    harness.dispose();
  });

  it("保存直前にremoteが変われば暗号化前に競合へ止める", async () => {
    const harness = createHarness({
      initialRemote: event(
        { text: "base" },
        { id: "1".repeat(64), createdAt: 100 },
      ),
    });
    await waitForState(harness.document, "ready");
    harness.document.update(() => ({ text: "local" }));
    harness.setRemote(
      event({ text: "other device" }, { id: "2".repeat(64), createdAt: 101 }),
    );
    harness.encrypt.mockClear();

    harness.clock.advance(2_000);
    await waitForState(harness.document, "conflict");

    // 捕まえる変異: base id の比較を暗号化・署名後へ移す。
    expect(harness.encrypt).not.toHaveBeenCalled();
    expect(harness.document.value()).toEqual({ text: "local" });
    harness.dispose();
  });

  it("アカウント切替後に古い取得結果を反映しない", async () => {
    const pendingA = deferred<NostrEvent | undefined>();
    const remoteB = { ...event({ text: "B" }), pubkey: PUBKEY_B };
    const fetchLatest = vi.fn(async (_kind, _identifier, pubkey) =>
      pubkey === PUBKEY_A ? pendingA.promise : remoteB,
    );
    const harness = createHarness({
      fetchLatest: () => fetchLatest(NIP78_KIND, "streets/test", PUBKEY_A),
    });
    // harnessの固定adapterを、切替を観測する形へ差し替えるため別rootで作る。
    harness.dispose();

    const clock = createFakeClock();
    const storage = memoryStorage();
    const [pubkey, setPubkey] = createSignal<string | undefined>(PUBKEY_A);
    let document!: Nip78Document<Value>;
    let dispose!: () => void;
    createRoot((rootDispose) => {
      dispose = rootDispose;
      document = createNip78Document({
        definition: definition(),
        pubkey,
        routingSettled: () => true,
        signer: {
          getPublicKey: async () => pubkey() ?? "",
          signEvent: async () => {
            throw new Error("unused");
          },
          nip44: {
            encrypt: async (_peer, raw) => `enc:${raw}`,
            decrypt: async (_peer, raw) => raw.slice(4),
          },
        },
        writer: {
          replace: async () => {
            throw new Error("unused");
          },
        },
        fetchLatest: async (_kind, _identifier, account) =>
          account === PUBKEY_A ? pendingA.promise : remoteB,
        storage,
        scheduler: clock,
      });
    });

    setPubkey(PUBKEY_B);
    await vi.waitFor(() => expect(document.value()).toEqual({ text: "B" }));
    pendingA.resolve(event({ text: "late A" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 捕まえる変異: generation guardを外す。Aの遅い復号結果がBへ出る。
    expect(document.value()).toEqual({ text: "B" });
    dispose();
  });

  it("別identifierのdocumentはcacheとremoteを共有しない", async () => {
    const storage = memoryStorage();
    const first = createHarness({
      storage,
      identifier: "streets/first",
      initialRemote: event({ text: "first" }, { identifier: "streets/first" }),
    });
    const second = createHarness({
      storage,
      identifier: "streets/second",
      initialRemote: event(
        { text: "second" },
        { identifier: "streets/second", id: "4".repeat(64) },
      ),
    });

    await vi.waitFor(() =>
      expect(first.document.value()).toEqual({ text: "first" }),
    );
    await vi.waitFor(() =>
      expect(second.document.value()).toEqual({ text: "second" }),
    );
    first.document.update(() => ({ text: "changed first" }));

    // 捕まえる変異: cache keyや状態をkindだけで共有する。
    expect(second.document.value()).toEqual({ text: "second" });
    expect(storage.values.has(`streets/first:${PUBKEY_A}`)).toBe(true);
    expect(storage.values.has(`streets/second:${PUBKEY_A}`)).toBe(true);
    first.dispose();
    second.dispose();
  });

  it("localStorage失敗でもmemoryの変更を巻き戻さない", async () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("quota");
    };
    const harness = createHarness({
      storage,
      initialRemote: event({ text: "base" }),
    });
    await vi.waitFor(() =>
      expect(harness.document.value()).toEqual({ text: "base" }),
    );

    harness.document.update(() => ({ text: "still visible" }));

    // 捕まえる変異: setItemしてからsetValueする。例外で画面更新も止まる。
    expect(harness.document.value()).toEqual({ text: "still visible" });
    expect(harness.document.state()).toMatchObject({ phase: "error" });
    harness.dispose();
  });
});
