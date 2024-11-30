import type { Accessor } from "solid-js";
import { insertTextIntoField } from "text-field-edit";

// biome-ignore lint/suspicious/noExplicitAny: any is used for type checking
export const isElement = (el: any): el is HTMLElement => {
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
  el: Accessor<HTMLTextAreaElement | HTMLInputElement | undefined>,
) => {
  const insertText = (text: string) => {
    const field = el();
    if (!field) return;

    // Windowsで\r\nを張り付けた後にUndoするとキャレット位置がずれる問題を回避するため、\r\nを\nに正規化する
    const normalizedText = text.replace(/\r\n/g, "n");
    insertTextIntoField(field, normalizedText);
  };

  return { insertText };
};
