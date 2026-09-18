import { useEffect, useRef, useState } from "preact/hooks";
import type { CropRect } from "../../lib/types";
import { setSourceCrop } from "../../stores/projectStore";

interface Props {
  imageUrl: string;
  sourceId: string;
  imageWidth: number;
  imageHeight: number;
  crop: CropRect | null;
}

/** Draggable/resizable crop rectangle over the preview (per-source crop edit). */
export function CropOverlay({
  imageUrl,
  sourceId,
  imageWidth,
  imageHeight,
  crop,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const imgRectRef = useRef<DOMRect | null>(null);
  const [displayScale, setDisplayScale] = useState({ scaleX: 1, scaleY: 1 });
  const [rect, setRect] = useState<CropRect>(
    crop ?? { x: 0, y: 0, width: imageWidth, height: imageHeight },
  );
  const rectRef = useRef(rect);
  rectRef.current = rect;
  const [mode, setMode] = useState<"move" | "resize" | null>(null);
  const dragStart = useRef<{ x: number; y: number; rect: CropRect } | null>(null);

  useEffect(() => {
    setRect(crop ?? { x: 0, y: 0, width: imageWidth, height: imageHeight });
  }, [sourceId, imageWidth, imageHeight]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    function updateDisplayScale() {
      const ir = img!.getBoundingClientRect();
      setDisplayScale({
        scaleX: ir.width / imageWidth,
        scaleY: ir.height / imageHeight,
      });
    }

    updateDisplayScale();
    const ro = new ResizeObserver(updateDisplayScale);
    ro.observe(img);
    return () => ro.disconnect();
  }, [imageWidth, imageHeight, imageUrl]);

  function commitCrop(next: CropRect) {
    setRect(next);
    setSourceCrop(sourceId, next);
  }

  function toImageCoords(clientX: number, clientY: number) {
    const ir = imgRectRef.current;
    if (!ir) return { x: 0, y: 0 };

    const scaleX = imageWidth / ir.width;
    const scaleY = imageHeight / ir.height;
    return {
      x: Math.round((clientX - ir.left) * scaleX),
      y: Math.round((clientY - ir.top) * scaleY),
    };
  }

  function onPointerDown(e: PointerEvent, kind: "move" | "resize") {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setMode(kind);

    const img = imgRef.current;
    imgRectRef.current = img ? img.getBoundingClientRect() : null;

    dragStart.current = { x: e.clientX, y: e.clientY, rect: { ...rect } };
  }

  function onPointerMove(e: PointerEvent) {
    if (!mode || !dragStart.current) return;
    const start = dragStart.current;
    const cur = toImageCoords(e.clientX, e.clientY);
    const origin = toImageCoords(start.x, start.y);

    if (mode === "move") {
      const dx = cur.x - origin.x;
      const dy = cur.y - origin.y;
      const x = Math.max(0, Math.min(imageWidth - start.rect.width, start.rect.x + dx));
      const y = Math.max(0, Math.min(imageHeight - start.rect.height, start.rect.y + dy));
      setRect({ ...start.rect, x, y });
    } else {
      const w = Math.max(8, Math.min(imageWidth - start.rect.x, cur.x - start.rect.x));
      const h = Math.max(8, Math.min(imageHeight - start.rect.y, cur.y - start.rect.y));
      setRect({ ...start.rect, width: w, height: h });
    }
  }

  function onPointerUp() {
    if (mode) {
      commitCrop(rectRef.current);
    }
    setMode(null);
    dragStart.current = null;
    imgRectRef.current = null;
  }

  const { scaleX, scaleY } = displayScale;

  return (
    <div ref={containerRef} class="relative inline-block max-h-full max-w-full">
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Crop"
        class="max-h-full max-w-full object-contain"
        draggable={false}
      />
      <div
        class="absolute border-2 border-accent bg-accent/10"
        style={{
          left: `${rect.x * scaleX}px`,
          top: `${rect.y * scaleY}px`,
          width: `${rect.width * scaleX}px`,
          height: `${rect.height * scaleY}px`,
        }}
        onPointerDown={(e) => onPointerDown(e, "move")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div
          class="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize bg-accent"
          onPointerDown={(e) => {
            e.stopPropagation();
            onPointerDown(e, "resize");
          }}
        />
      </div>
    </div>
  );
}
