"use client";

import useEmblaCarousel from "embla-carousel-react";
import { useEffect, useState, type ReactElement } from "react";
import { ChevronLeftIcon, ChevronRightIcon, MapPinIcon } from "@/components/icons";
import { DetailPhotoFrame } from "@/components/dates/DetailPhotoFrame";
import type { DetailGroup, DetailPhoto } from "@/lib/dates/detail";
import { useResetOnLinkReopen } from "@/lib/navigation/use-reset-on-link-reopen";
import { toShortRegionName } from "@/lib/places/region-name";

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
 * 모음 칩은 장소 줄과 같은 이름을 되풀이해 없앴다(#317). 다른 모음으로 넘어가면 장소 줄의 이름이 바뀌어 알 수 있다
 */
export const PhotoCarousel = ({ photos, groups, title, startIndex = 0 }: PhotoCarouselProps): ReactElement => {
  const [viewportRef, emblaApi] = useEmblaCarousel({ startIndex });
  const [selectedIndex, setSelectedIndex] = useState(startIndex);
  const total = photos.length;
  // 숨겨 둔 상세를 다른 사진 주소로 다시 열면 화면은 그대로지만, Embla가 바뀐 시작 순서로 다시 맞추고(reInit) 아래에서 상태도 맞춘다
  const current = photos[selectedIndex];

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

  // 한마디는 모음마다 하나라 같은 모음 사진을 넘기는 동안 그대로이고, 다른 모음으로 넘어가면 바뀐다(#309)
  const currentCaption = groups.find(({ id }) => id === current?.groupId)?.caption;

  return (
    <section aria-roledescription="carousel" aria-label="사진" className="flex flex-col">
      {/* 넘기는 영역은 화면 폭 그대로 두어 화면 끝에서 시작한 손짓도 넘긴다 */}
      <div ref={viewportRef} className="overflow-hidden">
        <div className="flex touch-pan-y">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${total}`}
              // 양옆 16px 여백과 16px 모서리는 홈 커플 사진과 같다(#321). 사진 왼쪽 끝이 아래 글자와 줄이 맞고, 넘기는 동안 사진 사이가 32px 벌어진다
              className="min-w-0 shrink-0 grow-0 basis-full px-4"
            >
              <DetailPhotoFrame
                url={photo.url}
                alt={`${title} 사진 ${index + 1}`}
                // 처음 펼친 사진은 바로 보이므로 먼저 받고, 나머지는 넘길 때 받는다
                loading={index === startIndex ? "eager" : "lazy"}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-11 items-start gap-2 px-4 pt-2">
        {/* 넘길 때 그 사진이 속한 모음의 장소를 읽어 준다(#249). 직접 붙인 장소 이름은 분홍으로, 다듬은 동 이름은 회색으로 둔다(#317) */}
        <div aria-live="polite" className="flex min-w-0 flex-1 flex-col gap-0.5 pt-2.5">
          {current && (
            <p className="flex flex-wrap items-center gap-x-1 text-[13px] text-ink-sub">
              <MapPinIcon className="size-3.5 shrink-0 text-accent" />
              <span className="sr-only">찍은 곳: </span>
              {/* 사이의 빈칸은 줄 배치(flex)에서는 보이지 않고, 화면 읽기 프로그램이 두 이름을 붙여 읽지 않게 한다 */}
              {current.placeName && (
                <>
                  <span className="min-w-0 text-[14px] break-words text-accent">{current.placeName}</span>{" "}
                </>
              )}
              <span className="min-w-0 break-words">
                {current.placeName && <span aria-hidden="true">· </span>}
                {toShortRegionName(current.place)}
              </span>
            </p>
          )}
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
  );
};
