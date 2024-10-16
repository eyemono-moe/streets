import {
  type SubmitHandler,
  createForm,
  insert,
  remove,
  reset,
  setValues,
  valiForm,
} from "@modular-forms/solid";
import { normalizeURL } from "nostr-tools/utils";
import {
  type Component,
  For,
  Show,
  createEffect,
  onMount,
  untrack,
} from "solid-js";
import * as v from "valibot";
import { useRelays } from "../../../context/relays";
import { useI18n } from "../../../i18n";
import Button from "../../../shared/components/UI/Button";
import { Checkbox } from "../../../shared/components/UI/Checkbox";
import { TextField } from "../../../shared/components/UI/TextField";

const t = useI18n();

const relayConfigFormSchema = v.object({
  relays: v.pipe(
    v.array(
      v.object({
        url: v.pipe(
          v.string(t("settings.relay.error.nonEmpty")),
          v.nonEmpty(t("settings.relay.error.nonEmpty")),
          v.startsWith("wss://", t("settings.relay.error.startWithWss")),
          v.transform((value) => normalizeURL(value)),
        ),
        read: v.boolean(),
        write: v.boolean(),
      }),
    ),
    // urlの重複チェック
    v.rawCheck(({ dataset, addIssue }) => {
      if (!dataset.typed) return;

      dataset.value.forEach((relay, index) => {
        const isDuplicate = dataset.value.some(
          (other, i) => i !== index && other.url === relay.url,
        );

        if (isDuplicate) {
          addIssue({
            message: t("settings.relay.error.duplicate"),
            path: [
              {
                type: "array",
                origin: "value",
                key: index,
                value: relay,
                input: dataset.value,
              },
              {
                type: "object",
                origin: "value",
                key: "url",
                value: relay.url,
                input: relay,
              },
            ],
          });
        }
      });
    }),
  ),
});

type RelayConfigForm = v.InferInput<typeof relayConfigFormSchema>;

const RelaySettings: Component = () => {
  const [relays, { updateRelay }] = useRelays();

  const relaysArray = () => {
    return Object.entries(relays.defaultRelays).map(
      ([url, { read, write }]) => ({
        url,
        read,
        write,
      }),
    );
  };

  const [form, { Form, Field, FieldArray }] = createForm<RelayConfigForm>({
    validate: valiForm(relayConfigFormSchema),
  });

  const handleAddRelay = () => {
    insert(form, "relays", {
      value: {
        url: "",
        read: true,
        write: true,
      },
    });
  };

  onMount(() => {
    setValues(form, {
      relays: relaysArray(),
    });
  });

  createEffect(() => {
    reset(
      untrack(() => form),
      {
        initialValues: {
          relays: relaysArray(),
        },
      },
    );
  });

  const handleSave: SubmitHandler<RelayConfigForm> = (input) => {
    const parsed = v.parse(relayConfigFormSchema, input);
    const relayRecord = Object.fromEntries(
      parsed.relays.map((relay) => [
        relay.url,
        { read: relay.read, write: relay.write },
      ]),
    );

    updateRelay(relayRecord);
  };

  return (
    <Form onSubmit={handleSave} class="flex flex-col gap-2">
      <div class="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-2">
        <div class="grid-col-span-3 grid grid-cols-[subgrid]">
          <div>{t("settings.relay.relayURL")}</div>
          <div>{t("settings.relay.read")}</div>
          <div>{t("settings.relay.write")}</div>
        </div>
        <FieldArray name="relays">
          {(fieldArray) => (
            <For each={fieldArray.items}>
              {(_, index) => (
                <div class="grid-col-span-4 grid grid-cols-[subgrid] place-items-center items-start">
                  <Field name={`relays.${index()}.url`}>
                    {(field, props) => (
                      <TextField
                        {...props}
                        type="text"
                        placeholder="wss://example.com"
                        value={field.value}
                        error={field.error}
                        required
                      />
                    )}
                  </Field>
                  <Field name={`relays.${index()}.read`} type="boolean">
                    {(field, props) => (
                      <Checkbox
                        {...props}
                        checked={field.value}
                        error={field.error}
                      />
                    )}
                  </Field>
                  <Field name={`relays.${index()}.write`} type="boolean">
                    {(field, props) => (
                      <Checkbox
                        {...props}
                        checked={field.value}
                        error={field.error}
                      />
                    )}
                  </Field>
                  <button
                    type="button"
                    onClick={() => {
                      remove(form, "relays", { at: index() });
                    }}
                    class="c-red-6 appearance-none rounded-full bg-transparent p-1 hover:bg-red-1"
                  >
                    <div class="i-material-symbols:delete-outline-rounded aspect-square h-1lh w-auto" />
                  </button>
                </div>
              )}
            </For>
          )}
        </FieldArray>
      </div>
      <div class="flex w-full justify-center text-sm">
        <Button variant="border" onClick={handleAddRelay}>
          <div class="i-material-symbols:add-rounded aspect-square h-1lh w-auto" />
          {t("settings.relay.add")}
        </Button>
      </div>
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

export default RelaySettings;
