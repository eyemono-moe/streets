/**
 * 打った言葉と名前を比べる前に形を揃える。カタカナはひらがなにする —— 名前は
 * 「ネコ」のようにカタカナのことがあり、打つ人は「ねこ」と打つため。
 */
export const normalizeForMatch = (value: string): string =>
  value
    // 全角の英数字を半角にする（「ｃａｔ」と打っても引けるように）。
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (kana) =>
      String.fromCharCode(kana.charCodeAt(0) - 0x60),
    )
    .replace(/[_\s]+/g, "");
