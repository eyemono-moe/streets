import { Menu } from "@ark-ui/solid/menu";
import type { MuteTarget } from "@streets/core/nostr/build/mute";
import { type Component, Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { useEventActions } from "../actions";
import { lazyPart } from "../lazy-part";
import { useMutes } from "../settings/MuteMediator";
import { useDispatch } from "../ui-events";

const AuthorRelaysDialog = lazyPart(() => import("./AuthorRelaysDialog"));

export const ProfileMenuView: Component<{
  open?: boolean;
  mine: boolean;
  muted: boolean;
  muteAvailable: boolean;
  onMute: () => void;
  onOpenRelays: () => void;
}> = (props) => {
  return (
    <Menu.Root
      open={props.open}
      lazyMount
      unmountOnExit
      onSelect={(details) => {
        if (details.value === "relays") props.onOpenRelays();
        if (details.value === "mute") props.onMute();
      }}
    >
      <Menu.Trigger
        aria-label="このユーザーの操作"
        class="c-secondary grid size-8.5 cursor-pointer place-items-center rounded-full border border-primary bg-primary hover:bg-secondary"
      >
        <span
          class="i-material-symbols:more-horiz size-4.5"
          aria-hidden="true"
        />
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content class="motion-pop c-primary w-60 space-y-1 rounded-2.5 border border-primary bg-primary p-1.5 shadow-lg outline-none">
            <Menu.Item
              value="relays"
              class="flex h-8.5 cursor-pointer items-center gap-2.5 rounded-1.5 px-2.5 text-body data-[highlighted]:bg-secondary"
            >
              <span
                class="i-material-symbols:hub-outline size-4.5"
                aria-hidden="true"
              />
              リレー設定
            </Menu.Item>
            <Show when={!props.mine}>
              <Menu.Item
                value="mute"
                disabled={!props.muteAvailable}
                class="flex h-8.5 items-center gap-2.5 rounded-1.5 px-2.5 text-body enabled:cursor-pointer data-[highlighted]:bg-secondary data-[disabled]:opacity-50"
              >
                <span
                  class={
                    props.muted
                      ? "i-material-symbols:person-outline-rounded"
                      : "i-material-symbols:person-off-outline-rounded"
                  }
                  classList={{ "size-4.5": true }}
                  aria-hidden="true"
                />
                {props.muted ? "ミュートを解除" : "ミュート"}
              </Menu.Item>
            </Show>
            <Menu.Item
              value="block"
              disabled
              class="flex h-8.5 items-center gap-2.5 rounded-1.5 px-2.5 text-body data-[disabled]:opacity-50"
            >
              <span
                class="i-material-symbols:block size-4.5"
                aria-hidden="true"
              />
              ブロック
            </Menu.Item>
            <Menu.Item
              value="report"
              disabled
              class="c-danger flex h-8.5 items-center gap-2.5 rounded-1.5 px-2.5 text-body data-[disabled]:opacity-50"
            >
              <span
                class="i-material-symbols:flag-outline-rounded size-4.5"
                aria-hidden="true"
              />
              通報
            </Menu.Item>
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
  const [relaysOpen, setRelaysOpen] = createSignal(false);
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
        onMute={toggleMute}
        onOpenRelays={() => setRelaysOpen(true)}
      />
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
