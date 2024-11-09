import Cropper from "cropperjs";
import { type ParentComponent, Show } from "solid-js";
import { type UploadFileProps, uploadFile } from "../../libs/uploadFile";
import { useDialog } from "../../libs/useDialog";
import "cropperjs/dist/cropper.min.css";
import { useFileServer } from "../../../context/fileServer";
import { useI18n } from "../../../i18n";
import { toast } from "../../libs/toast";
import Button from "./Button";

const FileUploadButton: ParentComponent<{
  class?: string;
  crop?: boolean;
  cropperOptions?: Cropper.Options;
  onUpload?: (res: Awaited<ReturnType<typeof uploadFile>>) => void;
  mediaType?: UploadFileProps["mediaType"];
}> = (props) => {
  const t = useI18n();

  let inputRef: HTMLInputElement;
  let imgRef: HTMLImageElement;
  let cropper: Cropper;

  const {
    Dialog: CropperDialog,
    open: openCropper,
    close: closeCropper,
  } = useDialog();
  const [, serverConfig] = useFileServer();

  const handleUploadFile = async (file: File) => {
    const apiUrl = "http://localhost:3000/api/v2/media";
    // const apiUrl = serverConfig()?.api_url;
    if (!apiUrl) {
      toast.error(t("noFileServerConfigured"));
      return;
    }
    const res = await uploadFile({
      apiUrl,
      file,
      mediaType: props.mediaType,
    });
    if (props.onUpload) props.onUpload(res);
  };

  const handleAccept = async (file: File) => {
    if (!props.crop) {
      handleUploadFile(file);
      return;
    }

    openCropper();
    imgRef.src = URL.createObjectURL(file);
    imgRef.onload = () => {
      cropper = new Cropper(imgRef, props.cropperOptions);
    };
  };

  const handleCrop = async () => {
    if (!cropper) return;
    const canvas = cropper.getCroppedCanvas();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve),
    );
    if (!blob) return;
    const file = new File([blob], "cropped.png");

    handleUploadFile(file);
    cropper.destroy();
    closeCropper();
  };

  return (
    <>
      <Show
        when={props.children}
        fallback={
          <button
            class="w-fit appearance-none rounded-full bg-accent-primary p-1"
            onClick={() => {
              inputRef.click();
            }}
            type="button"
          >
            <div class="i-material-symbols:add-photo-alternate-outline-rounded aspect-square h-1lh w-auto" />
          </button>
        }
      >
        <button
          class={props.class}
          onClick={() => {
            inputRef.click();
          }}
          type="button"
        >
          {props.children}
        </button>
      </Show>
      <input
        // biome-ignore lint/style/noNonNullAssertion:
        ref={inputRef!}
        accept="image/*"
        type="file"
        aria-hidden
        class="hidden"
        onChange={(e) => {
          if (!e.target.files) return;
          const file = e.target.files[0];
          if (!file) return;
          handleAccept(file);
          // Clear the input value to allow re-select of the same file
          e.currentTarget.value = "";
        }}
      />
      <CropperDialog>
        <div class="grid h-full w-full grid-rows-[minmax(0,1fr)_auto] gap-2 p-2">
          <div class="">
            <img
              // biome-ignore lint/style/noNonNullAssertion:
              ref={imgRef!}
              alt="cropper"
              class="h-auto max-h-full w-full object-contain"
            />
          </div>
          <div class="ml-auto">
            <Button onClick={handleCrop}>{t("applyCrop")}</Button>
          </div>
        </div>
      </CropperDialog>
    </>
  );
};

export default FileUploadButton;
