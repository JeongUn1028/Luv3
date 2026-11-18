"use client";

import useEmblaCarousel from "embla-carousel-react";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { DetailPhotoFrame } from "@/components/dates/DetailPhotoFrame";
import { PhotoPlace } from "@/components/dates/PhotoPlace";
import { PhotoViewer, type PhotoViewerHandle } from "@/components/dates/PhotoViewer";
import { useFirstPhotoGate } from "@/components/dates/FirstPhotoGate";
import type { DetailGroup, DetailPhoto } from "@/lib/dates/detail";
import { toSlidePhotoLoad } from "@/lib/dates/detail-photo-loading";
import { useResetOnLinkReopen } from "@/lib/navigation/use-reset-on-link-reopen";

interface PhotoCarouselProps {
  photos: DetailPhoto[];
  /** 사진 모음. 지금 보는 모음의 한마디를 찾는다(#309) */
  groups: DetailGroup[];
  /** 사진 대체 텍스트에 쓰는 기록 제목 */
  title: string;
  /** 처음 펼칠 사진의 순서. 지도에서 고른 사진부터 보여 줄 때 쓴다(#249) */
  startIndex?: number;
}

const navButtonClassName =
  "press-icon flex size-11 items-center justify-center text-ink-sub hover:text-ink disabled:opacity-30 disabled:hover:text-ink-sub";

/**
 * 화면 폭으로 넘겨 보는 사진과 지금 사진의 장소, 지금 모음의 한마디.
 * 모음 칩은 장소 줄과 같은 이름을 되풀이해 없앴다(#317). 다른 모음으로 넘어가면 장소 줄의 이름이 바뀌어 알 수 있다.
 * 사진은 지금 사진을 먼저 받고, 다 받으면 앞뒤 한 장을 미리 받는다(#313). 처음 펼친 사진은 사진을 받는 동안 썸네일을 먼저 보여 준다.
 * 칸에는 상세용 중간 크기(없으면 원본)를 그리고, 크게 보기는 원본을 쓴다(#411)
 */
export const PhotoCarousel = ({ photos, groups, title, startIndex = 0 }: PhotoCarouselProps): ReactElement => {
  const [viewportRef, emblaApi] = useEmblaCarousel({ startIndex });
  const [selectedIndex, setSelectedIndex] = useState(startIndex);
  const total = photos.length;
  // 숨겨 둔 상세를 다른 사진 주소로 다시 열면 화면은 그대로지만, Embla가 바뀐 시작 순서로 다시 맞추고(reInit) 아래에서 상태도 맞춘다
  const current = photos[selectedIndex];
  // 칸에 그릴 사진을 다 받은 사진
  const [shownPhotoIds, setShownPhotoIds] = useState<ReadonlySet<string>>(() => new Set());
  // 받기 시작한 사진. 다 받기 전에 멀리 넘겨도 주소를 빼지 않아, 받던 것을 끊고 나중에 처음부터 다시 받지 않는다
  const [requestedPhotoIds, setRequestedPhotoIds] = useState<ReadonlySet<string>>(() => new Set());
  const { markFirstPhotoShown } = useFirstPhotoGate();
  const viewerRef = useRef<PhotoViewerHandle>(null);
  const openButtonsRef = useRef<Map<number, HTMLButtonElement>>(new Map());
  // 받을 주소가 없는 사진은 기다릴 것이 없다
  const isSelectedShown = current === undefined || current.display === undefined || shownPhotoIds.has(current.id);
  const loads = photos.map((_, index) => toSlidePhotoLoad({ index, selectedIndex, isSelectedShown }));
  const newlyRequestedIds = photos.filter(({ id }, index) => loads[index] !== "later" && !requestedPhotoIds.has(id)).map(({ id }) => id);
  // 받을 차례가 된 사진을 이번 그리기에서 바로 기억한다(이전 그리기의 값으로 다음 값을 정하는 React의 그리기 중 갱신)
  if (newlyRequestedIds.length > 0) setRequestedPhotoIds(new Set([...requestedPhotoIds, ...newlyRequestedIds]));

  const handlePhotoShown = (photoId: string) => {
    setShownPhotoIds((ids) => (ids.has(photoId) ? ids : new Set(ids).add(photoId)));
    // 처음 펼친 사진이 아니어도(받기 전에 넘김) 지금 보는 사진을 받았으면 기다리던 동선 지도를 불러도 된다
    markFirstPhotoShown();
  };

  // 숨겨 둔 상세를 같은 사진 주소로 다시 열면 시작 순서가 그대로라 Embla가 다시 맞추지 않아, 마지막에 넘겨 본 사진이 남는다.
  // 링크로 다시 열었을 때만 주소의 사진으로 돌리고, 뒤로 가기로 돌아왔을 때는 보던 사진을 둔다(#249)
  useResetOnLinkReopen(() => {
    emblaApi?.scrollTo(startIndex, true);
    // 숨겨진 동안 select 알림을 듣지 않아 상태도 직접 맞춘다
    setSelectedIndex(startIndex);
  });

  // Embla(외부 라이브러리)가 넘긴 위치를 화면 상태와 맞춘다
  useEffect(() => {
    if (!emblaApi) return;
    const handleSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", handleSelect).on("reInit", handleSelect);
    return () => {
      emblaApi.off("select", handleSelect).off("reInit", handleSelect);
    };
  }, [emblaApi]);

  // 크게 보기에서 넘겨 본 사진으로 상세도 옮기고, 초점도 그 사진에 둔다. 창이 되돌린 초점은 처음 누른 사진이라 화면 밖 칸으로 줄이 밀린다
  const handleViewerClose = (index: number) => {
    emblaApi?.scrollTo(index, true);
    openButtonsRef.current.get(index)?.focus({ preventScroll: true });
  };

  // 한마디는 모음마다 하나라 같은 모음 사진을 넘기는 동안 그대로이고, 다른 모음으로 넘어가면 바뀐다(#309)
  const currentCaption = groups.find(({ id }) => id === current?.groupId)?.caption;

  return (
    <>
      <section aria-roledescription="carousel" aria-label="사진" className="flex flex-col">
        {/* 넘기는 영역은 화면 폭 그대로 두어 화면 끝에서 시작한 손짓도 넘긴다 */}
        <div ref={viewportRef} className="overflow-hidden">
          <div className="flex touch-pan-y">
            {photos.map((photo, index) => {
              const load = loads[index];
              return (
                <div
                  key={photo.id}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${index + 1} / ${total}`}
                  // 양옆 16px 여백과 16px 모서리는 홈 커플 사진과 같다(#321). 사진 왼쪽 끝이 아래 글자와 줄이 맞고, 넘기는 동안 사진 사이가 32px 벌어진다
                  className="relative min-w-0 shrink-0 grow-0 basis-full px-4"
                >
                  <DetailPhotoFrame
                    // 받을 차례가 아닌 사진은 주소를 넘기지 않아 받지 않는다(브라우저의 lazy는 옆 칸도 미리 받아 첫 사진과 회선을 나눠 쓴다)
                    photo={load !== "later" || requestedPhotoIds.has(photo.id) ? photo.display : undefined}
                    // 썸네일은 처음 펼칠 사진에만 온다. 넘겨 보는 사진은 미리 받아 두므로 썸네일을 거치지 않는다
                    placeholder={index === startIndex ? photo.thumb : undefined}
                    alt={`${title} 사진 ${index + 1}`}
                    fetchPriority={load === "now" ? "high" : "low"}
                    onShown={() => handlePhotoShown(photo.id)}
                  />
                  {/* 사진을 누르면 크게 본다(#350). 사진 요소를 버튼 안에 넣으면 사진으로 읽히지 않아 사진 위에 겹쳐 둔다. 밀어 넘긴 끝의 누름은 Embla가 막는다. 서명하지 못한 사진도 열어, 닫을 때 초점을 둘 버튼이 늘 있다 */}
                  <button
                    type="button"
                    ref={(button) => {
                      if (button) openButtonsRef.current.set(index, button);
                      else openButtonsRef.current.delete(index);
                    }}
                    aria-label={`${title} 사진 ${index + 1} 크게 보기`}
                    onClick={() => viewerRef.current?.open(index)}
                    className="absolute inset-y-0 right-4 left-4 rounded-[16px]"
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex min-h-11 items-start gap-2 px-4 pt-2">
          {/* 넘길 때 그 사진이 속한 모음의 장소를 읽어 준다(#249). 직접 붙인 장소 이름은 분홍으로, 다듬은 동 이름은 회색으로 둔다(#317) */}
          <div aria-live="polite" className="flex min-w-0 flex-1 flex-col gap-0.5 pt-2.5">
            {current && <PhotoPlace place={current.place} placeName={current.placeName} />}
          </div>
          {total > 1 && (
            <div className="-mr-3 flex shrink-0 items-center">
              <button
                type="button"
                aria-label="이전 사진"
                disabled={selectedIndex === 0}
                onClick={() => emblaApi?.scrollPrev()}
                className={navButtonClassName}
              >
                <ChevronLeftIcon className="size-5" />
              </button>
              <span className="font-display text-[13px] tracking-[2px] text-ink-sub">
                {selectedIndex + 1} / {total}
              </span>
              <button
                type="button"
                aria-label="다음 사진"
                disabled={selectedIndex === total - 1}
                onClick={() => emblaApi?.scrollNext()}
                className={navButtonClassName}
              >
                <ChevronRightIcon className="size-5" />
              </button>
            </div>
          )}
        </div>
        {/* 한마디가 없는 모음은 자리를 비운다. 다른 모음으로 넘어가 바뀔 때만 읽어 준다 */}
        <p aria-live="polite" className="px-4">
          {currentCaption && <span className="mt-2 block text-[14px] leading-[1.5] break-words whitespace-pre-line text-ink">{currentCaption}</span>}
        </p>
      </section>
      <PhotoViewer ref={viewerRef} photos={photos} groups={groups} title={title} onClose={handleViewerClose} />
    </>
  );
};
