import {
  formatEventTime,
  formatEventTimeFull,
  formatRelativeEventTime,
} from "@streets/core/view/format-time";
import { type Component, createSignal } from "solid-js";
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
    title={formatEventTimeFull(props.at)}
  >
    {timeFormat() === "relative"
      ? formatRelativeEventTime(props.at, minuteClock())
      : formatEventTime(props.at, new Date())}
  </time>
);

export default EventTime;
