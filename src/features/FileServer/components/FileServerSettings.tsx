import {
  type SubmitHandler,
  createForm,
  reset,
  setValues,
  valiForm,
} from "@modular-forms/solid";
import { type Component, Show, createEffect, onMount, untrack } from "solid-js";
import * as v from "valibot";
import { defaultFileServers, useFileServer } from "../../../context/fileServer";
import { useI18n } from "../../../i18n";
import Button from "../../../shared/components/UI/Button";
import { TextField } from "../../../shared/components/UI/TextField";

const fileServerSettingFormSchema = v.object({
  api: v.pipe(v.string(), v.nonEmpty()),
});
type FileServerSettingForm = v.InferInput<typeof fileServerSettingFormSchema>;

const FileServerSettings: Component = () => {
  const t = useI18n();

  const [fileServer, { setDefaultApi }] = useFileServer();

  const [form, { Form, Field }] = createForm<FileServerSettingForm>({
    validate: valiForm(fileServerSettingFormSchema),
  });

  onMount(() => {
    setValues(form, {
      api: fileServer.selectedApiURL,
    });
  });

  createEffect(() => {
    reset(
      untrack(() => form),
      {
        initialValues: {
          api: fileServer.selectedApiURL,
        },
      },
    );
  });

  const handleSubmit: SubmitHandler<FileServerSettingForm> = (values) => {
    setDefaultApi(values.api);
  };

  return (
    <Form onSubmit={handleSubmit} class="flex flex-col gap-2">
      <Field name="api">
        {(field, props) => (
          <TextField
            type="url"
            options={defaultFileServers.map((url) => ({
              label: url,
              value: url,
            }))}
            {...props}
            value={field.value}
            error={field.error}
            required
          />
        )}
      </Field>
      <div class="flex justify-end gap-1">
        <Show when={form.dirty}>
          <Button type="button" onClick={() => reset(form)} variant="border">
            {t("settings.relay.discard")}
          </Button>
        </Show>
        <Button
          type="submit"
          disabled={
            !form.dirty || form.invalid || form.submitting || form.validating
          }
        >
          {t("settings.relay.save")}
        </Button>
      </div>
    </Form>
  );
};

export default FileServerSettings;
