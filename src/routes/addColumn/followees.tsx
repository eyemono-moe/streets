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

const addFolloweesColumnformSchema = v.object({
  pubkey: pubkeySchema,
});
type AddFolloweesColumnForm = v.InferInput<typeof addFolloweesColumnformSchema>;

const followees: Component = () => {
  const t = useI18n();

  const [, { addColumn }] = useDeck();

  const [, { Form, Field }] = createForm<AddFolloweesColumnForm>({
    initialValues: {
      pubkey: "",
    },
    validate: valiForm(addFolloweesColumnformSchema),
  });

  const handleSubmit: SubmitHandler<AddFolloweesColumnForm> = (values) => {
    const parsed = v.parse(addFolloweesColumnformSchema, values);
    addColumn({
      type: "followees",
      size: "medium",
      pubkey: parsed.pubkey,
    });
  };

  return (
    <BasicLayout
      title={t("column.followees.titleAddColumn")}
      backTo="/add-column"
    >
      <div class="grid h-full w-full grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)]">
        <div>
          <h4 class="font-500 text-lg">{t("column.followees.addByPubkey")}</h4>
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
              <Button type="submit">{t("column.followees.add")}</Button>
            </div>
          </Form>
        </div>
        <div class="text-center text-3.5">or</div>
        <div class="grid h-full grid-rows-[auto_minmax(0,1fr)]">
          <h4 class="font-500 text-lg">{t("column.followees.searchByName")}</h4>
          <UserSearchList
            onSelect={(pubkey) => {
              addColumn({
                type: "followees",
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

export default followees;
