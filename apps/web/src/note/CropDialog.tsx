import { ImageCropper, useImageCropper } from "@ark-ui/solid/image-cropper";
import { type Component, For, createSignal } from "solid-js";
import Button from "../ui/Button";
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";

/**
 * 切り抜いた結果の種類。png で出すと写真が大きく膨らむので、元が jpeg / webp
 * ならその種類のまま出す。
 */
const outputType = (type: string) =>
  type === "image/jpeg" || type === "image/webp" ? type : "image/png";

const IconButton: Component<{
  label: string;
  icon: string;
  onClick: () => void;
}> = (props) => (
  <button
    type="button"
    aria-label={props.label}
    title={props.label}
    class="c-secondary grid size-8 cursor-pointer place-items-center rounded-2 bg-transparent hover:bg-secondary"
    onClick={() => props.onClick()}
  >
    <span class={`${props.icon} size-5`} aria-hidden="true" />
  </button>
);

/**
 * 添えた画像を切り抜く。預ける前に切るので、切り落とした部分は誰にも渡らない。
 */
const CropDialog: Component<{
  src: string;
  name: string;
  type: string;
  onDone: (image: Blob) => void;
  onClose: () => void;
}> = (props) => {
  const cropper = useImageCropper();
  const [working, setWorking] = createSignal(false);

  /**
   * 画像の縦横比。切り抜く枠の座標は「画像が枠いっぱいに伸びている」前提で
   * 元の画素に戻されるので、枠の側を画像に合わせる（読み込むまでは 16:9）。
   * 高さの上限は幅の上限に言い換える —— 高さを削ると比が崩れるため。
   */
  const ratio = () => {
    const { width, height } = cropper().naturalSize;
    return width > 0 && height > 0 ? width / height : 16 / 9;
  };

  const done = async () => {
    setWorking(true);
    try {
      const image = await cropper().getCroppedImage({
        type: outputType(props.type),
        quality: 0.92,
      });
      if (image instanceof Blob) props.onDone(image);
    } finally {
      setWorking(false);
    }
  };

  return (
    <DialogRoot open onClose={() => props.onClose()}>
      <DialogPortal>
        <DialogContent class="w-full max-w-140 rounded-3 border border-primary">
          <div class="flex h-12 items-center gap-2 pr-3 pl-4">
            <DialogTitle class="min-w-0 flex-1 truncate font-600 text-body">
              {props.name} を切り抜く
            </DialogTitle>
            <DialogClose />
          </div>

          <ImageCropper.RootProvider value={cropper} class="px-4">
            <ImageCropper.Viewport
              class="mx-auto w-full overflow-hidden rounded-2 bg-tertiary"
              style={{
                "aspect-ratio": `${ratio()}`,
                "max-width": `${20 * ratio()}rem`,
              }}
            >
              <ImageCropper.Image src={props.src} class="size-full" />
              {/* 切り抜く枠。外側を暗くして、残る範囲を分かりやすくする。 */}
              <ImageCropper.Selection class="shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] outline outline-2 outline-white">
                <For each={ImageCropper.handles}>
                  {(position) => (
                    <ImageCropper.Handle
                      position={position}
                      class="grid place-items-center"
                    >
                      <div class="size-3 rounded-0.5 bg-white" />
                    </ImageCropper.Handle>
                  )}
                </For>
                <ImageCropper.Grid
                  class="pointer-events-none absolute inset-x-0 inset-y-1/3 border-white/50 border-y opacity-0 transition-opacity data-[dragging]:opacity-100 data-[panning]:opacity-100"
                  axis="horizontal"
                />
                <ImageCropper.Grid
                  class="pointer-events-none absolute inset-x-1/3 inset-y-0 border-white/50 border-x opacity-0 transition-opacity data-[dragging]:opacity-100 data-[panning]:opacity-100"
                  axis="vertical"
                />
              </ImageCropper.Selection>
            </ImageCropper.Viewport>
          </ImageCropper.RootProvider>

          <div class="flex h-13 items-center gap-1.5 py-2.5 pr-3 pl-4">
            <IconButton
              label="縮小"
              icon="i-material-symbols:zoom-out-rounded"
              onClick={() => cropper().zoomBy(-0.1)}
            />
            <IconButton
              label="拡大"
              icon="i-material-symbols:zoom-in-rounded"
              onClick={() => cropper().zoomBy(0.1)}
            />
            <IconButton
              label="回転"
              icon="i-material-symbols:rotate-90-degrees-cw-outline-rounded"
              onClick={() => cropper().rotateBy(90)}
            />
            <IconButton
              label="元に戻す"
              icon="i-material-symbols:restart-alt-rounded"
              onClick={() => cropper().reset()}
            />
            <span class="flex-1" />
            <Button variant="secondary" onClick={() => props.onClose()}>
              やめる
            </Button>
            <Button variant="primary" disabled={working()} onClick={done}>
              切り抜く
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};

export default CropDialog;
