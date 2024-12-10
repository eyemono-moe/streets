import { createPresence } from "@solid-primitives/presence";
import { normalizeURL } from "nostr-tools/utils";
import { type Component, For, Show } from "solid-js";
import { useLoading } from "../../../context/loading";
import { useRxNostr } from "../../../context/rxNostr";

const lookupTable: { r: number; a: number }[][] = [
  [{ r: 3, a: 35 }],
  [
    { r: 3, a: 5 },
    { r: 3, a: 70 },
  ],
  [
    { r: 3, a: 5 },
    { r: 3, a: 32 },
    { r: 3, a: 70 },
  ],
  [
    { r: 3, a: 5 },
    { r: 3, a: 27 },
    { r: 3, a: 48 },
    { r: 3, a: 70 },
  ],
  [
    { r: 3, a: 5 },
    { r: 3, a: 38 },
    { r: 3, a: 70 },
    { r: 2, a: 21 },
    { r: 2, a: 54 },
  ],
  [
    { r: 3, a: 5 },
    { r: 3, a: 27 },
    { r: 3, a: 48 },
    { r: 3, a: 70 },
    { r: 2, a: 15 },
    { r: 2, a: 55 },
  ],
  [
    { r: 3, a: 5 },
    { r: 3, a: 27 },
    { r: 3, a: 48 },
    { r: 3, a: 70 },
    { r: 2, a: 15 },
    { r: 2, a: 55 },
    { r: 1, a: 35 },
  ],
  [
    { r: 3, a: 5 },
    { r: 3, a: 27 },
    { r: 3, a: 48 },
    { r: 3, a: 70 },
    { r: 2, a: 13 },
    { r: 2, a: 45 },
    { r: 2, a: 66 },
    { r: 1, a: 37 },
  ],
  [
    { r: 3, a: 5 },
    { r: 3, a: 27 },
    { r: 3, a: 48 },
    { r: 3, a: 70 },
    { r: 2, a: 15 },
    { r: 2, a: 42 },
    { r: 2, a: 62 },
    { r: 1, a: 20 },
    { r: 1, a: 50 },
  ],
  [
    { r: 3, a: 5 },
    { r: 3, a: 20 },
    { r: 3, a: 40 },
    { r: 3, a: 59 },
    { r: 3, a: 76 },
    { r: 2, a: 15 },
    { r: 2, a: 42 },
    { r: 2, a: 63 },
    { r: 1, a: 10 },
    { r: 1, a: 55 },
  ],
];

const random = (seed: number) => {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  // biome-ignore lint/suspicious/noAssignInExpressions:
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const rnd = random(9883);

const PublishingIndicators: Component = () => {
  const { connectionState } = useRxNostr();
  const [latestSendState] = useLoading();
  const { isVisible, isMounted } = createPresence(
    () => latestSendState.sending,
    {
      transitionDuration: 500,
    },
  );

  const relays = () => Object.keys(connectionState).slice(0, 10);
  const relayCount = () => Math.min(relays().length, 10);

  const ox = 6;
  const oy = 124;
  const l = 35;

  return (
    <Show when={isMounted()}>
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: */}
      <svg
        width="130"
        height="130"
        viewBox="0 0 130 130"
        class="transition-opacity duration-500"
        classList={{
          "opacity-0": !isVisible(),
          "opacity-50": isVisible(),
        }}
      >
        <For each={relays()}>
          {(relay, i) => {
            const success = () => {
              const done =
                latestSendState.relayStates[normalizeURL(relay)]?.done;
              return latestSendState.sending ? done : done !== undefined;
            };

            const p = () => lookupTable[relayCount() - 1][i()];
            const x = () =>
              Math.floor(ox + l * p().r * Math.cos((p().a * Math.PI) / 180));
            const y = () =>
              Math.floor(oy - l * p().r * Math.sin((p().a * Math.PI) / 180));

            const color = () =>
              success()
                ? "fill-green stroke-green/50"
                : success() === false
                  ? "fill-red stroke-red/50"
                  : "fill-gray stroke-gray/50 [line&]:animate-pulse";

            // get a random number between 5 and 8
            const size = () => 5 + 3 * rnd();

            return (
              <>
                <line
                  x1={ox}
                  y1={oy}
                  class={`${color()} transition-[fill,stroke]`}
                  stroke-width="3"
                >
                  <animate
                    attributeName="x2"
                    calcMode="spline"
                    values={`${x() + 5}; ${x() - 5}; ${x() + 5}`}
                    keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
                    dur="2.41s"
                    begin={`-${i() * 127}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="y2"
                    calcMode="spline"
                    values={`${y() + 5}; ${y() - 5}; ${y() + 5}`}
                    keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
                    dur="3.13s"
                    begin={`-${i() * 127}s`}
                    repeatCount="indefinite"
                  />
                </line>
                <circle
                  r={size()}
                  class={`${color()} transition-[fill,stroke]`}
                >
                  <animate
                    attributeName="cx"
                    calcMode="spline"
                    values={`${x() + 5}; ${x() - 5}; ${x() + 5}`}
                    keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
                    dur="2.41s"
                    begin={`-${i() * 127}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="cy"
                    calcMode="spline"
                    values={`${y() + 5}; ${y() - 5}; ${y() + 5}`}
                    keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
                    dur="3.13s"
                    begin={`-${i() * 127}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              </>
            );
          }}
        </For>
      </svg>
    </Show>
  );
};

export default PublishingIndicators;
