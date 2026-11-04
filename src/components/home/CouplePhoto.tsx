"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type ChangeEvent, type ReactElement } from "react";
import { CameraIcon, PlusIcon } from "@/components/icons";
import { clearCouplePhoto, CouplePhotoError, replaceCouplePhoto } from "@/lib/couple-photo/save";
import { PhotoError } from "@/lib/photos/errors";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import { isAcceptedPhoto, PHOTO_INPUT_ACCEPT, resizePhoto } from "@/lib/photos/resize";
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

const menuButtonClassName = "h-12 w-full rounded-[10px] border border-line text-[15px] hover:bg-background";

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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const changeButtonRef = useRef<HTMLButtonElement>(null);
  // 올리는 동안·지운 뒤에는 누른 버튼이 사라지거나 비활성이 되므로, 작업이 끝나면(실패 포함) 그 자리의 버튼으로 초점을 옮긴다
  const shouldMoveFocusRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

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
    shouldMoveFocusRef.current = true;
    setRefreshingTask(finishedTask);
    startRefresh(() => router.refresh());
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
      const { original } = await resizePhoto(file);
      const supabase = createClient();
      await replaceCouplePhoto({
        storage: supabase.storage.from(ALBUM_BUCKET),
        photoId: crypto.randomUUID(),
        photo: original,
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
    dialogRef.current?.showModal();
  };

  const handleCloseMenu = () => dialogRef.current?.close();

  const handleChangeClick = () => {
    handleCloseMenu();
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
      handleCloseMenu();
      refreshAfter("clear");
    } catch (error) {
      console.error(error);
      setDialogMessage(toMessage(error));
    } finally {
      setTask(undefined);
    }
  };

  return (
    <section aria-label="커플 사진" className="shrink-0">
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_INPUT_ACCEPT}
        hidden
        onChange={handleFileChange}
        aria-label="커플 사진 고르기"
      />
      {photoUrl ? (
        <div className="relative aspect-[4/3] overflow-hidden rounded-[16px] bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 때 이미 2000px JPEG로 줄였고, 서명 URL이라 next/image 캐시에 맞지 않는다 */}
          <img src={photoUrl} alt="커플 사진" className="size-full object-cover" />
          {!isBusy && (
            <button
              ref={changeButtonRef}
              type="button"
              onClick={handleOpenMenu}
              aria-label="커플 사진 바꾸기"
              aria-haspopup="dialog"
              className="absolute right-2.5 bottom-2.5 flex size-10 items-center justify-center rounded-full bg-background/70 text-ink after:absolute after:-inset-0.5"
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
          className="flex h-[120px] w-full items-center justify-center gap-1.5 rounded-[16px] border border-dashed border-ink-sub/50 text-[15px] text-ink-sub disabled:opacity-60"
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

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={isConfirmingClear ? descriptionId : undefined}
        // 지우는 중에 Esc로 닫혀 결과를 놓치지 않게 한다
        onCancel={(event) => {
          if (task === "clear") event.preventDefault();
        }}
        onClose={() => {
          setIsConfirmingClear(false);
          setDialogMessage(undefined);
        }}
        className="m-auto w-[calc(100%-32px)] max-w-[360px] rounded-[14px] border border-line bg-surface p-5 text-ink backdrop:bg-background/70"
      >
        {isConfirmingClear ? (
          <>
            <h2 id={titleId} className="text-[17px] font-bold">
              커플 사진을 지울까요?
            </h2>
            <p id={descriptionId} className="mt-2 text-[14px] leading-[1.6] text-ink-sub">
              두 사람 모두의 홈에서 사라지고 되돌릴 수 없어요.
            </p>
            {dialogMessage && (
              <p role="alert" className="mt-3 text-[13px] text-accent">
                {dialogMessage}
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                // 누른 "사진 지우기" 버튼이 사라지므로 확인 단계의 첫 버튼으로 초점을 옮긴다
                autoFocus
                disabled={task === "clear"}
                onClick={handleCloseMenu}
                className="h-12 flex-1 rounded-[10px] border border-line text-[15px] text-ink hover:bg-background disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={task === "clear"}
                onClick={handleClear}
                className="h-12 flex-1 rounded-[10px] bg-accent text-[15px] font-bold text-background disabled:opacity-50"
              >
                {task === "clear" ? "지우는 중…" : "지우기"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id={titleId} className="text-[17px] font-bold">
              커플 사진
            </h2>
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
          </>
        )}
      </dialog>
    </section>
  );
};
