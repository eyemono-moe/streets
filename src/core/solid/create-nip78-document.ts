import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import * as v from "valibot";
import type { NostrEvent } from "../nostr/event";
import type { Scheduler } from "../read/connection-pool";
import { defaultScheduler } from "../read/connection-pool";
import { Nip44UnavailableError, type Signer } from "../signer/signer";
import type { WriteResult, Writer } from "../write/writer";

export const NIP78_KIND = 30_078;
export const NIP78_SAVE_DEBOUNCE_MS = 2_000;

export type Nip78DocumentState =
  | { phase: "signed-out" }
  | { phase: "loading"; cached: boolean }
  | {
      phase: "ready";
      sync: "synced" | "pending" | "saving";
      remoteCreatedAt?: number;
    }
  | { phase: "error"; message: string; retryable: boolean }
  | { phase: "conflict"; remoteCreatedAt: number };

export type Nip78Document<T> = {
  value: Accessor<T | undefined>;
  state: Accessor<Nip78DocumentState>;
  update(change: (current: T) => T): void;
  refresh(): Promise<void>;
  keepLocal(): Promise<void>;
  useRemote(): void;
};

export type Nip78DocumentDefinition<T> = {
  identifier: string;
  cacheKey(pubkey: string): string;
  initial(pubkey: string): T;
  serialize(value: T): string;
  parse(raw: string): T | undefined;
  equals(left: T, right: T): boolean;
  migrateLegacy?(raw: string): T | undefined;
};

export type Nip78DocumentStorage = Pick<Storage, "getItem" | "setItem">;

export type CreateNip78DocumentOptions<T> = {
  definition: Nip78DocumentDefinition<T>;
  pubkey: Accessor<string | undefined>;
  routingSettled: Accessor<boolean>;
  signer: Signer;
  writer: Pick<Writer, "replace">;
  fetchLatest(
    kind: number,
    identifier: string | undefined,
    pubkey: string,
  ): Promise<NostrEvent | undefined>;
  storage: Nip78DocumentStorage;
  scheduler?: Scheduler;
  debounceMs?: number;
};

type RemoteVersion = { id: string; createdAt: number };
type LocalDocument<T> = {
  value: T;
  serialized: string;
  dirty: boolean;
  remote?: RemoteVersion;
};
type Conflict<T> = {
  event: NostrEvent;
  value: T;
  serialized: string;
};

const cacheSchema = v.strictObject({
  cacheVersion: v.literal(1),
  serialized: v.string(),
  dirty: v.boolean(),
  remote: v.optional(
    v.strictObject({
      id: v.string(),
      createdAt: v.number(),
    }),
  ),
});

class RemoteChangedError extends Error {
  constructor(readonly remote: NostrEvent) {
    super("NIP-78 remote document changed");
    this.name = "RemoteChangedError";
  }
}

class InvalidNip78DocumentError extends Error {
  constructor() {
    super("NIP-78 document payload is invalid");
    this.name = "InvalidNip78DocumentError";
  }
}

const remoteVersion = (event: NostrEvent): RemoteVersion => ({
  id: event.id,
  createdAt: event.created_at,
});

export const createNip78Document = <T>(
  options: CreateNip78DocumentOptions<T>,
): Nip78Document<T> => {
  const scheduler = options.scheduler ?? defaultScheduler;
  const debounceMs = options.debounceMs ?? NIP78_SAVE_DEBOUNCE_MS;
  const [value, setValue] = createSignal<T>();
  const [state, setState] = createSignal<Nip78DocumentState>({
    phase: "signed-out",
  });

  let author: string | undefined;
  let local: LocalDocument<T> | undefined;
  let conflict: Conflict<T> | undefined;
  let generation = 0;
  let revision = 0;
  let refreshRevision = 0;
  let loadedGeneration = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queue: Promise<void> = Promise.resolve();
  let disposed = false;
  let storageFailed = false;

  const clearTimer = () => {
    if (timer === undefined) return;
    scheduler.clearTimeout(timer);
    timer = undefined;
  };

  const storageErrorState = (): Nip78DocumentState => ({
    phase: "error",
    message:
      "この端末へ同期データを保存できませんでした。ブラウザのストレージ設定を確認してください",
    retryable: true,
  });

  const transition = (next: Nip78DocumentState) => {
    setState(storageFailed ? storageErrorState() : next);
  };

  const persistLocal = (): boolean => {
    if (!author || !local) return false;
    try {
      options.storage.setItem(
        options.definition.cacheKey(author),
        JSON.stringify({
          cacheVersion: 1,
          serialized: local.serialized,
          dirty: local.dirty,
          ...(local.remote ? { remote: local.remote } : {}),
        }),
      );
      storageFailed = false;
      return true;
    } catch {
      storageFailed = true;
      setState(storageErrorState());
      return false;
    }
  };

  const readLocal = (nextAuthor: string): LocalDocument<T> | undefined => {
    let raw: string | null;
    try {
      raw = options.storage.getItem(options.definition.cacheKey(nextAuthor));
    } catch {
      storageFailed = true;
      return undefined;
    }
    if (raw === null) return undefined;

    try {
      const parsed = v.safeParse(cacheSchema, JSON.parse(raw));
      if (parsed.success) {
        const parsedValue = options.definition.parse(parsed.output.serialized);
        if (parsedValue !== undefined) {
          return {
            value: parsedValue,
            serialized: parsed.output.serialized,
            dirty: parsed.output.dirty,
            remote: parsed.output.remote,
          };
        }
      }
    } catch {
      // 旧形式の migration を下で試す。
    }

    const migrated = options.definition.migrateLegacy?.(raw);
    return migrated === undefined
      ? undefined
      : {
          value: migrated,
          serialized: options.definition.serialize(migrated),
          dirty: true,
        };
  };

  const requireNip44 = () => {
    if (!options.signer.nip44) throw new Nip44UnavailableError();
    return options.signer.nip44;
  };

  const decodeRemote = async (
    event: NostrEvent,
    expectedAuthor: string,
  ): Promise<Conflict<T>> => {
    const plaintext = await requireNip44().decrypt(
      expectedAuthor,
      event.content,
    );
    const parsed = options.definition.parse(plaintext);
    if (parsed === undefined) throw new InvalidNip78DocumentError();
    return { event, value: parsed, serialized: plaintext };
  };

  const setLocal = (next: LocalDocument<T>, incrementRevision = true) => {
    local = next;
    if (incrementRevision) revision += 1;
    setValue(() => next.value);
    persistLocal();
  };

  const errorMessage = (cause: unknown, operation: "load" | "save") => {
    if (cause instanceof Nip44UnavailableError) {
      return "同期には NIP-44 対応と署名器の権限が必要です";
    }
    if (cause instanceof InvalidNip78DocumentError) {
      return "リレー上の同期データを読み取れませんでした";
    }
    return operation === "load"
      ? "同期データを取得できませんでした。接続を確認して再試行してください"
      : "同期データを保存できませんでした。署名器と接続を確認して再試行してください";
  };

  const validRun = (expectedGeneration: number, expectedAuthor: string) =>
    !disposed &&
    generation === expectedGeneration &&
    author === expectedAuthor &&
    options.pubkey() === expectedAuthor;

  const saveOnce = async (
    expectedGeneration: number,
    expectedAuthor: string,
  ): Promise<void> => {
    if (
      !validRun(expectedGeneration, expectedAuthor) ||
      !local ||
      !local.dirty
    ) {
      return;
    }
    const snapshot = local;
    const snapshotRevision = revision;
    transition({
      phase: "ready",
      sync: "saving",
      remoteCreatedAt: snapshot.remote?.createdAt,
    });

    let result: WriteResult;
    try {
      result = await options.writer.replace(
        NIP78_KIND,
        options.definition.identifier,
        async (current) => {
          // fetchLatest の待機中に logout / account 切替が起きた場合、
          // 新しい署名器へ旧 account の平文を渡す前に止める。
          if (!validRun(expectedGeneration, expectedAuthor)) {
            throw new Error("NIP-78 document の account が変わりました");
          }
          // current が無い場合は、消えた document を local から復旧してよい。
          // current が別 id なら、確認していない remote を上書きしない。
          if (current && current.id !== snapshot.remote?.id) {
            throw new RemoteChangedError(current);
          }
          // getter が返した NIP-44 adapter を await の前に固定する。
          // ActiveSigner が途中で切り替わっても、処理中の暗号化先は変えない。
          const nip44 = requireNip44();
          const content = await nip44.encrypt(
            expectedAuthor,
            snapshot.serialized,
          );
          // 暗号化の承認待ち中に account が変わった場合は、旧 draft を
          // Writer の署名段階へ渡さない。
          if (!validRun(expectedGeneration, expectedAuthor)) {
            throw new Error("NIP-78 document の account が変わりました");
          }
          return { kind: NIP78_KIND, tags: [], content };
        },
      );
    } catch (cause) {
      if (!validRun(expectedGeneration, expectedAuthor)) return;
      // 保存中の update が置いた timer を自動 retry に使わない。
      // 成功時だけ下で revision 差を即時再送する。
      clearTimer();
      if (cause instanceof RemoteChangedError) {
        try {
          const remote = await decodeRemote(cause.remote, expectedAuthor);
          if (!validRun(expectedGeneration, expectedAuthor) || !local) return;
          // decode の承認待ち中に update が置いた timer も、競合解決を
          // 追い越して保存を始めないように片付ける。
          clearTimer();
          if (options.definition.equals(local.value, remote.value)) {
            setLocal({
              value: local.value,
              serialized: local.serialized,
              dirty: false,
              remote: remoteVersion(remote.event),
            });
            conflict = undefined;
            transition({
              phase: "ready",
              sync: "synced",
              remoteCreatedAt: remote.event.created_at,
            });
          } else {
            conflict = remote;
            transition({
              phase: "conflict",
              remoteCreatedAt: remote.event.created_at,
            });
          }
        } catch (decodeCause) {
          if (!validRun(expectedGeneration, expectedAuthor)) return;
          // 復号の承認待ち中に置かれた timer を失敗後の自動 retry に
          // 使わず、次の明示操作まで error 状態を保つ。
          clearTimer();
          transition({
            phase: "error",
            message: errorMessage(decodeCause, "load"),
            retryable: true,
          });
        }
        return;
      }
      transition({
        phase: "error",
        message: errorMessage(cause, "save"),
        retryable: true,
      });
      return;
    }

    if (!validRun(expectedGeneration, expectedAuthor) || !local) return;
    // 保存中の update が置いた debounce timer は、revision 差による
    // 即時再送と二重になるため必ず片付ける。
    clearTimer();
    const changedWhileSaving = revision !== snapshotRevision;
    local = {
      ...local,
      dirty: changedWhileSaving,
      remote: remoteVersion(result.event),
    };
    persistLocal();
    if (changedWhileSaving) {
      transition({
        phase: "ready",
        sync: "pending",
        remoteCreatedAt: result.event.created_at,
      });
      void enqueueSave(expectedGeneration, expectedAuthor);
      return;
    }
    transition({
      phase: "ready",
      sync: "synced",
      remoteCreatedAt: result.event.created_at,
    });
  };

  const enqueueSave = (
    expectedGeneration = generation,
    expectedAuthor = author,
  ): Promise<void> => {
    if (!expectedAuthor) return Promise.resolve();
    const operation = queue
      .catch(() => {})
      .then(() => saveOnce(expectedGeneration, expectedAuthor));
    queue = operation;
    return operation;
  };

  const scheduleSave = () => {
    clearTimer();
    const expectedGeneration = generation;
    const expectedAuthor = author;
    if (!expectedAuthor) return;
    timer = scheduler.setTimeout(() => {
      timer = undefined;
      void enqueueSave(expectedGeneration, expectedAuthor);
    }, debounceMs);
  };

  const reconcile = async (
    expectedGeneration: number,
    expectedAuthor: string,
  ): Promise<void> => {
    const expectedRefresh = ++refreshRevision;
    transition({ phase: "loading", cached: local !== undefined });
    try {
      const event = await options.fetchLatest(
        NIP78_KIND,
        options.definition.identifier,
        expectedAuthor,
      );
      if (
        !validRun(expectedGeneration, expectedAuthor) ||
        refreshRevision !== expectedRefresh
      ) {
        return;
      }

      if (!event) {
        const nextValue =
          local?.value ?? options.definition.initial(expectedAuthor);
        setLocal({
          value: nextValue,
          serialized: options.definition.serialize(nextValue),
          dirty: true,
        });
        conflict = undefined;
        transition({ phase: "ready", sync: "pending" });
        scheduleSave();
        return;
      }

      const remote = await decodeRemote(event, expectedAuthor);
      if (
        !validRun(expectedGeneration, expectedAuthor) ||
        refreshRevision !== expectedRefresh
      ) {
        return;
      }

      if (!local || !local.dirty) {
        setLocal({
          value: remote.value,
          serialized: remote.serialized,
          dirty: false,
          remote: remoteVersion(event),
        });
        conflict = undefined;
        transition({
          phase: "ready",
          sync: "synced",
          remoteCreatedAt: event.created_at,
        });
        return;
      }

      if (options.definition.equals(local.value, remote.value)) {
        setLocal({
          value: local.value,
          serialized: local.serialized,
          dirty: false,
          remote: remoteVersion(event),
        });
        conflict = undefined;
        transition({
          phase: "ready",
          sync: "synced",
          remoteCreatedAt: event.created_at,
        });
        return;
      }

      if (local.remote?.id === event.id) {
        transition({
          phase: "ready",
          sync: "pending",
          remoteCreatedAt: event.created_at,
        });
        scheduleSave();
        return;
      }

      conflict = remote;
      transition({
        phase: "conflict",
        remoteCreatedAt: event.created_at,
      });
    } catch (cause) {
      if (
        !validRun(expectedGeneration, expectedAuthor) ||
        refreshRevision !== expectedRefresh
      ) {
        return;
      }
      if (!local) {
        const fallback = options.definition.initial(expectedAuthor);
        setLocal({
          value: fallback,
          serialized: options.definition.serialize(fallback),
          dirty: true,
        });
      }
      transition({
        phase: "error",
        message: errorMessage(cause, "load"),
        retryable: true,
      });
    }
  };

  const activate = (nextAuthor: string | undefined) => {
    clearTimer();
    // 前 account の未解決な署名要求を待たず、新 account は独立した
    // 保存列を開始できる。旧列の完了は generation guard で無視する。
    queue = Promise.resolve();
    generation += 1;
    refreshRevision += 1;
    loadedGeneration = -1;
    conflict = undefined;
    local = undefined;
    revision = 0;
    storageFailed = false;
    author = nextAuthor;
    setValue(undefined);
    if (!nextAuthor) {
      setState({ phase: "signed-out" });
      return;
    }

    local = readLocal(nextAuthor);
    if (local) {
      revision += 1;
      setValue(() => local?.value);
      // 旧形式を読んだ場合も、ここで汎用 envelope へ移す。
      persistLocal();
    }
    transition({ phase: "loading", cached: local !== undefined });
  };

  createEffect(() => {
    const nextAuthor = options.pubkey();
    const settled = options.routingSettled();
    if (nextAuthor !== author) activate(nextAuthor);
    if (!nextAuthor || !settled || loadedGeneration === generation) return;
    loadedGeneration = generation;
    void reconcile(generation, nextAuthor);
  });

  onCleanup(() => {
    disposed = true;
    generation += 1;
    refreshRevision += 1;
    clearTimer();
  });

  return {
    value,
    state,
    update(change) {
      if (!local || !author) return;
      const next = change(local.value);
      if (next === local.value) return;
      const nextSerialized = options.definition.serialize(next);
      local = {
        value: next,
        serialized: nextSerialized,
        dirty: true,
        remote: local.remote,
      };
      revision += 1;
      setValue(() => next);
      persistLocal();
      if (conflict) {
        transition({
          phase: "conflict",
          remoteCreatedAt: conflict.event.created_at,
        });
        return;
      }
      transition({
        phase: "ready",
        sync: "pending",
        remoteCreatedAt: local.remote?.createdAt,
      });
      scheduleSave();
    },
    async refresh() {
      if (!author) return;
      await reconcile(generation, author);
    },
    async keepLocal() {
      if (!author || !local || !conflict) return;
      clearTimer();
      const confirmedRemote = remoteVersion(conflict.event);
      local = {
        ...local,
        dirty: true,
        remote: confirmedRemote,
      };
      conflict = undefined;
      persistLocal();
      transition({
        phase: "ready",
        sync: "pending",
        remoteCreatedAt: confirmedRemote.createdAt,
      });
      await enqueueSave(generation, author);
    },
    useRemote() {
      if (!conflict) return;
      clearTimer();
      const remote = conflict;
      conflict = undefined;
      setLocal({
        value: remote.value,
        serialized: remote.serialized,
        dirty: false,
        remote: remoteVersion(remote.event),
      });
      transition({
        phase: "ready",
        sync: "synced",
        remoteCreatedAt: remote.event.created_at,
      });
    },
  };
};
