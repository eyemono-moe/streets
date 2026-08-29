import { Field as ArkField } from "@ark-ui/solid/field";
import { Field, createForm, handleSubmit, reset } from "@formisch/solid";
import { type Component, Show, createEffect } from "solid-js";
import * as v from "valibot";
import Button from "../../../shared/components/UI/Button";
import { useAccountSettings } from "../account-settings";
import SettingsTextField from "./SettingsTextField";

const profileSchema = v.object({
  display_name: v.string(),
  name: v.string(),
  about: v.string(),
  website: v.string(),
  nip05: v.string(),
  picture: v.string(),
  banner: v.string(),
  lightningAddress: v.string(),
});

const ProfileSettingsForm: Component = () => {
  const profile = useAccountSettings().profile;
  const form = createForm({
    schema: profileSchema,
    initialInput: profile.draft(),
  });

  createEffect(() => {
    const draft = profile.draft();
    if (!profile.dirty()) reset(form, { initialInput: draft });
  });

  const saveProfile = handleSubmit(form, (values) => {
    profile.change(values);
    void profile.save();
  });

  return (
    <section class="mt-5 rounded-2 border border-primary p-4">
      <h3 class="font-700 text-body">プロフィール</h3>
      <p class="c-secondary mt-1 text-caption">
        この情報は Nostr のプロフィールとして公開されます。
      </p>

      <Show when={profile.current().phase === "signed-out"}>
        <p class="c-secondary mt-4 text-body">
          プロフィールを編集するにはログインしてください。
        </p>
      </Show>
      <Show when={profile.current().phase === "loading"}>
        <p class="c-secondary mt-4 text-body">プロフィールを取得しています…</p>
      </Show>
      <Show when={profile.current().phase === "ready"}>
        <form class="mt-4 space-y-3" novalidate on:submit={saveProfile}>
          <Field of={form} path={["display_name"]}>
            {(field) => (
              <SettingsTextField
                {...field.props}
                data-testid="profile-display-name"
                error={field.errors?.[0]}
                label="表示名"
                labelVisible
                value={field.input ?? ""}
                onInput={(event) => {
                  field.props.onInput(event);
                  profile.change({ display_name: event.currentTarget.value });
                }}
              />
            )}
          </Field>
          <Field of={form} path={["name"]}>
            {(field) => (
              <SettingsTextField
                {...field.props}
                data-testid="profile-name"
                error={field.errors?.[0]}
                label="ユーザー名"
                labelVisible
                value={field.input ?? ""}
                onInput={(event) => {
                  field.props.onInput(event);
                  profile.change({ name: event.currentTarget.value });
                }}
              />
            )}
          </Field>
          <Field of={form} path={["about"]}>
            {(field) => (
              <ArkField.Root invalid={field.errors !== null}>
                <ArkField.Label class="c-secondary text-caption">
                  自己紹介
                </ArkField.Label>
                <ArkField.Textarea
                  {...field.props}
                  class="min-h-24 w-full resize-y rounded-2 border border-primary bg-secondary px-3 py-2 text-body outline-none focus:border-accent-5 data-[invalid]:border-red-6"
                  value={field.input ?? ""}
                  onInput={(event) => {
                    field.props.onInput(event);
                    profile.change({ about: event.currentTarget.value });
                  }}
                />
                <Show when={field.errors?.[0]}>
                  {(message) => (
                    <ArkField.ErrorText class="mt-2 block text-caption text-red-8 dark:text-red-4">
                      {message()}
                    </ArkField.ErrorText>
                  )}
                </Show>
              </ArkField.Root>
            )}
          </Field>
          <Field of={form} path={["website"]}>
            {(field) => (
              <SettingsTextField
                {...field.props}
                data-testid="profile-website"
                error={field.errors?.[0]}
                label="ウェブサイト"
                labelVisible
                placeholder="https://example.com"
                type="url"
                value={field.input ?? ""}
                onInput={(event) => {
                  field.props.onInput(event);
                  profile.change({ website: event.currentTarget.value });
                }}
              />
            )}
          </Field>
          <Field of={form} path={["nip05"]}>
            {(field) => (
              <SettingsTextField
                {...field.props}
                data-testid="profile-nip05"
                error={field.errors?.[0]}
                label="NIP-05"
                labelVisible
                placeholder="name@example.com"
                value={field.input ?? ""}
                onInput={(event) => {
                  field.props.onInput(event);
                  profile.change({ nip05: event.currentTarget.value });
                }}
              />
            )}
          </Field>
          <Field of={form} path={["picture"]}>
            {(field) => (
              <SettingsTextField
                {...field.props}
                data-testid="profile-picture"
                error={field.errors?.[0]}
                label="アイコン画像 URL"
                labelVisible
                placeholder="https://example.com/icon.png"
                type="url"
                value={field.input ?? ""}
                onInput={(event) => {
                  field.props.onInput(event);
                  profile.change({ picture: event.currentTarget.value });
                }}
              />
            )}
          </Field>
          <Field of={form} path={["banner"]}>
            {(field) => (
              <SettingsTextField
                {...field.props}
                data-testid="profile-banner"
                error={field.errors?.[0]}
                label="バナー画像 URL"
                labelVisible
                placeholder="https://example.com/banner.png"
                type="url"
                value={field.input ?? ""}
                onInput={(event) => {
                  field.props.onInput(event);
                  profile.change({ banner: event.currentTarget.value });
                }}
              />
            )}
          </Field>
          <Field of={form} path={["lightningAddress"]}>
            {(field) => (
              <SettingsTextField
                {...field.props}
                data-testid="profile-lightning-address"
                error={field.errors?.[0]}
                label="Lightning Address"
                labelVisible
                placeholder="name@lightning.example"
                value={field.input ?? ""}
                onInput={(event) => {
                  field.props.onInput(event);
                  profile.change({
                    lightningAddress: event.currentTarget.value,
                  });
                }}
              />
            )}
          </Field>

          <Show when={profile.error()}>
            {(message) => (
              <p class="text-caption text-red-8 dark:text-red-4">{message()}</p>
            )}
          </Show>
          <div class="flex justify-end gap-2">
            <Button
              disabled={!profile.dirty() || profile.saving()}
              type="button"
              variant="border"
              onClick={profile.reset}
            >
              変更を戻す
            </Button>
            <Button
              disabled={!profile.dirty() || profile.saving()}
              type="submit"
            >
              {profile.saving() ? "保存中…" : "保存"}
            </Button>
          </div>
        </form>
      </Show>
    </section>
  );
};

export default ProfileSettingsForm;
