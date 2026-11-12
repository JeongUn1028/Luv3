"use client";

import { useImperativeHandle, useRef, type ReactElement, type Ref, type RefObject } from "react";
import { ModalDialog, type ModalDialogHandle } from "@/components/ModalDialog";
import { isSamePhotoLocation, type PhotoLocation } from "@/lib/dates/form";

/** 창을 여닫는 기능 */
export interface PhotoLocationDialogHandle {
  open: () => void;
  close: () => void;
}

interface PhotoLocationDialogProps {
  ref: Ref<PhotoLocationDialogHandle>;
  /** 고치는 사진이 몇 번째인지(1부터). 창 제목에 쓴다 */
  photoNumber: number;
  location: PhotoLocation | undefined;
  /** 바로 앞 사진의 위치. 있으면 "앞 사진과 같은 곳"으로 고를 수 있다 */
  previousLocation: PhotoLocation | undefined;
  /** 고르거나 지우면 창을 닫고, 다 닫힌 뒤 부른다 */
  onChange: (location: PhotoLocation | undefined) => void;
}

const applyPendingChange = (pendingRef: RefObject<(() => void) | undefined>): void => {
  const apply = pendingRef.current;
  pendingRef.current = undefined;
  apply?.();
};

const optionButtonClassName =
  "press-wide flex min-h-[51px] w-full flex-col items-center justify-center rounded-[10px] border border-line px-4 py-2 text-[15px] text-ink hover:bg-background";

/**
 * 사진 한 장의 위치를 고르는 창(#249). 바로 앞 사진과 같은 곳으로 두거나 위치를 지운다.
 * 카카오 장소 찾기 결과는 저장할 수 없어 찾기는 없앴다(#296). 지도에서 고르기는 사진 모음 폼(#298)에서 생긴다.
 * 사진 줄에는 위치 한 줄만 두고 고르는 일은 여기서 해 사진 10장을 골라도 폼이 크게 길어지지 않는다.
 *
 * @example <PhotoLocationDialog ref={dialogRef} photoNumber={2} location={undefined} previousLocation={first} onChange={save} />
 */
export const PhotoLocationDialog = ({ ref, photoNumber, location, previousLocation, onChange }: PhotoLocationDialogProps): ReactElement => {
  const modalRef = useRef<ModalDialogHandle>(null);
  // 고른 값은 창이 다 닫힌 뒤에 넘긴다. 닫히는 움직임 동안 제목·설명·버튼이 새 값으로 바뀌어 보이지 않게 한다
  const pendingChangeRef = useRef<() => void>(undefined);
  const canUsePrevious = previousLocation !== undefined && !isSamePhotoLocation(previousLocation, location);

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        // 닫히는 중에 다시 열면 onClose가 오지 않으므로 앞에서 고른 값을 여기서 넘긴다
        applyPendingChange(pendingChangeRef);
        modalRef.current?.open();
      },
      close: () => modalRef.current?.close(),
    }),
    [],
  );

  const choose = (nextLocation: PhotoLocation | undefined) => {
    // 고를 때의 onChange(그때 연 사진)를 그대로 남겨, 닫히는 사이 다른 사진으로 다시 열어도 고른 사진에 들어가게 한다
    pendingChangeRef.current = () => onChange(nextLocation);
    modalRef.current?.close();
  };

  return (
    <ModalDialog
      ref={modalRef}
      title={`${photoNumber}번째 사진 위치`}
      description={location ? `지금: ${location.place}` : "아직 위치가 없어요."}
      shouldCloseOnOutsideClick
      // 고르면 바로 값이 바뀌므로, 위치 줄을 두 번 누른 두 번째가 창 안의 버튼에 닿지 않게 한다
      shouldGuardDoubleTap
      onClose={() => applyPendingChange(pendingChangeRef)}
    >
      <div className="mt-4 flex flex-col">
        {(canUsePrevious || location) && (
          <div className="flex flex-col gap-2">
            {canUsePrevious && (
              <button type="button" onClick={() => choose(previousLocation)} className={optionButtonClassName}>
                앞 사진과 같은 곳
                <span className="text-[12px] break-words text-ink-sub">{previousLocation.place}</span>
              </button>
            )}
            {location && (
              <button type="button" onClick={() => choose(undefined)} className="press-icon min-h-11 text-[13px] text-ink-sub underline">
                위치 지우기
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => modalRef.current?.close()}
          className="press-wide mt-4 h-12 w-full rounded-[10px] border border-line text-[15px] text-ink hover:bg-background"
        >
          닫기
        </button>
      </div>
    </ModalDialog>
  );
};
