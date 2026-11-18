"use client";

import type { ReactElement, Ref, SyntheticEvent } from "react";
import { PickedPhoto } from "@/components/home/PickedPhoto";
import { CameraIcon, PlusIcon } from "@/components/icons";
import { RememberedPhoto } from "@/components/RememberedPhoto";
import type { CouplePhotoView } from "@/lib/couple-photo/preview";
import type { RememberablePhoto } from "@/lib/photos/remembered-url";

/** 새 사진 위 카메라 버튼 자리의 진행 표시(#329 시안 A). 화면 읽기 프로그램에는 aria-live 문구로 따로 알린다 */
const BusyBadge = ({ label }: { label: string }): ReactElement => (
  <div aria-hidden="true" className="absolute right-2.5 bottom-2.5 flex h-8 items-center gap-[7px] rounded-full bg-background/70 pr-3 pl-2.5 text-[13px] text-ink">
    <span className="size-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent motion-reduce:animate-none" />
    {label}
  </div>
);

interface CouplePhotoCardProps {
  /** 서버의 커플 사진. 고른 사진만 있으면 없다 */
  photo: RememberablePhoto | undefined;
  /** 서버가 쿠키를 보고 고른 서버 사진 주소(#356) */
  serverSrc: string | undefined;
  view: Exclude<CouplePhotoView, { kind: "empty" }>;
  isUploading: boolean;
  /** 저장하는 중이면 카메라 버튼을 숨긴다 */
  isBusy: boolean;
  menuButtonRef: Ref<HTMLButtonElement>;
  onServerPhotoLoaded: () => void;
  onPreviewError: (event: SyntheticEvent<HTMLImageElement>) => void;
  onOpenMenu: () => void;
}

/**
 * 사진이 있을 때의 커플 사진 카드. 서버 사진 위에 방금 고른 사진을 먼저 보여 주고, 모서리 카메라 버튼이 메뉴를 연다.
 *
 * @example <CouplePhotoCard photo={photo} serverSrc={serverSrc} view={view} isUploading={false} isBusy={false} menuButtonRef={ref} onServerPhotoLoaded={handleLoaded} onPreviewError={handleError} onOpenMenu={handleOpenMenu} />
 */
export const CouplePhotoCard = ({
  photo,
  serverSrc,
  view,
  isUploading,
  isBusy,
  menuButtonRef,
  onServerPhotoLoaded,
  onPreviewError,
  onOpenMenu,
}: CouplePhotoCardProps): ReactElement => (
  // w-full: 늘어난 높이로 비율을 다시 계산해 폭까지 넓어지지 않게 폭을 고정한다
  <div className="relative aspect-[4/3] w-full shrink-0 grow overflow-hidden rounded-[16px] bg-surface">
    {/* 고른 사진 아래에서 서버 사진을 받아 두어, 미리 보기를 치울 때 빈 칸이 깜빡이지 않게 한다 */}
    {photo && (
      <RememberedPhoto
        photo={photo}
        homeSlot="couple"
        serverSrc={serverSrc}
        // 홈 첫 화면에서 가장 큰 사진이라 다른 받기보다 먼저 받는다
        fetchPriority="high"
        alt={view.kind === "preview" ? "" : "커플 사진"}
        onLoaded={onServerPhotoLoaded}
        className="absolute inset-0 size-full object-cover"
      />
    )}
    {view.kind === "preview" && <PickedPhoto url={view.url} alt="커플 사진" onError={onPreviewError} className="absolute inset-0 size-full object-cover" />}
    {isUploading && <BusyBadge label={view.kind === "preview" ? "올리는 중" : "사진 준비 중"} />}
    {!isBusy && (
      <button
        ref={menuButtonRef}
        type="button"
        onClick={onOpenMenu}
        aria-label="커플 사진 바꾸기"
        aria-haspopup="dialog"
        className="press-icon absolute right-2.5 bottom-2.5 flex size-10 items-center justify-center rounded-full bg-background/70 text-ink after:absolute after:-inset-0.5"
      >
        <CameraIcon className="size-5" />
      </button>
    )}
  </div>
);

interface CouplePhotoAddButtonProps {
  buttonRef: Ref<HTMLButtonElement>;
  isBusy: boolean;
  isUploading: boolean;
  onClick: () => void;
}

/**
 * 사진이 없을 때의 점선 "커플 사진 추가" 칸.
 *
 * @example <CouplePhotoAddButton buttonRef={addButtonRef} isBusy={false} isUploading={false} onClick={handlePick} />
 */
export const CouplePhotoAddButton = ({ buttonRef, isBusy, isUploading, onClick }: CouplePhotoAddButtonProps): ReactElement => (
  // 지우는 동안에도 초점을 받을 수 있게 disabled 대신 aria-disabled로 막는다(누름은 부르는 쪽이 무시한다)
  <button
    ref={buttonRef}
    type="button"
    onClick={onClick}
    aria-disabled={isBusy}
    className="press-card flex h-[120px] w-full items-center justify-center gap-1.5 rounded-[16px] border border-dashed border-ink-sub/50 text-[15px] text-ink-sub aria-disabled:opacity-60"
  >
    {isUploading ? (
      "사진 준비 중…"
    ) : (
      <>
        <PlusIcon className="size-5" />
        커플 사진 추가
      </>
    )}
  </button>
);
