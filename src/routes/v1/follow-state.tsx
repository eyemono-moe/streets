import {
  type Accessor,
  type ParentComponent,
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
} from "solid-js";
import { addFollow, removeFollow } from "../../core/nostr/build/follow";
import type { EventStore } from "../../core/read/event-store";
import { WriteFailedError, type Writer } from "../../core/write/writer";

const FOLLOW_KIND = 3;
const PUBKEY_PATTERN = /^[0-9a-f]{64}$/;

export type FollowError = {
  kind: "partial" | "failed";
  message: string;
};

export type FollowState = {
  viewer: string;
  followees: Accessor<readonly string[]>;
  isFollowing(pubkey: string): boolean;
  isSaving(pubkey: string): boolean;
  error(pubkey: string): FollowError | undefined;
  follow(pubkey: string): Promise<void>;
  unfollow(pubkey: string): Promise<void>;
  retry(pubkey: string): Promise<void>;
};

type FollowStore = Pick<
  EventStore,
  "latestReplaceable" | "onReplaceableChanged"
>;

export const followeesFrom = (
  event: ReturnType<FollowStore["latestReplaceable"]>,
): readonly string[] => {
  const unique = new Set<string>();
  for (const tag of event?.tags ?? []) {
    const pubkey = tag[0] === "p" ? tag[1] : undefined;
    if (pubkey && PUBKEY_PATTERN.test(pubkey)) unique.add(pubkey);
  }
  return [...unique];
};

export const createFollowState = (options: {
  viewer: string;
  store: FollowStore;
  writer: Pick<Writer, "replace">;
}): FollowState => {
  const [revision, setRevision] = createSignal(0);
  const [saving, setSaving] = createSignal<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = createSignal<ReadonlyMap<string, FollowError>>(
    new Map(),
  );
  const retryActions = new Map<string, "follow" | "unfollow">();
  let queue = Promise.resolve();

  const followees = createMemo(() => {
    revision();
    return followeesFrom(
      options.store.latestReplaceable(FOLLOW_KIND, options.viewer),
    );
  });

  const offChanged = options.store.onReplaceableChanged((change) => {
    if (change.kind === FOLLOW_KIND && change.pubkey === options.viewer) {
      setRevision((value) => value + 1);
    }
  });
  onCleanup(offChanged);

  const change = (
    pubkey: string,
    action: "follow" | "unfollow",
  ): Promise<void> => {
    if (
      !PUBKEY_PATTERN.test(pubkey) ||
      pubkey === options.viewer ||
      saving().has(pubkey)
    ) {
      return Promise.resolve();
    }
    setSaving((current) => new Set(current).add(pubkey));

    const operation = queue
      .catch(() => {})
      .then(async () => {
        setErrors((current) => {
          const next = new Map(current);
          next.delete(pubkey);
          return next;
        });
        try {
          const result = await options.writer.replace(
            FOLLOW_KIND,
            undefined,
            action === "follow" ? addFollow(pubkey) : removeFollow(pubkey),
          );
          if (result.rejected.length > 0) {
            retryActions.set(pubkey, action);
            setErrors((current) =>
              new Map(current).set(pubkey, {
                kind: "partial",
                message: `一部のリレーへ保存できませんでした (${result.rejected.length} 本)`,
              }),
            );
          } else {
            retryActions.delete(pubkey);
          }
        } catch (cause) {
          retryActions.set(pubkey, action);
          const message =
            cause instanceof WriteFailedError
              ? `どのリレーにも保存できませんでした (${cause.rejected.length} 本)`
              : `フォロー状態を保存できませんでした: ${cause instanceof Error ? cause.message : String(cause)}`;
          setErrors((current) =>
            new Map(current).set(pubkey, { kind: "failed", message }),
          );
        } finally {
          setSaving((current) => {
            const next = new Set(current);
            next.delete(pubkey);
            return next;
          });
        }
      });
    queue = operation;
    return operation;
  };

  return {
    viewer: options.viewer,
    followees,
    isFollowing: (pubkey) => followees().includes(pubkey),
    isSaving: (pubkey) => saving().has(pubkey),
    error: (pubkey) => errors().get(pubkey),
    follow: (pubkey) => change(pubkey, "follow"),
    unfollow: (pubkey) => change(pubkey, "unfollow"),
    retry: (pubkey) =>
      change(
        pubkey,
        retryActions.get(pubkey) ??
          (followees().includes(pubkey) ? "follow" : "unfollow"),
      ),
  };
};

const FollowStateContext = createContext<FollowState>();

export const FollowStateProvider: ParentComponent<{ value: FollowState }> = (
  props,
) => (
  <FollowStateContext.Provider value={props.value}>
    {props.children}
  </FollowStateContext.Provider>
);

export const useFollowState = (): FollowState => {
  const state = useContext(FollowStateContext);
  if (!state) throw new Error("FollowStateProvider の内側で使用してください");
  return state;
};
