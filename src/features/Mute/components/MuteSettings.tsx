import {
  type SubmitHandler,
  createForm,
  insert,
  remove,
  reset,
  setValues,
  valiForm,
} from "@modular-forms/solid";
import { type Component, For, Show, createEffect, untrack } from "solid-js";
import * as v from "valibot";
import { useMe } from "../../../context/me";
import { useMute } from "../../../context/mute";
import { useI18n } from "../../../i18n";
import Button from "../../../shared/components/UI/Button";
import { TextField } from "../../../shared/components/UI/TextField";
import { useSendMuteList } from "../../../shared/libs/query";
import { toast } from "../../../shared/libs/toast";
import NeedLoginPlaceholder from "../../Column/components/NeedLoginPlaceholder";
import {
  type MuteTargetSettingsInput,
  muteTargetSettingsSchema,
} from "../lib/muteTargetSettingsSchema";

const MuteSettings: Component = () => {
  const t = useI18n();

  const [{ isLogged, myPubkey }] = useMe();
  const [muteTargets] = useMute();

  const [form, { Form, Field, FieldArray }] =
    createForm<MuteTargetSettingsInput>({
      validate: valiForm(muteTargetSettingsSchema),
    });

  createEffect(() => {
    const _muteTargets = muteTargets();
    untrack(() => {
      // 一度setValuesをしないと、resetが反映されない
      // see: https://github.com/fabian-hiller/modular-forms/issues/157
      // また、setValuesを使うとformが読み取られ(subscribeされる)てしまいformに対する変更がeffectをトリガーしてしまうため、untrackで囲む
      setValues(form, _muteTargets);
      reset(form, {
        initialValues: _muteTargets,
      });
    });
  });

  const { sendMuteList } = useSendMuteList();
  const handleSubmit: SubmitHandler<MuteTargetSettingsInput> = async (
    values,
  ) => {
    const _myPubkey = myPubkey();
    if (!_myPubkey) return;

    const transformedValues = v.parse(muteTargetSettingsSchema, values);
    toast.promise(
      sendMuteList({
        pubkey: _myPubkey,
        privateItems: transformedValues,
        // TODO: もともと公開していたものはそのまま送る
        publicItems: {
          events: [],
          users: [],
          hashtags: [],
          words: [],
        },
      }),
      {
        success: () => t("settings.mute.saved"),
        error: () => t("settings.mute.error"),
      },
    );
  };

  return (
    <Show
      when={isLogged()}
      fallback={<NeedLoginPlaceholder message={t("settings.mute.needLogin")} />}
    >
      <Form onSubmit={handleSubmit}>
        <div class="space-y-2">
          <FieldArray name="words">
            {(fieldArray) => (
              <div class="flex flex-col gap-2">
                <h4 class="font-500 text-h3">{t("settings.mute.muteWords")}</h4>
                <For each={fieldArray.items}>
                  {(_, index) => (
                    <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
                      <Field name={`words.${index()}`}>
                        {(field, props) => (
                          <TextField
                            {...props}
                            type="text"
                            value={field.value}
                            error={field.error}
                          />
                        )}
                      </Field>
                      <button
                        type="button"
                        onClick={() => {
                          remove(form, "words", { at: index() });
                        }}
                        class="c-red-5 appearance-none rounded-full bg-transparent p-1 hover:bg-red-5/25"
                      >
                        <div class="i-material-symbols:delete-outline-rounded aspect-square h-1lh w-auto" />
                      </button>
                    </div>
                  )}
                </For>
                <div class="flex justify-center text-caption">
                  <Button
                    type="button"
                    onClick={() => {
                      insert(form, "words", { value: "" });
                    }}
                    variant="border"
                  >
                    <div class="i-material-symbols:add-rounded m--0.125lh aspect-square h-1.25lh w-auto" />
                    {t("settings.mute.add")}
                  </Button>
                </div>
              </div>
            )}
          </FieldArray>
          <FieldArray name="users">
            {(fieldArray) => (
              <div class="flex flex-col gap-2">
                <h4 class="font-500 text-h3">{t("settings.mute.muteUsers")}</h4>
                <For each={fieldArray.items}>
                  {(_, index) => (
                    <Field name={`users.${index()}`}>
                      {(field, props) => (
                        <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
                          <TextField
                            {...props}
                            type="text"
                            value={field.value}
                            error={field.error}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              remove(form, "users", { at: index() });
                            }}
                            class="c-red-5 appearance-none rounded-full bg-transparent p-1 hover:bg-red-5/25"
                          >
                            <div class="i-material-symbols:delete-outline-rounded aspect-square h-1lh w-auto" />
                          </button>
                        </div>
                      )}
                    </Field>
                  )}
                </For>
                <div class="flex justify-center text-caption">
                  <Button
                    type="button"
                    onClick={() => {
                      insert(form, "users", { value: "" });
                    }}
                    variant="border"
                  >
                    <div class="i-material-symbols:add-rounded m--0.125lh aspect-square h-1.25lh w-auto" />
                    {t("settings.mute.add")}
                  </Button>
                </div>
              </div>
            )}
          </FieldArray>
          <FieldArray name="hashtags">
            {(fieldArray) => (
              <div class="flex flex-col gap-2">
                <h4 class="font-500 text-h3">
                  {t("settings.mute.muteHashtags")}
                </h4>
                <For each={fieldArray.items}>
                  {(_, index) => (
                    <Field name={`hashtags.${index()}`}>
                      {(field, props) => (
                        <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
                          <TextField
                            {...props}
                            type="text"
                            value={field.value}
                            error={field.error}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              remove(form, "hashtags", { at: index() });
                            }}
                            class="c-red-5 appearance-none rounded-full bg-transparent p-1 hover:bg-red-5/25"
                          >
                            <div class="i-material-symbols:delete-outline-rounded aspect-square h-1lh w-auto" />
                          </button>
                        </div>
                      )}
                    </Field>
                  )}
                </For>
                <div class="flex justify-center text-caption">
                  <Button
                    type="button"
                    onClick={() => {
                      insert(form, "hashtags", { value: "" });
                    }}
                    variant="border"
                  >
                    <div class="i-material-symbols:add-rounded m--0.125lh aspect-square h-1.25lh w-auto" />
                    {t("settings.mute.add")}
                  </Button>
                </div>
              </div>
            )}
          </FieldArray>
          <FieldArray name="events">
            {(fieldArray) => (
              <div class="flex flex-col gap-2">
                <h4 class="font-500 text-h3">
                  {t("settings.mute.muteEvents")}
                </h4>
                <For each={fieldArray.items}>
                  {(_, index) => (
                    <Field name={`events.${index()}`}>
                      {(field, props) => (
                        <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
                          <TextField
                            {...props}
                            type="text"
                            value={field.value}
                            error={field.error}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              remove(form, "events", { at: index() });
                            }}
                            class="c-red-5 appearance-none rounded-full bg-transparent p-1 hover:bg-red-5/25"
                          >
                            <div class="i-material-symbols:delete-outline-rounded aspect-square h-1lh w-auto" />
                          </button>
                        </div>
                      )}
                    </Field>
                  )}
                </For>
                <div class="flex justify-center text-caption">
                  <Button
                    type="button"
                    onClick={() => {
                      insert(form, "events", { value: "" });
                    }}
                    variant="border"
                  >
                    <div class="i-material-symbols:add-rounded m--0.125lh aspect-square h-1.25lh w-auto" />
                    {t("settings.mute.add")}
                  </Button>
                </div>
              </div>
            )}
          </FieldArray>
          <div class="flex justify-end gap-1">
            <Show when={form.dirty}>
              <Button
                type="button"
                onClick={() => reset(form)}
                variant="border"
              >
                {t("settings.mute.discard")}
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
              {t("settings.mute.save")}
            </Button>
          </div>
        </div>
      </Form>
    </Show>
  );
};

export default MuteSettings;
