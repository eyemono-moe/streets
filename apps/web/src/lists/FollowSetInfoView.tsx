import {
  FOLLOW_SET_KIND,
  type FollowSet,
  type FollowSetMember,
  mayBeLegacyMuteSet,
} from "@streets/core/lists/follow-set";
import { decodeUserInput, encodeNaddr } from "@streets/core/nostr/nip19";
import type { ItemVisibility } from "@streets/core/nostr/private-tags";
import { type Component, For, Show, createSignal } from "solid-js";
import { useAppWindow } from "../app-window";
import { useUserCandidates, userSource } from "../completion/sources";
import { t } from "../i18n/locale";
import ProfileRow from "../profile/ProfileRow";
import { notifyError, notifySuccess } from "../toast";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import Completion from "../ui/Completion";
import IconButton from "../ui/IconButton";
import SegmentedControl from "../ui/SegmentedControl";
import { textInputClass } from "../ui/TextField";
import { followSetName } from "./follow-set-name";
import { privatePartNotice } from "./FollowSetMediator";
import { LegacyMuteNotice, memberCountLabel } from "./FollowSetSummary";
import ListPicture from "./ListPicture";
import {
  VISIBILITY_LABEL,
  memberVisibilityHint,
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
      setError(t("lists.info.invalidUser"));
      return;
    }
    if (props.set.members.some((member) => member.pubkey === pubkey)) {
      setError(t("lists.info.alreadyMember"));
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
        label={t("lists.info.visibility")}
        variant="secondary"
        value={visibility()}
        options={visibilityOptions(props.privateReady)}
        onChange={setChosen}
      />
      <div class="flex items-center gap-2">
        <Completion sources={people} label={t("lists.info.candidates")}>
          {(attach) => (
            <input
              ref={attach}
              class={`${textInputClass} min-w-0 flex-1`}
              placeholder={t("lists.info.searchPlaceholder")}
              aria-label={t("lists.info.memberInput")}
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
          {t("lists.info.add")}
        </Button>
      </div>
      <p
        class="text-caption"
        classList={{ "c-danger": !!error(), "c-secondary": !error() }}
      >
        {error() ?? memberVisibilityHint(visibility())}
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
                label={t("lists.info.removeMember")}
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
          {t("lists.info.delete")}
        </Button>
      }
    >
      <div class="motion-fade flex w-full animate-in flex-col gap-2 rounded-2 border border-primary p-3">
        <p class="text-caption">{t("lists.info.deleteNotice")}</p>
        <div class="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            {t("lists.common.cancel")}
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
            {t("lists.info.confirmDelete")}
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
  const appWindow = useAppWindow();
  const copyLink = async (set: FollowSet) => {
    const naddr = encodeNaddr({
      identifier: set.identifier,
      pubkey: set.pubkey,
      eventKind: FOLLOW_SET_KIND,
    });
    try {
      await appWindow.navigator.clipboard.writeText(`nostr:${naddr}`);
      notifySuccess(t("lists.info.linkCopied"));
    } catch (cause) {
      notifyError(cause, t("lists.info.linkCopyFailed"));
    }
  };
  return (
    <Show
      when={props.set}
      fallback={
        <p class="c-secondary p-4 text-caption">
          {props.settled ? t("lists.info.notFound") : t("lists.common.loading")}
        </p>
      }
    >
      {(set) => (
        <div class="flex flex-col gap-5 p-4">
          <div class="flex flex-col gap-2">
            <ListPicture url={set().image} class="size-16 rounded-3" />
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
            <h4 class="c-secondary font-600 text-caption">
              {t("lists.info.author")}
            </h4>
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
                {t("lists.info.edit")}
              </Button>
            </Show>
            <Button
              icon="i-material-symbols:link-rounded"
              onClick={() => void copyLink(set())}
            >
              {t("lists.info.copyLink")}
            </Button>
          </div>
          <section class="flex flex-col gap-1.5">
            <h4 class="c-secondary font-600 text-caption">
              {t("lists.info.members", { summary: memberCountLabel(set()) })}
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
                    ? t("lists.info.noMembersEditable")
                    : t("lists.info.noMembers")}
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
