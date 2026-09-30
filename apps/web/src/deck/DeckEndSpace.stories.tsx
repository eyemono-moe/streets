import { Collapsible } from "@ark-ui/solid";
import { TIMELINE_KINDS } from "@streets/core/deck/column-kinds";
import type { ColumnDef } from "@streets/core/deck/deck";
import { For, onMount } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ColumnHeader } from "../columns/ColumnHeader";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import { ToastStack, createAppToaster } from "../toast";
import { Mediates } from "../ui-events";
import ColumnSettingsPanel from "./ColumnSettingsPanel";
import DeckEndSpace from "./DeckEndSpace";
import { Sidebar } from "./Nav";

const viewer = createStoryAuthor(74, { name: "わたし" });
const friend = createStoryAuthor(75, { name: "ともだち" });
const columns: ColumnDef[] = [
  {
    id: "home",
    title: "ホーム",
    source: { kind: "followees", kinds: [...TIMELINE_KINDS] },
  },
  {
    id: "nostr",
    title: "Nostr",
    source: { kind: "literal", filters: [{ "#t": ["nostr"] }] },
  },
  { id: "notifications", title: "通知", source: { kind: "notifications" } },
  {
    id: "friend",
    title: "ともだち",
    source: { kind: "user", pubkey: friend.pubkey },
  },
];

const RightEnd = (props: { settingsOpen?: boolean }) => {
  let strip: HTMLDivElement | undefined;
  const toaster = createAppToaster(true);
  onMount(() => {
    strip?.scrollTo({ left: strip.scrollWidth });
    toaster.create({
      type: "error",
      title: "投稿を送れませんでした",
      description: "時間をおいて、もう一度お試しください",
      duration: Number.POSITIVE_INFINITY,
    });
  });

  return (
    <EventSceneProvider
      scene={{ events: [viewer.profile(), friend.profile()] }}
    >
      <Mediates handle={() => true}>
        <div class="flex h-dvh w-dvw">
          <Sidebar
            pubkey={viewer.pubkey}
            columns={columns}
            panel={undefined}
            numbers
            onLogout={() => {}}
            feedbackUrl={null}
          />
          <div class="flex min-w-0 flex-1 flex-col">
            <div
              ref={strip}
              class="flex min-h-0 flex-1 overflow-x-auto bg-tertiary"
            >
              <For each={columns}>
                {(column) => (
                  <>
                    <div class="h-full w-95 shrink-0 border-primary border-r bg-primary">
                      <ColumnHeader
                        column={column}
                        open={
                          props.settingsOpen === true && column.id === "friend"
                        }
                        grip
                        onTitle={() => {}}
                      />
                      <p class="p-4 text-body">{column.title}の内容</p>
                    </div>
                    <Collapsible.Root
                      lazyMount
                      unmountOnExit
                      open={props.settingsOpen && column.id === "friend"}
                      class="bg-secondary"
                    >
                      <Collapsible.Content class="motion-collapse-right h-full overflow-hidden">
                        <div class="h-full w-95 shrink-0 border-primary border-r">
                          <ColumnSettingsPanel
                            column={column}
                            relayList={{ phase: "ready", entries: [] }}
                          />
                        </div>
                      </Collapsible.Content>
                    </Collapsible.Root>
                  </>
                )}
              </For>
              <DeckEndSpace />
            </div>
          </div>
          <ToastStack toaster={toaster} />
        </div>
      </Mediates>
    </EventSceneProvider>
  );
};

const meta = {
  title: "デッキ/右端の余白",
  component: RightEnd,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RightEnd>;

export default meta;
type Story = StoryObj<typeof meta>;

export const トーストを出した右端: Story = {};

export const 設定を開いた右端: Story = { args: { settingsOpen: true } };
