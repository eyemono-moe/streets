import type { EventDraft } from "../nostr/build/draft";
/*
 * ランチャー側の受け答え。napplet 1 つにつき 1 つ作り、届いたメッセージを Streets の
 * 機能（`NappletHost`）につなぐ。iframe と `postMessage` は持たず、送り主の確認は
 * 呼ぶ側（`MessageEvent.source` を見る）が済ませてから `receive` に渡す。
 *
 * NIP-5D:
 * > Messages with an unrecognized `type` MUST be silently ignored.
 * NAP-RELAY（napplet/naps PR #2、2026-10-10 版）:
 * > The shell MUST respond to every request with a result or lifecycle message carrying the same
 * > `id` or `subId`.
 * > Subscription filters SHOULD be validated to prevent resource exhaustion.
 */
import type { NostrEvent } from "../nostr/event";
import { relayOf } from "../nostr/event-refs";
import { decodeNpub } from "../nostr/nip19";
import type { ReactionInput } from "../nostr/reaction";
import { type ReportReason, isReportReason } from "../nostr/report";
import type { RelayFilter } from "../relay/relay-connection";
import type { CatalogSnapshot } from "./catalog";
import {
  commonProfileData,
  commonReaction,
  decodeCommonNip19,
  encodeCommonNip19,
  profileTarget,
} from "./common";
import {
  type ConfigSchema,
  checkConfigSchema,
  configSections,
  resolveConfigValues,
} from "./config";
import {
  type IntentAvailability,
  type IntentDelivery,
  type IntentRequest,
  type IntentResult,
  parseIntentRequest,
} from "./intent";
import { type LinkTarget, parseLinkUrl } from "./link";
import { type ListRequest, parseListRequest, supportedLists } from "./lists";
import { type PublishOperation, parsePublishTemplate } from "./publish";
import {
  NAPPLET_RESOURCE_MAX_BYTES,
  NAPPLET_RESOURCE_MAX_SERVERS,
  NAPPLET_RESOURCE_MAX_URLS,
  type NappletResourceResult,
} from "./resource";

export type NappletTheme = {
  colors: { background: string; text: string; primary: string };
  title?: string;
};

export type NappletProfile = {
  name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
  banner?: string;
  nip05?: string;
  lud16?: string;
  website?: string;
};

export type NappletStorageScope = "shared" | "instance";

export type NappletSubscriptionSink = {
  event: (event: NostrEvent, relay?: string) => void;
  /** 保存済みのものを出し終えた。以後は新しく届いたものだけ。 */
  eose: () => void;
};

/** napplet に渡す Streets の機能。渡さない機能は `domains` に入れない。 */
export type NappletHost = {
  domains: readonly string[];
  /** ログインしていなければ `""`。 */
  publicKey: () => string;
  relays: () => Record<string, { read: boolean; write: boolean }>;
  profile: () => Promise<NappletProfile | null>;
  follows: () => Promise<readonly string[]>;
  mutes: () => Promise<readonly string[]>;
  theme: () => NappletTheme;
  storage: {
    get: (scope: NappletStorageScope, key: string) => string | null;
    /** 枠を超えたら例外を投げる。 */
    set: (scope: NappletStorageScope, key: string, value: string) => void;
    remove: (scope: NappletStorageScope, key: string) => void;
    keys: (scope: NappletStorageScope) => string[];
  };
  /**
   * 読み取り層へ購読を張る。著者が分かるフィルタは Outbox で行き先が決まるので、
   * NAP-RELAY と NAP-OUTBOX のどちらもこれを使う。`hints` は行き先に足すリレー。
   */
  subscribe: (
    filters: RelayFilter[],
    sink: NappletSubscriptionSink,
    hints?: readonly string[],
  ) => () => void;
  /** その人の書き込み先（NIP-65）。分からなければ `undefined`。 */
  writeRelays: (pubkey: string) => readonly string[] | undefined;
  /**
   * NAP-INTENT。受け手を決めて開く。選ばせるときは、ユーザーが選ぶまで待つ。
   * 中身を確かめた要求だけが届く（`parseIntentRequest`）。
   */
  intent: {
    invoke: (request: IntentRequest) => Promise<IntentResult>;
    available: (archetype: string) => IntentAvailability;
    handlers: () => IntentAvailability[];
  };
  /**
   * NAP-INC。ほかのアップレットへ話題で送る。受け手は、その話題を購読しているほかの
   * アップレット（`NappletSession.incEvent`）。
   */
  inc: { emit: (topic: string, payload: unknown) => void };
  /**
   * 頼まれた書き込み。ユーザーに確かめ、Streets が署名して送る。`relays` は自分の
   * write リレーに加えて送る先。
   */
  publish: (request: {
    operation: PublishOperation;
    draft: EventDraft;
    recipient?: string;
    relays?: readonly string[];
  }) => Promise<
    | { ok: true; event: NostrEvent; relays: Record<string, boolean> }
    | { ok: false; error: string }
  >;
  /**
   * NAP-LINK。確かめた行き先を開く。開いたか、断ったかを返す。
   */
  openLink: (
    target: LinkTarget,
    label: string | undefined,
  ) => Promise<{ status: "opened" | "denied"; error?: string }>;
  /**
   * NAP-KEYS。アップレットの中で押されたキーを、Streets の中で押したものとして扱う。
   */
  forwardKey: (key: {
    key: string;
    code: string;
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
  }) => void;
  /**
   * NAP-COMMON の書き込み。ユーザーに確かめてから、Streets のフォロー・リアクション・
   * 通報の操作として行う。
   */
  common: {
    setFollow: (pubkeys: string[], on: boolean) => Promise<CommonActionResult>;
    react: (
      eventId: string,
      input: ReactionInput,
    ) => Promise<CommonActionResult>;
    report: (
      target:
        | { type: "pubkey"; pubkey: string }
        | { type: "event"; id: string; pubkey?: string },
      reason: ReportReason,
      text: string,
    ) => Promise<CommonActionResult>;
  };
  /**
   * NAP-NOTIFY。Streets のトーストで知らせる。出してよいかはアップレットごとに確かめる。
   */
  notify: {
    send: (
      notification: NotifyPayload,
    ) => Promise<{ notificationId: string } | { error: string }>;
    dismiss: (notificationId: string) => void;
    requestPermission: () => Promise<boolean>;
  };
  /**
   * NAP-UPLOAD。Streets のアップロード先へ上げる。上げてよいかはユーザーに確かめる。
   */
  upload: {
    info: () => UploadInfo;
    upload: (
      request: UploadRequest,
    ) => Promise<UploadResult | { error: string }>;
    status: (uploadId: string) => UploadResult | undefined;
  };
  /**
   * NAP-LISTS。確かめてから、いまの版を読んで項目を足す・外し、署名して送る。
   */
  lists: {
    mutate: (
      request: ListRequest,
      operation: "add" | "remove",
    ) => Promise<
      | { ok: true; eventId: string; changed: number; skipped: number }
      | { ok: false; error: string }
    >;
  };
  /**
   * NAP-CONFIG。登録されたスキーマを覚え（カラムの設定に描く）、ユーザーが入れた値を
   * 返す。値を書くのは Streets の設定の画面だけ。
   */
  config: {
    register: (schema: ConfigSchema) => void;
    stored: () => unknown;
    openSettings: (section: string | undefined) => void;
  };
  /** NAP-CATALOG。いまのアップレットの一覧。 */
  catalog: () => CatalogSnapshot;
  /** 画像などの中身を取る（`fetchNappletResource`）。 */
  fetchResource: (
    url: string,
    servers: readonly string[],
    signal: AbortSignal,
  ) => Promise<NappletResourceResult>;
};

type Message = { type: string; [key: string]: unknown };

/** 1 回の購読で napplet が求められる件数の上限。`limit` が無い・大きい購読はここで切る。 */
export const NAPPLET_MAX_LIMIT = 500;
/** 1 つの napplet が同時に張れる購読の数。 */
export const NAPPLET_MAX_SUBSCRIPTIONS = 20;
/** `relay.query` は保存済みのものを出し終えるまで待つ。リレーが黙ったときに永遠に待たない。 */
export const NAPPLET_QUERY_TIMEOUT_MS = 15_000;
/** napplet が足せるリレーのヒントの数。明示した行き先は接続の予算を超えても開くので絞る。 */
export const NAPPLET_MAX_RELAY_HINTS = 4;
/** 1 つのアップレットが登録できる操作の数。偽りの名前で並べ立てさせない。 */
const MAX_KEY_ACTIONS = 50;

const HEX_64 = /^[0-9a-f]{64}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/**
 * napplet が渡したフィルタを、読み取り層へ渡せる形に絞る。誰の・どの kind の・何を指す
 * かのどれも無いフィルタは、リレーの全イベントを流す購読になるので受けない。
 */
export const sanitizeNappletFilters = (
  raw: unknown,
): RelayFilter[] | undefined => {
  // NAP-OUTBOX: > `filters` are NIP-01 filters, either one filter or an array of filters.
  const list = isRecord(raw) ? [raw] : raw;
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const filters: RelayFilter[] = [];
  for (const item of list) {
    if (!isRecord(item)) return undefined;
    const filter: RelayFilter = {};
    for (const [key, value] of Object.entries(item)) {
      if (key === "ids" || key === "authors") {
        if (!stringList(value)) return undefined;
        filter[key] = value;
      } else if (key === "kinds") {
        if (!Array.isArray(value) || !value.every(Number.isInteger))
          return undefined;
        filter.kinds = value as number[];
      } else if (key === "since" || key === "until" || key === "limit") {
        if (typeof value !== "number" || !Number.isFinite(value))
          return undefined;
        filter[key] = Math.max(0, Math.floor(value));
      } else if (key === "search") {
        if (typeof value !== "string") return undefined;
        filter.search = value;
      } else if (/^#[a-zA-Z]$/.test(key)) {
        if (!stringList(value)) return undefined;
        filter[key as `#${string}`] = value;
      }
      // 知らないキーは落とす。リレーに知らない条件を送ると、断られるか無視される。
    }
    const scoped =
      filter.ids !== undefined ||
      filter.authors !== undefined ||
      filter.kinds !== undefined ||
      Object.keys(filter).some((key) => key.startsWith("#"));
    if (!scoped) return undefined;
    filter.limit = Math.min(
      filter.limit ?? NAPPLET_MAX_LIMIT,
      NAPPLET_MAX_LIMIT,
    );
    filters.push(filter);
  }
  return filters;
};

/** kind:0 の中身を NAP-IDENTITY の `ProfileData` にする。 */
export const nappletProfile = (content: string): NappletProfile | null => {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isRecord(json)) return null;
  const text = (key: string) => {
    const value = json[key];
    return typeof value === "string" && value.trim() !== "" ? value : undefined;
  };
  const profile: NappletProfile = {
    name: text("name"),
    displayName: text("display_name") ?? text("displayName"),
    about: text("about"),
    picture: text("picture"),
    banner: text("banner"),
    nip05: text("nip05"),
    lud16: text("lud16"),
    website: text("website"),
  };
  return Object.fromEntries(
    Object.entries(profile).filter(([, value]) => value !== undefined),
  );
};

/** napplet が添えたリレーのヒント。`wss://` のものだけを、数を絞って使う。 */
const relayHints = (options: unknown): string[] => {
  if (!isRecord(options) || !stringList(options.relays)) return [];
  return [
    ...new Set(options.relays.filter((url) => url.startsWith("wss://"))),
  ].slice(0, NAPPLET_MAX_RELAY_HINTS);
};

const timeoutOf = (options: unknown): number => {
  const requested = isRecord(options) ? options.timeoutMs : undefined;
  return typeof requested === "number" && requested > 0
    ? Math.min(requested, NAPPLET_QUERY_TIMEOUT_MS)
    : NAPPLET_QUERY_TIMEOUT_MS;
};

export type UploadInfo = {
  rails: { rail: string; enabled: boolean; returns?: string[] }[];
  maxBytes?: number;
};

export type UploadRequest = {
  data: Blob;
  rail?: string;
  mimeType?: string;
  filename?: string;
  caption?: string;
};

export type UploadResult = {
  ok: boolean;
  uploadId: string;
  status: "complete" | "failed" | "cancelled";
  rail: string;
  url?: string;
  sha256?: string;
  size?: number;
  mimeType?: string;
  dimensions?: { width: number; height: number };
  blurhash?: string;
  nip94?: string[][];
  error?: string;
  updatedAt: number;
};

export type NotifyPriority = "low" | "normal" | "high" | "urgent";

export type NotifyPayload = {
  title: string;
  body?: string;
  actions: { id: string; label: string }[];
  priority: NotifyPriority;
};

const NOTIFY_PRIORITIES: readonly string[] = [
  "low",
  "normal",
  "high",
  "urgent",
];
// > Notifications may include up to 3 action buttons
const MAX_NOTIFY_ACTIONS = 3;
const MAX_NOTIFY_TITLE = 200;
const MAX_NOTIFY_BODY = 1000;

export type CommonActionResult =
  | { ok: true; eventId?: string; event?: NostrEvent }
  | { ok: false; error: string };

type EventResult = { event: NostrEvent; sidecar?: { relayHints: string[] } };

const resultOf = (event: NostrEvent, relay?: string): EventResult => ({
  event,
  ...(relay ? { sidecar: { relayHints: [relay] } } : {}),
});

export type NappletSession = {
  /** 送り主を確かめたメッセージを渡す。 */
  receive: (data: unknown) => void;
  /** ランチャー側のテーマが変わった。 */
  themeChanged: () => void;
  /** ログインしている人が変わった。 */
  identityChanged: () => void;
  /**
   * NAP-INTENT の依頼を届ける。napplet が起動し終えるまで待ってから送る。
   * > The runtime MUST deliver `IntentDelivery` only after the target is ready.
   */
  deliver: (delivery: IntentDelivery) => void;
  /** 受け手の一覧や既定が変わった。 */
  intentChanged: (availability: IntentAvailability) => void;
  /** Streets の設定の画面で、このアップレットの設定が変わった。 */
  configChanged: () => void;
  /** 出した知らせが押された・閉じられた。 */
  notifyEvent: (
    event:
      | { type: "notify.clicked"; notificationId: string }
      | { type: "notify.action"; notificationId: string; actionId: string }
      | {
          type: "notify.dismissed";
          notificationId: string;
          reason: "user" | "timeout" | "replaced";
        },
  ) => void;
  /** ほかのアップレットが話題で送った。その話題を購読していれば渡す。 */
  incEvent: (event: {
    topic: string;
    sender: string;
    payload?: unknown;
  }) => void;
  dispose: () => void;
};

export const createNappletSession = (
  host: NappletHost,
  post: (message: Message) => void,
  options: {
    setTimeout?: typeof setTimeout;
    clearTimeout?: typeof clearTimeout;
  } = {},
): NappletSession => {
  const schedule = options.setTimeout ?? setTimeout;
  const cancel = options.clearTimeout ?? clearTimeout;
  const exposed = new Set(host.domains);
  const subscriptions = new Map<string, () => void>();
  const queries = new Set<() => void>();
  const fetches = new Map<string, AbortController>();
  let initialized = false;
  let disposed = false;
  const waitingDeliveries: IntentDelivery[] = [];
  const topics = new Set<string>();

  const send = (message: Message) => {
    if (!disposed) post(message);
  };
  const reply = (request: Message, payload: Record<string, unknown>) =>
    send({ ...payload, type: `${request.type}.result`, id: request.id });
  const fail = (request: Message, error: string) => reply(request, { error });

  const answer = async (
    request: Message,
    field: string,
    read: () => Promise<unknown>,
  ) => {
    try {
      reply(request, { [field]: await read() });
    } catch (error) {
      fail(request, error instanceof Error ? error.message : String(error));
    }
  };

  const scopeOf = (request: Message): NappletStorageScope | undefined =>
    request.scope === undefined || request.scope === "shared"
      ? "shared"
      : request.scope === "instance"
        ? "instance"
        : undefined;

  const handleShell = (message: Message) => {
    if (message.type !== "shell.ready" || initialized) return;
    initialized = true;
    send({
      type: "shell.init",
      capabilities: { domains: [...host.domains] },
      services: [],
    });
    // > The shell MAY send `notify.controls` to inform the napplet which notification
    // > features the shell supports.
    if (exposed.has("notify")) {
      send({ type: "notify.controls", controls: ["toasts", "actions"] });
    }
    for (const delivery of waitingDeliveries.splice(0)) {
      send({ type: "intent.deliver", delivery });
    }
  };

  const handleInc = (request: Message) => {
    switch (request.type) {
      case "inc.subscribe":
        if (typeof request.topic !== "string") {
          fail(request, "invalid topic");
          return;
        }
        topics.add(request.topic);
        reply(request, {});
        return;
      case "inc.unsubscribe":
        if (typeof request.topic === "string") topics.delete(request.topic);
        return;
      case "inc.emit":
        if (typeof request.topic === "string") {
          host.inc.emit(request.topic, request.payload);
        }
        return;
      // 1 対 1 の通り道（channel）はまだ渡さない。
      case "inc.channel.open":
        fail(request, "unsupported");
        return;
      case "inc.channel.list":
        reply(request, { channels: [] });
        return;
    }
  };

  // Streets はアップレットの操作にキーを割り当てない（NAP-KEYS では、割り当てずに置いて
  // よい）。登録は受け付け、割り当ての一覧はいつも空で返す。
  const actions = new Set<string>();
  const handleKeys = (request: Message) => {
    switch (request.type) {
      case "keys.forward": {
        const { key, code, ctrl, alt, shift, meta } = request;
        if (
          typeof key !== "string" ||
          typeof code !== "string" ||
          typeof ctrl !== "boolean" ||
          typeof alt !== "boolean" ||
          typeof shift !== "boolean" ||
          typeof meta !== "boolean"
        ) {
          return;
        }
        host.forwardKey({ key, code, ctrl, alt, shift, meta });
        return;
      }
      case "keys.registerAction": {
        const action = isRecord(request.action) ? request.action : {};
        if (typeof action.id !== "string" || typeof action.label !== "string") {
          reply(request, { error: "invalid action" });
          return;
        }
        if (actions.has(action.id)) {
          reply(request, { actionId: action.id, error: "duplicate action ID" });
          return;
        }
        if (actions.size >= MAX_KEY_ACTIONS) {
          reply(request, { actionId: action.id, error: "too many actions" });
          return;
        }
        actions.add(action.id);
        reply(request, { actionId: action.id });
        send({ type: "keys.bindings", bindings: [] });
        return;
      }
      case "keys.unregisterAction":
        if (typeof request.actionId === "string") {
          actions.delete(request.actionId);
          send({ type: "keys.bindings", bindings: [] });
        }
        return;
    }
  };

  const handleCommon = (request: Message) => {
    const signedIn = host.publicKey() !== "";
    const answerAction = (run: () => Promise<CommonActionResult>) => {
      // > MUST reject modifying operations when no shell-user signer is connected
      if (!signedIn) {
        reply(request, { ok: false, error: "not-signed-in" });
        return;
      }
      run().then(
        (result) => reply(request, result),
        () => reply(request, { ok: false, error: "publish-failed" }),
      );
    };
    const npubs = (value: unknown) => {
      if (!stringList(value) || value.length === 0) return undefined;
      const pubkeys = value.map((item) => decodeNpub(item));
      return pubkeys.every((pubkey): pubkey is string => pubkey !== undefined)
        ? [...new Set(pubkeys)]
        : undefined;
    };
    switch (request.type) {
      case "common.encodeNip19":
        reply(request, encodeCommonNip19(request.input));
        return;
      case "common.decodeNip19":
        reply(request, decodeCommonNip19(request.value));
        return;
      case "common.getProfile": {
        const target = profileTarget(request.target);
        if (!target) {
          reply(request, { ok: false, error: "invalid-profile-target" });
          return;
        }
        collect(
          [{ kinds: [0], authors: [target.pubkey], limit: 1 }],
          target.relays
            .flatMap((relay) => relayOf(relay) ?? [])
            .slice(0, NAPPLET_MAX_RELAY_HINTS),
          NAPPLET_QUERY_TIMEOUT_MS,
          (events) => {
            const latest = events.sort(
              (a, b) => b.event.created_at - a.event.created_at,
            )[0];
            reply(request, {
              ok: true,
              pubkey: target.pubkey,
              profile: latest ? commonProfileData(latest.event.content) : null,
              ...(latest ? { result: latest } : {}),
            });
          },
        );
        return;
      }
      case "common.follows":
        host.follows().then(
          (pubkeys) => reply(request, { ok: true, pubkeys }),
          () =>
            reply(request, { ok: false, pubkeys: [], error: "relay-timeout" }),
        );
        return;
      case "common.follow":
      case "common.unfollow": {
        const pubkeys = npubs(request.pubkeys);
        if (!pubkeys) {
          reply(request, { ok: false, error: "invalid-pubkey" });
          return;
        }
        answerAction(() =>
          host.common.setFollow(pubkeys, request.type === "common.follow"),
        );
        return;
      }
      case "common.react": {
        const input = commonReaction(request.reaction, request.customEmojiHref);
        if (
          typeof request.targetEventId !== "string" ||
          !HEX_64.test(request.targetEventId)
        ) {
          reply(request, { ok: false, error: "invalid-target" });
          return;
        }
        if (!input) {
          reply(request, { ok: false, error: "invalid-reaction" });
          return;
        }
        const id = request.targetEventId;
        answerAction(() => host.common.react(id, input));
        return;
      }
      case "common.report": {
        if (!isReportReason(request.reason)) {
          reply(request, { ok: false, error: "invalid-report-reason" });
          return;
        }
        const raw = isRecord(request.target) ? request.target : {};
        const pubkey =
          typeof raw.pubkey === "string" ? decodeNpub(raw.pubkey) : undefined;
        const target =
          raw.type === "pubkey" && pubkey
            ? ({ type: "pubkey", pubkey } as const)
            : raw.type === "event" &&
                typeof raw.id === "string" &&
                HEX_64.test(raw.id)
              ? ({
                  type: "event",
                  id: raw.id,
                  ...(pubkey ? { pubkey } : {}),
                } as const)
              : undefined;
        if (!target) {
          reply(request, { ok: false, error: "invalid-target" });
          return;
        }
        const reason = request.reason;
        const text = typeof request.text === "string" ? request.text : "";
        answerAction(() => host.common.report(target, reason, text));
        return;
      }
    }
  };

  let schema: ConfigSchema | undefined;
  let configSubscribed = false;
  const configValues = () =>
    schema ? resolveConfigValues(schema, host.config.stored()) : undefined;
  const noSchema = () =>
    send({
      type: "config.schemaError",
      code: "no-schema",
      error: "register a schema before reading configuration",
    });
  const handleConfig = (request: Message) => {
    switch (request.type) {
      case "config.registerSchema": {
        const checked = checkConfigSchema(request.schema);
        if (!checked.ok) {
          reply(request, checked);
          return;
        }
        schema = checked.schema;
        host.config.register(checked.schema);
        reply(request, { ok: true });
        if (configSubscribed)
          send({ type: "config.values", values: configValues() });
        return;
      }
      // > `config.values` is dual-use: with `id` it answers `config.get`
      case "config.get":
        if (!schema) return noSchema();
        send({ type: "config.values", id: request.id, values: configValues() });
        return;
      // > `config.subscribe` MUST produce an immediate initial `config.values` push
      case "config.subscribe":
        if (!schema) return noSchema();
        configSubscribed = true;
        send({ type: "config.values", values: configValues() });
        return;
      case "config.unsubscribe":
        configSubscribed = false;
        return;
      // > shells SHOULD silently ignore the request (opening the settings UI to its default
      // > entry is acceptable).
      case "config.openSettings": {
        const section =
          typeof request.section === "string" &&
          schema &&
          configSections(schema).includes(request.section)
            ? request.section
            : undefined;
        host.config.openSettings(section);
        return;
      }
    }
  };

  const handleLists = (request: Message) => {
    if (request.type === "lists.supported") {
      reply(request, { lists: supportedLists() });
      return;
    }
    if (request.type !== "lists.add" && request.type !== "lists.remove") return;
    const operation = request.type === "lists.add" ? "add" : "remove";
    if (host.publicKey() === "") {
      reply(request, { ok: false, error: "not-signed-in" });
      return;
    }
    const parsed = parseListRequest(
      request.list,
      request.items,
      request.options,
      operation,
    );
    if (!parsed.ok) {
      reply(request, parsed);
      return;
    }
    host.lists.mutate(parsed.request, operation).then(
      (result) =>
        reply(
          request,
          result.ok
            ? {
                ok: true,
                eventId: result.eventId,
                [operation === "add" ? "added" : "removed"]: result.changed,
                skipped: result.skipped,
              }
            : result,
        ),
      () => reply(request, { ok: false, error: "publish-failed" }),
    );
  };

  const handleUpload = (request: Message) => {
    switch (request.type) {
      case "upload.info":
        reply(request, { info: host.upload.info() });
        return;
      case "upload.upload": {
        const raw = isRecord(request.request) ? request.request : {};
        // > `request.data` is a `Blob` or `ArrayBuffer` and crosses the boundary by structured clone
        const data =
          raw.data instanceof Blob
            ? raw.data
            : raw.data instanceof ArrayBuffer
              ? new Blob([raw.data])
              : undefined;
        if (!data) {
          reply(request, { error: "invalid upload" });
          return;
        }
        const text = (value: unknown) =>
          typeof value === "string" ? value : undefined;
        const upload: UploadRequest = { data };
        const rail = text(raw.rail);
        const mimeType = text(raw.mimeType);
        const filename = text(raw.filename);
        const caption = text(raw.caption);
        if (rail) upload.rail = rail;
        if (mimeType) upload.mimeType = mimeType;
        if (filename) upload.filename = filename;
        if (caption) upload.caption = caption;
        host.upload.upload(upload).then(
          (result) =>
            reply(
              request,
              "error" in result && !("ok" in result) ? result : { result },
            ),
          () => reply(request, { error: "upload failed" }),
        );
        return;
      }
      case "upload.status": {
        const status =
          typeof request.uploadId === "string"
            ? host.upload.status(request.uploadId)
            : undefined;
        reply(request, status ? { status } : { error: "unknown upload" });
        return;
      }
    }
  };

  const handleNotify = (request: Message) => {
    switch (request.type) {
      case "notify.send": {
        const { title, body, actions, priority } = request;
        if (typeof title !== "string" || title.trim() === "") {
          reply(request, { error: "invalid notification" });
          return;
        }
        const list = Array.isArray(actions) ? actions : [];
        const valid = list
          .filter(
            (action): action is { id: string; label: string } =>
              isRecord(action) &&
              typeof action.id === "string" &&
              typeof action.label === "string",
          )
          .slice(0, MAX_NOTIFY_ACTIONS)
          .map((action) => ({ id: action.id, label: action.label }));
        host.notify
          .send({
            title: title.slice(0, MAX_NOTIFY_TITLE),
            ...(typeof body === "string"
              ? { body: body.slice(0, MAX_NOTIFY_BODY) }
              : {}),
            actions: valid,
            priority:
              typeof priority === "string" &&
              NOTIFY_PRIORITIES.includes(priority)
                ? (priority as NotifyPriority)
                : "normal",
          })
          .then(
            (result) => reply(request, result),
            () => reply(request, { error: "permission denied" }),
          );
        return;
      }
      // > Messages referencing an unknown `notificationId` ... MUST be silently ignored
      case "notify.dismiss":
        if (typeof request.notificationId === "string") {
          host.notify.dismiss(request.notificationId);
        }
        return;
      case "notify.permission.request":
        host.notify.requestPermission().then(
          (granted) =>
            send({ type: "notify.permission.result", id: request.id, granted }),
          () =>
            send({
              type: "notify.permission.result",
              id: request.id,
              granted: false,
            }),
        );
        return;
      // バッジとチャンネルは渡さない（notify.controls にも挙げない）。受け取って捨てる。
      case "notify.badge":
      case "notify.channel.register":
        return;
    }
  };

  const handleLink = (request: Message) => {
    if (request.type !== "link.open") return;
    // > The shell MUST respond to every request with a result message carrying the same `id`.
    const parsed = parseLinkUrl(request.url);
    if (!parsed.ok) {
      reply(request, { status: "denied", error: parsed.error });
      return;
    }
    const options = isRecord(request.options) ? request.options : {};
    const label = typeof options.label === "string" ? options.label : undefined;
    host.openLink(parsed.target, label).then(
      (result) => reply(request, result),
      () => reply(request, { status: "denied", error: "blocked-by-policy" }),
    );
  };

  const handleIntent = (request: Message) => {
    switch (request.type) {
      case "intent.invoke": {
        const parsed = parseIntentRequest(request.request);
        if (!parsed.ok) {
          reply(request, { result: { ok: false, error: parsed.error } });
          return;
        }
        host.intent.invoke(parsed.request).then(
          // `handled` は NAP-INTENT の前の版の欄。Myco が返し、Noris などがまだ見ている。
          (result) =>
            reply(request, {
              result: result.ok ? { ...result, handled: true } : result,
            }),
          () =>
            reply(request, { result: { ok: false, error: "invoke rejected" } }),
        );
        return;
      }
      case "intent.available":
        if (typeof request.archetype !== "string") {
          fail(request, "invalid archetype");
          return;
        }
        reply(request, {
          availability: host.intent.available(request.archetype),
        });
        return;
      case "intent.handlers":
        reply(request, { handlers: host.intent.handlers() });
        return;
    }
  };

  const handleTheme = (request: Message) => {
    if (request.type === "theme.get") reply(request, { theme: host.theme() });
  };

  const handleIdentity = (request: Message) => {
    switch (request.type) {
      case "identity.getPublicKey":
        reply(request, { pubkey: host.publicKey() });
        return;
      case "identity.getRelays":
        reply(request, { relays: host.relays() });
        return;
      case "identity.getProfile":
        void answer(request, "profile", host.profile);
        return;
      case "identity.getFollows":
        void answer(request, "pubkeys", host.follows);
        return;
      case "identity.getMutes":
        void answer(request, "pubkeys", host.mutes);
        return;
      case "identity.getList":
      case "identity.getZaps":
      case "identity.getBlocked":
      case "identity.getBadges":
        fail(request, "unsupported");
        return;
    }
  };

  const handleStorage = (request: Message) => {
    const scope = scopeOf(request);
    if (scope === undefined) {
      fail(request, "invalid scope");
      return;
    }
    const key = request.key;
    try {
      switch (request.type) {
        case "storage.get":
          if (typeof key !== "string") return fail(request, "invalid key");
          reply(request, { value: host.storage.get(scope, key) });
          return;
        case "storage.set":
          if (typeof key !== "string" || typeof request.value !== "string") {
            return fail(request, "invalid key or value");
          }
          host.storage.set(scope, key, request.value);
          reply(request, {});
          return;
        case "storage.remove":
          if (typeof key !== "string") return fail(request, "invalid key");
          host.storage.remove(scope, key);
          reply(request, {});
          return;
        case "storage.keys":
          reply(request, { keys: host.storage.keys(scope) });
          return;
      }
    } catch (error) {
      fail(request, error instanceof Error ? error.message : String(error));
    }
  };

  const closeSubscription = (subId: string) => {
    subscriptions.get(subId)?.();
    subscriptions.delete(subId);
  };

  /** 購読を張る。張れなければ理由を返す。 */
  const openSubscription = (
    subId: string,
    rawFilters: unknown,
    hints: readonly string[],
    sink: NappletSubscriptionSink,
  ): string | undefined => {
    closeSubscription(subId);
    const filters = sanitizeNappletFilters(rawFilters);
    if (!filters) return "invalid: filters";
    if (subscriptions.size >= NAPPLET_MAX_SUBSCRIPTIONS) {
      return "rate-limited: too many subscriptions";
    }
    subscriptions.set(subId, host.subscribe(filters, sink, hints));
    return undefined;
  };

  /**
   * 保存済みのものを出し終えるまで集めて返す。時間が来たら、それまでのものを
   * 返す（`incomplete`）。
   */
  const collect = (
    filters: RelayFilter[],
    hints: readonly string[],
    timeoutMs: number,
    done: (events: EventResult[], incomplete: boolean) => void,
  ) => {
    const events = new Map<string, EventResult>();
    let finished = false;
    let close: () => void = () => {};
    const finish = (incomplete: boolean) => {
      if (finished) return;
      finished = true;
      cancel(timer);
      queries.delete(stop);
      close();
      done([...events.values()], incomplete);
    };
    const stop = () => {
      finished = true;
      cancel(timer);
      close();
    };
    const timer = schedule(() => finish(true), timeoutMs);
    queries.add(stop);
    close = host.subscribe(
      filters,
      {
        event: (event, relay) => {
          if (finished || events.has(event.id)) return;
          events.set(event.id, resultOf(event, relay));
        },
        eose: () => finish(false),
      },
      hints,
    );
    // 購読を張る前に保存済みのものだけで片付いたときは、張った購読をここで閉じる。
    if (finished) close();
  };

  const handleRelay = (request: Message) => {
    switch (request.type) {
      case "relay.subscribe": {
        const subId = request.subId;
        if (typeof subId !== "string") return;
        const closed = (reason: string) =>
          send({ type: "relay.closed", subId, reason });
        // 指定したリレーへ直に繋ぐ購読は、Streets の接続の上限と許可の外になるので、まだ受けない。
        if (request.relay !== undefined) {
          closeSubscription(subId);
          return closed("unsupported: scoped relay");
        }
        const refused = openSubscription(subId, request.filters, [], {
          event: (event, relay) =>
            send({
              type: "relay.event",
              subId,
              result: resultOf(event, relay),
            }),
          eose: () => send({ type: "relay.eose", subId }),
        });
        if (refused) closed(refused);
        return;
      }
      case "relay.close":
        if (typeof request.subId === "string") closeSubscription(request.subId);
        return;
      case "relay.query": {
        const filters = sanitizeNappletFilters(request.filters);
        if (!filters) return fail(request, "invalid: filters");
        collect(filters, [], NAPPLET_QUERY_TIMEOUT_MS, (events) =>
          reply(request, { events }),
        );
        return;
      }
      case "relay.publish": {
        const parsed = parsePublishTemplate(request.event, "publish");
        if (!parsed.ok) return fail(request, parsed.error);
        void host
          .publish({ operation: "publish", draft: parsed.draft })
          .then((result) =>
            result.ok
              ? reply(request, { event: result.event })
              : fail(request, result.error),
          );
        return;
      }
      // 暗号化は NIP-44 だけ。NIP-04 は新しく書かない（NIP-04 自体が NIP-17 を勧めている）。
      case "relay.publishEncrypted": {
        if (
          request.encryption !== undefined &&
          request.encryption !== "nip44"
        ) {
          return fail(request, "unsupported: only nip44 encryption");
        }
        if (
          typeof request.recipient !== "string" ||
          !HEX_64.test(request.recipient)
        ) {
          return fail(request, "invalid: recipient");
        }
        const parsed = parsePublishTemplate(request.event, "publishEncrypted");
        if (!parsed.ok) return fail(request, parsed.error);
        void host
          .publish({
            operation: "publishEncrypted",
            draft: parsed.draft,
            recipient: request.recipient,
          })
          .then((result) =>
            result.ok
              ? reply(request, {
                  ok: true,
                  event: result.event,
                  eventId: result.event.id,
                })
              : fail(request, result.error),
          );
        return;
      }
    }
  };

  /*
   * NAP-OUTBOX（napplet/naps PR #32、2026-10-12 版）。行き先は読み取り層が NIP-65 から
   * 決めるので、NAP-RELAY と同じ購読をそのまま使う。
   * > `outbox.getEvent` is a request; `outbox.event` remains the subscription push message.
   */
  const handleOutbox = (request: Message) => {
    const hints = relayHints(request.options);
    switch (request.type) {
      case "outbox.subscribe": {
        const subId = request.subId;
        if (typeof subId !== "string") return;
        const refused = openSubscription(subId, request.filters, hints, {
          event: (event, relay) =>
            send({
              type: "outbox.event",
              subId,
              result: resultOf(event, relay),
            }),
          // NAP-OUTBOX の購読には EOSE の知らせが無い。
          eose: () => {},
        });
        if (refused) send({ type: "outbox.closed", subId, reason: refused });
        return;
      }
      case "outbox.close":
        if (typeof request.subId === "string") closeSubscription(request.subId);
        return;
      case "outbox.query": {
        const filters = sanitizeNappletFilters(request.filters);
        if (!filters)
          return reply(request, { events: [], error: "invalid: filters" });
        collect(
          filters,
          hints,
          timeoutOf(request.options),
          (events, incomplete) =>
            reply(request, { events, ...(incomplete ? { incomplete } : {}) }),
        );
        return;
      }
      case "outbox.getEvent": {
        const eventId = request.eventId;
        if (typeof eventId !== "string" || !/^[0-9a-f]{64}$/.test(eventId)) {
          return reply(request, { error: "invalid: eventId" });
        }
        const options = isRecord(request.options) ? request.options : {};
        // 著者が分かれば、その人の書き込み先から引ける（Outbox）。
        const author =
          typeof options.author === "string" &&
          /^[0-9a-f]{64}$/.test(options.author)
            ? options.author
            : undefined;
        const filter: RelayFilter = {
          ids: [eventId],
          ...(author ? { authors: [author] } : {}),
          limit: 1,
        };
        collect([filter], hints, timeoutOf(options), (events, incomplete) =>
          reply(request, {
            ...(events[0] ? { result: events[0] } : {}),
            ...(incomplete && !events[0] ? { incomplete } : {}),
          }),
        );
        return;
      }
      case "outbox.resolveRelays": {
        const target = isRecord(request.target) ? request.target : {};
        const authors = [
          ...(stringList(target.authors) ? target.authors : []),
          ...(typeof target.pubkey === "string" ? [target.pubkey] : []),
        ];
        const known = authors.map((pubkey) => ({
          pubkey,
          relays: host.writeRelays(pubkey),
        }));
        const relays = [
          ...new Set(known.flatMap((entry) => entry.relays ?? [])),
        ];
        const missingAuthors = known
          .filter((entry) => entry.relays === undefined)
          .map((entry) => entry.pubkey);
        reply(request, {
          plan: {
            relays,
            source: relays.length > 0 ? "nip65" : "fallback",
            ...(missingAuthors.length > 0 ? { missingAuthors } : {}),
          },
        });
        return;
      }
      case "outbox.publish": {
        const parsed = parsePublishTemplate(request.event, "publish");
        if (!parsed.ok) {
          reply(request, { ok: false, error: parsed.error });
          return;
        }
        // 添えた行き先は、読むときのヒントと同じく本数を絞って足す。`toInboxes` は、
        // `p` タグの相手の read リレーへ Streets がもともと送るので、別に扱わない。
        const options = isRecord(request.options) ? request.options : {};
        const relays = stringList(options.relays)
          ? options.relays
              .flatMap((relay) => relayOf(relay) ?? [])
              .slice(0, NAPPLET_MAX_RELAY_HINTS)
          : [];
        void host
          .publish({ operation: "publish", draft: parsed.draft, relays })
          .then((result) =>
            reply(
              request,
              result.ok
                ? {
                    ok: true,
                    event: result.event,
                    eventId: result.event.id,
                    relays: result.relays,
                  }
                : { ok: false, error: result.error },
            ),
          );
        return;
      }
    }
  };

  /*
   * NAP-RESOURCE。結果は `<type>.result`、失敗は `<type>.error` で返す（@napplet/shim の形）。
   * 取っている途中に napplet が `resource.cancel` を送ったら、取るのをやめる。
   */
  const handleResource = (request: Message) => {
    const id = request.id as string;
    const serversOf = (raw: unknown) =>
      stringList(raw)
        ? raw
            .filter((server) => server.startsWith("https://"))
            .slice(0, NAPPLET_RESOURCE_MAX_SERVERS)
        : [];
    const start = (url: string, servers: readonly string[]) => {
      const controller = new AbortController();
      fetches.set(id, controller);
      return host
        .fetchResource(url, servers, controller.signal)
        .catch((error): NappletResourceResult => ({
          ok: false,
          error: "network-error",
          message: String(error),
        }));
    };
    const done = () => fetches.delete(id);
    switch (request.type) {
      case "resource.info":
        send({
          type: "resource.info.result",
          id,
          info: {
            schemes: [
              { scheme: "https", enabled: true },
              { scheme: "blossom", enabled: true },
              { scheme: "data", enabled: true },
              { scheme: "nostr", enabled: false },
              { scheme: "htree", enabled: false },
            ],
            maxBytes: NAPPLET_RESOURCE_MAX_BYTES,
            maxUrls: NAPPLET_RESOURCE_MAX_URLS,
            maxServers: NAPPLET_RESOURCE_MAX_SERVERS,
          },
        });
        return;
      case "resource.bytes": {
        if (typeof request.url !== "string") {
          send({ type: "resource.bytes.error", id, error: "invalid-request" });
          return;
        }
        void start(request.url, serversOf(request.servers)).then((result) => {
          const cancelled = !fetches.has(id);
          done();
          if (cancelled) return;
          send(
            result.ok
              ? {
                  type: "resource.bytes.result",
                  id,
                  blob: result.blob,
                  mime: result.mime,
                }
              : {
                  type: "resource.bytes.error",
                  id,
                  error: result.error,
                  ...(result.message ? { message: result.message } : {}),
                },
          );
        });
        return;
      }
      case "resource.bytesMany": {
        const requests = Array.isArray(request.requests)
          ? request.requests
          : [];
        if (
          requests.length === 0 ||
          requests.length > NAPPLET_RESOURCE_MAX_URLS ||
          !requests.every(
            (item) => isRecord(item) && typeof item.url === "string",
          )
        ) {
          send({
            type: "resource.bytesMany.error",
            id,
            error: "invalid-request",
          });
          return;
        }
        const controller = new AbortController();
        fetches.set(id, controller);
        void Promise.all(
          (requests as { url: string; servers?: unknown }[]).map(
            ({ url, servers }) =>
              host
                .fetchResource(url, serversOf(servers), controller.signal)
                .catch((error): NappletResourceResult => ({
                  ok: false,
                  error: "network-error",
                  message: String(error),
                }))
                .then((result) =>
                  result.ok
                    ? { url, ok: true, blob: result.blob, mime: result.mime }
                    : {
                        url,
                        ok: false,
                        error: result.error,
                        ...(result.message ? { message: result.message } : {}),
                      },
                ),
          ),
        ).then((items) => {
          const cancelled = !fetches.has(id);
          done();
          if (!cancelled)
            send({ type: "resource.bytesMany.result", id, items });
        });
        return;
      }
      case "resource.cancel":
        fetches.get(id)?.abort();
        fetches.delete(id);
        return;
    }
  };

  return {
    receive: (data) => {
      if (disposed || !isRecord(data) || typeof data.type !== "string") return;
      const message = data as Message;
      const domain = message.type.split(".")[0] ?? "";
      if (!exposed.has(domain)) return;
      if (domain === "shell") return handleShell(message);
      // 結果を返す要求は `id` で突き合わせる。無いものは答えようがない。購読は `subId` で扱い、
      // INC の送りっぱなしの知らせは結果を返さない。
      const withoutId =
        /^(relay|outbox)\.(subscribe|close)$/.test(message.type) ||
        /^inc\.(emit|unsubscribe|channel\.(emit|broadcast|close))$/.test(
          message.type,
        ) ||
        /^keys\.(forward|unregisterAction)$/.test(message.type) ||
        /^notify\.(dismiss|badge|channel\.register)$/.test(message.type) ||
        /^config\.(subscribe|unsubscribe|openSettings)$/.test(message.type);
      if (!withoutId && typeof message.id !== "string") return;
      switch (domain) {
        case "theme":
          return handleTheme(message);
        case "identity":
          return handleIdentity(message);
        case "storage":
          return handleStorage(message);
        case "relay":
          return handleRelay(message);
        case "outbox":
          return handleOutbox(message);
        case "resource":
          return handleResource(message);
        case "intent":
          return handleIntent(message);
        case "inc":
          return handleInc(message);
        case "link":
          return handleLink(message);
        case "keys":
          return handleKeys(message);
        case "common":
          return handleCommon(message);
        case "notify":
          return handleNotify(message);
        case "upload":
          return handleUpload(message);
        case "lists":
          return handleLists(message);
        case "config":
          return handleConfig(message);
        case "catalog":
          if (message.type === "catalog.get") {
            reply(message, { snapshot: host.catalog() });
          }
          return;
      }
    },
    themeChanged: () => {
      if (exposed.has("theme"))
        send({ type: "theme.changed", theme: host.theme() });
    },
    identityChanged: () => {
      if (exposed.has("identity")) {
        send({ type: "identity.changed", pubkey: host.publicKey() });
      }
    },
    deliver: (delivery) => {
      if (!exposed.has("intent")) return;
      if (initialized) send({ type: "intent.deliver", delivery });
      else waitingDeliveries.push(delivery);
    },
    intentChanged: (availability) => {
      if (exposed.has("intent")) send({ type: "intent.changed", availability });
    },
    configChanged: () => {
      if (exposed.has("config") && schema && configSubscribed) {
        send({ type: "config.values", values: configValues() });
      }
    },
    notifyEvent: (event) => {
      if (exposed.has("notify")) send(event);
    },
    incEvent: (event) => {
      if (exposed.has("inc") && topics.has(event.topic)) {
        send({ type: "inc.event", ...event });
      }
    },
    dispose: () => {
      for (const close of subscriptions.values()) close();
      subscriptions.clear();
      for (const stop of queries) stop();
      queries.clear();
      for (const controller of fetches.values()) controller.abort();
      fetches.clear();
      disposed = true;
    },
  };
};
