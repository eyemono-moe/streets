import {
  DEFAULT_READ_REDUNDANCY,
  READ_REDUNDANCY_CHOICES,
  type ReadRedundancy,
} from "@streets/core/settings/read-redundancy-setting";
import { type Component, Show } from "solid-js";
import { t, plural } from "../i18n/locale";
import { useDispatch } from "../ui-events";
import SegmentedControl from "../ui/SegmentedControl";
import SettingsSection from "./SettingsSection";

const options = () =>
  READ_REDUNDANCY_CHOICES.map((value) => ({
    value: String(value),
    label:
      value === DEFAULT_READ_REDUNDANCY
        ? t("settings.readRedundancy.defaultOption", { value })
        : String(value),
  }));

export type ReadRedundancyViewProps = {
  value: ReadRedundancy;
  /** いま読んでいるリレーの数。読み取り層がまだ無いときは undefined。 */
  relayCount: number | undefined;
  /** 本数を変えたら、何本のリレーを読むことになるか。 */
  preview: (redundancy: ReadRedundancy) => number;
  /** 同時につなげるリレーの数。 */
  budget: number;
};

/** 投稿を探すリレーの数。変えたらイベントを上へ渡す。 */
const ReadRedundancyView: Component<ReadRedundancyViewProps> = (props) => {
  const dispatch = useDispatch();
  const set = (value: ReadRedundancy) =>
    dispatch({ type: "deck/set-read-redundancy", value });
  const next = (): ReadRedundancy | undefined =>
    READ_REDUNDANCY_CHOICES.find((value) => value > props.value);
  const changed = () => props.value !== DEFAULT_READ_REDUNDANCY;

  return (
    <SettingsSection
      id="readRedundancy"
      scope="device"
      changed={changed()}
      onReset={() => set(DEFAULT_READ_REDUNDANCY)}
      description={t("settings.readRedundancy.description")}
    >
      <SegmentedControl
        label={t("settings.readRedundancy.label")}
        variant="secondary"
        block
        value={String(props.value)}
        options={options()}
        onChange={(value) => set(Number(value) as ReadRedundancy)}
      />
      <Show when={props.relayCount}>
        {(count) => (
          <div class="c-secondary flex flex-col gap-1 rounded-2 border border-primary p-3 text-caption">
            <p>
              {plural("settings.readRedundancy.current", count())}
              <Show
                when={changed()}
                fallback={
                  <Show when={next()}>
                    {(more) =>
                      t("settings.readRedundancy.increase", {
                        more: more(),
                        preview: props.preview(more()),
                      })
                    }
                  </Show>
                }
              >
                {t("settings.readRedundancy.backToDefault", {
                  default: DEFAULT_READ_REDUNDANCY,
                  preview: props.preview(DEFAULT_READ_REDUNDANCY),
                })}
              </Show>
            </p>
            <Show when={count() >= props.budget}>
              <p class="flex items-start gap-1">
                <span
                  class="i-material-symbols:warning-outline-rounded c-status-warn mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                {t("settings.readRedundancy.budgetReached", {
                  budget: props.budget,
                })}
              </p>
            </Show>
          </div>
        )}
      </Show>
    </SettingsSection>
  );
};

export default ReadRedundancyView;
