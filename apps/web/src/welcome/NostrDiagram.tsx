import { type Component, For } from "solid-js";
import { t } from "../i18n/locale";

const APPS = [
  { y: 16, self: true },
  { y: 57, self: false },
  { y: 98, self: false },
] as const;
const RELAYS = [26, 70, 114] as const;
const ACCOUNT = { x: 40, y: 70 };
const APP_X = 112;
const APP_W = 92;
const APP_H = 26;
const RELAY_X = 276;

/**
 * 1 つのアカウントでいくつものアプリを使い、どのアプリの投稿もリレーに置かれる様子。
 * 画像にせず SVG で描き、テーマの色（アクセントと文字の色味）をそのまま使う。
 */
const NostrDiagram: Component = () => (
  <svg
    viewBox="0 0 320 140"
    role="img"
    aria-label={t("welcome.diagram.label")}
    class="c-primary w-full rounded-3 border border-primary bg-secondary"
  >
    <g class="stroke-ui-3 dark:stroke-ui-6" stroke-width="1.5" fill="none">
      <For each={APPS}>
        {(app) => (
          <>
            <line
              x1={ACCOUNT.x + 20}
              y1={ACCOUNT.y}
              x2={APP_X}
              y2={app.y + APP_H / 2}
            />
            <For each={RELAYS}>
              {(relay) => (
                <line
                  x1={APP_X + APP_W}
                  y1={app.y + APP_H / 2}
                  x2={RELAY_X - 16}
                  y2={relay}
                  stroke-dasharray="3 3"
                />
              )}
            </For>
          </>
        )}
      </For>
    </g>

    <circle cx={ACCOUNT.x} cy={ACCOUNT.y - 6} r="20" class="fill-accent-5" />
    <circle cx={ACCOUNT.x} cy={ACCOUNT.y - 12} r="6" class="fill-white" />
    <path
      d={`M${ACCOUNT.x - 11} ${ACCOUNT.y + 6}a11 9 0 0 1 22 0z`}
      class="fill-white"
    />
    <text
      x={ACCOUNT.x}
      y={ACCOUNT.y + 32}
      text-anchor="middle"
      font-size="11"
      class="fill-current"
    >
      {t("welcome.diagram.account")}
    </text>

    <For each={APPS}>
      {(app) => (
        <>
          <rect
            x={APP_X}
            y={app.y}
            width={APP_W}
            height={APP_H}
            rx="6"
            class={
              app.self
                ? "fill-accent-5"
                : "fill-white stroke-ui-3 dark:fill-ui-950 dark:stroke-ui-6"
            }
          />
          <text
            x={APP_X + APP_W / 2}
            y={app.y + APP_H / 2 + 4}
            text-anchor="middle"
            font-size="11"
            font-weight={app.self ? 700 : 400}
            class={app.self ? "fill-white" : "fill-current"}
          >
            {app.self ? "Streets" : t("welcome.diagram.otherApp")}
          </text>
        </>
      )}
    </For>

    <For each={RELAYS}>
      {(y) => (
        <>
          {/* リレーはサーバーなので、データベースの円柱で描く。 */}
          <path
            d={`M${RELAY_X - 14} ${y - 8}v16a14 4 0 0 0 28 0v-16`}
            class="fill-white stroke-ui-4 dark:fill-ui-950 dark:stroke-ui-5"
          />
          <ellipse
            cx={RELAY_X}
            cy={y - 8}
            rx="14"
            ry="4"
            class="fill-white stroke-ui-4 dark:fill-ui-950 dark:stroke-ui-5"
          />
        </>
      )}
    </For>
    <text
      x={RELAY_X}
      y="136"
      text-anchor="middle"
      font-size="11"
      class="fill-current"
    >
      {t("welcome.diagram.relay")}
    </text>
  </svg>
);

export default NostrDiagram;
