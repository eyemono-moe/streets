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

  // NAP-INTENT と NAP-INC で同じ、URI の問い合わせを中身にする読み方。
  // > The runtime MUST NOT coerce query values to boolean, number, or null. A `+` is a
  // > literal plus sign, not a space.
  const queryPayload = (query: string) => {
    const fields: Record<string, string> = {};
    for (const pair of query ? query.split("&") : []) {
      const separator = pair.indexOf("=");
      if (separator < 0) {
        throw new Error(
          "Convention URI query parameters must use name=value form",
        );
      }
      const name = decodeURIComponent(pair.slice(0, separator));
      if (Object.prototype.hasOwnProperty.call(fields, name)) {
        throw new Error("Convention URI query parameter names must be unique");
      }
      fields[name] = decodeURIComponent(pair.slice(separator + 1));
    }
    return fields;
  };
  // inc.on で受けている話題。onDelivery を使わず、話題で依頼を受ける napplet
  // （NAP-INTENT が INC から分かれる前の書き方。Myco 向けのものなど）に依頼を渡すのに使う。
  const topicHandlers = new Map<string, Set<(event: unknown) => void>>();
  const waitingDeliveries: Record<string, unknown>[] = [];
  const handOver = (delivery: Record<string, unknown>) => {
    const handlers = topicHandlers.get(String(delivery.convention));
    if (!handlers || handlers.size === 0) return false;
    for (const handler of handlers) {
      handler({
        topic: delivery.convention,
        sender: delivery.sender,
        payload: delivery.payload,
      });
    }
    return true;
  };

  if (exposed.has("intent")) {
    // NAP-INTENT の URI の読み方。`@napplet/shim` の normalizeIntentUri と同じく、
    // 送る前に断る（呼んだ側へ同期で例外を返す）。
    const decodeNaddr = (value: string) => {
      const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
      const lower = value.toLowerCase();
      const split = lower.lastIndexOf("1");
      if (lower.slice(0, split) !== "naddr") {
        throw new Error("Intent handler fragment must be a bare naddr");
      }
      const words = lower
        .slice(split + 1, -6)
        .split("")
        .map((char) => {
          const word = CHARSET.indexOf(char);
          if (word < 0)
            throw new Error("Intent handler fragment must be a bare naddr");
          return word;
        });
      const bytes: number[] = [];
      let acc = 0;
      let bits = 0;
      for (const word of words) {
        acc = (acc << 5) | word;
        bits += 5;
        while (bits >= 8) {
          bits -= 8;
          bytes.push((acc >> bits) & 0xff);
        }
      }
      let identifier: string | undefined;
      let pubkey: string | undefined;
      let kind: number | undefined;
      const relays: string[] = [];
      for (let i = 0; i + 2 <= bytes.length;) {
        const type = bytes[i] as number;
        const length = bytes[i + 1] as number;
        const chunk = bytes.slice(i + 2, i + 2 + length);
        i += 2 + length;
        if (type === 0)
          identifier = new TextDecoder().decode(new Uint8Array(chunk));
        if (type === 1)
          relays.push(new TextDecoder().decode(new Uint8Array(chunk)));
        if (type === 2)
          pubkey = chunk.map((b) => b.toString(16).padStart(2, "0")).join("");
        if (type === 3) kind = chunk.reduce((n, b) => n * 256 + b, 0);
      }
      if (identifier === undefined || !pubkey || kind !== 35129) {
        throw new Error(
          "Intent handler hint requires a named napplet coordinate",
        );
      }
      return {
        address: `${kind}:${pubkey}:${identifier}`,
        ...(relays.length > 0 ? { relays } : {}),
      };
    };
    type InvokeOptions = {
      payload?: unknown;
      handler?: string;
      handlerHint?: { address: string; relays?: string[] };
      behavior?: unknown;
    };
    const normalize = (uri: string, options: InvokeOptions = {}) => {
      if (typeof uri !== "string")
        throw new Error("Convention URI must be a string");
      decodeURIComponent(uri);
      const fragmentIndex = uri.indexOf("#");
      if (fragmentIndex >= 0 && options.handlerHint !== undefined) {
        throw new Error(
          "Intent handler fragment cannot accompany an explicit handler hint",
        );
      }
      const base = fragmentIndex < 0 ? uri : uri.slice(0, fragmentIndex);
      const queryIndex = base.indexOf("?");
      const convention = queryIndex < 0 ? base : base.slice(0, queryIndex);
      const match = /^napplet:([^/?#]+)\/([^/?#]+)$/.exec(convention);
      if (!match) {
        throw new Error(
          "Convention URI must use napplet:<archetype>/<intent> syntax",
        );
      }
      let payload = options.payload;
      if (queryIndex >= 0) {
        if (options.payload !== undefined) {
          throw new Error(
            "Convention URI queries cannot be combined with an explicit payload",
          );
        }
        payload = queryPayload(base.slice(queryIndex + 1));
      }
      const handlerHint =
        fragmentIndex >= 0
          ? decodeNaddr(uri.slice(fragmentIndex + 1))
          : options.handlerHint;
      return {
        archetype: match[1],
        action: match[2],
        convention,
        ...(payload !== undefined ? { payload } : {}),
        ...(options.handler !== undefined ? { handler: options.handler } : {}),
        ...(options.behavior !== undefined
          ? { behavior: options.behavior }
          : {}),
        ...(handlerHint !== undefined ? { handlerHint } : {}),
      };
    };
    // NAP-INTENT: > The runtime-provided binding MUST retain an incoming delivery until an
    // > `onDelivery` handler is registered.
    const deliveryHandlers = new Set<(delivery: unknown) => void>();
    onPush("intent.deliver", (message) => {
      const delivery = message.delivery as Record<string, unknown>;
      if (deliveryHandlers.size > 0) {
        for (const handler of deliveryHandlers) handler(delivery);
      } else if (!handOver(delivery)) {
        waitingDeliveries.push(delivery);
      }
    });
    const invoke = (uri: string, options?: InvokeOptions) => {
      const normalized = normalize(uri, options);
      return request(
        "intent.invoke",
        { request: normalized },
        (message) => message.result,
        false,
      );
    };
    napplet.intent = {
      invoke,
      open: (uri: string, options?: InvokeOptions) => {
        if (normalize(uri, options).action !== "open") {
          throw new Error("intent.open requires the open URI action");
        }
        return invoke(uri, options);
      },
      available: (archetype: string) =>
        request(
          "intent.available",
          { archetype },
          (message) => message.availability,
        ),
      handlers: () =>
        request("intent.handlers", {}, (message) => message.handlers),
      onChanged: (handler: (availability: unknown) => void) =>
        onPush("intent.changed", (message) => handler(message.availability)),
      onDelivery: (handler: (delivery: unknown) => void) => {
        deliveryHandlers.add(handler);
        for (const delivery of waitingDeliveries.splice(0)) handler(delivery);
        return { close: () => deliveryHandlers.delete(handler) };
      },
    };
  }

  if (exposed.has("keys")) {
    // NAP-KEYS の Smart Forwarding。iframe の中で押したキーは Streets に届かないので、
    // 入力欄の外で押したものを送り、Streets のショートカットが効くようにする。
    const RESERVED = new Set(["Tab", "Shift+Tab", "Escape"]);
    const MODIFIERS = new Set(["Control", "Alt", "Shift", "Meta"]);
    const comboOf = (event: {
      key: string;
      altKey: boolean;
      ctrlKey: boolean;
      shiftKey: boolean;
      metaKey: boolean;
    }) =>
      [
        event.altKey ? "Alt" : "",
        event.ctrlKey ? "Ctrl" : "",
        event.shiftKey ? "Shift" : "",
        event.metaKey ? "Meta" : "",
        event.key.length === 1 ? event.key.toUpperCase() : event.key,
      ]
        .filter(Boolean)
        .join("+");
    const normalize = (combo: string) => {
      const parts = combo.split("+");
      const key = parts.pop() ?? "";
      return comboOf({
        key,
        altKey: parts.includes("Alt"),
        ctrlKey: parts.includes("Ctrl"),
        shiftKey: parts.includes("Shift"),
        metaKey: parts.includes("Meta"),
      });
    };
    const bound = new Map<string, string>();
    const actionHandlers = new Map<string, Set<() => void>>();
    const fire = (actionId: string) => {
      for (const handler of actionHandlers.get(actionId) ?? []) handler();
    };
    onPush("keys.bindings", (message) => {
      bound.clear();
      if (!Array.isArray(message.bindings)) return;
      for (const binding of message.bindings as {
        actionId?: unknown;
        key?: unknown;
      }[]) {
        if (typeof binding.actionId !== "string") continue;
        if (typeof binding.key !== "string") continue;
        bound.set(normalize(binding.key), binding.actionId);
      }
    });
    onPush("keys.action", (message) => {
      if (typeof message.actionId === "string") fire(message.actionId);
    });
    const typing = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element || typeof element.closest !== "function") return false;
      return (
        element.isContentEditable ||
        element.closest("input, textarea, select, [contenteditable]") !== null
      );
    };
    window.addEventListener(
      "keydown",
      (event) => {
        if (typing(event.target)) return;
        if (MODIFIERS.has(event.key) || event.isComposing) return;
        const combo = comboOf(event);
        const actionId = bound.get(combo);
        if (actionId && !RESERVED.has(combo)) {
          event.preventDefault();
          fire(actionId);
          return;
        }
        post({
          type: "keys.forward",
          key: event.key,
          code: event.code,
          ctrl: event.ctrlKey,
          alt: event.altKey,
          shift: event.shiftKey,
          meta: event.metaKey,
        });
      },
      true,
    );
    napplet.keys = {
      registerAction: (action: unknown) =>
        request("keys.registerAction", { action }, (message) => ({
          actionId: message.actionId,
          ...(typeof message.binding === "string"
            ? { binding: message.binding }
            : {}),
        })),
      unregisterAction: (actionId: string) =>
        post({ type: "keys.unregisterAction", actionId }),
      forward: (fields: Record<string, unknown>) =>
        post({ ...fields, type: "keys.forward" }),
      onAction: (actionId: string, handler: () => void) => {
        const handlers = actionHandlers.get(actionId) ?? new Set();
        handlers.add(handler);
        actionHandlers.set(actionId, handlers);
        return { close: () => handlers.delete(handler) };
      },
    };
  }

  if (exposed.has("common")) {
    // 結果は `ok` と `error` の欄で返し、reject しない（@napplet/shim と同じ）。
    const result = (message: Message) => {
      const { type: _type, id: _id, ...rest } = message;
      return rest;
    };
    const ask = (type: string, payload: Record<string, unknown>) =>
      request(type, payload, result, false);
    napplet.common = {
      encodeNip19: (input: unknown) => ask("common.encodeNip19", { input }),
      decodeNip19: (value: string) => ask("common.decodeNip19", { value }),
      getProfile: (target: string) => ask("common.getProfile", { target }),
      follows: () => ask("common.follows", {}),
      follow: (...pubkeys: string[]) => ask("common.follow", { pubkeys }),
      unfollow: (...pubkeys: string[]) => ask("common.unfollow", { pubkeys }),
      react: (
        targetEventId: string,
        reaction: string,
        customEmojiHref?: string,
      ) =>
        ask("common.react", {
          targetEventId,
          reaction,
          ...(customEmojiHref === undefined ? {} : { customEmojiHref }),
        }),
      report: (target: unknown, reason: string, text: string) =>
        ask("common.report", { target, reason, text }),
    };
  }

  if (exposed.has("link")) {
    // 断られたときも reject せず `{ status: "denied" }` で返す（@napplet/shim と同じ）。
    napplet.link = {
      open: (url: string, options?: { label?: string }) =>
        request(
          "link.open",
          { url, ...(options ? { options } : {}) },
          (message) => ({ status: message.status }),
          false,
        ),
    };
  }

  if (exposed.has("inc")) {
    const emit = (topic: string, payload?: unknown) => {
      if (typeof topic !== "string")
        throw new Error("INC topic must be a string");
      if (!topic.startsWith("napplet:")) {
        post({
          type: "inc.emit",
          topic,
          ...(payload !== undefined ? { payload } : {}),
        });
        return;
      }
      decodeURIComponent(topic);
      if (topic.includes("#")) {
        throw new Error("Convention URI fragments are not supported");
      }
      const queryIndex = topic.indexOf("?");
      if (queryIndex >= 0 && payload !== undefined) {
        throw new Error(
          "Convention URI queries cannot be combined with an explicit payload",
        );
      }
      const routed = queryIndex < 0 ? topic : topic.slice(0, queryIndex);
      const body =
        queryIndex < 0 ? payload : queryPayload(topic.slice(queryIndex + 1));
      post({
        type: "inc.emit",
        topic: routed,
        ...(body !== undefined ? { payload: body } : {}),
      });
    };
    onPush("inc.event", (message) => {
      for (const handler of topicHandlers.get(String(message.topic)) ?? []) {
        handler({
          topic: message.topic,
          sender: message.sender,
          payload: message.payload,
        });
      }
    });
    const unsupported = () =>
      Promise.reject(new Error("INC channels are not supported by this shell"));
    napplet.inc = {
      emit,
      on: (topic: string, handler: (event: unknown) => void) => {
        const handlers = topicHandlers.get(topic) ?? new Set();
        const first = handlers.size === 0;
        handlers.add(handler);
        topicHandlers.set(topic, handlers);
        if (first) void request("inc.subscribe", { topic }, () => undefined);
        // 先に届いて待っていた依頼のうち、この話題のものを渡す。
        for (const delivery of [...waitingDeliveries]) {
          if (delivery.convention !== topic) continue;
          waitingDeliveries.splice(waitingDeliveries.indexOf(delivery), 1);
          handOver(delivery);
        }
        return {
          close: () => {
            if (!handlers.delete(handler) || handlers.size > 0) return;
            topicHandlers.delete(topic);
            post({ type: "inc.unsubscribe", topic });
          },
        };
      },
      channel: {
        open: unsupported,
        onOpened: () => ({ close: () => {} }),
        list: () => Promise.resolve([]),
        broadcast: () => {},
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
