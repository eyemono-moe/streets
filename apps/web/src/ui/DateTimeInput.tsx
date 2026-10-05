import {
  fromDateTimeLocal,
  toDateTimeLocal,
} from "@streets/core/view/format-time";
import type { Component } from "solid-js";
import { textInputClass } from "./TextField";

/**
 * 日時を選ぶ欄。値は秒で受け渡し、端末の時刻で見せる。選び終えたとき（`change`）
 * だけ知らせる —— 打っている途中の値で知らせると、そのたびに読み直しが走る。
 */
const DateTimeInput: Component<{
  value: number;
  onChange: (seconds: number) => void;
  label: string;
  /** これより後は選べない（秒）。 */
  max?: number;
  autofocus?: boolean;
}> = (props) => (
  <input
    type="datetime-local"
    class={`${textInputClass} w-full`}
    aria-label={props.label}
    value={toDateTimeLocal(props.value)}
    max={props.max === undefined ? undefined : toDateTimeLocal(props.max)}
    autofocus={props.autofocus}
    onChange={(event) => {
      const seconds = fromDateTimeLocal(event.currentTarget.value);
      if (seconds === undefined) {
        // 空にされたら、元の値を見せ直す。
        event.currentTarget.value = toDateTimeLocal(props.value);
        return;
      }
      props.onChange(seconds);
    }}
  />
);

export default DateTimeInput;
