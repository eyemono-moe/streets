import { timeCircuitParts } from "@streets/core/view/format-time";
import { type Component, createSignal, onCleanup, onMount } from "solid-js";
import SegmentDisplay from "./SegmentDisplay";

const BLANK = {
  month: "---",
  day: "--",
  year: "----",
  pm: undefined,
  hour: "--",
  minute: "--",
} as const;

const CircuitRow: Component<{
  label: string;
  /** 秒。無ければ桁を消したまま描く。 */
  seconds: number | undefined;
  color: string;
}> = (props) => {
  const parts = () =>
    props.seconds === undefined ? BLANK : timeCircuitParts(props.seconds);
  return (
    <div class="flex flex-col items-center gap-0.5">
      <div
        class={`flex items-center gap-1.5 text-[11px] [filter:drop-shadow(0_0_2px_currentColor)] ${props.color}`}
      >
        <SegmentDisplay text={parts().month} />
        <SegmentDisplay text={parts().day} />
        <SegmentDisplay text={parts().year} />
        {/* 時の前に午前・午後の灯り。 */}
        <span class="flex flex-col gap-px">
          <span
            class="size-1 rounded-full bg-current"
            classList={{ "opacity-15": parts().pm !== false }}
          />
          <span
            class="size-1 rounded-full bg-current"
            classList={{ "opacity-15": parts().pm !== true }}
          />
        </span>
        <SegmentDisplay text={`${parts().hour}`} />
        <SegmentDisplay text={parts().minute} />
      </div>
      <span class={`text-[6px] leading-none tracking-widest ${props.color}`}>
        {props.label}
      </span>
    </div>
  );
};

/**
 * タイムスリップのカラムの設定の下に置く、時刻の表示板。行き先（さかのぼり始めた日時）、
 * 今、前に出発した時刻を 3 段で見せる。普段は薄く、指を乗せると灯る。中身は上の日時の
 * 欄と同じなので、読み上げには出さない。
 */
const TimeCircuits: Component<{
  destination: number;
  departed: number | undefined;
  /** 指を乗せなくても灯す。Storybook で灯った姿を見るため。 */
  lit?: boolean;
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
    <div class="flex justify-center">
      <div
        aria-hidden="true"
        class="flex select-none flex-col items-center gap-1.5 rounded-1 bg-time-circuit-panel px-2.5 py-2 font-mono [transition-property:opacity] duration-150 hover:opacity-100"
        classList={{ "opacity-25": !props.lit }}
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
    </div>
  );
};

export default TimeCircuits;
