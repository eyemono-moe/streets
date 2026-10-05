import { timeCircuitParts } from "@streets/core/view/format-time";
import {
  type Component,
  For,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

type Row = {
  label: string;
  /** 秒。無ければ欄を消したまま描く。 */
  seconds: number | undefined;
  color: string;
};

const FIELDS = [
  { key: "month", name: "MONTH", width: "w-[3ch]" },
  { key: "day", name: "DAY", width: "w-[2ch]" },
  { key: "year", name: "YEAR", width: "w-[4ch]" },
  { key: "hour", name: "HOUR", width: "w-[2ch]" },
  { key: "minute", name: "MIN", width: "w-[2ch]" },
] as const;

const BLANK = {
  month: "---",
  day: "--",
  year: "----",
  hour: "--",
  minute: "--",
} as const;

const CircuitRow: Component<Row> = (props) => {
  const parts = () =>
    props.seconds === undefined ? undefined : timeCircuitParts(props.seconds);
  return (
    <div class="flex flex-col items-center gap-1">
      <div class={`flex items-end gap-1.5 ${props.color}`}>
        <For each={FIELDS}>
          {(field) => (
            <>
              {/* 時の前に午前・午後の灯り。光っている方が今の側。 */}
              {field.key === "hour" && (
                <span class="flex flex-col gap-0.5 pb-1 text-[8px] leading-none">
                  <span classList={{ "opacity-25": parts()?.pm !== false }}>
                    AM
                  </span>
                  <span classList={{ "opacity-25": parts()?.pm !== true }}>
                    PM
                  </span>
                </span>
              )}
              <span class="flex flex-col items-center gap-0.5">
                <span class="c-time-circuit-label text-[8px] leading-none">
                  {field.name}
                </span>
                <span
                  class={`${field.width} rounded-1 bg-time-circuit-digits px-1 py-0.5 text-center text-body tabular-nums [text-shadow:0_0_6px_currentColor] box-content`}
                >
                  {parts()?.[field.key] ?? BLANK[field.key]}
                </span>
              </span>
            </>
          )}
        </For>
      </div>
      <span
        class={`rounded-1 px-2 text-[9px] leading-4 tracking-wider ${props.color} border border-current`}
      >
        {props.label}
      </span>
    </div>
  );
};

/**
 * タイムスリップのカラムの設定の下に置く、時刻の表示板。行き先（さかのぼり始めた日時）、
 * 今、前に出発した時刻を 3 段で見せる。中身は上の日時の欄と同じなので、読み上げには出さない。
 */
const TimeCircuits: Component<{
  destination: number;
  departed: number | undefined;
}> = (props) => {
  const [present, setPresent] = createSignal(Math.floor(Date.now() / 1000));
  onMount(() => {
    const timer = setInterval(
      () => setPresent(Math.floor(Date.now() / 1000)),
      1000,
    );
    onCleanup(() => clearInterval(timer));
  });
  return (
    <div
      aria-hidden="true"
      class="flex select-none flex-col items-center gap-3 rounded-2 bg-time-circuit-panel px-2 py-3 font-mono"
    >
      <CircuitRow
        label="DESTINATION TIME"
        seconds={props.destination}
        color="c-time-circuit-destination"
      />
      <CircuitRow
        label="PRESENT TIME"
        seconds={present()}
        color="c-time-circuit-present"
      />
      <CircuitRow
        label="LAST TIME DEPARTED"
        seconds={props.departed}
        color="c-time-circuit-departed"
      />
    </div>
  );
};

export default TimeCircuits;
