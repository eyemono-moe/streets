import {
  FOLLOW_SET_KIND,
  type FollowSet,
  type FollowSetMember,
  followSetName,
  mayBeLegacyMuteSet,
} from "@streets/core/lists/follow-set";
import { decodeUserInput, encodeNaddr } from "@streets/core/nostr/nip19";
import type { ItemVisibility } from "@streets/core/nostr/private-tags";
import { type Component, For, Show, createSignal } from "solid-js";
import { useUserCandidates, userSource } from "../completion/sources";
import ProfileRow from "../profile/ProfileRow";
import { notifyError, notifySuccess } from "../toast";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import Completion from "../ui/Completion";
import IconButton from "../ui/IconButton";
import SegmentedControl from "../ui/SegmentedControl";
import { textInputClass } from "../ui/TextField";
import { privatePartNotice } from "./FollowSetMediator";
import FollowSetPicture from "./FollowSetPicture";
import { LegacyMuteNotice, memberCountLabel } from "./FollowSetSummary";
import {
  MEMBER_VISIBILITY_HINT,
  VISIBILITY_LABEL,
  visibilityOptions,
} from "./visibility";

const AddMember: Component<{ set: FollowSet; privateReady: boolean }> = (
  props,
) => {
  const dispatch = useDispatch();
  const people = [
    userSource(useUserCandidates(), {
      trigger: { kind: "user", prefixes: [] },
      format: (nprofile) => nprofile,
    }),
  ];
  // 安全な側に倒す。入れたことを知られたくない人を、うっかり公開で入れない。
  const [chosen, setChosen] = createSignal<ItemVisibility>("private");
  const visibility = (): ItemVisibility =>
    props.privateReady ? chosen() : "public";
  const [text, setText] = createSignal("");
  const [error, setError] = createSignal<string>();

  const submit = () => {
    const pubkey = decodeUserInput(text());
    if (!pubkey) {
      setError(
        "npub1… か nprofile1… で始まる、ユーザーの ID を入力してください",
      );
      return;
    }
    if (props.set.members.some((member) => member.pubkey === pubkey)) {
      setError("もうこのリストに入っています");
      return;
    }
    dispatch({
      type: "follow-sets/add",
      identifier: props.set.identifier,
      member: { pubkey, visibility: visibility() },
    });
    setText("");
    setError(undefined);
  };

  return (
    <form
      class="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <SegmentedControl
        label="公開範囲"
        variant="secondary"
        value={visibility()}
        options={visibilityOptions(props.privateReady)}
        onChange={setChosen}
      />
      <div class="flex items-center gap-2">
        <Completion sources={people} label="人の候補">
          {(attach) => (
            <input
              ref={attach}
              class={`${textInputClass} min-w-0 flex-1`}
              placeholder="名前・npub1… で探す"
              aria-label="リストに入れる人"
              aria-invalid={error() !== undefined}
              value={text()}
              onInput={(event) => {
                setText(event.currentTarget.value);
                setError(undefined);
              }}
            />
          )}
        </Completion>
        <Button
          type="submit"
          variant="primary"
          icon="i-material-symbols:add-rounded"
        >
          追加
        </Button>
      </div>
      <p
        class="text-caption"
        classList={{ "c-danger": !!error(), "c-secondary": !error() }}
      >
        {error() ?? MEMBER_VISIBILITY_HINT[visibility()]}
      </p>
    </form>
  );
};

const MemberRow: Component<{
  set: FollowSet;
  member: FollowSetMember;
  editable: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <li>
      <ProfileRow
        pubkey={props.member.pubkey}
        detail={
          <Show when={props.editable}>
            <div class="flex items-center gap-2">
              <span class="c-secondary rounded-full bg-secondary px-2.5 py-0.5 font-600 text-caption">
                {VISIBILITY_LABEL[props.member.visibility]}
              </span>
              {/* リストから外すだけで、その人やフォローには触れない（⊖）。 */}
              <IconButton
                icon="i-material-symbols:do-not-disturb-on-outline-rounded"
                label="リストから外す"
                onClick={() =>
                  dispatch({
                    type: "follow-sets/remove",
                    identifier: props.set.identifier,
                    member: props.member,
                  })
                }
              />
            </div>
          </Show>
        }
      />
    </li>
  );
};

/** リストを消す。元に戻せないので、もう一度押してもらう。 */
const DeleteFollowSet: Component<{
  set: FollowSet;
  initialConfirming?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const [confirming, setConfirming] = createSignal(
    props.initialConfirming ?? false,
  );
  return (
    <Show
      when={confirming()}
      fallback={
        <Button
          variant="danger"
          icon="i-material-symbols:delete-outline-rounded"
          onClick={() => setConfirming(true)}
        >
          リストを削除
        </Button>
      }
    >
      <div class="motion-fade flex w-full animate-in flex-col gap-2 rounded-2 border border-primary p-3">
        <p class="text-caption">
          リストそのものを削除します。入っている人やフォローには影響しません。元には戻せません。
        </p>
        <div class="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            やめる
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon="i-material-symbols:delete-outline-rounded"
            onClick={() =>
              dispatch({
                type: "follow-sets/delete",
                identifier: props.set.identifier,
              })
            }
          >
            削除する
          </Button>
        </div>
      </div>
    </Show>
  );
};

/**
 * リストの情報。上に名前・説明・作った人を、下に入っている人を並べる。
 * リストのカラムの見出しの ⓘ から重ねて開く。自分のリストなら、ここで直す。
 */
const FollowSetInfoView: Component<{
  set?: FollowSet;
  settled: boolean;
  /** 自分のリストなら、情報とメンバーを直せる。 */
  editable: boolean;
  privateReady: boolean;
  /** Storybook で削除の確かめを開いた姿を並べるため。 */
  initialConfirmingDelete?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const copyLink = async (set: FollowSet) => {
    const naddr = encodeNaddr({
      identifier: set.identifier,
      pubkey: set.pubkey,
      eventKind: FOLLOW_SET_KIND,
    });
    try {
      await navigator.clipboard.writeText(`nostr:${naddr}`);
      notifySuccess("リンクをコピーしました");
    } catch (cause) {
      notifyError(cause, "リンクをコピーできませんでした");
    }
  };
  return (
    <Show
      when={props.set}
      fallback={
        <p class="c-secondary p-4 text-caption">
          {props.settled
            ? "このリストが見つかりません。削除されたか、リレーから取得できませんでした。"
            : "読み込み中…"}
        </p>
      }
    >
      {(set) => (
        <div class="flex flex-col gap-5 p-4">
          <div class="flex flex-col gap-2">
            <FollowSetPicture url={set().image} class="size-16 rounded-3" />
            <h3 class="c-primary break-anywhere font-700 text-h3">
              {followSetName(set())}
            </h3>
            <Show when={set().description}>
              {(description) => (
                <p class="c-primary break-anywhere whitespace-pre-wrap text-body">
                  {description()}
                </p>
              )}
            </Show>
            <Show when={mayBeLegacyMuteSet(set())}>
              <LegacyMuteNotice />
            </Show>
          </div>
          <section class="flex flex-col gap-1.5">
            <h4 class="c-secondary font-600 text-caption">作った人</h4>
            <div class="overflow-hidden rounded-2 border border-primary">
              <ProfileRow pubkey={set().pubkey} />
            </div>
          </section>
          <div class="flex flex-wrap gap-2">
            <Show when={props.editable}>
              <Button
                icon="i-material-symbols:edit-square-outline-rounded"
                onClick={() =>
                  dispatch({ type: "follow-set-form/open-edit", set: set() })
                }
              >
                情報を直す
              </Button>
            </Show>
            <Button
              icon="i-material-symbols:link-rounded"
              onClick={() => void copyLink(set())}
            >
              リンクをコピー
            </Button>
          </div>
          <section class="flex flex-col gap-1.5">
            <h4 class="c-secondary font-600 text-caption">
              入っている人（{memberCountLabel(set())}）
            </h4>
            <Show when={privatePartNotice(set().privatePart)}>
              {(notice) => (
                <p
                  class="rounded-2 p-3 text-caption"
                  classList={{
                    "c-danger bg-danger-subtle":
                      set().privatePart === "invalid",
                    "c-secondary bg-secondary": set().privatePart !== "invalid",
                  }}
                >
                  {notice()}
                </p>
              )}
            </Show>
            <Show when={props.editable}>
              <AddMember
                set={set()}
                privateReady={
                  props.privateReady && set().privatePart !== "invalid"
                }
              />
            </Show>
            <Show
              when={set().members.length > 0}
              fallback={
                <p class="c-secondary text-caption">
                  {props.editable
                    ? "まだ誰も入っていません。上の欄や、投稿・人のメニューの「リストに追加」から入れられます。"
                    : "まだ誰も入っていません。"}
                </p>
              }
            >
              <ul class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
                <For each={set().members}>
                  {(member) => (
                    <MemberRow
                      set={set()}
                      member={member}
                      editable={props.editable}
                    />
                  )}
                </For>
              </ul>
            </Show>
          </section>
          <Show when={props.editable}>
            <DeleteFollowSet
              set={set()}
              initialConfirming={props.initialConfirmingDelete}
            />
          </Show>
        </div>
      )}
    </Show>
  );
};

export default FollowSetInfoView;
