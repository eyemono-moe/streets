import { Popover } from "@kobalte/core/popover";
import {
  Field,
  Form,
  type SubmitHandler,
  createFormStore,
} from "@modular-forms/solid";
import { type Component, createSignal } from "solid-js";
import * as v from "valibot";
import { TextField } from "../../../shared/components/UI/TextField";
import { useDeck } from "../../Column/context/deck";

const searchQueryFormSchema = v.object({
  query: v.pipe(v.string(), v.nonEmpty()),
});

type SearchQueryDetailFormSchema = v.InferInput<typeof searchQueryFormSchema>;

const SearchPopover: Component = () => {
  const [, { addColumn }] = useDeck();

  const [opened, setOpened] = createSignal(false);

  const formStore = createFormStore<SearchQueryDetailFormSchema>();
  const handleSubmit: SubmitHandler<SearchQueryDetailFormSchema> = (values) => {
    const parsed = v.safeParse(searchQueryFormSchema, values);
    if (!parsed.success) return;

    addColumn({
      size: "medium",
      content: {
        type: "search",
        query: parsed.output.query,
      },
    });
    setOpened(false);
  };

  return (
    <Popover onOpenChange={setOpened} open={opened()}>
      <Popover.Trigger class="appearance-none bg-transparent p-1.5">
        <div class="i-material-symbols:search-rounded aspect-square h-auto w-8" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content class="transform-origin-[--kb-popover-content-transform-origin] b-1 flex w-360px max-w-[calc(100vw-32px)] animate-duration-100 animate-fade-out flex-col gap-1 rounded-2 bg-primary p-1 shadow-lg shadow-ui/25 data-[expanded]:animate-duration-100 data-[expanded]:animate-fade-in">
          <Popover.Arrow />
          <div class="flex items-center justify-between gap-1">
            <Popover.Title>Search</Popover.Title>
            <Popover.CloseButton class="appearance-none rounded-full bg-transparent p-0.5 enabled:hover:bg-alpha-hover enabled:hover:bg-opacity-50">
              <div class="i-material-symbols:close-rounded aspect-square h-auto w-4" />
            </Popover.CloseButton>
          </div>
          <Popover.Description as="div" class="popover__description">
            <Form
              of={formStore}
              onSubmit={handleSubmit}
              class="grid grid-cols-[minmax(0,1fr)_auto] gap-1"
            >
              <Field of={formStore} name="query">
                {(field, props) => (
                  // TODO: autofocus
                  <TextField
                    {...props}
                    type="text"
                    value={field.value}
                    error={field.error}
                  />
                )}
              </Field>
              <button
                type="submit"
                class="flex aspect-square items-center justify-center rounded bg-accent-primary text-white active:bg-accent-active not-active:enabled:hover:bg-accent-hover"
              >
                <div class="i-material-symbols:search-rounded aspect-square h-1lh w-auto" />
              </button>
            </Form>
          </Popover.Description>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
};

export default SearchPopover;
