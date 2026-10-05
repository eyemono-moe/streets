import { Menu } from "@ark-ui/solid/menu";
import { Show, createSignal, onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import NewerNotice from "../columns/NewerNotice";
import IconButton from "./IconButton";
import { menuContentClass, menuItemClass } from "./menu";
import VirtualList, { NewerItemsProvider } from "./VirtualList";

const items = Array.from({ length: 200 }, (_, index) => ({
  id: `${index}`,
  text:
    index % 7 === 0
      ? `高さが変わる長い行 ${index}。`.repeat(12)
      : `通常の行 ${index}`,
}));

const meta = {
  title: "UI/VirtualList",
  component: VirtualList,
  args: {
    items,
    itemKey: (item) => item.id,
    children: (item) => <p class="border-primary border-b p-3">{item.text}</p>,
  },
  decorators: [
    (Story) => (
      <div
        data-scroll-container
        class="h-96 w-88 overflow-y-auto border border-primary"
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof VirtualList<(typeof items)[number]>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 高さが異なる200件: Story = {};

/** 行が持っている状態（開いたメニューなど）が、新着で消えないことを見るための行。 */
const StatefulRow = (props: { text: string }) => {
  const [open, setOpen] = createSignal(false);
  return (
    <div class="border-primary border-b p-3">
      <button
        type="button"
        class="cursor-pointer bg-transparent underline"
        onClick={() => setOpen(!open())}
      >
        {props.text}
      </button>
      <Show when={open()}>
        <p class="mt-2 rounded-2 bg-secondary p-2 text-caption">
          開いたまま。先頭に行が増えても閉じない。
        </p>
      </Show>
    </div>
  );
};

const RealtimeExample = (props: {
  profile?: boolean;
  stateful?: boolean;
  followsStart?: boolean;
}) => {
  const [liveItems, setLiveItems] = createSignal(items.slice(0, 30));
  let next = 30;
  return (
    <div class="flex h-96 w-88 flex-col border border-primary">
      <button
        type="button"
        class="shrink-0 cursor-pointer border-primary border-b bg-secondary p-2"
        onClick={() => {
          const index = next++;
          setLiveItems((current) => [
            {
              id: `new-${index}`,
              text:
                index % 2 === 0
                  ? `リアルタイムに追加された長い行 ${index}。`.repeat(8)
                  : `リアルタイムに追加された行 ${index}`,
            },
            ...current,
          ]);
        }}
      >
        先頭に投稿を追加
      </button>
      <div data-scroll-container class="min-h-0 flex-1 overflow-y-auto">
        <Show when={props.profile}>
          <div class="flex h-36 flex-col justify-end gap-1 bg-secondary p-4">
            <strong>プロフィール</strong>
            <span class="c-secondary text-caption">
              一覧より前にある内容も見えたまま追従する
            </span>
          </div>
        </Show>
        <VirtualList
          items={liveItems()}
          itemKey={(item) => item.id}
          followsStart={props.followsStart}
        >
          {(item) => (
            <Show
              when={props.stateful}
              fallback={<p class="border-primary border-b p-3">{item.text}</p>}
            >
              <StatefulRow text={item.text} />
            </Show>
          )}
        </VirtualList>
      </div>
    </div>
  );
};

export const リアルタイム追加: Story = {
  render: () => <RealtimeExample profile={false} />,
  decorators: [],
};

/**
 * 過去から新しい方へ読み進める一覧（タイムスリップ）。一番上にいても、先頭に足された
 * 束へ飛ばず、読んでいた行に留まる。
 */
export const 先頭に足しても読んでいる行に留まる: Story = {
  render: () => <RealtimeExample followsStart={false} />,
  decorators: [],
};

export const プロフィールの下でリアルタイム追加: Story = {
  render: () => <RealtimeExample profile />,
  decorators: [],
};

/**
 * どれかの行を押して開いてから「先頭に投稿を追加」を押す。行は中身ごとに
 * 持っているので、順番がずれても開いたまま（メニューやダイアログが消えない）。
 */
export const 開いた行は新着で閉じない: Story = {
  render: () => <RealtimeExample stateful />,
  decorators: [],
};

/** 行の中のメニュー。開いている間は、新着が届いても先頭へ戻らない。 */
const MenuRow = (props: { text: string }) => (
  <div class="flex items-start gap-2 border-primary border-b p-3">
    <p class="min-w-0 flex-1">{props.text}</p>
    <Menu.Root lazyMount unmountOnExit>
      <Menu.Trigger
        asChild={(triggerProps) => (
          <IconButton
            {...triggerProps()}
            size="sm"
            icon="i-material-symbols:more-horiz"
            label="メニュー"
          />
        )}
      />
      <Menu.Positioner>
        <Menu.Content class={`${menuContentClass} w-40`}>
          <Menu.Item value="copy" class={menuItemClass}>
            リンクをコピー
          </Menu.Item>
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  </div>
);

const HoldExample = () => {
  const [liveItems, setLiveItems] = createSignal(items.slice(0, 30));
  const [newer, setNewer] = createSignal(0);
  let next = 30;
  const timer = setInterval(() => {
    const index = next++;
    setLiveItems((current) => [
      { id: `new-${index}`, text: `2 秒ごとに届いた行 ${index}` },
      ...current,
    ]);
  }, 2000);
  onCleanup(() => clearInterval(timer));
  let scroller: HTMLDivElement | undefined;
  return (
    <div class="relative flex h-96 w-88 flex-col border border-primary">
      <div
        ref={scroller}
        data-scroll-container
        class="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]"
      >
        <NewerItemsProvider
          value={(_, report) => setNewer(report?.items.length ?? 0)}
        >
          <VirtualList
            items={liveItems()}
            itemKey={(item) => item.id}
            newer={{ noun: "投稿", authorOf: () => undefined }}
          >
            {(item) => <MenuRow text={item.text} />}
          </VirtualList>
        </NewerItemsProvider>
      </div>
      <Show when={newer() > 0}>
        <div class="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
          <NewerNotice
            count={newer()}
            noun="投稿"
            authors={[]}
            onClick={() => scroller?.scrollTo({ top: 0 })}
          />
        </div>
      </Show>
    </div>
  );
};

/**
 * 一番上で行のメニューを開いたまま待つ。メニューの行は動かず、上に溜まった数が
 * 札に出る。札を押すか、一番上まで戻ると消える。
 */
export const メニューを開いている間は先頭へ戻らない: Story = {
  render: () => <HoldExample />,
  decorators: [],
};
