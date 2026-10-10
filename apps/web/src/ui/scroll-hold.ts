/**
 * 開き口が行の中にあり、開いている間は行が動くと困るもの。Ark UI（zag）は開き口に
 * `data-scope`・`data-part`・`data-state` を付けるので、部品ごとに知らせてもらわずに
 * 見分けられる。中身は body の末尾へ出るので、開き口の側を見る。折りたたみ
 * （collapsible）も `data-state="open"` を出すが、開いたまま置くものなので数えない。
 */
const OPEN_TRIGGER =
  ':is([data-scope="menu"],[data-scope="popover"],[data-scope="hover-card"])[data-part="trigger"][data-state="open"]';

/** ダイアログはどこから開いたかを DOM から辿れないので、どれか 1 つでも開いていれば止める。 */
const OPEN_DIALOG =
  '[data-scope="dialog"][data-part="content"][data-state="open"]';

const playing = (scroller: HTMLElement): boolean => {
  for (const media of scroller.querySelectorAll("video, audio")) {
    if (media instanceof HTMLMediaElement && !media.paused && !media.ended) {
      return true;
    }
  }
  return false;
};

const selecting = (scroller: HTMLElement): boolean => {
  const selection = scroller.ownerDocument.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return false;
  }
  return scroller.contains(selection.getRangeAt(0).commonAncestorContainer);
};

/**
 * 使う人が一覧の中の何かを操作している間は、新着で一覧を動かさない。動かすと、
 * 開いたメニューや再生中の動画、選んでいる文字が手元から逃げる。届いたその時に
 * 確かめるので、開閉を見張らない。
 */
export const holdsScroll = (scroller: HTMLElement): boolean =>
  scroller.querySelector(OPEN_TRIGGER) !== null ||
  scroller.ownerDocument.querySelector(OPEN_DIALOG) !== null ||
  playing(scroller) ||
  selecting(scroller);
