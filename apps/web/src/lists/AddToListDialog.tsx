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
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";
import SegmentedControl from "../ui/SegmentedControl";
import Switch from "../ui/Switch";
import CreateFollowSetForm from "./CreateFollowSetForm";
import { useFollowSets } from "./FollowSetMediator";
import { MEMBER_VISIBILITY_HINT, visibilityOptions } from "./visibility";

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
  const [creating, setCreating] = createSignal(props.initialCreating ?? false);
  const memberOf = (set: FollowSet) =>
    set.members.find((member) => member.pubkey === props.pubkey);

  return (
    <DialogRoot open onClose={props.onClose}>
      <DialogPortal>
        <DialogContent class="flex max-h-[80vh] w-full max-w-105 flex-col rounded-3 border border-primary">
          <div class="flex min-h-12 items-start gap-2 py-3 pr-3 pl-4">
            <DialogTitle class="min-w-0 flex-1 font-600 text-body">
              リストに追加
            </DialogTitle>
            <DialogClose />
          </div>
          <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
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
            <div class="flex flex-col gap-1.5">
              <SegmentedControl
                label="入れるときの公開範囲"
                variant="secondary"
                value={visibility()}
                options={visibilityOptions(props.privateReady)}
                onChange={setChosen}
              />
              <p class="c-secondary text-caption">
                {MEMBER_VISIBILITY_HINT[visibility()]}
              </p>
            </div>
            <Branch>
              <Match when={props.sets.length > 0}>
                <div class="flex flex-col">
                  <For each={props.sets}>
                    {(set) => (
                      <Switch
                        label={followSetName(set)}
                        checked={memberOf(set) !== undefined}
                        aside={
                          <Show when={memberOf(set)}>
                            {(member) => (
                              <span class="c-secondary shrink-0 rounded-full bg-secondary px-2 text-caption">
                                {member().visibility === "private"
                                  ? "非公開"
                                  : "公開"}
                              </span>
                            )}
                          </Show>
                        }
                        onChange={(on) => {
                          const current = memberOf(set);
                          if (on && !current) {
                            dispatch({
                              type: "follow-sets/add",
                              identifier: set.identifier,
                              member: {
                                pubkey: props.pubkey,
                                visibility: visibility(),
                              },
                            });
                          }
                          if (!on && current) {
                            dispatch({
                              type: "follow-sets/remove",
                              identifier: set.identifier,
                              member: current,
                            });
                          }
                        }}
                      />
                    )}
                  </For>
                </div>
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
              <div class="motion-fade animate-in rounded-2 border border-primary p-3">
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
          </div>
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
