import { Popover } from "@ark-ui/solid/popover";
import {
  type CompletionMatch,
  type CompletionTrigger,
  applyCompletion,
  completionTransition,
  findCompletion,
  initialCompletion,
} from "@streets/core/view/completion";
import {
  For,
  type JSX,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
} from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { Portal } from "solid-js/web";
import { type CaretOffset, caretOffset, caretRect } from "./caret";
import { insertText } from "./insert-text";

type Field = HTMLInputElement | HTMLTextAreaElement;

export type CompletionItem = {
  key: string;
  /** 選んだときに入れる文字。 */
  insert: string;
  /** 後ろに空白を置くか（人の参照の直後に言葉が続かないように）。 */
  space?: boolean;
  /** 一覧の 1 行の中身。 */
  view: () => JSX.Element;
};

/** 何を打ったら何を出すか。欄ごとに組み合わせて渡す。 */
export type CompletionSource = {
  trigger: CompletionTrigger;
  /** 打った言葉に合う候補。多すぎると選びにくいので、ここで絞っておく。 */
  items: (query: string) => readonly CompletionItem[];
};

/**
 * 文字を打つ欄に、カーソルの位置で候補を出す。欄は `children` に渡す `ref` で
 * つなぐ —— 欄が既に持っている `onInput` や `onKeyDown` と混ぜずに済むよう、
 * 聞き取りは欄に直接付ける。
 *
 * - ↑↓（Ctrl+P / Ctrl+N）で移り、Enter / Tab で入れる。Esc は一覧だけを閉じる
 * - 日本語の変換中のキーは見ない（変換を確定する Enter で候補を入れない）
 * - 入れるときはブラウザの入力として入れる。取り消し（Ctrl+Z）で戻せる
 */
const Completion = (props: {
  sources: readonly CompletionSource[];
  /** 一覧の名前（読み上げ用）。 */
  label: string;
  children: (ref: (field: Field) => void) => JSX.Element;
}): JSX.Element => {
  const [state, setState] = createStore(initialCompletion());
  const apply = (event: Parameters<typeof completionTransition>[1]) =>
    setState(reconcile(completionTransition(unwrap(state), event)));
  const [field, setField] = createSignal<Field>();
  const listId = createUniqueId();
  const optionId = (index: number) => `${listId}-${index}`;

  const triggers = () => props.sources.map((source) => source.trigger);
  const sourceOf = (match: CompletionMatch) =>
    props.sources.find(
      (source) =>
        source.trigger.kind === match.kind &&
        (source.trigger.prefixes.length === 0 ||
          source.trigger.prefixes.includes(match.prefix)),
    );
  const items = createMemo(() => {
    const match = state.match;
    if (!match) return [];
    return sourceOf(match)?.items(match.query) ?? [];
  });
  // Popover が動き出す前に開くと、その後の開閉を受け取らない。描いた次のフレームから開く
  // （開いた直後に欄へフォーカスを当てる画面で、一覧が出なくなる）。
  const [ready, setReady] = createSignal(false);
  onMount(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    onCleanup(() => cancelAnimationFrame(frame));
  });
  const open = () => ready() && state.match !== undefined && items().length > 0;
  const active = () => Math.min(state.active, items().length - 1);

  // 一覧を付ける位置。打った内容が変わったときにだけ測り直す（`caretOffset` を参照）。
  // 付け先は 1 つを使い回す。呼ぶたびに作ると、付け先が替わったとみなされて位置を
  // 決め直し続ける。
  let anchor:
    | { start: number; before: string; offset: CaretOffset }
    | undefined;

  const anchorElement = {
    getBoundingClientRect: () => {
      const el = field();
      return el && anchor ? caretRect(el, anchor.offset) : new DOMRect();
    },
  };

  const refresh = () => {
    const el = field();
    if (!el || document.activeElement !== el) {
      apply({ type: "completion/input", match: undefined });
      return;
    }
    const match = findCompletion(
      el.value,
      el.selectionStart ?? el.value.length,
      triggers(),
    );
    if (match) {
      const before = el.value.slice(0, match.start);
      if (anchor?.start !== match.start || anchor.before !== before) {
        anchor = {
          start: match.start,
          before,
          offset: caretOffset(el, match.start),
        };
      }
    }
    apply({ type: "completion/input", match });
  };

  const choose = (item: CompletionItem) => {
    const el = field();
    const match = state.match;
    if (!el || !match) return;
    const result = applyCompletion(el.value, match, item.insert, {
      space: item.space,
    });
    const tail = el.value.length - match.end;
    const inserted = result.text.slice(match.start, result.text.length - tail);
    insertText(el, inserted, match);
    // 後ろに空白が続いていたときは、その空白の後ろへ送る。
    el.setSelectionRange(result.caret, result.caret);
    apply({ type: "completion/chosen" });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // 変換中（229 は変換中の Safari が返す値）は、確定の Enter などを横取りしない。
    if (event.isComposing || event.keyCode === 229) return;
    if (!open()) return;
    const plain = !event.shiftKey && !event.altKey && !event.metaKey;
    const down =
      event.key === "ArrowDown" || (event.ctrlKey && event.key === "n");
    const up = event.key === "ArrowUp" || (event.ctrlKey && event.key === "p");
    if (plain && (down || up)) {
      event.preventDefault();
      apply({
        type: "completion/move",
        delta: down ? 1 : -1,
        count: items().length,
      });
      return;
    }
    if (
      plain &&
      !event.ctrlKey &&
      (event.key === "Enter" || event.key === "Tab")
    ) {
      // 送信やフォーカスの移動より先に取る。
      event.preventDefault();
      event.stopPropagation();
      const item = items()[active()];
      if (item) choose(item);
      return;
    }
    if (event.key === "Escape") {
      // ダイアログまで閉じないよう、ここで止める。
      event.preventDefault();
      event.stopPropagation();
      apply({ type: "completion/dismiss" });
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    // ↑↓ は候補を移るのに使ったので、カーソルが動いていない。
    if (open() && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      return;
    }
    if (
      event.key.startsWith("Arrow") ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      refresh();
    }
  };

  const attach = (el: Field) => {
    setField(el);
    // 2 種類の欄の合併型のままでは、聞き取りの型を絞れない。
    const node: HTMLElement = el;
    const listeners = [
      ["keydown", onKeyDown],
      ["keyup", onKeyUp],
      ["input", refresh],
      ["click", refresh],
      ["focus", refresh],
      ["compositionend", refresh],
      ["blur", refresh],
    ] as const;
    for (const [type, listener] of listeners) {
      node.addEventListener(type, listener as EventListener);
    }
    onCleanup(() => {
      for (const [type, listener] of listeners) {
        node.removeEventListener(type, listener as EventListener);
      }
    });
  };

  // 読み上げで、欄と一覧・選んでいる候補を結び付ける。
  createEffect(() => {
    const el = field();
    if (!el) return;
    el.setAttribute("aria-autocomplete", "list");
    el.setAttribute("aria-expanded", String(open()));
    if (open()) {
      el.setAttribute("aria-controls", listId);
      el.setAttribute("aria-activedescendant", optionId(active()));
    } else {
      el.removeAttribute("aria-controls");
      el.removeAttribute("aria-activedescendant");
    }
  });

  let list: HTMLDivElement | undefined;
  createEffect(() => {
    if (!open()) return;
    list
      ?.querySelector(`#${CSS.escape(optionId(active()))}`)
      ?.scrollIntoView({ block: "nearest" });
  });

  return (
    <Popover.Root
      open={open()}
      // フォーカスは欄に残す。外を押したり Esc で閉じたりするのは、欄の側で決める。
      autoFocus={false}
      closeOnInteractOutside={false}
      closeOnEscape={false}
      lazyMount
      unmountOnExit
      positioning={{
        placement: "bottom-start",
        gutter: 4,
        // 打ち始めた印の位置に付ける。打つにつれて一覧が横へ動かないように。
        getAnchorElement: () => anchorElement,
      }}
    >
      {props.children(attach)}
      <Portal>
        <Popover.Positioner>
          <Popover.Content
            class="motion-pop c-primary w-72 overflow-hidden rounded-2.5 border border-primary bg-primary shadow-lg outline-none"
            // 押しても欄からフォーカスを外さない（外すと一覧が閉じる）。
            onPointerDown={(event) => event.preventDefault()}
          >
            {/* フォーカスは欄に残し、欄の aria-activedescendant で候補を指す（combobox の形）。
                一覧と候補はフォーカスを受け取らず、キーボードでは欄から操作する。 */}
            {/* 上のとおり、フォーカスは欄に残す */}
            <div
              ref={list}
              id={listId}
              // select では、打ちながら選ぶ形にできない
              role="listbox"
              aria-label={props.label}
              class="max-h-61 overflow-y-auto p-1"
            >
              <For each={items()}>
                {(item, index) => (
                  // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- キーボードでは欄から ↑↓ と Enter で選ぶ
                  <div
                    id={optionId(index())}
                    // 一覧と同じ理由
                    role="option"
                    aria-selected={index() === active()}
                    class="flex h-9.5 cursor-pointer items-center gap-2 rounded-1.5 px-2 hover:bg-secondary"
                    classList={{ "bg-secondary": index() === active() }}
                    onClick={() => choose(item)}
                  >
                    {item.view()}
                  </div>
                )}
              </For>
            </div>
            <p class="c-secondary b-t-1 border-primary px-2.5 py-1 text-caption">
              ↑↓ で選ぶ · Enter で入れる · Esc で閉じる
            </p>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
};

export default Completion;
