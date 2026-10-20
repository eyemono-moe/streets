/*
 * napplet の中で `window.napplet` を作るスクリプト。ランチャーが srcdoc の先頭に差し込む。
 *
 * > Shells MUST inject `window.napplet` before any napplet script runs.
 * > The namespace MUST contain only the NAP domain objects the shell exposes to that napplet.
 *
 * 呼び方の形は、napplet を作る側が使う `@napplet/shim`（napplet/web、2026-10）に合わせる。
 * 仕様の文章と食い違うところ（`relay.subscribe` がコールバックを引数で受けるなど）は、
 * 実際に配られている napplet が SDK の形で呼ぶので、SDK に従う。
 */

type Message = { type: string; [key: string]: unknown };
type Handler = (message: Message) => void;

/**
 * 文字列にして iframe の中で動かすので、外の変数・import・ヘルパーに一切触れない。
 * 触れると、ビルドで名前が変わった先が iframe の中に無く、napplet が起動しない。
 */
function installNapplet(domains: readonly string[]): void {
  const parent = window.parent;
  const post = (message: Message) => parent.postMessage(message, "*");
  let counter = 0;
  const newId = () => `${Date.now().toString(36)}-${(counter += 1)}`;
  type Pending = {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    pick: (message: Message) => unknown;
    /** NAP-OUTBOX の結果は `error` を欄として返し、reject しない（@napplet/shim と同じ）。 */
    rejectOnError: boolean;
    timer: ReturnType<typeof setTimeout>;
  };
  const pending = new Map<string, Pending>();
  const pushes = new Map<string, Set<Handler>>();
  const subscriptions = new Map<string, Handler>();

  window.addEventListener("message", (event) => {
    if (event.source !== parent) return;
    const message = event.data as Message | null;
    if (typeof message !== "object" || message === null) return;
    if (typeof message.type !== "string") return;
    if (typeof message.subId === "string") {
      subscriptions.get(message.subId)?.(message);
      return;
    }
    // NAP-RESOURCE は失敗を `<type>.error` という別の種類で返す。
    if (typeof message.id === "string" && message.type.endsWith(".error")) {
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      clearTimeout(waiting.timer);
      const detail =
        typeof message.message === "string" ? `: ${message.message}` : "";
      waiting.reject(new Error(`${String(message.error)}${detail}`));
      return;
    }
    if (typeof message.id === "string" && message.type.endsWith(".result")) {
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      clearTimeout(waiting.timer);
      if (waiting.rejectOnError && typeof message.error === "string") {
        waiting.reject(new Error(message.error));
      } else {
        waiting.resolve(waiting.pick(message));
      }
      return;
    }
    for (const handler of pushes.get(message.type) ?? []) handler(message);
  });

  const request = (
    type: string,
    payload: Record<string, unknown>,
    pick: (message: Message) => unknown,
    rejectOnError = true,
    id = newId(),
  ): Promise<never> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`${type} timed out`));
      }, 30_000);
      pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        pick,
        rejectOnError,
        timer,
      });
      post({ ...payload, type, id });
    });
  const onPush = (type: string, handler: Handler) => {
    const handlers = pushes.get(type) ?? new Set<Handler>();
    handlers.add(handler);
    pushes.set(type, handlers);
    return { close: () => handlers.delete(handler) };
  };

  const napplet: Record<string, unknown> = {};
  const exposed = new Set(domains);

  if (exposed.has("shell")) {
    type Environment = {
      capabilities: { domains: string[] };
      services: string[];
    };
    let environment: Environment | undefined;
    const waiting = new Set<(environment: Environment) => void>();
    onPush("shell.init", (message) => {
      if (environment) return;
      const capabilities = message.capabilities as
        | { domains?: unknown }
        | undefined;
      environment = {
        capabilities: {
          domains: Array.isArray(capabilities?.domains)
            ? (capabilities.domains as string[])
            : [],
        },
        services: Array.isArray(message.services)
          ? (message.services as string[])
          : [],
      };
      const ready = environment;
      for (const callback of waiting) callback(ready);
      waiting.clear();
    });
    napplet.shell = {
      supports: (domain: string) =>
        Object.prototype.hasOwnProperty.call(napplet, domain) &&
        typeof napplet[domain] === "object",
      get services() {
        return environment?.services ?? [];
      },
      ready: () =>
        environment
          ? Promise.resolve(environment)
          : new Promise((resolve) => waiting.add(resolve)),
      onReady: (handler: (environment: Environment) => void) => {
        if (environment) handler(environment);
        else waiting.add(handler);
        return { close: () => waiting.delete(handler) };
      },
    };
  }

  if (exposed.has("theme")) {
    napplet.theme = {
      get: () => request("theme.get", {}, (message) => message.theme),
      onChanged: (handler: (theme: unknown) => void) =>
        onPush("theme.changed", (message) => handler(message.theme)),
    };
  }

  if (exposed.has("identity")) {
    const query = (action: string, field: string, payload = {}) =>
      request(`identity.${action}`, payload, (message) => message[field]);
    napplet.identity = {
      getPublicKey: () => query("getPublicKey", "pubkey"),
      onChanged: (handler: (pubkey: string) => void) =>
        onPush("identity.changed", (message) =>
          handler(message.pubkey as string),
        ),
      getRelays: () => query("getRelays", "relays"),
      getProfile: () =>
        request(
          "identity.getProfile",
          {},
          (message) => message.profile ?? null,
        ),
      getFollows: () => query("getFollows", "pubkeys"),
      getList: (listType: string) => query("getList", "entries", { listType }),
      getZaps: () => query("getZaps", "zaps"),
      getMutes: () => query("getMutes", "pubkeys"),
      getBlocked: () => query("getBlocked", "pubkeys"),
      getBadges: () => query("getBadges", "badges"),
    };
  }

  if (exposed.has("storage")) {
    const scoped = (scope: "shared" | "instance") => {
      const payload = scope === "instance" ? { scope } : {};
      return {
        getItem: (key: string) =>
          request(
            "storage.get",
            { ...payload, key },
            (message) => message.value ?? null,
          ),
        setItem: (key: string, value: string) =>
          request("storage.set", { ...payload, key, value }, () => undefined),
        removeItem: (key: string) =>
          request("storage.remove", { ...payload, key }, () => undefined),
        keys: () =>
          request("storage.keys", payload, (message) => message.keys ?? []),
      };
    };
    napplet.storage = { ...scoped("shared"), instance: scoped("instance") };
  }

  if (exposed.has("relay")) {
    const asList = (filters: unknown) =>
      Array.isArray(filters) ? filters : [filters];
    napplet.relay = {
      subscribe: (
        filters: unknown,
        onEvent: (result: unknown) => void,
        onEose?: () => void,
        options?: { relay?: string },
      ) => {
        const subId = newId();
        subscriptions.set(subId, (message) => {
          if (message.type === "relay.event") onEvent(message.result);
          else if (message.type === "relay.eose") onEose?.();
          else if (message.type === "relay.closed") subscriptions.delete(subId);
        });
        post({
          type: "relay.subscribe",
          id: newId(),
          subId,
          filters: asList(filters),
          ...(options?.relay ? { relay: options.relay } : {}),
        });
        return {
          close: () => {
            if (!subscriptions.delete(subId)) return;
            post({ type: "relay.close", id: newId(), subId });
          },
        };
      },
      query: (filters: unknown) =>
        request("relay.query", { filters: asList(filters) }, (message) =>
          Array.isArray(message.events) ? message.events : [],
        ),
      publish: (event: unknown) =>
        request("relay.publish", { event }, (message) => message.event),
      publishEncrypted: (
        event: unknown,
        recipient: string,
        encryption: "nip44" | "nip04" = "nip44",
      ) =>
        request(
          "relay.publishEncrypted",
          { event, recipient, encryption },
          (message) => message.event,
        ),
    };
  }

  if (exposed.has("outbox")) {
    const withOptions = (options: unknown) =>
      options === undefined ? {} : { options };
    const fields =
      (...names: string[]) =>
      (message: Message) =>
        Object.fromEntries(
          names.flatMap((name) =>
            message[name] === undefined ? [] : [[name, message[name]]],
          ),
        );
    napplet.outbox = {
      getEvent: (eventId: string, options?: unknown) =>
        request(
          "outbox.getEvent",
          { eventId, ...withOptions(options) },
          fields("result", "incomplete", "error"),
          false,
        ),
      query: (filters: unknown, options?: unknown) =>
        request(
          "outbox.query",
          { filters, ...withOptions(options) },
          (message) => ({
            ...fields("incomplete", "error")(message),
            events: Array.isArray(message.events) ? message.events : [],
          }),
          false,
        ),
      subscribe: (filters: unknown, options?: unknown) => {
        const subId = newId();
        const onEvent = new Set<(result: unknown) => void>();
        const onClosed = new Set<(reason?: string) => void>();
        subscriptions.set(subId, (message) => {
          if (message.type === "outbox.event") {
            for (const callback of onEvent) callback(message.result);
          } else if (message.type === "outbox.closed") {
            subscriptions.delete(subId);
            for (const callback of onClosed) {
              callback(message.reason as string | undefined);
            }
          }
        });
        post({
          type: "outbox.subscribe",
          id: newId(),
          subId,
          filters,
          ...withOptions(options),
        });
        return {
          on: (
            kind: "event" | "closed",
            callback: (value?: unknown) => void,
          ) => {
            if (kind === "event") onEvent.add(callback);
            else if (kind === "closed") onClosed.add(callback);
          },
          close: () => {
            if (!subscriptions.delete(subId)) return;
            post({ type: "outbox.close", id: newId(), subId });
          },
        };
      },
      publish: (event: unknown, options?: unknown) =>
        request(
          "outbox.publish",
          { event, ...withOptions(options) },
          (message) => ({
            ...fields("event", "eventId", "relays", "error")(message),
            ok: message.ok === true,
          }),
          false,
        ),
      resolveRelays: (target: unknown) =>
        request("outbox.resolveRelays", { target }, (message) => message.plan),
    };
  }

  if (exposed.has("resource")) {
    // data: は中身が URL に入っているので、ランチャーへ頼まずにここで読む（@napplet/shim と同じ）。
    const decodeData = (url: string): Blob => {
      const match = /^data:([^,]*?)(;base64)?,(.*)$/s.exec(url);
      if (!match) throw new Error("decode-failed");
      const type = (match[1] ?? "").split(";")[0] || "text/plain";
      const body = decodeURIComponent(match[3] ?? "");
      const bytes = match[2]
        ? Uint8Array.from(atob(body), (char) => char.charCodeAt(0))
        : new TextEncoder().encode(body);
      return new Blob([bytes], { type });
    };
    const inflight = new Map<string, Promise<Blob>>();
    const bytes = (
      url: string,
      options?: { servers?: string[]; signal?: AbortSignal },
    ): Promise<Blob> => {
      if (options?.signal?.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }
      if (url.startsWith("data:")) {
        try {
          return Promise.resolve(decodeData(url));
        } catch (error) {
          return Promise.reject(error);
        }
      }
      const cached = inflight.get(url);
      const id = newId();
      const work =
        cached ??
        request(
          "resource.bytes",
          { url, ...(options?.servers ? { servers: options.servers } : {}) },
          (message) => message.blob,
          true,
          id,
        ).finally(() => inflight.delete(url));
      if (!cached) inflight.set(url, work);
      const signal = options?.signal;
      if (!signal) return work;
      return new Promise<Blob>((resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            if (!cached) post({ type: "resource.cancel", id });
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
        work.then(resolve, reject);
      });
    };
    napplet.resource = {
      info: () => request("resource.info", {}, (message) => message.info),
      bytes,
      bytesMany: (requests: { url: string; servers?: string[] }[]) =>
        request("resource.bytesMany", { requests }, (message) =>
          Array.isArray(message.items) ? message.items : [],
        ),
      bytesAsObjectURL: (url: string) => {
        let objectUrl: string | undefined;
        let revoked = false;
        const handle = {
          url: "",
          revoke: () => {
            if (revoked) return;
            revoked = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
          },
        };
        const ready = bytes(url).then((blob) => {
          if (revoked) return undefined;
          objectUrl = URL.createObjectURL(blob);
          handle.url = objectUrl;
          return objectUrl;
        });
        Object.defineProperty(handle, "ready", { value: ready });
        return handle;
      },
    };
  }

  Object.defineProperty(window, "napplet", {
    value: Object.freeze(napplet),
    writable: false,
    configurable: false,
  });
  if (exposed.has("shell")) post({ type: "shell.ready" });
}

/** napplet の中で動かす 1 本のスクリプト。`domains` に挙げた機能だけを生やす。 */
export const nappletPrelude = (domains: readonly string[]): string =>
  `(${installNapplet.toString()})(${JSON.stringify(domains)});`;
