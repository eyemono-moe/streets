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

/**
 * テキストフィールドとそれを再現したミラー要素を一意に管理するためのマップ
 */
const mirrorMap = new WeakMap<
  HTMLInputElement | HTMLTextAreaElement,
  HTMLDivElement
>();

export type CaretPos = Readonly<Omit<DOMRect, "toJSON">>;

/**
 * テキストフィールドのキャレット位置(絶対座標)を取得する
 * @param markerPosition 再現したいキャレットのインデックス(デフォルト値: テキスト終端)
 */
const getCaretPosition = (
  textField: HTMLInputElement | HTMLTextAreaElement,
  markerPosition: number | null,
): CaretPos => {
  let mirror = mirrorMap.get(textField);
  if (mirror && mirror.parentElement === textField.parentElement) {
    mirror.innerHTML = "";
  } else {
    mirror = document.createElement("div");
    mirrorMap.set(textField, mirror);
    mirror.style.cssText = calcMirrorStyle(textField);
  }

  const marker = document.createElement("span");
  marker.style.cssText = "position: absolute;";
  marker.innerHTML = "&nbsp;";

  let before: Text | undefined;
  let after: Text | undefined;
  if (markerPosition !== null) {
    const prefix = textField.value.slice(0, markerPosition);
    if (prefix) {
      before = document.createTextNode(prefix);
    }
    const suffix = textField.value.slice(markerPosition);
    if (suffix) {
      after = document.createTextNode(suffix);
    }
  } else {
    const text = textField.value;
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
    if (!textField.parentElement) {
      throw new Error("textField must have a parentElement to mirror");
    }
    textField.parentElement.insertBefore(mirror, textField);
  }

  mirror.scrollTop = textField.scrollTop;
  mirror.scrollLeft = textField.scrollLeft;

  const textFieldClientRect = textField.getBoundingClientRect();

  const width = marker.offsetWidth;
  const height = marker.offsetHeight;
  const x = marker.offsetLeft - mirror.scrollLeft + textFieldClientRect.x;
  const y = marker.offsetTop - mirror.scrollTop + textFieldClientRect.y;

  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  };
};

export default getCaretPosition;
