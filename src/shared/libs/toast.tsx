import { Toast, toaster } from "@kobalte/core/toast";
import {
  type Component,
  type ComponentProps,
  type ParentComponent,
  splitProps,
} from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { Match, Portal, Switch } from "solid-js/web";
import "../../assets/toast.css";

export const Toaster: Component = () => {
  return (
    <Portal>
      <Toast.Region limit={99}>
        <Toast.List class="fixed right-0 bottom-0 z-9999 flex max-w-full flex-col items-end gap-2 p-[--toast-padding] [--toast-padding:1rem]" />
      </Toast.Region>
    </Portal>
  );
};

const MyToast: ParentComponent<
  ComponentProps<typeof Toast> & {
    variant?: "success" | "error" | "pending";
  }
> = (props) => {
  const [addedProps, kobalteProps] = splitProps(props, ["variant"]);

  return (
    <Toast
      {...kobalteProps}
      class="b-1 relative w-200px max-w-full rounded bg-primary p-2 shadow shadow-ui/25 data-[swipe=cancel]:translate-x-0 data-[swipe=move]:translate-x-[--kb-toast-swipe-move-x] data-[closed]:animate-duration-100! data-[closed]:animate-fade-out-right! data-[opened]:animate-duration-100! data-[opened]:animate-slide-in-right! data-[swipe=end]:animate-[swipeOut_100ms] data-[swipe=cancel]:transition-transform-100"
    >
      <Toast.CloseButton class="c-secondary absolute right-2 bg-transparent">
        <div class="i-material-symbols:close-small-rounded h-6 w-6" />
      </Toast.CloseButton>
      <Toast.Description class="flex items-center gap-2">
        <Switch
          fallback={
            <div class="i-material-symbols:info-rounded c-blue h-6 w-6" />
          }
        >
          <Match when={addedProps.variant === "success"}>
            <div class="i-material-symbols:check-circle-rounded c-green h-6 w-6" />
          </Match>
          <Match when={addedProps.variant === "error"}>
            <div class="i-material-symbols:cancel-rounded c-red h-6 w-6" />
          </Match>
          <Match when={addedProps.variant === "pending"}>
            <div class="i-material-symbols:pending c-secondary h-6 w-6" />
          </Match>
        </Switch>
        {props.children}
      </Toast.Description>
    </Toast>
  );
};

const show = (message: string) => {
  return toaster.show((props) => (
    <MyToast toastId={props.toastId}>{message}</MyToast>
  ));
};
const success = (message: string) => {
  return toaster.show((props) => (
    <MyToast toastId={props.toastId} variant="success">
      {message}
    </MyToast>
  ));
};
const error = (message: string) => {
  return toaster.show((props) => (
    <MyToast toastId={props.toastId} variant="error">
      {message}
    </MyToast>
  ));
};
const promise = <T, U>(
  promise: Promise<T> | (() => Promise<T>),
  options: {
    loading?: JSX.Element;
    success?: (data: T) => JSX.Element;
    error?: (error: U) => JSX.Element;
  },
) => {
  return toaster.promise(promise, (props) => (
    <MyToast
      toastId={props.toastId}
      variant={
        props.state === "pending"
          ? "pending"
          : props.state === "fulfilled"
            ? "success"
            : "error"
      }
    >
      <Switch>
        <Match when={props.state === "pending"}>{options.loading}</Match>
        <Match when={props.state === "fulfilled"}>
          {/* biome-ignore lint/style/noNonNullAssertion: data is not null on fulfilled */}
          {options.success?.(props.data!)}
        </Match>
        <Match when={props.state === "rejected"}>
          {options.error?.(props.error)}
        </Match>
      </Switch>
    </MyToast>
  ));
};
const custom = (jsx: () => JSX.Element) => {
  return toaster.show((props) => (
    <Toast toastId={props.toastId}>{jsx()}</Toast>
  ));
};
const dismiss = (id: number) => {
  return toaster.dismiss(id);
};
export const toast = {
  show,
  success,
  error,
  promise,
  custom,
  dismiss,
};
