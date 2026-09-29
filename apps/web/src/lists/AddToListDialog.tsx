import { type FollowSet, followSetName } from "@streets/core/lists/follow-set";
import type { ItemVisibility } from "@streets/core/nostr/private-tags";
import {
  type Component,
  For,
  Match,
  Show,
  Switch as Branch,
  createSignal,
} from "solid-js";
import Avatar from "../note/Avatar";
import { ProfileName } from "../note/Name";
import { useProfileDetails } from "../note/use-profile";
import { useDispatch } from "../ui-events";
import {
  DialogBody,
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";
import SegmentedControl from "../ui/SegmentedControl";
import CreateFollowSetForm from "./CreateFollowSetForm";
import { useFollowSets } from "./FollowSetMediator";
import {
  MEMBERSHIP_HINT,
  type Membership,
  membershipOptions,
  visibilityOptions,
} from "./visibility";

export const AddToListDialogView: Component<{
  pubkey: string;
  sets: readonly FollowSet[];
  loading: boolean;
  privateReady: boolean;
  onClose: () => void;
  /** Storybook で作る欄を開いた姿を並べるため。 */
  initialCreating?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const details = useProfileDetails(() => props.pubkey);
  // 安全な側に倒す。入れたことを知られたくない人を、うっかり公開で入れない。
  const [chosen, setChosen] = createSignal<ItemVisibility>("private");
  const visibility = (): ItemVisibility =>
    props.privateReady ? chosen() : "public";
  const memberOf = (set: FollowSet) =>
    set.members.find((member) => member.pubkey === props.pubkey);
  const choose = (set: FollowSet, next: Membership) => {
    const current = memberOf(set);
    if ((current?.visibility ?? "none") === next) return;
    const identifier = set.identifier;
    if (next === "none") {
      if (current)
        dispatch({ type: "follow-sets/remove", identifier, member: current });
      return;
    }
    const member = { pubkey: props.pubkey, visibility: next };
    dispatch(
      current
        ? { type: "follow-sets/move", identifier, from: current, to: member }
        : { type: "follow-sets/add", identifier, member },
    );
  };
  const [creating, setCreating] = createSignal(props.initialCreating ?? false);

  return (
    <DialogRoot open onClose={props.onClose}>
      <DialogPortal>
        <DialogContent class="w-full max-w-105 rounded-3 border border-primary">
          <div class="flex min-h-12 shrink-0 items-start gap-2 py-3 pr-3 pl-4">
            <DialogTitle class="min-w-0 flex-1 font-600 text-body">
              リストに追加
            </DialogTitle>
            <DialogClose />
          </div>
          <DialogBody class="flex flex-col gap-4 px-4 pb-4">
            <div class="flex min-w-0 items-center gap-2">
              <Avatar pubkey={props.pubkey} size="compact" static />
              <span class="truncate font-600 text-body">
                <ProfileName
                  pubkey={props.pubkey}
                  profile={details()?.profile}
                  tags={details()?.tags}
                />
              </span>
            </div>
            <p class="c-secondary text-caption">{MEMBERSHIP_HINT}</p>
            <Branch>
              <Match when={props.sets.length > 0}>
                <ul class="flex flex-col">
                  <For each={props.sets}>
                    {(set) => (
                      <li class="flex min-h-11 items-center gap-3 py-1">
                        <span class="min-w-0 flex-1 break-words text-body">
                          {followSetName(set)}
                        </span>
                        <SegmentedControl
                          label={`「${followSetName(set)}」に入れるか`}
                          variant="secondary"
                          value={memberOf(set)?.visibility ?? "none"}
                          options={membershipOptions(props.privateReady)}
                          onChange={(next) => choose(set, next)}
                        />
                      </li>
                    )}
                  </For>
                </ul>
              </Match>
              <Match when={props.loading}>
                <p class="c-secondary text-caption">読み込み中…</p>
              </Match>
              <Match when={true}>
                <p class="c-secondary text-caption">まだリストがありません。</p>
              </Match>
            </Branch>
            <Show
              when={creating()}
              fallback={
                <button
                  type="button"
                  class="c-accent-5 flex cursor-pointer items-center gap-1.5 self-start bg-transparent p-0 font-600 text-body hover:underline"
                  onClick={() => setCreating(true)}
                >
                  <span
                    class="i-material-symbols:add-rounded size-4.5"
                    aria-hidden="true"
                  />
                  新しいリストを作って入れる
                </button>
              }
            >
              <div class="motion-fade flex animate-in flex-col gap-3 rounded-2 border border-primary p-3">
                <div class="flex items-center gap-3">
                  <span class="min-w-0 flex-1 text-body">
                    入れるときの公開範囲
                  </span>
                  <SegmentedControl
                    label="新しいリストに入れるときの公開範囲"
                    variant="secondary"
                    value={visibility()}
                    options={visibilityOptions(props.privateReady)}
                    onChange={setChosen}
                  />
                </div>
                <CreateFollowSetForm
                  submitLabel="作って入れる"
                  onSubmit={(title) => {
                    dispatch({
                      type: "follow-sets/create",
                      title,
                      member: {
                        pubkey: props.pubkey,
                        visibility: visibility(),
                      },
                    });
                    setCreating(false);
                  }}
                  onCancel={() => setCreating(false)}
                />
              </div>
            </Show>
          </DialogBody>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};

/** 投稿やその人のメニューから開く「リストに追加」。 */
const AddToListDialog: Component<{ pubkey: string; onClose: () => void }> = (
  props,
) => {
  const lists = useFollowSets();
  return (
    <AddToListDialogView
      pubkey={props.pubkey}
      sets={lists?.sets() ?? []}
      loading={lists?.loading() ?? false}
      privateReady={lists?.privateReady() ?? false}
      onClose={props.onClose}
    />
  );
};

export default AddToListDialog;
