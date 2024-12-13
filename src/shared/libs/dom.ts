import { insertTextIntoField } from "text-field-edit";

// biome-ignore lint/suspicious/noExplicitAny: any is used for type checking
const isElement = (el: any): el is HTMLElement => {
  return (
    typeof el === "object" &&
    el?.nodeType === Node.ELEMENT_NODE &&
    typeof el?.nodeName === "string"
  );
};

type ContainsTarget = HTMLElement | EventTarget | null | undefined;
export const contains = (parent: ContainsTarget, child: ContainsTarget) => {
  if (!parent || !child) return false;
  if (!isElement(parent) || !isElement(child)) return false;
  return parent === child || parent.contains(child);
};

export const useInsertText = (
  target:
    | (HTMLInputElement | HTMLTextAreaElement)
    | (() => HTMLInputElement | HTMLTextAreaElement | undefined),
) => {
  const insertText = (
    text: string,
    range?: { start: number; end: number } | undefined,
  ) => {
    const el = typeof target === "function" ? target() : target;
    if (!el) return;

    if (range) {
      el.setSelectionRange(range.start, range.end);
    }

    // Windowsでの改行コードをLFに統一
    const normalizedText = text.replace(/\r\n/g, "\n");
    insertTextIntoField(el, normalizedText);
  };

  return insertText;
};
