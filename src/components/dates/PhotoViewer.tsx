"use client";

import useEmblaCarousel from "embla-carousel-react";
import { useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type ReactElement, type Ref } from "react";
import { ModalDialog, type ModalDialogHandle } from "@/components/ModalDialog";
import { RememberedPhoto } from "@/components/RememberedPhoto";
import type { DetailGroup, DetailPhoto } from "@/lib/dates/detail";
import { toSlidePhotoLoad } from "@/lib/dates/detail-photo-loading";
import { PhotoPlace } from "./PhotoPlace";

/** 크게 보기를 여는 기능 */
export interface PhotoViewerHandle {
  /** 그 순서의 사진부터 연다 */
  open: (index: number) => void;
}

interface PhotoViewerProps {
  ref: Ref<PhotoViewerHandle>;
  photos: DetailPhoto[];
  groups: DetailGroup[];
  /** 사진 대체 텍스트와 창 이름에 쓰는 기록 제목 */
  title: string;
  /** 닫히면 마지막으로 보던 사진의 순서를 넘긴다. 상세도 그 사진으로 돌아간다 */
  onClose: (index: number) => void;
}

interface ViewerSlidesProps {
  photos: DetailPhoto[];
  title: string;
  startIndex: number;
  onSelect: (index: number) => void;
}

/** 넘겨 보는 사진 줄. 열 때마다 새로 그려 연 사진에서 시작한다 */
const ViewerSlides = ({ photos, title, startIndex, onSelect }: ViewerSlidesProps): ReactElement => {
  const [viewportRef, emblaApi] = useEmblaCarousel({ startIndex });
  const focusRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(startIndex);
  // 다 받은 사진. 받기 전과 받지 못했을 때는 깨진 사진 표시 대신 빈 칸으로 둔다
  const [shownIds, setShownIds] = useState<ReadonlySet<string>>(() => new Set());
  // 받기 시작한 사진. 상세와 같이 지금 사진을 다 받은 뒤 앞뒤 한 장을 받고(#313), 받기 시작한 사진은 멀리 넘겨도 주소를 빼지 않는다
  const [requestedIds, setRequestedIds] = useState<ReadonlySet<string>>(() => new Set());
  const current = photos[selectedIndex];
  const isSelectedShown = current === undefined || current.original === undefined || shownIds.has(current.id);
  const loads = photos.map((_, index) => toSlidePhotoLoad({ index, selectedIndex, isSelectedShown }));
  const newlyRequestedIds = photos.filter(({ id }, index) => loads[index] !== "later" && !requestedIds.has(id)).map(({ id }) => id);
  if (newlyRequestedIds.length > 0) setRequestedIds(new Set([...requestedIds, ...newlyRequestedIds]));

  // Embla(외부 라이브러리)가 넘긴 위치를 화면 상태와 맞춘다
  useEffect(() => {
    if (!emblaApi) return;
    const handleSelect = () => {
      const index = emblaApi.selectedScrollSnap();
      setSelectedIndex(index);
      onSelect(index);
    };
    emblaApi.on("select", handleSelect);
    return () => {
      emblaApi.off("select", handleSelect);
    };
  }, [emblaApi, onSelect]);

  // 창은 연 순간 닫기 버튼에 초점을 두지만, 사진 줄이 그 뒤에 그려지므로 그려진 뒤 사진 줄로 옮겨 바로 화살표로 넘길 수 있게 한다
  useEffect(() => {
    focusRef.current?.focus();
  }, []);

  // 화면 읽기·키보드 사용자는 밀어 넘기지 못하므로 좌우 화살표로 넘긴다. 닫기 버튼에서 Tab으로 다시 돌아올 수 있다
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") emblaApi?.scrollNext();
    else if (event.key === "ArrowLeft") emblaApi?.scrollPrev();
  };

  const markShown = (photoId: string) => setShownIds((ids) => (ids.has(photoId) ? ids : new Set(ids).add(photoId)));

  return (
    <div ref={focusRef} tabIndex={0} role="region" aria-roledescription="carousel" aria-label="사진, 좌우 화살표로 넘기기" onKeyDown={handleKeyDown} className="flex min-h-0 flex-1 outline-none">
      <div ref={viewportRef} className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full touch-pan-y">
          {photos.map((photo, index) => (
            <div key={photo.id} role="group" aria-roledescription="slide" aria-label={`${index + 1} / ${photos.length}`} className="flex h-full min-w-0 shrink-0 grow-0 basis-full items-center justify-center">
              {photo.original ? (
                requestedIds.has(photo.id) && (
                  <RememberedPhoto
                    photo={photo.original}
                    alt={`${title} 사진 ${index + 1}`}
                    draggable={false}
                    loading="eager"
                    fetchPriority={loads[index] === "now" ? "high" : "low"}
                    onLoaded={() => markShown(photo.id)}
                    className={`max-h-full max-w-full object-contain ${shownIds.has(photo.id) ? "" : "opacity-0"}`}
                  />
                )
              ) : (
                <p className="text-[14px] text-ink-sub">사진을 불러오지 못했어요</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * 기록 사진 크게 보기(#350). 화면 전체에 원본을 자르지 않고 원래 비율로 보여 주고, 좌우로 넘기며 사진 아래에 장소와 모음 한마디를 둔다.
 * 초점과 Esc 닫기는 공통 전체 화면 창(`ModalDialog`)을 따른다.
 *
 * @example <PhotoViewer ref={viewerRef} photos={photos} groups={groups} title={title} onClose={(index) => emblaApi?.scrollTo(index, true)} />
 */
export const PhotoViewer = ({ ref, photos, groups, title, onClose }: PhotoViewerProps): ReactElement => {
  const modalRef = useRef<ModalDialogHandle>(null);
  // 닫는 움직임(약 150ms) 중에 다시 열면 isOpen이 그대로라 사진 줄이 다시 그려지지 않으므로, 열 때마다 바뀌는 열쇠로 새로 그린다
  const [openCount, setOpenCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [startIndex, setStartIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  useImperativeHandle(
    ref,
    () => ({
      open: (index) => {
        setOpenCount((count) => count + 1);
        setStartIndex(index);
        setSelectedIndex(index);
        setIsOpen(true);
        modalRef.current?.open();
      },
    }),
    [],
  );

  const current = photos[selectedIndex];
  const caption = groups.find(({ id }) => id === current?.groupId)?.caption;

  return (
    <ModalDialog
      ref={modalRef}
      title={`${title} 사진`}
      // 닫힌 창의 글자가 상세의 "1 / 3"과 겹쳐 찾히지 않게 열려 있을 때만 쓴다
      headerLabel={isOpen ? `${selectedIndex + 1} / ${photos.length}` : ""}
      isFullScreen
      onClose={() => {
        setIsOpen(false);
        onClose(selectedIndex);
      }}
    >
      {isOpen && <ViewerSlides key={openCount} photos={photos} title={title} startIndex={startIndex} onSelect={setSelectedIndex} />}
      <div aria-live="polite" className="flex min-h-[88px] shrink-0 flex-col gap-1.5 px-4 pt-3 pb-[max(1rem,var(--bottom-safe-inset))]">
        {current && <PhotoPlace place={current.place} placeName={current.placeName} />}
        {caption && <p className="text-[14px] leading-[1.5] break-words whitespace-pre-line text-ink">{caption}</p>}
      </div>
    </ModalDialog>
  );
};
