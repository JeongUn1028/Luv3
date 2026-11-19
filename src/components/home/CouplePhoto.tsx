"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ChangeEvent, type ReactElement } from "react";
import { CouplePhotoAddButton, CouplePhotoCard } from "@/components/home/couple-photo/CouplePhotoFrames";
import { CouplePhotoMenu } from "@/components/home/couple-photo/CouplePhotoMenu";
import { useCouplePhotoPreview } from "@/components/home/couple-photo/use-couple-photo-preview";
import type { ModalDialogHandle } from "@/components/ModalDialog";
import { toCouplePhotoView } from "@/lib/couple-photo/preview";
import { clearCouplePhoto, CouplePhotoError, replaceCouplePhoto } from "@/lib/couple-photo/save";
import { refreshOutsideForm } from "@/lib/navigation/refresh-outside-form";
import { useLeavableDelete } from "@/lib/navigation/use-leavable-delete";
import { useResetOnHide } from "@/lib/navigation/use-reset-on-hide";
import { PhotoError } from "@/lib/photos/errors";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import type { RememberablePhoto } from "@/lib/photos/remembered-url";
import { isAcceptedPhoto, PHOTO_INPUT_ACCEPT } from "@/lib/photos/accepted";
import { loadClient } from "@/lib/supabase/load-client";

type Task = "upload" | "clear";

const BUSY_LABELS = {
  upload: "사진 올리는 중…",
  clear: "사진 지우는 중…",
} as const satisfies Record<Task, string>;

const toMessage = (error: unknown): string =>
  error instanceof PhotoError || error instanceof CouplePhotoError
    ? error.message
    : "사진을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";

interface CouplePhotoProps {
  /** 커플 사진의 경로·서명 주소. 없으면 추가 칸을 보여 준다 */
  photo: RememberablePhoto | undefined;
  /** 서버가 쿠키를 보고 고른 사진 주소(#356). 화면 코드가 뜨기 전에 받기 시작한다 */
  serverSrc: string | undefined;
}

/**
 * 홈의 커플 사진. 사진이 있으면 모서리 카메라 버튼 → "사진 바꾸기 / 사진 지우기 / 취소",
 * 없으면 점선 "커플 사진 추가" 칸을 누르고 사진을 고른다. 두 사람이 같은 사진을 본다.
 * 고른 사진과 지우기는 저장을 기다리지 않고 먼저 보여 주고, 실패하면 원래 사진으로 되돌린다(#329).
 * 사진 자체를 누르는 방식은 스크롤하다 스쳐도 열리고, 길게 누르기는 iOS 이미지 메뉴와 겹쳐 쓰지 않는다(#60).
 */
export const CouplePhoto = ({ photo, serverSrc }: CouplePhotoProps): ReactElement => {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<ModalDialogHandle>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const changeButtonRef = useRef<HTMLButtonElement>(null);
  // 올리는 동안·지우는 동안에는 누른 버튼이 사라지므로, 그 자리의 버튼이 생기면(실패 포함) 초점을 옮긴다
  const shouldMoveFocusRef = useRef(false);

  const [task, setTask] = useState<Task>();
  // 저장은 끝났고 새 사진을 받아 오는 중인 작업. 받아 오는 동안에도 같은 표시를 이어 간다
  const [refreshingTask, setRefreshingTask] = useState<Task>();
  const [isRefreshing, startRefresh] = useTransition();
  const [message, setMessage] = useState<string>();
  useResetOnHide(() => setMessage(undefined));
  const { beginDelete, finishDeleted, finishDeleteFailed } = useLeavableDelete({ noticeKey: "delete:couple-photo", subject: "커플 사진을" });

  const { preview, isCurrentPreview, showPreview, handlePreviewError, handleServerPhotoLoaded } = useCouplePhotoPreview(photo?.path);
  // 지우기를 누른 사진의 경로. 서버가 이 사진을 더 주지 않거나 지우기가 실패할 때까지 추가 칸을 보여 준다
  const [clearingPath, setClearingPath] = useState<string>();

  const busyTask = task ?? (isRefreshing ? refreshingTask : undefined);
  const isBusy = busyTask !== undefined;
  const view = toCouplePhotoView({ photoPath: photo?.path, preview, clearingPath });
  const hasCard = view.kind !== "empty";

  useEffect(() => {
    if (!shouldMoveFocusRef.current) return;
    // 고른 사진을 기다리는 빈 칸은 곧 사진 카드로 바뀌므로, 끝난 뒤 카메라 버튼으로 옮긴다
    const target = hasCard ? (isBusy ? null : changeButtonRef.current) : busyTask === "upload" ? null : addButtonRef.current;
    if (!target) return;
    shouldMoveFocusRef.current = false;
    target.focus();
  }, [hasCard, isBusy, busyTask]);

  const refreshAfter = (finishedTask: Task) => {
    setRefreshingTask(finishedTask);
    // 올리는 사이 폼으로 옮겨 쓰고 있으면 다시 불러올 때 쓰던 내용이 사라진다(#164).
    // 미뤘으면 홈이 숨겨져 있어, 초점을 옮기려 남겨 두면 나중에 홈에 돌아올 때 저절로 버튼으로 튄다
    shouldMoveFocusRef.current = refreshOutsideForm(() => startRefresh(() => router.refresh()));
  };

  const handlePick = () => {
    if (isBusy) return;
    setMessage(undefined);
    inputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 같은 사진을 다시 골라도 바뀌었다고 알리도록 선택값을 비운다
    event.target.value = "";
    if (!file || isBusy) return;
    if (!isAcceptedPhoto(file)) {
      setMessage(new PhotoError("unsupported-type").message);
      return;
    }

    const photoId = crypto.randomUUID();
    const replacedPath = photo?.path;
    // 아이폰 Safari는 HEIC도 바로 그린다. 못 그리면 handlePreviewError가 줄인 사진을 기다리게 바꾼다
    showPreview({ photoId, url: URL.createObjectURL(file), replacedPath });
    shouldMoveFocusRef.current = true;
    setTask("upload");
    setMessage(undefined);
    try {
      // 줄이기 라이브러리는 사진을 고른 뒤에 받아 홈 첫 화면 코드를 줄인다(#344). 받지 못하면 아래에서 다시 시도 문구를 보여 준다
      const { resizeCouplePhoto } = await import("@/lib/photos/resize");
      const { original, medium } = await resizeCouplePhoto(file);
      // 고른 원본(수십 MB일 수 있음)보다 가볍고, 브라우저가 못 그린 HEIC도 변환된 사진으로 그린다
      if (isCurrentPreview(photoId)) showPreview({ photoId, url: URL.createObjectURL(medium), replacedPath });
      const supabase = await loadClient();
      await replaceCouplePhoto({
        storage: supabase.storage.from(ALBUM_BUCKET),
        photoId,
        original,
        medium,
        savePath: (path) => supabase.rpc("set_couple_photo", { p_path: path }),
        onCleanupError: console.error,
      });
      // 미리 보여 준 사진은 서버의 새 사진을 다 받아 그린 뒤에 치운다(handleServerPhotoLoaded)
      refreshAfter("upload");
    } catch (error) {
      // 사용자에게는 다시 시도할 수 있다는 문구만 보여 주고, 원인은 개발자 도구에서 볼 수 있게 남긴다.
      // 화면을 새로 받지 않으므로 로그인이 끊겼을 때도 로그인 화면으로 넘어가지 않는다(#102)
      console.error(error);
      if (isCurrentPreview(photoId)) showPreview(undefined);
      setMessage(toMessage(error));
    } finally {
      setTask(undefined);
    }
  };

  const handleOpenMenu = () => {
    setMessage(undefined);
    modalRef.current?.open();
  };

  const handleChangeClick = () => {
    // 창이 닫히기 전이면 고르기 칸이 창 뒤에 막혀 있다. 움직임을 기다리지 않고 닫은 뒤 바로 연다
    modalRef.current?.closeImmediately();
    handlePick();
  };

  const handleClear = async () => {
    if (isBusy || !photo) return;
    setTask("clear");
    setMessage(undefined);
    beginDelete();
    setClearingPath(photo.path);
    // 사라질 카메라 버튼 대신 바로 생기는 추가 칸으로 옮긴다. 움직임을 기다리면 사라지는 창의 버튼으로 초점이 돌아간다
    shouldMoveFocusRef.current = true;
    modalRef.current?.closeImmediately();
    try {
      const supabase = await loadClient();
      await clearCouplePhoto({
        storage: supabase.storage.from(ALBUM_BUCKET),
        clearPath: () => supabase.rpc("clear_couple_photo"),
        onCleanupError: console.error,
      });
      // 홈을 떠났으면 도우미가 새로 받고 알린다. 초점을 옮기려 남겨 두면 나중에 홈에 돌아올 때 저절로 버튼으로 튄다
      if (finishDeleted()) refreshAfter("clear");
    } catch (error) {
      console.error(error);
      setClearingPath(undefined);
      // 홈을 보고 있으면 되돌린 사진 아래에 알리고, 떠났으면 도우미가 알림으로 알린다(#261). 화면을 새로 받지 않는다(#102)
      const canShowHere = finishDeleteFailed(true);
      shouldMoveFocusRef.current = canShowHere;
      if (canShowHere) setMessage(toMessage(error));
    } finally {
      setTask(undefined);
    }
  };

  return (
    // 사진이 있으면 남는 높이를 채운다. 4:3보다 작아지지 않고, 공간이 모자라면 화면이 스크롤된다(#115)
    <section aria-label="커플 사진" className={hasCard ? "flex shrink-0 grow flex-col" : "shrink-0"}>
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_INPUT_ACCEPT}
        hidden
        onChange={handleFileChange}
        aria-label="커플 사진 고르기"
      />
      {view.kind === "empty" ? (
        <CouplePhotoAddButton buttonRef={addButtonRef} isBusy={isBusy} isUploading={busyTask === "upload"} onClick={handlePick} />
      ) : (
        <CouplePhotoCard
          photo={photo}
          serverSrc={serverSrc}
          view={view}
          isUploading={busyTask === "upload"}
          isBusy={isBusy}
          menuButtonRef={changeButtonRef}
          onServerPhotoLoaded={handleServerPhotoLoaded}
          onPreviewError={handlePreviewError}
          onOpenMenu={handleOpenMenu}
        />
      )}
      {message && (
        <p role="alert" className="mt-2 text-center text-[13px] text-accent">
          {message}
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {busyTask ? BUSY_LABELS[busyTask] : ""}
      </p>

      <CouplePhotoMenu modalRef={modalRef} onChange={handleChangeClick} onClear={handleClear} />
    </section>
  );
};
