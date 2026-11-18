"use client";

import { useRef, type PointerEvent, type RefObject } from "react";
import { shouldDismissPhoto, toReleaseVelocity, type DragSample } from "@/lib/dates/photo-dismiss";

/** 덜 내리고 놓았을 때 제자리로 돌아오는 시간 */
const SNAP_BACK_MS = 200;

interface SheetDrag {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
}

interface Drag {
  pointerId: number;
  startY: number;
  samples: DragSample[];
}

/**
 * 아래에서 올라오는 창을 손잡이(머리글)로 끌어내려 닫는다(#352). 내리는 동안 창이 손가락을 따라오고,
 * 사진 크게 보기와 같은 기준(`shouldDismissPhoto`)으로 충분히 내렸거나 빠르게 튕기면 닫고, 아니면 제자리로 돌아온다.
 * 창은 렌더링 없이 스타일로만 옮긴다. 닫는 움직임은 지금 내린 자리에서 이어진다.
 *
 * @example
 * const dragHandlers = useSheetDrag({ sheetRef: dialogRef, onDismiss: () => closeWithMotion(dialog, timerRef), isLocked: () => isClosingDialog(dialog) });
 * <div className="touch-none" {...dragHandlers}>손잡이</div>
 */
interface UseSheetDragParams {
  sheetRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  /** 끌기를 시작하지 않을 때(창이 닫히는 움직임 중). 내린 자리가 닫히는 움직임과 겹친다 */
  isLocked: () => boolean;
}

export const useSheetDrag = ({ sheetRef, onDismiss, isLocked }: UseSheetDragParams): SheetDrag => {
  const dragRef = useRef<Drag | undefined>(undefined);
  const snapTimerRef = useRef<number | undefined>(undefined);

  const finish = (event: PointerEvent<HTMLElement>, isCancelled: boolean) => {
    const drag = dragRef.current;
    const sheet = sheetRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    if (!sheet) return;
    const distance = Math.max(0, event.clientY - drag.startY);
    const velocity = toReleaseVelocity({ samples: [...drag.samples, { y: event.clientY, time: event.timeStamp }], time: event.timeStamp });
    if (!isCancelled && shouldDismissPhoto({ distance, velocity })) {
      sheet.style.transition = "";
      onDismiss();
      return;
    }
    sheet.style.transition = `translate ${SNAP_BACK_MS}ms ease-out`;
    sheet.style.translate = "";
    snapTimerRef.current = window.setTimeout(() => {
      sheet.style.transition = "";
    }, SNAP_BACK_MS);
  };

  return {
    onPointerDown: (event) => {
      if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      if (isLocked()) return;
      // 손잡이 안의 단추(닫기)는 붙잡지 않는다. 붙잡으면 누름이 단추에 가지 않는다
      if (event.target instanceof Element && event.target.closest("button, a")) return;
      window.clearTimeout(snapTimerRef.current);
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { pointerId: event.pointerId, startY: event.clientY, samples: [{ y: event.clientY, time: event.timeStamp }] };
    },
    onPointerMove: (event) => {
      const drag = dragRef.current;
      const sheet = sheetRef.current;
      if (!drag || !sheet || drag.pointerId !== event.pointerId) return;
      drag.samples.push({ y: event.clientY, time: event.timeStamp });
      // 위로는 올리지 않는다
      sheet.style.transition = "none";
      sheet.style.translate = `0 ${Math.max(0, event.clientY - drag.startY)}px`;
    },
    onPointerUp: (event) => finish(event, false),
    onPointerCancel: (event) => finish(event, true),
  };
};
