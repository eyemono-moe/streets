const properties = [
  "position:absolute;",
  "overflow:auto;",
  "word-wrap:break-word;",
  "top:0px;",
  "left:-9999px;",
];

/** カーソルの位置に影響するCSSプロパティ */
const propertyNamesToCopy = [
  "box-sizing",
  "font-family",
  "font-size",
  "font-style",
  "font-variant",
  "font-weight",
  "height",
  "letter-spacing",
  "line-height",
  "max-height",
  "min-height",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "border-bottom",
  "border-left",
  "border-right",
  "border-top",
  "text-decoration",
  "text-indent",
  "text-transform",
  "width",
  "word-spacing",
];

const overrideProperties = ["width: 100%"];

const calcMirrorStyle = (textField: HTMLInputElement | HTMLTextAreaElement) => {
  const style = window.getComputedStyle(textField);
  const props: string[] = [
    ...properties,
    `white-space:${
      textField.nodeName.toLowerCase() === "textarea" ? "pre-wrap" : "nowrap"
    };`,
    ...propertyNamesToCopy.map(
      (name) => `${name}:${style.getPropertyValue(name)};`,
    ),
    ...overrideProperties,
  ];
  return props.join(" ");
};

const mirrorMap = new WeakMap<
  HTMLTextAreaElement | HTMLInputElement,
  HTMLDivElement
>();

/**
 * キャレットの位置に
 *
 * @param field キャレットの位置を取得するテキストフィールド
 * @param index 取得したいキャレットのインデックス(省略時はテキスト終端)
 */
export const getCaretElement = (
  field: HTMLTextAreaElement | HTMLInputElement,
  index: number | null,
): HTMLSpanElement => {
  let mirror = mirrorMap.get(field);
  if (mirror && mirror.parentNode === field.parentNode) {
    mirror.innerHTML = "";
  } else {
    mirror = document.createElement("div");
    mirrorMap.set(field, mirror);
    mirror.style.cssText = calcMirrorStyle(field);
  }

  // キャレットを模倣するspan要素
  const marker = document.createElement("span");
  marker.style.cssText = "position:absolute;";
  marker.innerHTML = "&nbsp;";

  let before: Text | undefined;
  let after: Text | undefined;
  if (index !== null) {
    const prefix = field.value.slice(0, index);
    if (prefix) {
      before = document.createTextNode(prefix);
    }
    const suffix = field.value.slice(index);
    if (suffix) {
      after = document.createTextNode(suffix);
    }
  } else {
    const text = field.value;
    if (text) {
      before = document.createTextNode(text);
    }
  }

  if (before) {
    mirror.appendChild(before);
  }

  mirror.appendChild(marker);

  if (after) {
    mirror.appendChild(after);
  }

  if (!mirror.parentElement) {
    if (!field.parentElement) {
      throw new Error("textField must have a parentElement to mirror");
    }
    field.parentElement.insertBefore(mirror, field);
  }

  return marker;
};
