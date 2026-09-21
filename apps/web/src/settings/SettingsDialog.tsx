import { Tabs } from "@ark-ui/solid/tabs";
import type { DeckAppearance } from "@streets/core/deck/deck";
import type { ColorScheme } from "@streets/core/settings/color-scheme";
import {
  type Component,
  For,
  type JSX,
  Show,
  createEffect,
  createSignal,
  on,
} from "solid-js";
import { Mediates, type UiEvent, useDispatch } from "../ui-events";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";
import AccountSettings from "./AccountSettings";
import DisplaySettings from "./DisplaySettings";
import MediaSettings from "./MediaSettings";
import MuteSettings from "./MuteSettings";
import { useProfileEdit } from "./ProfileMediator";
import RelaySettings from "./RelaySettings";

type Page = {
  value: string;
  label: string;
  icon: string;
  title: string;
  description: string;
  /** まだ作っていないページは、並べるが押せなくする。 */
  content?: () => JSX.Element;
};

/**
 * 設定。デッキの上に開くダイアログで、左（狭い画面では上）にページの一覧を置く。
 */
const SettingsDialog: Component<{
  open: boolean;
  /** 狭い画面では、ページの一覧を横に並べて全面に出す。 */
  wide: boolean;
  scheme: ColorScheme;
  appearance: DeckAppearance;
  writeProgress: boolean;
  /** 開いたときに出すページ。 */
  initialPage?: string;
}> = (props) => {
  const dispatch = useDispatch();
  const [page, setPage] = createSignal(props.initialPage ?? "display");
  // プロフィールを書きかけのまま閉じようとしたら、そのページを見せる。
  const profileEdit = useProfileEdit();
  createEffect(
    on(
      () => profileEdit?.attention() ?? 0,
      (count) => {
        if (count > 0) setPage("account");
      },
      { defer: true },
    ),
  );

  const pages: Page[] = [
    {
      value: "account",
      label: "アカウント",
      icon: "i-material-symbols:person-outline-rounded",
      title: "アカウント",
      description: "プロフィールを編集し、この端末からログアウトします。",
      content: () => <AccountSettings />,
    },
    {
      value: "relays",
      label: "リレー",
      icon: "i-material-symbols:globe",
      title: "リレー",
      description: "投稿をアップロードするサーバーを選びます。",
      content: () => <RelaySettings />,
    },

    {
      value: "media",
      label: "画像",
      icon: "i-material-symbols:image-outline-rounded",
      title: "画像",
      description: "投稿に付ける画像のアップロード先を決めます。",
      content: () => <MediaSettings />,
    },
    {
      value: "mute",
      label: "ミュート",
      icon: "i-material-symbols:volume-off-outline-rounded",
      title: "ミュート",
      description: "見たくない人や投稿を隠します。",
      content: () => <MuteSettings />,
    },
    {
      value: "display",
      label: "表示",
      icon: "i-material-symbols:visibility-outline-rounded",
      title: "表示",
      description: "画面の色と、保存したときの知らせ方を選びます。",
      content: () => (
        <DisplaySettings
          scheme={props.scheme}
          appearance={props.appearance}
          writeProgress={props.writeProgress}
        />
      ),
    },
  ];

  // 設定はカラムではないので、重ねる先が無い。人やノートを開く操作は、デッキに
  // カラムとして足してからダイアログを閉じ、足したカラムを見せる。
  const handle = (event: UiEvent): boolean => {
    if (event.type !== "stack/open") return false;
    dispatch({ type: "deck/add-column", column: event.column });
    dispatch({ type: "deck/close-settings" });
    return true;
  };

  return (
    <Mediates handle={handle}>
      <DialogRoot
        open={props.open}
        onClose={() => dispatch({ type: "deck/close-settings" })}
      >
        <DialogPortal class="" classList={{ "p-6": props.wide }}>
          <DialogContent
            classList={{
              "h-[min(640px,calc(100dvh-48px))] w-[min(880px,calc(100vw-48px))] rounded-3 border border-primary shadow-xl":
                props.wide,
              "h-dvh w-screen": !props.wide,
            }}
          >
            <DialogDescription class="sr-only">
              アカウントと、この端末の表示を設定します。
            </DialogDescription>
            <Tabs.Root
              value={page()}
              onValueChange={(details) => setPage(details.value)}
              orientation={props.wide ? "vertical" : "horizontal"}
              class="grid h-full min-h-0"
              classList={{
                "grid-cols-[220px_minmax(0,1fr)]": props.wide,
                "grid-rows-[auto_minmax(0,1fr)]": !props.wide,
              }}
            >
              <div
                class="flex min-w-0 bg-secondary"
                classList={{
                  "flex-col gap-1 px-2 py-3": props.wide,
                  // 横へ流すのはページの一覧だけ。閉じるボタンまで流すと、見えなくなる。
                  "items-center gap-1 px-2 py-2": !props.wide,
                }}
              >
                <DialogTitle
                  class="font-600 text-h3"
                  classList={{
                    "px-3 pb-2": props.wide,
                    "sr-only": !props.wide,
                  }}
                >
                  設定
                </DialogTitle>
                <Tabs.List
                  class="flex gap-1"
                  classList={{
                    "flex-col": props.wide,
                    "min-w-0 flex-1 overflow-x-auto": !props.wide,
                  }}
                >
                  <For each={pages}>
                    {(page) => (
                      <Tabs.Trigger
                        value={page.value}
                        disabled={page.content === undefined}
                        class="c-primary flex h-9 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-2 bg-transparent px-3 text-body outline-none focus-visible:ring-2 focus-visible:ring-accent-5 enabled:cursor-pointer enabled:hover:bg-alpha-hover disabled:opacity-40 data-[selected]:bg-primary data-[selected]:font-600"
                      >
                        <span
                          class={`${page.icon} size-4.5`}
                          aria-hidden="true"
                        />
                        {page.label}
                        <Show when={page.content === undefined}>
                          <span class="sr-only">（準備中）</span>
                        </Show>
                      </Tabs.Trigger>
                    )}
                  </For>
                </Tabs.List>
                <Show when={!props.wide}>
                  <DialogClose
                    aria-label="設定を閉じる"
                    class="bg-transparent hover:bg-secondary"
                  />
                </Show>
              </div>

              <For each={pages}>
                {(page) => (
                  <Tabs.Content
                    value={page.value}
                    class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]"
                  >
                    {/* 閉じるボタンは見出しの行にあるので、流すのは本文だけにする。 */}
                    <div
                      class="flex items-start gap-3"
                      classList={{
                        "px-6 pt-6 pb-4": props.wide,
                        "px-4 pt-4 pb-3": !props.wide,
                      }}
                    >
                      <div class="flex min-w-0 flex-1 flex-col gap-1">
                        <h2 class="font-600 text-h3">{page.title}</h2>
                        <Show when={page.description}>
                          <p class="c-secondary text-caption">
                            {page.description}
                          </p>
                        </Show>
                      </div>
                      <Show when={props.wide}>
                        <DialogClose
                          aria-label="設定を閉じる"
                          class="bg-transparent hover:bg-secondary"
                        />
                      </Show>
                    </div>
                    <div
                      class="overflow-y-auto"
                      classList={{
                        "px-6 pb-6": props.wide,
                        "px-4 pb-4": !props.wide,
                      }}
                    >
                      <Show when={page.content}>
                        {(content) => content()()}
                      </Show>
                    </div>
                  </Tabs.Content>
                )}
              </For>
            </Tabs.Root>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
    </Mediates>
  );
};

export default SettingsDialog;
