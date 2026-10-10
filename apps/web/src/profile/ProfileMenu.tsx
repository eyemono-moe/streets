import { Menu } from "@ark-ui/solid/menu";
import type { MuteTarget } from "@streets/core/nostr/build/mute";
import { zapEndpointOf } from "@streets/core/zap/lnurl";
import { type Component, Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { useEventActions } from "../actions";
import { lazyPart } from "../lazy-part";
import { useFollowSets } from "../lists/FollowSetMediator";
import { useProfileDetails } from "../note/use-profile";
import { useMutes } from "../settings/MuteMediator";
import { useDispatch } from "../ui-events";
import IconButton from "../ui/IconButton";
import { menuContentClass, menuIconClass, menuItemClass } from "../ui/menu";

const AuthorRelaysDialog = lazyPart(() => import("./AuthorRelaysDialog"));

const AddToListDialog = lazyPart(() => import("../lists/AddToListDialog"));

export const ProfileMenuView: Component<{
  open?: boolean;
  mine: boolean;
  muted: boolean;
  muteAvailable: boolean;
  /** ログインしていれば、リストに入れられる。 */
  listAvailable: boolean;
  /** Zap の受け取り先を書いている人にだけ、Zap を出す。 */
  zappable: boolean;
  onZap: () => void;
  onMute: () => void;
  onOpenRelays: () => void;
  onAddToList: () => void;
}> = (props) => {
  return (
    <Menu.Root
      open={props.open}
      lazyMount
      unmountOnExit
      onSelect={(details) => {
        if (details.value === "zap") props.onZap();
        if (details.value === "relays") props.onOpenRelays();
        if (details.value === "mute") props.onMute();
        if (details.value === "add-to-list") props.onAddToList();
      }}
    >
      <Menu.Trigger
        asChild={(trigger) => (
          <IconButton
            {...trigger()}
            variant="secondary"
            size="md"
            circle
            icon="i-material-symbols:more-horiz"
            label="このユーザーの操作"
          />
        )}
      />
      <Portal>
        <Menu.Positioner>
          <Menu.Content class={`${menuContentClass} w-56`}>
            <Show when={props.zappable && !props.mine}>
              <Menu.Item value="zap" class={menuItemClass}>
                <span
                  class={`i-material-symbols:bolt-outline-rounded ${menuIconClass}`}
                  aria-hidden="true"
                />
                Zap する
              </Menu.Item>
            </Show>
            <Menu.Item value="relays" class={menuItemClass}>
              <span
                class={`i-material-symbols:hub-outline ${menuIconClass}`}
                aria-hidden="true"
              />
              リレー設定
            </Menu.Item>
            <Menu.Item
              value="add-to-list"
              disabled={!props.listAvailable}
              class={menuItemClass}
            >
              <span
                class={`i-material-symbols:playlist-add-rounded ${menuIconClass}`}
                aria-hidden="true"
              />
              リストに追加
            </Menu.Item>
            <Show when={!props.mine}>
              <Menu.Item
                value="mute"
                disabled={!props.muteAvailable}
                class={menuItemClass}
              >
                <span
                  class={`${menuIconClass} ${
                    props.muted
                      ? "i-material-symbols:person-outline-rounded"
                      : "i-material-symbols:person-off-outline-rounded"
                  }`}
                  aria-hidden="true"
                />
                {props.muted ? "ミュートを解除" : "ミュート"}
              </Menu.Item>
            </Show>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};

/** ユーザーカラム上部から、その人に対する操作を開く。 */
const ProfileMenu: Component<{ pubkey: string }> = (props) => {
  const dispatch = useDispatch();
  const mutes = useMutes();
  const viewer = useEventActions()?.viewer;
  const lists = useFollowSets();
  const details = useProfileDetails(() => props.pubkey);
  const [relaysOpen, setRelaysOpen] = createSignal(false);
  const [addingToList, setAddingToList] = createSignal(false);
  const target = (): MuteTarget => ({ type: "pubkey", value: props.pubkey });
  const mutedEntry = () =>
    mutes
      ?.entries()
      .find(
        (entry) =>
          entry.target.type === "pubkey" && entry.target.value === props.pubkey,
      );
  const toggleMute = () => {
    const entry = mutedEntry();
    dispatch(
      entry
        ? { type: "mutes/remove", entry }
        : { type: "mutes/add", target: target() },
    );
  };

  return (
    <>
      <ProfileMenuView
        mine={props.pubkey === viewer}
        muted={mutedEntry() !== undefined}
        muteAvailable={mutes !== undefined}
        listAvailable={lists !== undefined}
        zappable={zapEndpointOf(details()?.content) !== undefined}
        onZap={() =>
          dispatch({
            type: "zap/open",
            target: { type: "profile", pubkey: props.pubkey },
          })
        }
        onMute={toggleMute}
        onOpenRelays={() => setRelaysOpen(true)}
        onAddToList={() => setAddingToList(true)}
      />
      <Show when={addingToList()}>
        <AddToListDialog
          pubkey={props.pubkey}
          onClose={() => setAddingToList(false)}
        />
      </Show>
      <Show when={relaysOpen()}>
        <AuthorRelaysDialog
          pubkey={props.pubkey}
          onClose={() => setRelaysOpen(false)}
        />
      </Show>
    </>
  );
};

export default ProfileMenu;
