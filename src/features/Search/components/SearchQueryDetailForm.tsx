import { Field, Form, type FormStore } from "@modular-forms/solid";
import type { Component } from "solid-js";
import * as v from "valibot";
import { useI18n } from "../../../i18n";
import DatetimePicker from "../../../shared/components/UI/DatetimePicker";
import SuggestTextField from "../../../shared/components/UI/SuggestTextField";
import { TextField } from "../../../shared/components/UI/TextField";
import { useUserOptions } from "../../../shared/libs/createSuggestList";

export const searchQueryDetailFormSchema = v.object({
  word: v.optional(v.string()),
  since: v.optional(
    v.union([
      v.pipe(
        v.number(),
        v.transform((v) => {
          // 入力値はローカルタイムゾーンのUnix時間なのでUTCに変換する
          const offsetMilliseconds = new Date().getTimezoneOffset() * 60 * 1000;
          return v + offsetMilliseconds;
        }),
      ),
      // 日時が入力されていない場合(NaNが渡される)はundefinedに変換する
      v.pipe(
        v.nan(),
        v.transform(() => undefined),
      ),
    ]),
  ),
  until: v.optional(
    v.union([
      v.pipe(
        v.number(),
        v.transform((v) => {
          // 入力値はローカルタイムゾーンのUnix時間なのでUTCに変換する
          const offsetMilliseconds = new Date().getTimezoneOffset() * 60 * 1000;
          return v + offsetMilliseconds;
        }),
      ),
      // 日時が入力されていない場合(NaNが渡される)はundefinedに変換する
      v.pipe(
        v.nan(),
        v.transform(() => undefined),
      ),
    ]),
  ),
  from: v.optional(v.string()),
  to: v.optional(v.string()),
  hashtag: v.optional(v.string()),
});
export type SearchQueryDetailFormSchema = v.InferInput<
  typeof searchQueryDetailFormSchema
>;

const SearchQueryDetailForm: Component<{
  formStore: FormStore<SearchQueryDetailFormSchema>;
}> = (props) => {
  const t = useI18n();

  const userOption = useUserOptions((m) => m.pubkey);

  return (
    <Form of={props.formStore} shouldActive={false} class="space-y-1">
      <Field of={props.formStore} name="word">
        {(field, props) => (
          <TextField
            label={t("column.search.word")}
            help={t("column.search.helpWord")}
            {...props}
            type="text"
            value={field.value}
            error={field.error}
          />
        )}
      </Field>
      <Field of={props.formStore} name="from">
        {(field, props) => (
          <SuggestTextField
            label={t("column.search.from")}
            help={t("column.search.helpFrom")}
            {...props}
            type="text"
            value={field.value}
            error={field.error}
            autoComplete={{
              prefixes: ["@"],
              options: {
                "@": userOption,
              },
            }}
          />
        )}
      </Field>
      <Field of={props.formStore} name="to">
        {(field, props) => (
          <SuggestTextField
            label={t("column.search.to")}
            help={t("column.search.helpTo")}
            {...props}
            type="text"
            value={field.value}
            error={field.error}
            autoComplete={{
              prefixes: ["@"],
              options: {
                "@": userOption,
              },
            }}
          />
        )}
      </Field>
      <Field of={props.formStore} name="since" type="number">
        {(field, props) => (
          <DatetimePicker
            label={t("column.search.since")}
            help={t("column.search.helpSince")}
            {...props}
            value={field.value}
            error={field.error}
          />
        )}
      </Field>
      <Field of={props.formStore} name="until" type="number">
        {(field, props) => (
          <DatetimePicker
            label={t("column.search.until")}
            help={t("column.search.helpUntil")}
            {...props}
            value={field.value}
            error={field.error}
          />
        )}
      </Field>
      <Field of={props.formStore} name="hashtag">
        {(field, props) => (
          <TextField
            label={t("column.search.hashtag")}
            help={t("column.search.helpHashtag")}
            {...props}
            type="text"
            value={field.value}
            error={field.error}
          />
        )}
      </Field>
    </Form>
  );
};

export default SearchQueryDetailForm;
