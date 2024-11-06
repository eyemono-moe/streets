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
