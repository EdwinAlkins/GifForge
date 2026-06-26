import type { SourceAsset } from "../../lib/types";
import {
  selectSource,
  selectedSourceId,
  appendSourceToTimeline,
} from "../../stores/projectStore";
import { resolveThumbUrl } from "../../lib/assetCache";

interface Props {
  source: SourceAsset;
}

export function SourceItem({ source }: Props) {
  const selected = selectedSourceId.value === source.id;
  const hasCrop = source.crop !== null;
  const thumbSrc = resolveThumbUrl(source.thumbnailPath, source.thumbnail);

  return (
    <li class="rounded border border-transparent p-1 hover:border-edge">
      <button
        type="button"
        onClick={() => selectSource(selected ? null : source.id)}
        class={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${
          selected ? "bg-accent-soft text-white" : "hover:bg-panel-2 text-neutral-300"
        }`}
      >
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt={source.filename}
            class="h-8 w-8 shrink-0 rounded object-cover"
          />
        ) : (
          <span class="h-8 w-8 shrink-0 rounded bg-neutral-700" />
        )}
        <span class="min-w-0 flex-1 truncate text-xs">{source.filename}</span>
        {hasCrop && (
          <span class="shrink-0 text-[10px] text-accent" title="Recadrage actif">
            crop
          </span>
        )}
      </button>
      <div class="mt-1 flex gap-1 px-1">
        <button
          type="button"
          onClick={() => selectSource(source.id)}
          class={`flex-1 rounded px-1 py-0.5 text-[10px] ${
            selected ? "bg-accent text-white" : "bg-panel-2 text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Recadrer
        </button>
        <button
          type="button"
          onClick={() => appendSourceToTimeline(source.id, true)}
          class="flex-1 rounded bg-panel-2 px-1 py-0.5 text-[10px] text-neutral-400 hover:text-neutral-200"
          title="Insérer les frames après le playhead"
        >
          + Timeline
        </button>
      </div>
    </li>
  );
}
