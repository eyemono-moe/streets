import {
  formatEventTime,
  formatEventTimeFull,
  formatRelativeEventTime,
} from "@streets/core/view/format-time";
import { type Component, createSignal } from "solid-js";
import { locale, messageOrText } from "../i18n/locale";
import { timeFormat } from "../time-format-setting";

const [now, setNow] = createSignal(new Date());
let ticking = false;

/**
 * 相対時間を進める時計。画面全体で 1 つだけ持つ —— 投稿ごとにタイマーを作ると、
 * カラムを並べた画面では数千本になる。相対時間を選んだ人の画面でだけ動かす。
 */
const minuteClock = () => {
  if (!ticking) {
    ticking = true;
    setNow(new Date());
    setInterval(() => setNow(new Date()), 60_000);
  }
  return now();
};

/** 投稿などを出した時刻。設定に従って、絶対時間か相対時間で見せる。 */
const EventTime: Component<{
  at: Date;
  class?: string;
  ref?: (element: HTMLTimeElement) => void;
}> = (props) => (
  <time
    ref={props.ref}
    class={`c-secondary text-caption ${props.class ?? ""}`}
    datetime={props.at.toISOString()}
    title={formatEventTimeFull(props.at, locale())}
  >
    {timeFormat() === "relative"
      ? messageOrText(
          formatRelativeEventTime(props.at, minuteClock(), locale()),
        )
      : formatEventTime(props.at, new Date(), locale())}
  </time>
);

export default EventTime;
