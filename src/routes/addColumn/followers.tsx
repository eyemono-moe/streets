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

const addFollowersColumnFormSchema = v.object({
  pubkey: pubkeySchema,
});
type AddFollowersColumnForm = v.InferInput<typeof addFollowersColumnFormSchema>;

const followers: Component = () => {
  const t = useI18n();

  const [, { addColumn }] = useDeck();

  const [, { Form, Field }] = createForm<AddFollowersColumnForm>({
    initialValues: {
      pubkey: "",
    },
    validate: valiForm(addFollowersColumnFormSchema),
  });

  const handleAddColumn = (pubkey: string) => {
    addColumn({
      content: {
        type: "followers",
        pubkey,
      },
      size: "medium",
    });
  };

  const handleSubmit: SubmitHandler<AddFollowersColumnForm> = (values) => {
    const parsed = v.parse(addFollowersColumnFormSchema, values);
    handleAddColumn(parsed.pubkey);
  };

  return (
    <BasicLayout
      title={t("column.followers.titleAddColumn")}
      backTo="/add-column"
    >
      <div class="grid h-full w-full grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)]">
        <div>
          <h4 class="font-500 text-h3">{t("column.followers.addByPubkey")}</h4>
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
              <Button type="submit">{t("column.followers.add")}</Button>
            </div>
          </Form>
        </div>
        <div class="text-center text-caption">or</div>
        <div class="grid h-full grid-rows-[auto_minmax(0,1fr)]">
          <h4 class="font-500 text-h3">{t("column.followers.searchByName")}</h4>
          <UserSearchList
            onSelect={(pubkey) => {
              handleAddColumn(pubkey);
            }}
          />
        </div>
      </div>
    </BasicLayout>
  );
};

export default followers;
