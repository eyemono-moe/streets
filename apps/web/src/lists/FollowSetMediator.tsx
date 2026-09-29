import { buildFollowSetColumn } from "@streets/core/deck/column-presets";
import { followSetsSource } from "@streets/core/deck/column-sources";
import {
  FOLLOW_SET_KIND,
  type FollowSet,
  type FollowSetChange,
  changeFollowSet,
  decodeFollowSet,
  followSetName,
  latestFollowSets,
  newFollowSetIdentifier,
  readFollowSet,
} from "@streets/core/lists/follow-set";
import {
  type FollowSetEditEvent,
  type FollowSetWrite,
  displayedFollowSets,
  emptyFollowSetEdit,
  followSetEditTransition,
} from "@streets/core/lists/follow-set-edit";
import {
  type FollowSetFormEvent,
  type FollowSetFormState,
  closedFollowSetForm,
  followSetFormTransition,
  isFollowSetFormDirty,
} from "@streets/core/lists/follow-set-form";
import { buildDeletion } from "@streets/core/nostr/build/deletion";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { PrivatePartStatus } from "@streets/core/nostr/private-tags";
import type { SubscriptionManager } from "@streets/core/read/subscription-manager";
import type { Signer } from "@streets/core/signer/signer";
import { createSection } from "@streets/core/solid/create-section";
import type { Writer } from "@streets/core/write/writer";
import {
  type Accessor,
  type ParentComponent,
  Show,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
} from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { lazyPart, onceTrue } from "../lazy-part";
import { notifyError } from "../toast";
import { Mediates, type UiEvent, useDispatch } from "../ui-events";
import { trackWrites } from "../write-progress";

const FollowSetFormDialog = lazyPart(() => import("./FollowSetFormDialog"));

export type FollowSets = {
  viewer: string;
  /** 自分のリスト。作った直後や直している途中のものは、送る前の姿で出す。 */
  sets: Accessor<FollowSet[]>;
  /** 一覧をまだ 1 度も読み終えていない。 */
  loading: Accessor<boolean>;
  /** 新しく非公開で人を入れられるか。署名の方法によってはできない。 */
  privateReady: Accessor<boolean>;
  find: (identifier: string) => FollowSet | undefined;
};

const FollowSetsContext = createContext<FollowSets>();

/**
 * 自分のリストを裁定する段。一覧を読み（非公開のメンバーは復号する）、変更は
 * 1 回ずつ書き込む。送っている間は、送った変更を当てた姿を出す。リストを作る・
 * 直すフォームもここが持つ。
 */
export const FollowSetMediator: ParentComponent<{
  writer: Pick<Writer, "replace" | "publish">;
  signer: Signer;
  viewer: string;
  manager: SubscriptionManager;
}> = (props) => {
  const dispatch = useDispatch();
  const [state, setState] = createStore(emptyFollowSetEdit());
  const apply = (event: FollowSetEditEvent) =>
    setState(reconcile(followSetEditTransition(unwrap(state), event)));

  const section = createSection({
    source: () => followSetsSource(props.viewer),
    manager: props.manager,
  });
  const latest = createMemo(() => latestFollowSets(section.items()));

  // 復号は版ごとに 1 回だけ。届くまでは公開の部分だけを出す。
  const [decoded, setDecoded] = createSignal(new Map<string, FollowSet>());
  const decoding = new Set<string>();
  createEffect(() => {
    for (const event of latest()) {
      if (decoding.has(event.id)) continue;
      decoding.add(event.id);
      void decodeFollowSet(event, props.signer, props.viewer).then((set) =>
        setDecoded((current) => new Map(current).set(event.id, set)),
      );
    }
  });
  const saved = createMemo(() =>
    latest().map((event) => decoded().get(event.id) ?? readFollowSet(event)),
  );
  const sets = createMemo(() =>
    displayedFollowSets(saved(), state, props.viewer),
  );
  const eventOf = (identifier: string): NostrEvent | undefined =>
    latest().find((event) => readFollowSet(event).identifier === identifier);

  /** 失敗はトーストで知らせたうえで投げ直す（フォームが書きかけに戻れるように）。 */
  const write = (
    identifier: string,
    changes: FollowSetChange[],
    what: string,
  ): Promise<unknown> => {
    const pending: FollowSetWrite = {
      id: crypto.randomUUID(),
      identifier,
      changes,
    };
    apply({ type: "follow-sets/write", write: pending });
    return trackWrites(props.writer, "リスト")
      .replace(
        FOLLOW_SET_KIND,
        identifier,
        changeFollowSet(props.signer, props.viewer, changes),
      )
      .catch((cause) => {
        notifyError(cause, what);
        throw cause;
      })
      .finally(() => apply({ type: "follow-sets/settled", id: pending.id }));
  };
  /** 失敗はもうトーストで知らせてある。 */
  const quietly = (promise: Promise<unknown>) => void promise.catch(() => {});

  const remove = (identifier: string) => {
    const target = eventOf(identifier);
    if (!target) return;
    const pending: FollowSetWrite = {
      id: crypto.randomUUID(),
      identifier,
      changes: [],
      deleting: true,
    };
    apply({ type: "follow-sets/write", write: pending });
    trackWrites(props.writer, "リストの削除")
      .publish(buildDeletion(target))
      .catch((cause) => notifyError(cause, "リストを削除できませんでした"))
      .finally(() => apply({ type: "follow-sets/settled", id: pending.id }));
  };

  const [form, setForm] = createStore<{ value: FollowSetFormState }>({
    value: closedFollowSetForm(),
  });
  const applyForm = (event: FollowSetFormEvent) => {
    const next = followSetFormTransition(unwrap(form).value, event);
    setForm("value", reconcile(next));
    return next;
  };
  const submitForm = () => {
    const current = unwrap(form).value;
    if (current.phase !== "saving") return;
    const { title, description, image } = current.draft;
    const creating = current.mode === "create";
    const identifier = current.identifier ?? newFollowSetIdentifier();
    write(
      identifier,
      [{ type: "describe", title, description, image }],
      creating ? "リストを作れませんでした" : "リストを保存できませんでした",
    ).then(
      () => {
        applyForm({ type: "follow-set-form/saved" });
        // チャンネルを作ったときと同じく、作ったリストはデッキのカラムに足す。
        if (!creating) return;
        dispatch({
          type: "deck/add-column",
          column: {
            ...buildFollowSetColumn(
              props.viewer,
              identifier,
              followSetName({ title: title.trim(), identifier }),
            ),
            id: crypto.randomUUID(),
          },
        });
      },
      () => applyForm({ type: "follow-set-form/failed" }),
    );
  };

  // タブを閉じる・再読み込みでも、書きかけを黙って捨てない。
  createEffect(() => {
    if (!isFollowSetFormDirty(form.value)) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    onCleanup(() => window.removeEventListener("beforeunload", warn));
  });
  // 閉じる動きを見せるため、一度開いたら残す。
  const formMounted = onceTrue(() => form.value.phase !== "closed");

  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "follow-sets/create":
        quietly(
          write(
            newFollowSetIdentifier(),
            [
              {
                type: "describe",
                title: event.title,
                description: "",
                image: "",
              },
              { type: "add", member: event.member },
            ],
            "リストを作れませんでした",
          ),
        );
        return true;
      case "follow-sets/add":
        quietly(
          write(
            event.identifier,
            [{ type: "add", member: event.member }],
            "リストに追加できませんでした",
          ),
        );
        return true;
      case "follow-sets/remove":
        quietly(
          write(
            event.identifier,
            [{ type: "remove", member: event.member }],
            "リストから外せませんでした",
          ),
        );
        return true;
      case "follow-sets/move":
        quietly(
          write(
            event.identifier,
            [
              { type: "remove", member: event.from },
              { type: "add", member: event.to },
            ],
            "リストの公開範囲を変えられませんでした",
          ),
        );
        return true;
      case "follow-sets/delete":
        remove(event.identifier);
        return true;
      case "follow-set-form/submit":
        if (applyForm(event).phase === "saving") submitForm();
        return true;
      case "follow-set-form/open-create":
      case "follow-set-form/open-edit":
      case "follow-set-form/input":
      case "follow-set-form/close":
      case "follow-set-form/discard":
        applyForm(event);
        return true;
      default:
        return false;
    }
  };

  const value: FollowSets = {
    viewer: props.viewer,
    sets,
    loading: () =>
      section.status().phase !== "settled" && section.items().length === 0,
    privateReady: () => props.signer.nip44 !== undefined,
    find: (identifier) => sets().find((set) => set.identifier === identifier),
  };

  return (
    <FollowSetsContext.Provider value={value}>
      <Mediates handle={handle}>
        {props.children}
        <Show when={formMounted()}>
          <FollowSetFormDialog form={form.value} />
        </Show>
      </Mediates>
    </FollowSetsContext.Provider>
  );
};

/** ログインしていない場所（Storybook の一部など）では undefined。 */
export const useFollowSets = (): FollowSets | undefined =>
  useContext(FollowSetsContext);

/** 非公開の部分を読めなかったことを、リストの利用者に伝える一文。 */
export const privatePartNotice = (
  status: PrivatePartStatus | undefined,
): string | undefined => {
  switch (status) {
    case "unavailable":
      return "今のログインの方法では非公開のメンバーを読めないため、公開のメンバーだけを表示しています。";
    case "invalid":
      return "非公開のメンバーを読み取れませんでした。公開のメンバーだけを表示しています。";
    default:
      return undefined;
  }
};
