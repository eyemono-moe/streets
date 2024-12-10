import { createPresence } from "@solid-primitives/presence";
import { normalizeURL } from "nostr-tools/utils";
import { type Component, For, Show } from "solid-js";
import { useLoading } from "../../../context/loading";
import { useRxNostr } from "../../../context/rxNostr";

const goldenAngleRad = 2.399963229728653; // (3 - Math.sqrt(5)) * Math.PI
const phase = 0.7; // 斜めにしていい感じに見えるように調整

const ox = 65;
const oy = 65;
const M = 50;
const m = 20;
const l = (count: number, i: number) =>
  m + ((M - m) * Math.sqrt(count * (count - i))) / count;

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

            // 黄金角を使って均等に配置
            const x = () =>
              Math.floor(
                ox +
                  l(relayCount(), i()) * Math.cos(i() * goldenAngleRad + phase),
              );
            const y = () =>
              Math.floor(
                oy -
                  l(relayCount(), i()) * Math.sin(i() * goldenAngleRad + phase),
              );

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
                    values={`${x() + 3}; ${x() - 3}; ${x() + 3}`}
                    keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
                    dur="2.41s"
                    begin={`-${i() * 127}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="y2"
                    calcMode="spline"
                    values={`${y() + 3}; ${y() - 3}; ${y() + 3}`}
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
                    values={`${x() + 3}; ${x() - 3}; ${x() + 3}`}
                    keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
                    dur="2.41s"
                    begin={`-${i() * 127}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="cy"
                    calcMode="spline"
                    values={`${y() + 3}; ${y() - 3}; ${y() + 3}`}
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
        <circle r="10" cx="65" cy="65" class="fill-accent" />
      </svg>
    </Show>
  );
};

export default PublishingIndicators;
