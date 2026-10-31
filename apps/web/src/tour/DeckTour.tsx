import { Tour, type TourStepDetails, useTour } from "@ark-ui/solid/tour";
import { type Component, For, createEffect, on } from "solid-js";
import { t } from "../i18n/locale";
import { markTourSeen } from "../tour-setting";
import Button from "../ui/Button";
import { Portal } from "../ui/Portal";
import type { TourTarget } from "./tour-target";
import TourCard from "./TourCard";

const target = (name: TourTarget) => () =>
  document.querySelector<HTMLElement>(`[data-tour="${name}"]`);

type Step = TourStepDetails;
type Placement = NonNullable<Step["placement"]>;
type Action = NonNullable<Step["actions"]>[number];

const skip = () => ({ label: t("tour.actions.skip"), action: "skip" }) as const;
const back = () => ({ label: t("tour.actions.back"), action: "prev" }) as const;
const next = () => ({ label: t("tour.actions.next"), action: "next" }) as const;

const pointAt = (
  id: TourTarget,
  title: string,
  description: string,
  placement: Placement,
  last = false,
): Step => ({
  id,
  type: "tooltip",
  target: target(id),
  title,
  description,
  placement,
  backdrop: true,
  actions: last
    ? // 最後のステップに「次」は無いので、閉じる動きにする（next のままだと押せない）。
      [back(), { label: t("tour.actions.start"), action: "dismiss" }]
    : [skip(), back(), next()],
});

/**
 * 案内のステップ。始めるときの画面の幅で作る（狭い画面では下のバーを指すので、
 * 吹き出しは上に出す）。
 */
export const tourSteps = (wide: boolean): Step[] => [
  {
    id: "welcome",
    type: "dialog",
    title: t("tour.steps.welcome.title"),
    description: t("tour.steps.welcome.description"),
    backdrop: true,
    meta: { welcome: true },
    actions: [skip(), { label: t("tour.actions.look"), action: "next" }],
  },
  pointAt(
    "columns",
    t("tour.steps.columns.title"),
    wide
      ? t("tour.steps.columns.descriptionWide")
      : t("tour.steps.columns.descriptionNarrow"),
    wide ? "right-start" : "top",
  ),
  // 狭い画面では、カラムの追加は左上のメニューの中にあるので、最後のステップでまとめて指す。
  ...(wide
    ? [
        pointAt(
          "add-column",
          t("tour.steps.addColumn.title"),
          t("tour.steps.addColumn.description"),
          "right",
        ),
      ]
    : []),
  pointAt(
    "compose",
    t("tour.steps.compose.title"),
    t("tour.steps.compose.description"),
    wide ? "right-start" : "top-end",
  ),
  wide
    ? pointAt(
        "account",
        t("tour.steps.settings.title"),
        t("tour.steps.settings.description"),
        "right-end",
        true,
      )
    : pointAt(
        "account",
        t("tour.steps.menu.title"),
        t("tour.steps.menu.description"),
        "bottom-start",
        true,
      ),
];

/** 進むもの（次へ・はじめる・案内を見る）を目立たせ、飛ばすものは控えめにする。 */
const variantOf = (action: Action) =>
  action.action === "skip"
    ? "ghost"
    : action.action === "prev"
      ? "secondary"
      : "primary";

/**
 * 案内を出す。`requests` が増えるたびに、その時の画面の幅でステップを作り直して
 * 始める。一度も案内しない起動では読み込まれない（ツアーの部品は重い）。
 */
const DeckTour: Component<{ requests: number; wide: boolean }> = (props) => {
  const tour = useTour({
    steps: [],
    // 指す場所の外を押しても閉じない（押し間違いで案内が消えないように）。
    closeOnInteractOutside: false,
    translations: {
      progressText: ({ current, total }) => `${current + 1} / ${total}`,
    },
    onStatusChange: (details) => {
      if (details.status !== "started" && details.status !== "idle") {
        markTourSeen();
      }
    },
  });
  createEffect(
    on(
      () => props.requests,
      () => {
        tour().setSteps(tourSteps(props.wide));
        tour().start();
      },
    ),
  );
  return (
    <Tour.Root tour={tour} lazyMount unmountOnExit>
      <Portal>
        <Tour.Backdrop class="motion-fade fixed inset-0 bg-ui-950/40" />
        <Tour.Spotlight class="rounded-2 ring-2 ring-accent-5" />
        {/* 真ん中に出すステップ（dialog）は、Ark UI が置き場所を決めないので自分で置く。 */}
        <Tour.Positioner class="data-[type=dialog]:pointer-events-none data-[type=dialog]:fixed data-[type=dialog]:inset-0 data-[type=dialog]:grid data-[type=dialog]:place-items-center">
          <Tour.Content class="motion-pop pointer-events-auto w-max outline-none">
            <TourCard
              welcome={tour().step?.meta?.welcome === true}
              title={<Tour.Title class="font-600 text-body" />}
              description={<Tour.Description />}
              progress={
                tour().step?.meta?.welcome ? undefined : <Tour.ProgressText />
              }
              actions={
                <Tour.Actions>
                  {(actions) => (
                    <For each={actions()}>
                      {(action) => (
                        <Tour.ActionTrigger
                          action={action}
                          asChild={(triggerProps) => (
                            <Button
                              {...triggerProps()}
                              variant={variantOf(action)}
                              size="sm"
                            >
                              {action.label}
                            </Button>
                          )}
                        />
                      )}
                    </For>
                  )}
                </Tour.Actions>
              }
            />
          </Tour.Content>
        </Tour.Positioner>
      </Portal>
    </Tour.Root>
  );
};

export default DeckTour;
