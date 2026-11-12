"use client";

import { useEffect, useState, type ReactElement } from "react";
import { fetchPhotoFile, savePhotoToDevice } from "@/lib/photos/save-to-device";

interface SaveTrashPhotoButtonProps {
  /** 원본 서명 주소 */
  url: string;
  fileName: string;
}

type PhotoFileState = { status: "loading" } | { status: "ready"; file: File } | { status: "failed" };

const BUTTON_CLASS_NAME = "press-wide h-[52px] w-full rounded-[10px] bg-accent font-display text-[15px] text-background disabled:opacity-50";

const downloadFile = (file: File): void => {
  const objectUrl = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = file.name;
  link.click();
  // 내려받기가 시작된 뒤에 풀어야 파일이 비지 않는다
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};

/**
 * 휴지통 사진을 휴대폰에 저장하는 버튼. 아이폰은 공유 창을 누른 순간에 열어야 해서, 화면을 열 때 원본을 미리 받아 둔다.
 *
 * @example <SaveTrashPhotoButton url={photo.url} fileName={photo.fileName} />
 */
export const SaveTrashPhotoButton = ({ url, fileName }: SaveTrashPhotoButtonProps): ReactElement => {
  const [attempt, setAttempt] = useState(0);
  const [photoFile, setPhotoFile] = useState<PhotoFileState>({ status: "loading" });
  const [notice, setNotice] = useState<{ text: string; isError: boolean }>();
  // 공유 창이 열려 있는 동안 또 누르면 두 번째 share()가 실패해 저장 실패로 보이므로 막는다
  const [isSaving, setIsSaving] = useState(false);

  // 서명 주소의 사진 파일(외부 저장소)을 받아 둔다. 다시 받기를 누르면 attempt가 바뀌어 다시 받는다
  useEffect(() => {
    let isCurrent = true;
    fetchPhotoFile({ url, fileName }).then(
      (file) => {
        if (isCurrent) setPhotoFile({ status: "ready", file });
      },
      () => {
        if (isCurrent) setPhotoFile({ status: "failed" });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [url, fileName, attempt]);

  const handleRetry = () => {
    setPhotoFile({ status: "loading" });
    setNotice(undefined);
    setAttempt((count) => count + 1);
  };

  const handleSave = async (file: File) => {
    if (isSaving) return;
    setIsSaving(true);
    setNotice(undefined);
    try {
      const outcome = await savePhotoToDevice(file, {
        canShare: typeof navigator.canShare === "function" ? (data) => navigator.canShare(data) : undefined,
        share: typeof navigator.share === "function" ? (data) => navigator.share(data) : undefined,
        download: downloadFile,
      });
      if (outcome === "downloaded") setNotice({ text: "사진을 내려받았어요.", isError: false });
    } catch {
      setNotice({ text: "사진을 저장하지 못했어요. 다시 눌러 주세요.", isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  if (photoFile.status === "failed") {
    return (
      <div className="flex flex-col gap-2.5">
        <p role="alert" className="text-center text-[13px] text-accent">
          사진을 받지 못했어요. 다시 시도해 주세요.
        </p>
        <button type="button" onClick={handleRetry} className={BUTTON_CLASS_NAME}>
          다시 받기
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {notice && (
        <p role={notice.isError ? "alert" : "status"} className={`text-center text-[13px] ${notice.isError ? "text-accent" : "text-ink-sub"}`}>
          {notice.text}
        </p>
      )}
      {photoFile.status === "ready" ? (
        <button type="button" disabled={isSaving} onClick={() => void handleSave(photoFile.file)} className={BUTTON_CLASS_NAME}>
          휴대폰에 저장
        </button>
      ) : (
        <button type="button" disabled className={BUTTON_CLASS_NAME}>
          사진 준비 중…
        </button>
      )}
    </div>
  );
};
