import { type Component, For, Show } from "solid-js";
import { archetypeLabel } from "../napplet/IntentSheet";
import SelectMenu from "../ui/SelectMenu";
import SettingsSection from "./SettingsSection";

/** 既定を置かない。 */
const ASK = "ask";

export type IntentRole = {
  archetype: string;
  /** 開く先の候補。`value` は受け手の id。 */
  options: { value: string; title: string }[];
  /** 既定の受け手の id。無ければ決めていない。 */
  current?: string;
};

const RoleField: Component<{
  role: IntentRole;
  onChange: (archetype: string, value: string | undefined) => void;
}> = (props) => {
  const label = () => archetypeLabel(props.role.archetype);
  return (
    <div class="flex items-center gap-3">
      <span class="c-primary min-w-0 flex-1 text-body">{label()}</span>
      <SelectMenu
        label={`${label()}の開く先`}
        value={props.role.current ?? ASK}
        options={[
          ...props.role.options.map((option) => ({
            value: option.value,
            label: option.title,
          })),
          { value: ASK, label: "決めない" },
        ]}
        onChange={(value) =>
          props.onChange(
            props.role.archetype,
            value === ASK ? undefined : value,
          )
        }
      />
    </div>
  );
};

/** アップレットの設定。役割ごとに、どこで開くかを選ぶ。 */
const AppletSettingsView: Component<{
  roles: readonly IntentRole[];
  onChange: (archetype: string, value: string | undefined) => void;
}> = (props) => (
  <div class="flex flex-col gap-6">
    <SettingsSection
      id="intentDefaults"
      scope="account"
      description="アップレットや Streets の中で人や投稿を開くとき、どこで開くかを選びます。決めないときは、Streets の中で押したものは Streets のカラムで開き、アップレットから頼まれたときは、候補が複数あれば選ぶ画面を出します。"
    >
      <Show
        when={props.roles.length > 0}
        fallback={
          <p class="c-secondary text-caption">
            開く先を選べるものはまだありません。
          </p>
        }
      >
        <div class="flex flex-col gap-3">
          <For each={props.roles}>
            {(role) => <RoleField role={role} onChange={props.onChange} />}
          </For>
        </div>
      </Show>
    </SettingsSection>
  </div>
);

export default AppletSettingsView;
