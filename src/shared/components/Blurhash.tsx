import { decode } from "blurhash";
import {
  type Component,
  type ComponentProps,
  createEffect,
  mergeProps,
  splitProps,
} from "solid-js";

const Blurhash: Component<
  ComponentProps<"canvas"> & { blurhash: string; size?: number }
> = (props) => {
  const mergedProps = mergeProps({ size: 32 }, props);
  const [_, canvasProps] = splitProps(mergedProps, ["blurhash", "size"]);

  let canvasRef!: HTMLCanvasElement;

  createEffect(() => {
    const pixels = decode(props.blurhash, mergedProps.size, mergedProps.size);
    const ctx = canvasRef.getContext("2d");
    if (!ctx) {
      return;
    }
    const imageData = ctx.createImageData(mergedProps.size, mergedProps.size);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);
  });

  return (
    <canvas
      ref={canvasRef}
      {...canvasProps}
      width={mergedProps.size}
      height={mergedProps.size}
    />
  );
};

export default Blurhash;
