"use client";

import { useImperativeHandle, useRef, useState, type ReactElement, type Ref } from "react";
import { ModalDialog, type ModalDialogHandle } from "@/components/ModalDialog";
import type { PhotoLocation } from "@/lib/dates/form";
import type { OtherGroupLocation } from "@/lib/dates/group-location";
import { GroupLocationPicker } from "./GroupLocationPicker";

/** 창을 여는 기능 */
export interface GroupLocationDialogHandle {
  open: () => void;
}

interface GroupLocationDialogProps {
  ref: Ref<GroupLocationDialogHandle>;
  /** 창 제목("모음 2 위치 고르기") */
  title: string;
  /** 지도 키. 없으면 지도 대신 안내를 보인다 */
  appKey: string | undefined;
  initialLocation: PhotoLocation | undefined;
  otherLocations: OtherGroupLocation[];
  /** 고르면 창을 닫고 부른다 */
  onChoose: (location: PhotoLocation) => void;
}

/**
 * 모음 위치를 고르는 창(#298). 지도가 화면을 넓게 써야 핀을 맞추기 쉬워 화면 전체를 덮는다.
 * 닫으면 연 버튼으로 초점이 돌아간다(공통 모달).
 *
 * @example <GroupLocationDialog ref={dialogRef} title="모음 2 위치 고르기" appKey={key} initialLocation={undefined} otherLocations={[]} onChoose={save} />
 */
export const GroupLocationDialog = ({ ref, title, appKey, initialLocation, otherLocations, onChoose }: GroupLocationDialogProps): ReactElement => {
  const modalRef = useRef<ModalDialogHandle>(null);
  // 열려 있을 때만 지도를 그려, 폼을 열기만 해서는 지도 SDK를 부르지 않는다. 열 때마다 새로 그려 처음 자리에서 시작한다
  const [openCount, setOpenCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        setOpenCount((count) => count + 1);
        setIsOpen(true);
        modalRef.current?.open();
      },
    }),
    [],
  );

  return (
    <ModalDialog ref={modalRef} title={title} isFullScreen onClose={() => setIsOpen(false)}>
      {isOpen &&
        (appKey ? (
          <GroupLocationPicker
            key={openCount}
            appKey={appKey}
            initialLocation={initialLocation}
            otherLocations={otherLocations}
            onChoose={(location) => {
              // 닫는 움직임을 기다리지 않고 바로 고친다. 창 뒤의 위치 줄이 닫히는 동안 새 이름으로 바뀐다
              modalRef.current?.close();
              onChoose(location);
            }}
          />
        ) : (
          <p className="flex flex-1 items-center justify-center px-6 text-center text-[14px] text-ink-sub">지도를 쓸 수 없어요.</p>
        ))}
    </ModalDialog>
  );
};
