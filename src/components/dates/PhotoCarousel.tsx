"use client";

import useEmblaCarousel from "embla-carousel-react";
import { useEffect, useState, type ReactElement } from "react";
import { ChevronLeftIcon, ChevronRightIcon, MapPinIcon } from "@/components/icons";
import { SignedPhoto } from "@/components/SignedPhoto";
import type { DetailPhoto } from "@/lib/dates/detail";
import { useResetOnLinkReopen } from "@/lib/navigation/use-reset-on-link-reopen";

interface PhotoCarouselProps {
  photos: DetailPhoto[];
  /** 사진 대체 텍스트에 쓰는 기록 제목 */
  title: string;
  /** 처음 펼칠 사진의 순서. 지도에서 고른 사진부터 보여 줄 때 쓴다(#249) */
  startIndex?: number;
}

const navButtonClassName =
  "press-icon flex size-11 items-center justify-center text-ink-sub hover:text-ink disabled:opacity-30 disabled:hover:text-ink-sub";

/** 화면 폭으로 넘겨 보는 사진과 지금 사진의 한마디·장소 */
export const PhotoCarousel = ({ photos, title, startIndex = 0 }: PhotoCarouselProps): ReactElement => {
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

  return (
    <section aria-roledescription="carousel" aria-label="사진" className="flex flex-col">
      <div ref={viewportRef} className="overflow-hidden">
        <div className="flex touch-pan-y">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${total}`}
              className="aspect-[4/5] min-w-0 shrink-0 grow-0 basis-full bg-surface"
            >
              {photo.url && (
                <SignedPhoto
                  src={photo.url}
                  alt={photo.caption ?? `${title} 사진 ${index + 1}`}
                  // 처음 펼친 사진은 바로 보이므로 먼저 받고, 나머지는 넘길 때 받는다
                  loading={index === startIndex ? "eager" : "lazy"}
                  draggable={false}
                  className="size-full object-contain"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-11 items-start gap-2 px-4 pt-2">
        {/* 넘길 때 한마디와 장소를 함께 읽어 준다. 장소는 한마디 아래 한 줄(#249, 2026-11-11 사용자 결정) */}
        <div aria-live="polite" className="flex min-w-0 flex-1 flex-col gap-0.5 pt-2.5">
          <p className="text-[14px] leading-[1.5] break-words text-ink">{current?.caption ?? ""}</p>
          {current?.place && (
            <p className="flex items-center gap-1 text-[13px] text-ink-sub">
              <MapPinIcon className="size-3.5 shrink-0" />
              <span className="sr-only">찍은 곳: </span>
              <span className="min-w-0 break-words">{current.place}</span>
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
    </section>
  );
};
