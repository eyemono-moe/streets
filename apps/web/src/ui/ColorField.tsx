import { ColorPicker, parseColor } from "@ark-ui/solid/color-picker";
import { type Component, createEffect, createSignal } from "solid-js";
import { Portal } from "solid-js/web";

/**
 * 色を 1 つ選ぶ欄。見本を押すと、面と色相の帯で選ぶ窓が開く。16 進数でも打てる。
 * 動かしている間は `onPreview` で当てるだけにし、手を離したときに `onCommit` で確定する ——
 * 保存がアカウント（リレーへの書き込み）なので、つまみを動かすたびに送らない。
 *
 * 今の色は窓自身が持つ。外の値（16 進数）だけを正にすると、明度や彩度を落としたときに
 * 色相が失われ、つまみが戻ってしまう。外から変わったときだけ合わせる。
 */
const ColorField: Component<{
  label: string;
  /** `#rrggbb`。 */
  value: string;
  onPreview: (hex: string) => void;
  onCommit: (hex: string) => void;
}> = (props) => {
  const [color, setColor] = createSignal(parseColor(props.value));
  createEffect(() => {
    const outside = props.value.toLowerCase();
    if (outside !== color().toString("hex").toLowerCase()) {
      setColor(parseColor(outside));
    }
  });

  return (
    <ColorPicker.Root
      value={color()}
      format="hsba"
      onValueChange={(details) => {
        setColor(details.value);
        props.onPreview(details.value.toString("hex"));
      }}
      onValueChangeEnd={(details) =>
        props.onCommit(details.value.toString("hex"))
      }
      lazyMount
      unmountOnExit
      positioning={{ placement: "bottom-end" }}
      class="flex min-h-10 w-full items-center gap-3"
    >
      <ColorPicker.Label class="c-primary min-w-0 flex-1 text-body">
        {props.label}
      </ColorPicker.Label>
      <ColorPicker.Control class="flex h-9 shrink-0 items-center gap-2 rounded-2 border border-primary bg-primary pr-2.5 pl-1">
        <ColorPicker.Trigger
          aria-label={`${props.label}を選ぶ`}
          class="grid size-7 cursor-pointer place-items-center rounded-1.5 bg-transparent p-0"
        >
          <ColorPicker.ValueSwatch class="size-6 rounded-1.5" />
        </ColorPicker.Trigger>
        <ColorPicker.ChannelInput
          channel="hex"
          class="c-primary w-20 bg-transparent font-mono text-caption uppercase outline-none"
        />
      </ColorPicker.Control>
      <Portal>
        <ColorPicker.Positioner>
          <ColorPicker.Content class="motion-pop flex w-60 flex-col gap-3 rounded-3 border border-primary bg-primary p-3 shadow-lg outline-none">
            {/* つまみは位置だけが当てられるので、中心へ寄せるのと基準の位置はこちらで持つ。 */}
            <ColorPicker.Area class="relative h-36 overflow-hidden rounded-2">
              <ColorPicker.AreaBackground class="size-full" />
              <ColorPicker.AreaThumb class="-translate-x-1/2 -translate-y-1/2 size-4 rounded-full border-2 border-white shadow-md" />
            </ColorPicker.Area>
            <ColorPicker.ChannelSlider channel="hue" class="relative py-1">
              <ColorPicker.ChannelSliderTrack class="h-3 rounded-full" />
              <ColorPicker.ChannelSliderThumb class="-translate-x-1/2 -translate-y-1/2 size-4 rounded-full border-2 border-white shadow-md" />
            </ColorPicker.ChannelSlider>
          </ColorPicker.Content>
        </ColorPicker.Positioner>
      </Portal>
      <ColorPicker.HiddenInput />
    </ColorPicker.Root>
  );
};

export default ColorField;
