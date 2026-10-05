import {
  type Virtualizer,
  createVirtualizer,
  elementScroll,
  observeElementOffset,
} from "@tanstack/solid-virtual";
import {
  type Accessor,
  For,
  type JSX,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  useContext,
} from "solid-js";

const ScrollContainerContext =
  createContext<Accessor<HTMLElement | undefined>>();

/**
 * 一覧を包むスクロール領域を、一覧が描かれる前から教える。一覧は作られる途中で
 * 今の位置を読むが、その時点では自分の要素がまだ無く、領域を辿れない。
 */
export const ScrollContainerProvider = ScrollContainerContext.Provider;

export type VirtualListProps<T> = {
  items: readonly T[];
  itemKey: (item: T) => string;
  children: (item: T) => JSX.Element;
  /** 実測前に使う行高。大きく外れても、表示後は ResizeObserver で補正される。 */
  estimateSize?: number;
  /**
   * スクロール領域が `flex-direction: column-reverse`（チャットのように、下を基準に
   * 新しいものが下へ足され、古いものを上へ取り足す）。位置を保つのはブラウザに
   * 任せ、TanStack にはふつうの向きの位置に直して渡す。
   */
  reversed?: boolean;
  /**
   * 一番上にいるときに先頭へ足されたら、足されたものへ上がる。既定は上がる。過去から
   * 新しい方へ読み進める一覧では、足された束の一番上へ飛ばずに、読んでいる行に留まる。
   */
  followsStart?: boolean;
  class?: string;
};

/**
 * `column-reverse` の領域の位置を、先頭からの距離に直す。`scrollTop` は一番下が 0 で、
 * 上へ行くほど負になる。
 */
const reversedOffset = (element: HTMLElement): number =>
  element.scrollHeight - element.clientHeight + element.scrollTop;

/**
 * `column-reverse` の領域の位置を TanStack へ渡す。上へ足したときは `scrollTop` が
 * 変わらずスクロールも起きないまま先頭からの距離だけが変わるので、中身の大きさが
 * 変わったときにも渡し直す。
 */
const observeReversedOffset = (
  instance: Virtualizer<HTMLElement, HTMLDivElement>,
  callback: (offset: number, isScrolling: boolean) => void,
) => {
  const element = instance.scrollElement;
  if (!element) return;
  const report = () => callback(reversedOffset(element), false);
  const resize = new ResizeObserver(report);
  for (const child of element.children) resize.observe(child);
  report();
  const stop = observeElementOffset(instance, (_, isScrolling) =>
    callback(reversedOffset(element), isScrolling),
  );
  return () => {
    resize.disconnect();
    stop?.();
  };
};

/**
 * 親のスクロール領域に対して、見えている行とその前後だけを DOM に置く。
 * 行高は固定せず `measureElement` で測るため、長文や画像を含む投稿にも使える。
 */
const VirtualList = <T,>(props: VirtualListProps<T>): JSX.Element => {
  let root: HTMLDivElement | undefined;
  let followsStart = true;
  let firstKey: string | undefined;
  const container = useContext(ScrollContainerContext);
  /**
   * 置かれるまで行を 0 件と見せる。置かれる前は一覧の位置（scrollMargin）を
   * 測れず 0 になり、その値で並べた行の高さの補正が、スクロール位置を
   * 実際とずれた向きへ動かす。
   */
  const [mounted, setMounted] = createSignal(false);
  /**
   * 一覧より上にあるもの（プロフィールなど）の高さ。TanStack は options を
   * 渡された時点の値で写し取るので、DOM を読む getter では古い値が残る。測って
   * signal に入れ、変わったら options を渡し直させる。
   */
  const [margin, setMargin] = createSignal(0);
  const measureMargin = () => {
    const scroller = scrollElement();
    if (!root || !scroller) return;
    setMargin(
      root.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        (props.reversed ? reversedOffset(scroller) : scroller.scrollTop),
    );
  };
  const scrollElement = () =>
    (root?.closest("[data-scroll-container]") as HTMLElement | null) ??
    container?.() ??
    root?.parentElement ??
    null;
  const virtualizer = createVirtualizer<HTMLElement, HTMLDivElement>({
    get count() {
      return mounted() ? props.items.length : 0;
    },
    getScrollElement: scrollElement,
    estimateSize: () => props.estimateSize ?? 180,
    getItemKey: (index) => {
      const item = props.items[index];
      return item === undefined ? index : props.itemKey(item);
    },
    get scrollMargin() {
      return margin();
    },
    // 付けた時点の位置から始める。既定の 0 だと、付けたとたんにスクロール領域を
    // 先頭へ動かす —— 領域は一覧より上のもの（プロフィールなど）と共有なので、
    // タブを切り替えるたびにカラムの先頭まで戻ってしまう。
    initialOffset: () => {
      const scroller = scrollElement();
      if (!scroller) return 0;
      return props.reversed ? reversedOffset(scroller) : scroller.scrollTop;
    },
    ...(props.reversed
      ? {
          observeElementOffset: observeReversedOffset,
          scrollToFn: (offset, options, instance) => {
            const scroller = instance.scrollElement;
            if (!scroller) return;
            elementScroll(
              offset - (scroller.scrollHeight - scroller.clientHeight),
              options,
              instance,
            );
          },
        }
      : {}),
    // 先頭への追加で既存の投稿が後ろへずれても、表示中の投稿を同じ位置に保つ。
    // column-reverse の領域では、下を基準にするブラウザが保つ。
    anchorTo: props.reversed ? "start" : "end",
    // 末尾に張り付く扱いを切る。`anchorTo: "end"` は末尾まで見えている一覧を
    // 「末尾にいる」とみなし、行の高さが見積もりから縮むたびに末尾を保つよう
    // スクロール位置を戻す。短い一覧の上にプロフィールがあると、そこまで引き戻される。
    // 末尾は一番古い投稿なので、張り付く理由が無い。
    scrollEndThreshold: -1,
    overscan: 5,
  });
  if (props.reversed) {
    // 行の高さが変わったときの位置の補正もブラウザに任せる。TanStack も補正すると二重になる。
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => false;
  }

  onMount(() => {
    measureMargin();
    setMounted(true);
    const scroller = scrollElement();
    if (!scroller) return;
    // 上にあるものの高さが変わる（画像が読み込まれるなど）と、一覧の位置も変わる。
    const resize = new ResizeObserver(measureMargin);
    for (const child of scroller.children) resize.observe(child);
    onCleanup(() => resize.disconnect());
    const updateFollowsStart = () => {
      followsStart = scroller.scrollTop <= 1;
    };
    updateFollowsStart();
    scroller.addEventListener("scroll", updateFollowsStart, { passive: true });
    onCleanup(() => scroller.removeEventListener("scroll", updateFollowsStart));
  });

  createEffect(() => {
    if (props.reversed || props.followsStart === false) return;
    const first = props.items[0];
    const nextKey = first === undefined ? undefined : props.itemKey(first);
    const shouldFollow =
      firstKey !== undefined && nextKey !== firstKey && followsStart;
    firstKey = nextKey;
    if (shouldFollow) {
      // anchorTo は既存行を安定させるため常に有効にし、一覧先頭にいた場合だけ
      // その補正後にカラム全体の先頭へ追従する。virtualizer の offset 0 は
      // scrollMargin の後ろなので、一覧より上に内容があるとそこまで隠してしまう。
      queueMicrotask(() => scrollElement()?.scrollTo({ top: 0 }));
    }
  });

  /**
   * 表示する中身と、その置き場所。TanStack は「何番目か」で行を返すが、行を
   * 番号で作り直すと、先頭に 1 件入っただけで全部の行が作り直される —— 開いて
   * いたメニューやダイアログが消えてしまう。中身ごとに行を持ち、位置だけを
   * 動かす。
   */
  const placements = createMemo(() => {
    const map = new Map<string, { index: number; start: number }>();
    for (const row of virtualizer.getVirtualItems()) {
      const item = props.items[row.index];
      if (item === undefined) continue;
      map.set(props.itemKey(item), { index: row.index, start: row.start });
    }
    return map;
  });
  const visible = createMemo(() => {
    const items: T[] = [];
    for (const row of virtualizer.getVirtualItems()) {
      const item = props.items[row.index];
      if (item !== undefined) items.push(item);
    }
    return items;
  });

  return (
    <div
      ref={root}
      class={`relative w-full ${props.class ?? ""}`}
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      <For each={visible()}>
        {(item) => {
          const placement = () => placements().get(props.itemKey(item));
          let element: HTMLDivElement | undefined;
          // 番号が変わったら測り直させる。TanStack は data-index で行を見分ける。
          // ここで測ると、先頭への追従（下の scrollTo）より先に高さが確定する。
          createEffect(() => {
            if (placement()?.index === undefined) return;
            if (element?.isConnected) virtualizer.measureElement(element);
          });
          return (
            <div
              ref={element}
              data-virtual-row
              data-index={placement()?.index}
              class="absolute top-0 left-0 w-full"
              style={{
                transform: `translateY(${(placement()?.start ?? 0) - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {props.children(item)}
            </div>
          );
        }}
      </For>
    </div>
  );
};

export default VirtualList;
