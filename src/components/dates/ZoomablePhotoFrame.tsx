"use client";

import { useRef, useState, type CSSProperties, type PointerEvent, type ReactElement, type ReactNode } from "react";
import { isDismissDrag, shouldDismissPhoto, toDismissZoom, toReleaseVelocity, type DragSample } from "@/lib/dates/photo-dismiss";
import { NO_ZOOM, clampPhotoZoom, isDoubleTap, toDoubleTapZoom, toPinchZoom, type PhotoZoom, type Point } from "@/lib/dates/photo-zoom";

interface ZoomablePhotoFrameProps {
  /** 지금 보는 사진인지. 넘겨서 다른 사진이 되면 원래 크기로 돌린다 */
  isSelected: boolean;
  /** 확대했는지 바뀔 때 알린다. 확대한 동안에는 사진 줄을 밀어 넘기지 않고 사진을 옮긴다 */
  onZoomedChange: (isZoomed: boolean) => void;
  /** 두 손가락 손동작을 시작하고 끝낼 때 알린다. 그사이 사진 줄이 넘어가지 않게 붙든다 */
  onPinchingChange: (isPinching: boolean) => void;
  /** 원래 크기에서 아래로 밀어 놓으면 부른다. 크게 보기를 닫는다 */
  onDismiss: () => void;
  /** 확대 모양을 받아 사진을 그린다. 사진은 칸의 첫 요소여야 크기를 잴 수 있다 */
  children: (zoomStyle: CSSProperties) => ReactNode;
}

/** 지금 한 손가락 또는 두 손가락으로 하는 일 */
type Gesture =
  | { kind: "none" }
  | { kind: "pan"; start: PhotoZoom; startPoint: Point }
  | { kind: "pinch"; start: PhotoZoom; startCenter: Point; startDistance: number }
  // 원래 크기에서 아래로 밀어 닫는 중. 놓을 때 빠르기를 재려고 움직임을 기록한다
  | { kind: "dismiss"; startPoint: Point; samples: DragSample[] }
  // 원래 크기에서 옆으로 끄는 중. 사진 줄(Embla)이 넘기므로 손대지 않는다
  | { kind: "slide" };

// 이만큼 넘게 움직이면 누르기가 아니라 끌기로 본다
const TAP_MOVE_PX = 10;
const MAX_DRAG_SAMPLES = 20;

const toCenterAndDistance = ([first, second]: Point[]): { center: Point; distance: number } => ({
  center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
  distance: Math.hypot(first.x - second.x, first.y - second.y),
});

/**
 * 크게 보기 사진 칸(#350). 두 손가락으로 벌리고 오므려 키우고 줄이고, 두 번 누르면 확대·원래 크기를 오가며, 확대한 동안 한 손가락으로 옮긴다.
 * 원래 크기에서 아래로 밀어 놓으면 닫는다.
 * 좌표는 칸 가운데를 (0, 0)으로 둔다.
 *
 * @example <ZoomablePhotoFrame isSelected onZoomedChange={setIsZoomed} onPinchingChange={setIsPinching} onDismiss={close}>{(style) => <img style={style} src={src} alt="" />}</ZoomablePhotoFrame>
 */
export const ZoomablePhotoFrame = ({ isSelected, onZoomedChange, onPinchingChange, onDismiss, children }: ZoomablePhotoFrameProps): ReactElement => {
  const frameRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<PhotoZoom>(NO_ZOOM);
  const [isGesturing, setIsGesturing] = useState(false);
  // 손가락 위치는 움직일 때마다 바뀌어 화면을 다시 그릴 필요가 없으므로 ref에 둔다
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture>({ kind: "none" });
  const tapStartRef = useRef<(Point & { time: number; isMulti: boolean }) | undefined>(undefined);
  const lastTapRef = useRef<(Point & { time: number }) | undefined>(undefined);

  const changeZoom = (next: PhotoZoom) => {
    setZoom(next);
    onZoomedChange(next.scale > 1);
  };

  // 넘겨서 다른 사진이 되면 원래 크기로 돌린다
  if (!isSelected && zoom !== NO_ZOOM) setZoom(NO_ZOOM);

  const toFramePoint = (event: PointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
  };

  const clampToFrame = (next: PhotoZoom): PhotoZoom => {
    const frame = frameRef.current;
    const photo = frame?.firstElementChild;
    if (!frame || !(photo instanceof HTMLElement)) return NO_ZOOM;
    return clampPhotoZoom({ zoom: next, photo: { width: photo.offsetWidth, height: photo.offsetHeight }, frame: { width: frame.clientWidth, height: frame.clientHeight } });
  };

  // 손가락 수가 바뀔 때마다 지금 확대 상태에서 새로 시작해 튀지 않게 한다
  const setGesture = (next: Gesture) => {
    const wasPinching = gestureRef.current.kind === "pinch";
    gestureRef.current = next;
    if (wasPinching !== (next.kind === "pinch")) onPinchingChange(next.kind === "pinch");
  };

  const startGesture = (current: PhotoZoom) => {
    const points = [...pointersRef.current.values()];
    if (points.length >= 2) {
      const { center, distance } = toCenterAndDistance(points);
      setGesture({ kind: "pinch", start: current, startCenter: center, startDistance: distance });
    } else if (points.length === 1 && current.scale > 1) {
      setGesture({ kind: "pan", start: current, startPoint: points[0] });
    } else {
      setGesture({ kind: "none" });
    }
  };

  // 손동작 중에 다른 사진으로 넘어가면(화살표 키 등) 앞 사진의 손동작을 버린다
  const cancelGesture = () => {
    pointersRef.current.clear();
    tapStartRef.current = undefined;
    setGesture({ kind: "none" });
    setIsGesturing(false);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // 넘어가는 중에 옆 사진을 눌러도 그 사진을 키우지 않는다
    if (!isSelected || (event.pointerType === "mouse" && event.button !== 0)) return;
    // 사진을 받기 전에는 잴 크기가 없어 키우지 않는다
    if (!(frameRef.current?.firstElementChild instanceof HTMLElement)) return;
    const point = toFramePoint(event);
    pointersRef.current.set(event.pointerId, point);
    const count = pointersRef.current.size;
    tapStartRef.current = count === 1 ? { ...point, time: event.timeStamp, isMulti: false } : tapStartRef.current && { ...tapStartRef.current, isMulti: true };
    // 밀어 닫던 중 두 번째 손가락이 닿으면 줄어든 모양을 버리고 원래 크기에서 두 손가락 손동작을 시작한다
    const current = gestureRef.current.kind === "dismiss" ? NO_ZOOM : zoom;
    if (current !== zoom) changeZoom(current);
    startGesture(current);
    if (gestureRef.current.kind !== "none") {
      // 칸 밖으로 손가락이 나가도 끝까지 따라간다
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsGesturing(true);
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    if (!isSelected) {
      cancelGesture();
      return;
    }
    const point = toFramePoint(event);
    pointersRef.current.set(event.pointerId, point);
    const tapStart = tapStartRef.current;
    if (gestureRef.current.kind === "none" && tapStart && !tapStart.isMulti && zoom.scale === 1 && event.pointerType !== "mouse") {
      // 원래 크기에서 한 손가락으로 끌기 시작하면 첫 움직임으로 방향을 한 번만 정한다. 사진 줄(Embla)도 첫 움직임에서 가로가 더 크면 끌고
      // 아니면 놓으므로 같은 기준을 써야 넘기기와 밀어 닫기가 함께 일어나지 않는다. 마우스 끌기는 사진 줄 넘기기로 둔다
      const delta = { x: point.x - tapStart.x, y: point.y - tapStart.y };
      if (delta.x === 0 && delta.y === 0) return;
      if (!isDismissDrag(delta)) {
        setGesture({ kind: "slide" });
        return;
      }
      setGesture({ kind: "dismiss", startPoint: tapStart, samples: [] });
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsGesturing(true);
    }
    const gesture = gestureRef.current;
    if (gesture.kind === "dismiss") {
      // 빠르기는 놓기 직전 기록만 쓰므로 오래된 기록은 버린다(120Hz 화면에서 100ms가 약 12개)
      gesture.samples.push({ y: point.y, time: event.timeStamp });
      if (gesture.samples.length > MAX_DRAG_SAMPLES) gesture.samples.shift();
      changeZoom(toDismissZoom({ x: point.x - gesture.startPoint.x, y: point.y - gesture.startPoint.y }));
    } else if (gesture.kind === "pinch") {
      const { center, distance } = toCenterAndDistance([...pointersRef.current.values()]);
      changeZoom(toPinchZoom({ start: gesture.start, startCenter: gesture.startCenter, startDistance: gesture.startDistance, center, distance }));
    } else if (gesture.kind === "pan") {
      changeZoom(clampToFrame({ ...gesture.start, x: gesture.start.x + point.x - gesture.startPoint.x, y: gesture.start.y + point.y - gesture.startPoint.y }));
    }
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    if (!isSelected) {
      cancelGesture();
      return;
    }
    const point = toFramePoint(event);
    pointersRef.current.delete(event.pointerId);
    const gesture = gestureRef.current;
    // 거의 움직이지 않았으면 밀어 닫기가 아니라 누르기로 보고 아래 두 번 누르기 판단으로 넘긴다
    if (gesture.kind === "dismiss" && Math.hypot(point.x - gesture.startPoint.x, point.y - gesture.startPoint.y) > TAP_MOVE_PX) {
      cancelGesture();
      lastTapRef.current = undefined;
      const velocity = toReleaseVelocity({ samples: [...gesture.samples, { y: point.y, time: event.timeStamp }], time: event.timeStamp });
      if (event.type === "pointerup" && shouldDismissPhoto({ distance: point.y - gesture.startPoint.y, velocity })) {
        // 닫히는 동안 사진이 멈춰 있지 않게 화면 아래로 마저 내보낸다
        changeZoom(toDismissZoom({ x: zoom.x, y: frameRef.current?.clientHeight ?? zoom.y }));
        onDismiss();
      } else {
        changeZoom(NO_ZOOM);
      }
      return;
    }
    const settled = clampToFrame(zoom);
    if (pointersRef.current.size > 0) {
      // 두 손가락 중 하나를 떼면 남은 손가락으로 이어서 옮긴다
      startGesture(settled);
      changeZoom(settled);
      return;
    }
    setGesture({ kind: "none" });
    setIsGesturing(false);

    const tapStart = tapStartRef.current;
    tapStartRef.current = undefined;
    const isTap =
      event.type === "pointerup" && tapStart !== undefined && !tapStart.isMulti && Math.hypot(point.x - tapStart.x, point.y - tapStart.y) <= TAP_MOVE_PX;
    if (!isTap) {
      lastTapRef.current = undefined;
      changeZoom(settled);
      return;
    }
    const tap = { ...point, time: event.timeStamp };
    if (isDoubleTap({ previous: lastTapRef.current, current: tap })) {
      lastTapRef.current = undefined;
      changeZoom(clampToFrame(toDoubleTapZoom({ zoom: settled, point })));
      return;
    }
    lastTapRef.current = tap;
    changeZoom(settled);
  };

  const zoomStyle: CSSProperties = zoom === NO_ZOOM ? {} : { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` };

  return (
    <div
      ref={frameRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      // 손가락으로 움직이는 동안에는 바로 따라가고, 두 번 누르기·손 뗀 뒤 제자리 맞추기만 부드럽게 움직인다
      className={`flex h-full w-full touch-none items-center justify-center ${isGesturing ? "" : "*:transition-transform *:duration-200 motion-reduce:*:transition-none"}`}
    >
      {children(zoomStyle)}
    </div>
  );
};
