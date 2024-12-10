import { Switch as KSwitch } from "@kobalte/core/switch";

type CheckboxProps = {
  label?: string;
  checked?: boolean | undefined;
  onChange?: (checked: boolean) => void;
  disabled?: boolean | undefined;
};

export function Switch(props: CheckboxProps) {
  return (
    <KSwitch
      class="inline-flex items-center justify-between"
      checked={props.checked}
      onChange={props.onChange}
    >
      <KSwitch.Input class="peer" />
      <KSwitch.Label>{props.label}</KSwitch.Label>
      <KSwitch.Control class="b-1 data-[checked]:b-accent inline-flex h-[calc(1lh+4px)] w-[calc(2lh+4px)] shrink-0 not-[[data-disabled]]:cursor-pointer items-center rounded-full not-[[data-checked]]:bg-secondary p-0.5 outline-2 outline-accent outline-offset-2 transition-[background-color]-100 peer-focus-visible:outline data-[checked]:bg-accent-primary">
        <KSwitch.Thumb class="aspect-square h-1lh w-auto rounded-full bg-white transition-transform-100 data-[checked]:translate-x-[calc(100%-2px)]" />
      </KSwitch.Control>
    </KSwitch>
  );
}
