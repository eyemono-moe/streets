import { Image } from "@kobalte/core/image";
import {
  type SubmitHandler,
  createForm,
  getValue,
  reset,
  setValue,
  valiForm,
} from "@modular-forms/solid";
import { type Component, Show, createEffect, untrack } from "solid-js";
import { useMe } from "../../../context/me";
import { useI18n } from "../../../i18n";
import Button from "../../../shared/components/UI/Button";
import FileUploadButton from "../../../shared/components/UI/FileUploadButton";
import { TextField } from "../../../shared/components/UI/TextField";
import {
  type ProfileSettingsInput,
  profileSettingsSchema,
} from "../../../shared/libs/parser/0_metadata";
import { useProfile, useSendProfile } from "../../../shared/libs/query";
import { toast } from "../../../shared/libs/toast";
import {
  type FileUploadResponse,
  extractFileUrl,
  handleErrorResponse,
} from "../../../shared/libs/uploadFile";
import NeedLoginPlaceholder from "../../Column/components/NeedLoginPlaceholder";

const ProfileSettings: Component = () => {
  const t = useI18n();

  const [{ myPubkey, isLogged }] = useMe();
  const myProfile = useProfile(myPubkey);

  const [form, { Form, Field }] = createForm<ProfileSettingsInput>({
    validate: valiForm(profileSettingsSchema),
  });

  createEffect(() => {
    reset(
      untrack(() => form),
      {
        initialValues: myProfile().data?.parsed,
      },
    );
  });

  const handleIconOnUpload = (res: FileUploadResponse) => {
    const handled = handleErrorResponse(res);
    const url = extractFileUrl(handled);
    if (!url) {
      toast.error(t("settings.profile.uploadFailed"));
      return;
    }
    setValue(form, "picture", url);
  };

  const handleBannerOnUpload = (res: FileUploadResponse) => {
    const handled = handleErrorResponse(res);
    const url = extractFileUrl(handled);
    if (!url) {
      toast.error(t("settings.profile.uploadFailed"));
      return;
    }
    setValue(form, "banner", url);
  };

  const { sendProfile } = useSendProfile();
  const handleSubmit: SubmitHandler<ProfileSettingsInput> = (values) => {
    const _myPubkey = myPubkey();
    if (!_myPubkey) return;

    toast.promise(
      sendProfile({
        profile: values,
        pubkey: _myPubkey,
      }),
      {
        success: () => t("settings.profile.saved"),
        error: () => t("settings.profile.saveFailed"),
      },
    );
  };

  return (
    <Show
      when={isLogged()}
      fallback={
        <NeedLoginPlaceholder message={t("settings.profile.needLogin")} />
      }
    >
      <Form onSubmit={handleSubmit}>
        <div class="flex flex-col items-start">
          <FileUploadButton
            onUpload={handleBannerOnUpload}
            class="translate--2 mb--24 h-fit max-h-50 w-[calc(100%+1rem)] appearance-none bg-transparent"
          >
            <Image class="max-h-50 w-full">
              <Image.Img
                class="h-full w-full object-cover"
                src={getValue(form, "banner")}
                loading="lazy"
              />
              <Image.Fallback
                as="div"
                class="flex h-32 w-full bg-secondary p-10%"
              >
                <div class="i-material-symbols:add-photo-alternate-outline-rounded h-full w-full" />
              </Image.Fallback>
            </Image>
          </FileUploadButton>
          <FileUploadButton
            class="z-1 appearance-none bg-transparent"
            crop
            cropperOptions={{
              aspectRatio: 1,
              viewMode: 1,
              autoCropArea: 1,
            }}
            onUpload={handleIconOnUpload}
          >
            <Image
              as="div"
              class="inline-flex aspect-square h-auto w-32 max-w-full select-none items-center justify-center overflow-hidden rounded align-mid"
            >
              <Image.Img
                class="h-full w-full object-cover"
                src={getValue(form, "picture")}
                loading="lazy"
              />
              <Image.Fallback
                as="div"
                class="flex h-full w-full bg-secondary p-25%"
              >
                <div class="i-material-symbols:add-photo-alternate-outline-rounded h-full w-full" />
              </Image.Fallback>
            </Image>
          </FileUploadButton>
        </div>
        <div class="space-y-2">
          <Field name="display_name">
            {(field, props) => (
              <TextField
                {...props}
                label={t("settings.profile.label.displayName")}
                type="text"
                value={field.value}
                error={field.error}
              />
            )}
          </Field>
          <Field name="name">
            {(field, props) => (
              <TextField
                {...props}
                label={t("settings.profile.label.name")}
                type="text"
                value={field.value}
                error={field.error}
              />
            )}
          </Field>
          <Field name="about">
            {(field, props) => (
              <TextField
                {...props}
                label={t("settings.profile.label.about")}
                multiline
                type="text"
                value={field.value}
                error={field.error}
              />
            )}
          </Field>
          <Field name="website">
            {(field, props) => (
              <TextField
                {...props}
                label={t("settings.profile.label.website")}
                type="url"
                placeholder="https://example.com"
                value={field.value}
                error={field.error}
              />
            )}
          </Field>
          <Field name="nip05">
            {(field, props) => (
              <TextField
                {...props}
                label={t("settings.profile.label.nip05")}
                help={t("settings.profile.nip05Help")}
                type="text"
                placeholder="name@example.com"
                value={field.value}
                error={field.error}
              />
            )}
          </Field>
          <Field name="picture">
            {(field, props) => (
              <div class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1">
                <TextField
                  {...props}
                  label={t("settings.profile.label.picture")}
                  type="url"
                  placeholder="https://example.com/icon.png"
                  value={field.value}
                  error={field.error}
                />
                <FileUploadButton
                  crop
                  cropperOptions={{
                    aspectRatio: 1,
                    viewMode: 1,
                    autoCropArea: 1,
                  }}
                  onUpload={handleIconOnUpload}
                />
              </div>
            )}
          </Field>
          <Field name="banner">
            {(field, props) => (
              <div class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1">
                <TextField
                  {...props}
                  label={t("settings.profile.label.banner")}
                  type="url"
                  placeholder="https://example.com/banner.png"
                  value={field.value}
                  error={field.error}
                />
                <FileUploadButton onUpload={handleBannerOnUpload} />
              </div>
            )}
          </Field>
          <div class="flex justify-end gap-1">
            <Show when={form.dirty}>
              <Button
                type="button"
                onClick={() => reset(form)}
                variant="border"
              >
                {t("settings.profile.discard")}
              </Button>
            </Show>
            <Button
              type="submit"
              disabled={
                !form.dirty ||
                form.invalid ||
                form.submitting ||
                form.validating
              }
            >
              {t("settings.profile.save")}
            </Button>
          </div>
        </div>
      </Form>
    </Show>
  );
};

export default ProfileSettings;
