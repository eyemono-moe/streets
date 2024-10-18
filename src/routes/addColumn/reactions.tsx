import { type SubmitHandler, createForm, valiForm } from "@modular-forms/solid";
import type { Component } from "solid-js";
import * as v from "valibot";
import { useDeck } from "../../features/Column/context/deck";
import BasicLayout from "../../features/Settings/components/BasicLayout";
import UserSearchList from "../../features/User/components/UserSearchList";
import { useI18n } from "../../i18n";
import Button from "../../shared/components/UI/Button";
import { TextField } from "../../shared/components/UI/TextField";
import { pubkeySchema } from "../../shared/libs/schema";

const addReactionsColumnformSchema = v.object({
  pubkey: pubkeySchema,
});
type AddReactionsColumnForm = v.InferInput<typeof addReactionsColumnformSchema>;

const reactions: Component = () => {
  const t = useI18n();

  const [, { addColumn }] = useDeck();

  const [, { Form, Field }] = createForm<AddReactionsColumnForm>({
    initialValues: {
      pubkey: "",
    },
    validate: valiForm(addReactionsColumnformSchema),
  });

  const handleSubmit: SubmitHandler<AddReactionsColumnForm> = (values) => {
    const parsed = v.parse(addReactionsColumnformSchema, values);
    addColumn({
      type: "reactions",
      size: "medium",
      pubkey: parsed.pubkey,
    });
  };

  return (
    <BasicLayout
      title={t("column.reactions.titleAddColumn")}
      backTo="/add-column"
    >
      <div class="grid h-full w-full grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)]">
        <div>
          <h4 class="font-500 text-h3">{t("column.reactions.addByPubkey")}</h4>
          <Form onSubmit={handleSubmit}>
            <div class="flex items-center gap-1">
              <Field name="pubkey">
                {(field, props) => (
                  <TextField
                    {...props}
                    type="text"
                    placeholder="npub / nprofile / ID"
                    value={field.value}
                    error={field.error}
                    required
                  />
                )}
              </Field>
              <Button type="submit">{t("column.reactions.add")}</Button>
            </div>
          </Form>
        </div>
        <div class="text-center text-caption">or</div>
        <div class="grid h-full grid-rows-[auto_minmax(0,1fr)]">
          <h4 class="font-500 text-h3">{t("column.reactions.searchByName")}</h4>
          <UserSearchList
            onSelect={(pubkey) => {
              addColumn({
                type: "reactions",
                size: "medium",
                pubkey,
              });
            }}
          />
        </div>
      </div>
    </BasicLayout>
  );
};

export default reactions;
