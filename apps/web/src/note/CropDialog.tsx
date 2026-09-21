import { ImageCropper, useImageCropper } from "@ark-ui/solid/image-cropper";
import type { CropRect } from "@streets/core/view/compose";
import { type Component, For, Show, createSignal, onMount } from "solid-js";
import Button from "../ui/Button";
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";

/** 枠の高さの上限。これより縦長の画像は、幅を詰めて収める。 */
const MAX_VIEWPORT_HEIGHT = 320;

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

/** 画面に映す大きさと、元の画素との倍率。 */
type Box = { scale: number; width: number; height: number };

const Editor: Component<{
  src: string;
  box: Box;
  crop: CropRect | undefined;
  onDone: (crop: CropRect | undefined) => void;
  onClose: () => void;
}> = (props) => {
  // 前に決めた範囲を、画面の座標に直して開く（続きから直せるように）。
  const initialCrop = props.crop && {
    x: props.crop.x * props.box.scale,
    y: props.crop.y * props.box.scale,
    width: props.crop.width * props.box.scale,
    height: props.crop.height * props.box.scale,
  };
  const cropper = useImageCropper({ initialCrop });

  const done = () => {
    const data = cropper().getCropData();
    const { width, height } = cropper().naturalSize;
    const rect = {
      x: Math.round(data.x),
      y: Math.round(data.y),
      width: Math.round(data.width),
      height: Math.round(data.height),
    };
    // 画像まるごとなら、切り抜きは無かったことにする（預けるのは元の画像）。
    const whole =
      rect.x === 0 &&
      rect.y === 0 &&
      rect.width >= width &&
      rect.height >= height;
    props.onDone(whole ? undefined : rect);
  };

  return (
    <>
      <ImageCropper.RootProvider value={cropper} class="px-4">
        <ImageCropper.Viewport
          class="mx-auto overflow-hidden rounded-2 bg-tertiary"
          style={{
            width: `${props.box.width}px`,
            height: `${props.box.height}px`,
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
          label="全体に戻す"
          icon="i-material-symbols:restart-alt-rounded"
          onClick={() => {
            cropper().reset();
            props.onDone(undefined);
          }}
        />
        <span class="flex-1" />
        <Button variant="secondary" onClick={() => props.onClose()}>
          やめる
        </Button>
        <Button variant="primary" onClick={done}>
          決定
        </Button>
      </div>
    </>
  );
};

/**
 * 添えた画像の、切り抜く範囲を決める。ここでは画素を作らない —— 元の画像を
 * 残したまま範囲だけを持ち、実際に切るのは預ける直前。何度でも直せる。
 */
const CropDialog: Component<{
  src: string;
  name: string;
  crop?: CropRect;
  onDone: (crop: CropRect | undefined) => void;
  onClose: () => void;
}> = (props) => {
  const [box, setBox] = createSignal<Box>();
  let area: HTMLDivElement | undefined;

  // 元の画素へ戻す倍率が要るので、先に画像の大きさを読む。読めてから枠を出す。
  onMount(async () => {
    const image = new Image();
    image.src = props.src;
    try {
      await image.decode();
    } catch {
      props.onClose();
      return;
    }
    // 枠の左右の余白（px-4 ＝ 16px ずつ）を引いた、実際に使える幅。
    const available = (area?.clientWidth ?? 0) - 32 || image.naturalWidth;
    const scale = Math.min(
      available / image.naturalWidth,
      MAX_VIEWPORT_HEIGHT / image.naturalHeight,
    );
    setBox({
      scale,
      width: image.naturalWidth * scale,
      height: image.naturalHeight * scale,
    });
  });

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

          {/* 読み込む前でも高さが変わらないよう、場所だけ先に取っておく。 */}
          <div ref={area}>
            <Show
              when={box()}
              fallback={<div style={{ height: `${MAX_VIEWPORT_HEIGHT}px` }} />}
            >
              {(box) => (
                <Editor
                  src={props.src}
                  box={box()}
                  crop={props.crop}
                  onDone={props.onDone}
                  onClose={props.onClose}
                />
              )}
            </Show>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};

export default CropDialog;
