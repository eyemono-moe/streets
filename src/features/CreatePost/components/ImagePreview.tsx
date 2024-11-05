import {
  type Component,
  createEffect,
  createSignal,
  onCleanup,
} from "solid-js";

const ImagePreview: Component<{
  file: File;
}> = (props) => {
  const [url, setUrl] = createSignal("");

  createEffect(() => {
    // create object url
    const objectUrl = URL.createObjectURL(props.file);
    setUrl(objectUrl);

    onCleanup(() => {
      URL.revokeObjectURL(objectUrl);
    });
  });

  return <img src={url()} alt="preview" class="h-full w-full object-contain" />;
};

export default ImagePreview;
