import { createEventListener } from "@solid-primitives/event-listener";
import { createWritableMemo } from "@solid-primitives/memo";
import {
  type Accessor,
  batch,
  createEffect,
  createResource,
  createSignal,
} from "solid-js";
import getCaretPosition, { type CaretPos } from "./caretPosition";
import { useInsertText } from "./dom";

type TargetEl = HTMLInputElement | HTMLTextAreaElement;
export type Target = Accessor<TargetEl | undefined>;

export type Option<T> = {
  value: T;
  insertValue: string;
};

type MaybePromise<T> = T | Promise<T>;

export const createAutoComplete = <T extends string, U>(
  target: Target,
  prefixes: T[],
  options: {
    [K in T]:
      | Option<U>[]
      | ((query: string) => Option<U>[])
      | ((query: string) => Promise<Option<U>[]>);
  },
  minQueryLength = 2,
) => {
  const [query, setQuery] = createSignal<string>();
  const [activePrefix, setActivePrefix] = createSignal<T>();
  const [insertRange, setInsertRange] = createSignal<{
    start: number;
    end: number;
  }>({
    start: 0,
    end: 0,
  });

  const [candidates] = createResource(
    () => [query(), activePrefix()] as const,
    ([q, p]): MaybePromise<Option<U>[]> => {
      // クエリがない場合は候補を返さない
      if (!q || !p) {
        return [];
      }

      const opts = options[p];
      if (Array.isArray(opts)) {
        return opts.filter((o) => o.insertValue.includes(q));
      }

      // TODO: debounce
      return opts(q);
    },
  );

  const [showSuggestion, setShowSuggestion] = createWritableMemo(
    () => query() && candidates.state === "ready" && candidates().length > 0,
  );

  // 選択中の候補のインデックス
  const [activeIndex, setActiveIndex] = createSignal(-1);

  const insert = useInsertText(target);

  const insertAutoComplete = (index?: number) => {
    const c = candidates()?.[index ?? activeIndex()];
    if (c) {
      insert(c.insertValue, insertRange());

      setShowSuggestion(false);
    }
  };

  const [caretPosition, setCaretPosition] = createSignal<CaretPos>({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    right: 0,
    bottom: 0,
  });

  createEffect(() => {
    // 候補が変わったら選択中の候補をリセット
    void candidates();
    setActiveIndex(0);
  });

  const updateTarget = (el: TargetEl) => {
    const { value, selectionStart } = el;
    if (selectionStart !== null) {
      // カーソルがある行のカーソル前の文字列を取得
      const textBeforeCaret =
        value.slice(0, selectionStart).split("\n").pop() ?? "";

      const match = textBeforeCaret.match(
        new RegExp(`(${prefixes.join("|")})([^\\s]*)$`),
      );

      if (!match) {
        batch(() => {
          setQuery("");
          setActivePrefix();
        });
        return;
      }

      const [fullSearchString, prefix, searchQuery] = match;

      // クエリが最小文字数以上の場合のみ候補を表示
      if (searchQuery.length < minQueryLength) {
        batch(() => {
          setQuery("");
          setActivePrefix();
        });
        return;
      }

      // batchしないと setQuery()→candidateが0件→setShowSuggestion(false) の処理の後にsetShowSuggestion(true)が実行されてしまう
      batch(() => {
        setQuery(searchQuery);
        setActivePrefix(() => prefix as T);
        const textBeforePrefix = value.slice(
          0,
          selectionStart - fullSearchString.length,
        );
        setInsertRange({
          start: selectionStart - fullSearchString.length,
          end: selectionStart,
        });
        setCaretPosition(getCaretPosition(el, textBeforePrefix.length));
      });
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing) return;
    if (!showSuggestion()) return;

    if (
      e.key === "ArrowDown" &&
      candidates.state === "ready" &&
      candidates().length > 0
    ) {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % candidates().length);
    } else if (
      e.key === "ArrowUp" &&
      candidates.state === "ready" &&
      candidates().length > 0
    ) {
      e.preventDefault();
      setActiveIndex(
        (i) => (i - 1 + candidates().length) % candidates().length,
      );
    } else if (e.key === "Tab") {
      e.preventDefault();
      insertAutoComplete();
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.key === "Tab" || e.key === "ArrowUp" || e.key === "ArrowDown") return;
    if (e.currentTarget) updateTarget(e.currentTarget as TargetEl);

    if (e.key === "Escape") {
      setShowSuggestion(false);
    }
  };

  const handleBlur = () => {
    setShowSuggestion(false);
  };

  const onSelect = (index: number) => {
    insertAutoComplete(index);
  };

  createEventListener(target, "keyup", handleKeyUp);
  createEventListener(target, "keydown", handleKeyDown);
  createEventListener(target, "blur", handleBlur);

  return { candidates, activeIndex, caretPosition, showSuggestion, onSelect };
};
