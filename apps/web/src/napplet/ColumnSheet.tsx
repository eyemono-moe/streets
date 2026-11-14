import type { JSX, ParentComponent } from "solid-js";

/**
 * アップレットのカラムの中に、下から出すシート。頼んだカラムの中に出すので、どの
 * アップレットが頼んだのかが見て分かり、答えるまでそのカラムを触れなくする。
 * 外側を押すと、やめたことにする。
 */
const ColumnSheet: ParentComponent<{
  label: string;
  /** 頼んだアップレットの名前。 */
  source: string;
  title: JSX.Element;
  onCancel: () => void;
}> = (props) => (
  <div class="absolute inset-0 flex flex-col justify-end">
    <div
      class="motion-fade absolute inset-0 bg-ui-950/40"
      aria-hidden="true"
      onClick={() => props.onCancel()}
    />
    <section
      role="dialog"
      aria-modal="true"
      aria-label={props.label}
      class="motion-drawer relative flex max-h-[85%] flex-col gap-3 overflow-y-auto rounded-t-3 border-control border-t bg-primary p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.28)]"
    >
      <div class="flex flex-col gap-0.5">
        <p class="c-secondary text-caption">{props.source}</p>
        <h3 class="c-primary break-anywhere font-700 text-body">
          {props.title}
        </h3>
      </div>
      {props.children}
    </section>
  </div>
);

export default ColumnSheet;
