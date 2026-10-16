import { Drawer, useDrawerContext } from "@ark-ui/solid/drawer";
import { Popover, type PopoverRootProps } from "@ark-ui/solid/popover";
import {
  type Component,
  type JSX,
  Show,
  createEffect,
  createSignal,
  onCleanup,
} from "solid-js";
import { useAppWindow } from "../app-window";
import { canHover } from "../can-hover";
import { sheetContentClass } from "../ui/menu";
import PopoverTrigger from "../ui/PopoverTrigger";
import { Portal } from "../ui/Portal";
import {
  type VisibleViewport,
  createKeyboardViewport,
} from "../visible-viewport";

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
 * キーボードが出ている間、見えている部分を親へ知らせ、シートを引き上げた高さにする。
 * 低い位置で止めたままだと、キーボードの上に残る一覧が数行になる。
 * シートが開いている間だけ見張るため、シートの中に置く。
 */
const FollowKeyboard: Component<{
  onChange: (viewport: VisibleViewport | undefined) => void;
}> = (props) => {
  const drawer = useDrawerContext();
  const viewport = createKeyboardViewport(useAppWindow());
  createEffect(() => {
    const value = viewport();
    props.onChange(value);
    if (value) drawer().setSnapPoint(SNAP_POINTS[SNAP_POINTS.length - 1]);
  });
  onCleanup(() => props.onChange(undefined));
  return null;
};

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
  const [keyboard, setKeyboard] = createSignal<VisibleViewport>();
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
          {/* キーボードが出ている間は、見えている部分に置き直してその上に載せる。 */}
          <Drawer.Positioner
            class="fixed inset-0"
            style={
              keyboard()
                ? {
                    top: `${keyboard()?.top}px`,
                    bottom: "auto",
                    height: `${keyboard()?.height}px`,
                  }
                : undefined
            }
          >
            <Drawer.Content
              ref={sheet}
              class={`${sheetContentClass} h-[85dvh]`}
              // 上に少し背景を残し、下の画面の上に重なっていると分かるようにする。
              style={
                keyboard()
                  ? {
                      height: `min(85dvh, ${(keyboard()?.height ?? 0) - 24}px)`,
                    }
                  : undefined
              }
            >
              <FollowKeyboard onChange={setKeyboard} />
              <Drawer.Grabber class="flex shrink-0 justify-center py-2">
                <Drawer.GrabberIndicator class="h-1 w-10 rounded-full bg-ui-4" />
              </Drawer.Grabber>
              <Drawer.Title class="sr-only">{props.title}</Drawer.Title>
              {/* 低い位置で止めている間、シートの下端は画面の外にある。その分を下に空けて、
                  一覧の終わりと下端の操作を画面の中に収める。キーボードの上ではホームバーが
                  隠れているので、その分は空けない。 */}
              <div
                class="flex min-h-0 flex-1 flex-col"
                style={{
                  "padding-bottom": `calc(var(--drawer-snap-point-offset-y, 0px) + ${keyboard() ? "0.5rem" : "max(0.5rem, env(safe-area-inset-bottom))"})`,
                }}
              >
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
