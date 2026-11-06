"use client";

import useEmblaCarousel from "embla-carousel-react";
import { useEffect, useState, type ReactElement } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import type { DetailPhoto } from "@/lib/dates/detail";

interface PhotoCarouselProps {
  photos: DetailPhoto[];
  /** 사진 대체 텍스트에 쓰는 기록 제목 */
  title: string;
}

const navButtonClassName =
  "press-icon flex size-11 items-center justify-center text-ink-sub hover:text-ink disabled:opacity-30 disabled:hover:text-ink-sub";

/** 화면 폭으로 넘겨 보는 사진과 지금 사진의 한마디 */
export const PhotoCarousel = ({ photos, title }: PhotoCarouselProps): ReactElement => {
  const [viewportRef, emblaApi] = useEmblaCarousel();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const total = photos.length;
  const current = photos[selectedIndex];

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
                // eslint-disable-next-line @next/next/no-img-element -- 업로드 때 이미 줄인 원본이고 서명 URL이 시간이 지나면 바뀌어 next/image 최적화를 거치지 않는다
                <img
                  src={photo.url}
                  alt={photo.caption ?? `${title} 사진 ${index + 1}`}
                  // 첫 사진은 바로 보이므로 먼저 받고, 나머지는 넘길 때 받는다
                  loading={index === 0 ? "eager" : "lazy"}
                  draggable={false}
                  className="size-full object-contain"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-11 items-center gap-2 px-4 pt-2">
        <p aria-live="polite" className="min-w-0 flex-1 text-[14px] leading-[1.5] text-ink">
          {current?.caption ?? ""}
        </p>
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
