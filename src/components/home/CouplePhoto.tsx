"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ChangeEvent, type ReactElement } from "react";
import { CameraIcon, PlusIcon } from "@/components/icons";
import { ModalActions, ModalDialog, ModalMessage, type ModalDialogHandle } from "@/components/ModalDialog";
import { SignedPhoto } from "@/components/SignedPhoto";
import { clearCouplePhoto, CouplePhotoError, replaceCouplePhoto } from "@/lib/couple-photo/save";
import { refreshOutsideForm } from "@/lib/navigation/refresh-outside-form";
import { PhotoError } from "@/lib/photos/errors";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import { isAcceptedPhoto, PHOTO_INPUT_ACCEPT, resizeCouplePhoto } from "@/lib/photos/resize";
import { createClient } from "@/lib/supabase/client";

type Task = "upload" | "clear";

const BUSY_LABELS = {
  upload: "사진 올리는 중…",
  clear: "사진 지우는 중…",
} as const satisfies Record<Task, string>;

const toMessage = (error: unknown): string =>
  error instanceof PhotoError || error instanceof CouplePhotoError
    ? error.message
    : "사진을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";

const menuButtonClassName = "press-wide h-12 w-full rounded-[10px] border border-line text-[15px] hover:bg-background";

interface CouplePhotoProps {
  /** 커플 사진 서명 URL. 없으면 추가 칸을 보여 준다 */
  photoUrl: string | undefined;
}

/**
 * 홈의 커플 사진. 사진이 있으면 모서리 카메라 버튼 → "사진 바꾸기 / 사진 지우기 / 취소",
 * 없으면 점선 "커플 사진 추가" 칸을 누르고 사진을 고른다. 두 사람이 같은 사진을 본다.
 * 사진 자체를 누르는 방식은 스크롤하다 스쳐도 열리고, 길게 누르기는 iOS 이미지 메뉴와 겹쳐 쓰지 않는다(#60).
 */
export const CouplePhoto = ({ photoUrl }: CouplePhotoProps): ReactElement => {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<ModalDialogHandle>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const changeButtonRef = useRef<HTMLButtonElement>(null);
  // 올리는 동안·지운 뒤에는 누른 버튼이 사라지거나 비활성이 되므로, 작업이 끝나면(실패 포함) 그 자리의 버튼으로 초점을 옮긴다
  const shouldMoveFocusRef = useRef(false);

  const [task, setTask] = useState<Task>();
  // 저장은 끝났고 새 사진을 받아 오는 중인 작업. 받아 오는 동안에도 같은 표시를 이어 간다
  const [refreshingTask, setRefreshingTask] = useState<Task>();
  const [isRefreshing, startRefresh] = useTransition();
  const [message, setMessage] = useState<string>();
  const [dialogMessage, setDialogMessage] = useState<string>();
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  const busyTask = task ?? (isRefreshing ? refreshingTask : undefined);
  const isBusy = busyTask !== undefined;

  useEffect(() => {
    if (isBusy || !shouldMoveFocusRef.current) return;
    shouldMoveFocusRef.current = false;
    (photoUrl ? changeButtonRef : addButtonRef).current?.focus();
  }, [photoUrl, isBusy]);

  const refreshAfter = (finishedTask: Task) => {
    setRefreshingTask(finishedTask);
    // 올리는 사이 폼으로 옮겨 쓰고 있으면 다시 불러올 때 쓰던 내용이 사라진다(#164).
    // 미뤘으면 홈이 숨겨져 있어, 초점을 옮기려 남겨 두면 나중에 홈에 돌아올 때 저절로 버튼으로 튄다
    shouldMoveFocusRef.current = refreshOutsideForm(() => startRefresh(() => router.refresh()));
  };

  const handlePick = () => {
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

    shouldMoveFocusRef.current = true;
    setTask("upload");
    setMessage(undefined);
    try {
      const { original, medium } = await resizeCouplePhoto(file);
      const supabase = createClient();
      await replaceCouplePhoto({
        storage: supabase.storage.from(ALBUM_BUCKET),
        photoId: crypto.randomUUID(),
        original,
        medium,
        savePath: (path) => supabase.rpc("set_couple_photo", { p_path: path }),
        onCleanupError: console.error,
      });
      refreshAfter("upload");
    } catch (error) {
      // 사용자에게는 다시 시도할 수 있다는 문구만 보여 주고, 원인은 개발자 도구에서 볼 수 있게 남긴다
      console.error(error);
      setMessage(toMessage(error));
    } finally {
      setTask(undefined);
    }
  };

  const handleOpenMenu = () => {
    setMessage(undefined);
    // 지우는 중에 화면을 벗어나면 닫힌 뒤에 실패 문구가 들어올 수 있다
    setDialogMessage(undefined);
    modalRef.current?.open();
  };

  const handleCloseMenu = () => modalRef.current?.close();

  const handleChangeClick = () => {
    // 창이 닫히기 전이면 고르기 칸이 창 뒤에 막혀 있다. 움직임을 기다리지 않고 닫은 뒤 바로 연다
    modalRef.current?.closeImmediately();
    handlePick();
  };

  const handleClear = async () => {
    if (isBusy) return;
    setTask("clear");
    setDialogMessage(undefined);
    try {
      const supabase = createClient();
      await clearCouplePhoto({
        storage: supabase.storage.from(ALBUM_BUCKET),
        clearPath: () => supabase.rpc("clear_couple_photo"),
        onCleanupError: console.error,
      });
      // 움직임을 기다리면 창이 열린 채로 초점을 옮기려다 실패하고, 사라지는 창의 버튼이 "지우기"로 되돌아 보인다
      modalRef.current?.closeImmediately();
      refreshAfter("clear");
    } catch (error) {
      console.error(error);
      setDialogMessage(toMessage(error));
    } finally {
      setTask(undefined);
    }
  };

  return (
    // 사진이 있으면 남는 높이를 채운다. 4:3보다 작아지지 않고, 공간이 모자라면 화면이 스크롤된다(#115)
    <section aria-label="커플 사진" className={photoUrl ? "flex shrink-0 grow flex-col" : "shrink-0"}>
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_INPUT_ACCEPT}
        hidden
        onChange={handleFileChange}
        aria-label="커플 사진 고르기"
      />
      {photoUrl ? (
        // w-full: 늘어난 높이로 비율을 다시 계산해 폭까지 넓어지지 않게 폭을 고정한다
        <div className="relative aspect-[4/3] w-full shrink-0 grow overflow-hidden rounded-[16px] bg-surface">
          <SignedPhoto src={photoUrl} alt="커플 사진" className="absolute inset-0 size-full object-cover" />
          {!isBusy && (
            <button
              ref={changeButtonRef}
              type="button"
              onClick={handleOpenMenu}
              aria-label="커플 사진 바꾸기"
              aria-haspopup="dialog"
              className="press-icon absolute right-2.5 bottom-2.5 flex size-10 items-center justify-center rounded-full bg-background/70 text-ink after:absolute after:-inset-0.5"
            >
              <CameraIcon className="size-5" />
            </button>
          )}
          {busyTask && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-[14px] text-ink">
              {BUSY_LABELS[busyTask]}
            </div>
          )}
        </div>
      ) : (
        <button
          ref={addButtonRef}
          type="button"
          onClick={handlePick}
          disabled={isBusy}
          className="press-card flex h-[120px] w-full items-center justify-center gap-1.5 rounded-[16px] border border-dashed border-ink-sub/50 text-[15px] text-ink-sub disabled:opacity-60"
        >
          {busyTask ? (
            BUSY_LABELS[busyTask]
          ) : (
            <>
              <PlusIcon className="size-5" />
              커플 사진 추가
            </>
          )}
        </button>
      )}
      {message && (
        <p role="alert" className="mt-2 text-center text-[13px] text-accent">
          {message}
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {busyTask ? BUSY_LABELS[busyTask] : ""}
      </p>

      <ModalDialog
        ref={modalRef}
        title={isConfirmingClear ? "커플 사진을 지울까요?" : "커플 사진"}
        description={isConfirmingClear ? "두 사람 모두의 홈에서 사라지고 되돌릴 수 없어요." : undefined}
        isBusy={task === "clear"}
        onClose={() => {
          setIsConfirmingClear(false);
          setDialogMessage(undefined);
        }}
      >
        {isConfirmingClear ? (
          <>
            {dialogMessage && <ModalMessage>{dialogMessage}</ModalMessage>}
            {/* 누른 "사진 지우기" 버튼이 사라지므로 확인 단계의 첫 버튼으로 초점을 옮긴다 */}
            <ModalActions
              cancelLabel="취소"
              onCancel={handleCloseMenu}
              confirmLabel={task === "clear" ? "지우는 중…" : "지우기"}
              onConfirm={handleClear}
              isDisabled={task === "clear"}
              shouldFocusCancel
            />
          </>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" onClick={handleChangeClick} className={`${menuButtonClassName} text-ink`}>
              사진 바꾸기
            </button>
            <button type="button" onClick={() => setIsConfirmingClear(true)} className={`${menuButtonClassName} text-ink`}>
              사진 지우기
            </button>
            <button type="button" onClick={handleCloseMenu} className={`${menuButtonClassName} text-ink-sub`}>
              취소
            </button>
          </div>
        )}
      </ModalDialog>
    </section>
  );
};
