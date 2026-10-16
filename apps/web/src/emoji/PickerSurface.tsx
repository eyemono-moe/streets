import { Drawer } from "@ark-ui/solid/drawer";
import { Popover, type PopoverRootProps } from "@ark-ui/solid/popover";
import { type Component, type JSX, Show } from "solid-js";
import { canHover } from "../can-hover";
import { sheetContentClass } from "../ui/menu";
import PopoverTrigger from "../ui/PopoverTrigger";
import { Portal } from "../ui/Portal";

/**
 * 押せる要素をそのままトリガーにするための、Ark UI から渡ってくる props。
 * 戻り値の要素型は Ark UI 側が `any` で持つので、そこに合わせる。
 */
export type PickerTrigger = (
  userProps?: JSX.IntrinsicElements["button"],
  // Ark UI の `asChild` の型に合わせる
) => JSX.HTMLAttributes<any>;

/** ピッカーの中身をどの形で出すか。`sheet` は触る端末の下から出るドロワー。 */
export type PickerLayout = "popup" | "sheet";

// 開いた直後は下の投稿が見える高さで止め、引き上げると Content の高さ（画面の 85%）まで広がる。
const SNAP_POINTS = [0.6, 1];

/**
 * 絵文字ピッカーの入れ物。カーソルを当てられる端末ではトリガーの脇に出るポップアップ、
 * 触る端末では下から出るドロワーにする。ポップアップの 1 マス 32px は指で押すには小さい。
 */
const PickerSurface: Component<{
  /** ドロワーの見出し（画面には出さず、読み上げに使う）。 */
  title: string;
  /** 押して開く要素。渡さないときは `open` で開く。 */
  trigger?: (props: PickerTrigger) => JSX.Element;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** ポップアップを出す位置。トリガーを置かずに開くときに渡す。 */
  anchor?: () => HTMLElement | undefined;
  placement: NonNullable<PopoverRootProps["positioning"]>["placement"];
  /** 閉じた後にフォーカスを戻す先。 */
  finalFocusEl?: () => HTMLElement | undefined;
  onExitComplete?: () => void;
  children: (close: () => void, layout: PickerLayout) => JSX.Element;
}> = (props) => {
  const finalFocusEl = () =>
    props.finalFocusEl && (() => props.finalFocusEl?.() ?? null);
  let sheet: HTMLDivElement | undefined;
  return (
    <Show
      when={!canHover()}
      fallback={
        // 閉じている間は中身を作らない（絵文字は 1900 件あり、投稿ごとに 2 か所ある）。
        <Popover.Root
          lazyMount
          unmountOnExit
          positioning={{
            placement: props.placement,
            getAnchorElement: props.anchor && (() => props.anchor?.() ?? null),
          }}
          finalFocusEl={finalFocusEl()}
          open={props.open}
          onOpenChange={(details) => props.onOpenChange?.(details.open)}
          onExitComplete={props.onExitComplete}
        >
          <Show when={props.trigger}>
            {(trigger) => <PopoverTrigger asChild={trigger()} />}
          </Show>
          <Portal>
            <Popover.Positioner>
              <Popover.Content class="motion-pop outline-none">
                <Popover.Context>
                  {(api) => props.children(() => api().setOpen(false), "popup")}
                </Popover.Context>
              </Popover.Content>
            </Popover.Positioner>
          </Portal>
        </Popover.Root>
      }
    >
      <Drawer.Root
        lazyMount
        unmountOnExit
        open={props.open}
        onOpenChange={(details) => props.onOpenChange?.(details.open)}
        onExitComplete={props.onExitComplete}
        finalFocusEl={finalFocusEl()}
        // 既定では最初の入力欄（検索窓）に焦点が移り、開いただけでキーボードが出る。
        // 絵文字を押して選ぶ人が多いので、シートそのものに焦点を置く。
        initialFocusEl={() => sheet ?? null}
        snapPoints={SNAP_POINTS}
        defaultSnapPoint={SNAP_POINTS[0]}
        swipeDirection="down"
      >
        <Show when={props.trigger}>
          {(trigger) => <Drawer.Trigger asChild={trigger()} />}
        </Show>
        <Portal>
          <Drawer.Backdrop class="motion-fade fixed inset-0 bg-ui-950/40" />
          <Drawer.Positioner class="fixed inset-0">
            <Drawer.Content
              ref={sheet}
              class={`${sheetContentClass} h-[85dvh]`}
            >
              <Drawer.Grabber class="flex shrink-0 justify-center py-2">
                <Drawer.GrabberIndicator class="h-1 w-10 rounded-full bg-ui-4" />
              </Drawer.Grabber>
              <Drawer.Title class="sr-only">{props.title}</Drawer.Title>
              {/* 低い位置で止めている間、シートの下端は画面の外にある。その分を下に空けて、
                  一覧の終わりと下端の操作を画面の中に収める。 */}
              <div class="flex min-h-0 flex-1 flex-col pb-[calc(var(--drawer-snap-point-offset-y,0px)+env(safe-area-inset-bottom))]">
                <Drawer.Context>
                  {(api) => props.children(() => api().setOpen(false), "sheet")}
                </Drawer.Context>
              </div>
            </Drawer.Content>
          </Drawer.Positioner>
        </Portal>
      </Drawer.Root>
    </Show>
  );
};

export default PickerSurface;
