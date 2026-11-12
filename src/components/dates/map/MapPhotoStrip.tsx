"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { SignedPhoto } from "@/components/SignedPhoto";
import { toRecordPhotoHref } from "@/lib/dates/detail";
import { fetchMapPhotos } from "@/lib/dates/fetch-map-photos";
import { formatMapPhotoDate, MAP_PHOTO_PAGE_SIZE, toPhotosWithKnownThumbs, type MapPhoto } from "@/lib/dates/map-photos";
import type { MapPhotoSpot } from "@/lib/dates/map-spots";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";
import { MapSheet } from "./MapSheet";

interface MapPhotoStripProps {
  spot: MapPhotoSpot;
  /** 서버 응답 전에 먼저 보여 줄 사진(핀 썸네일과 함께 받아 둔 대표 사진, #300). 없으면 빈 목록 */
  initialPhotos: MapPhoto[];
  onClose: () => void;
}

/** loading: 다음 묶음을 받는 중 · ready: 받은 만큼 보여 주는 중 · failed: 앞 묶음을 받지 못함 */
type StripStatus = "loading" | "ready" | "failed";

/** 끝에 닿기 전에 미리 다음 묶음을 부르는 거리. 사진 두 장쯤이다 */
const PRELOAD_DISTANCE_PX = 320;

const photoBoxClassName = "h-[188px] w-[150px] overflow-hidden rounded-lg bg-background";

/**
 * 사진 핀을 눌렀을 때 아래에 띄우는 그 자리 사진 가로 줄(#249 시안 "사진 가로 줄"). 최근 기록부터 보여 주고, 사진을 누르면 그 사진이 펼쳐진 기록 상세로 간다.
 * 사진은 칸을 열 때 그 자리 것만 받고, 옆으로 넘겨 끝에 가까워지면 이어 받는다. 다른 핀을 누르면 부르는 쪽이 key를 바꿔 새로 받는다.
 * 받아 둔 대표 사진은 칸을 열자마자 보여 준다. 첫 묶음에는 대표 사진도 넣어 받아, 그사이 지워졌거나 제목이 바뀐 것을 바로잡는다(썸네일 주소는 그대로 둔다).
 *
 * @example <MapPhotoStrip key={spot.key} spot={spot} initialPhotos={initialPhotos} onClose={close} />
 */
export const MapPhotoStrip = ({ spot, initialPhotos, onClose }: MapPhotoStripProps): ReactElement => {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);
  // 몇 번째 사진까지 받았는지로 이어 받으므로, 칸을 연 뒤 핀을 다시 받아 목록이 바뀌어도 연 때의 목록으로 끝까지 받는다(겹치거나 빠지지 않게)
  const [photoIds] = useState(spot.photoIds);
  const [photos, setPhotos] = useState(initialPhotos);
  /** 받은 사진 id 수. 그사이 지워진 사진은 응답에서 빠져 `photos`보다 많을 수 있다 */
  const [requestedCount, setRequestedCount] = useState(0);
  const [status, setStatus] = useState<StripStatus>("loading");
  /** 썸네일을 받지 못해 주소를 한 번 새로 받은 사진. 또 실패하면 빈 칸으로 둔다 */
  const refreshedIdsRef = useRef(new Set<string>());
  const hasMore = requestedCount < photoIds.length;
  const isAllDeleted = !hasMore && status === "ready" && photos.length === 0;

  // "loading"이면 다음 묶음을 받는다. 화면이 숨겨지면 멈췄다가 다시 보이면 이어서 받는다
  useEffect(() => {
    if (status !== "loading") return;
    const controller = new AbortController();
    const pageIds = photoIds.slice(requestedCount, requestedCount + MAP_PHOTO_PAGE_SIZE);
    fetchMapPhotos(pageIds, controller.signal)
      .then((page) => {
        // 첫 묶음은 먼저 보여 준 사진을 대신한다
        setPhotos((current) => (requestedCount === 0 ? toPhotosWithKnownThumbs(page, current) : [...current, ...page]));
        setRequestedCount((count) => count + pageIds.length);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("지도 사진 줄 받기 실패", error);
        setStatus("failed");
      });
    return () => controller.abort();
  }, [photoIds, requestedCount, status]);

  // 칸을 열어 둔 채 오래 지나면(상세에 다녀오는 동안 등) 아직 안 받은(lazy) 썸네일의 주소가 만료된다. 그 사진만 새 주소를 받는다
  const handleThumbFailed = (photoId: string): boolean => {
    if (refreshedIdsRef.current.has(photoId)) return true;
    refreshedIdsRef.current.add(photoId);
    fetchMapPhotos([photoId])
      .then(([fresh]) => {
        if (fresh?.thumbUrl) setPhotos((current) => current.map((photo) => (photo.id === photoId ? fresh : photo)));
      })
      .catch((error: unknown) => console.error("지도 사진 줄 썸네일 다시 받기 실패", error));
    return true;
  };

  const shouldWatchEnd = hasMore && status === "ready";
  useEffect(() => {
    const scroller = scrollerRef.current;
    const sentinel = sentinelRef.current;
    if (!shouldWatchEnd || !scroller || !sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setStatus("loading");
      },
      { root: scroller, rootMargin: `0px ${PRELOAD_DISTANCE_PX}px 0px 0px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [shouldWatchEnd]);

  return (
    <MapSheet label={`${spot.place} 사진`} title={spot.place} subtitle={`사진 ${hasMore ? photoIds.length : photos.length}장`} closeLabel="사진 줄 닫기" onClose={onClose}>
      <ul ref={scrollerRef} aria-label="이 자리 사진" className="flex gap-2.5 overflow-x-auto overscroll-x-contain px-4 pt-1.5 pb-4">
        {photos.map((photo) => (
          <li key={photo.id} className="w-[150px] shrink-0">
            <Link
              href={toRecordPhotoHref({ recordId: photo.recordId, photoId: photo.id })}
              transitionTypes={FORWARD_TRANSITION}
              className="press-card flex flex-col gap-1.5"
            >
              <div className={photoBoxClassName}>
                {photo.thumbUrl && (
                  <SignedPhoto
                    src={photo.thumbUrl}
                    // 기록 제목과 날짜를 함께 읽으므로 사진은 따로 읽지 않는다
                    alt=""
                    loading="lazy"
                    draggable={false}
                    // 화면을 새로 받아도 이 주소는 바뀌지 않으므로(칸에서 따로 받는다) 이 사진만 새로 받는다
                    onLoadFailed={() => handleThumbFailed(photo.id)}
                    className="size-full object-cover"
                  />
                )}
              </div>
              <span className="truncate text-[13px] text-ink">{photo.title}</span>
              <span className="-mt-1 text-[12px] text-ink-sub">{formatMapPhotoDate(photo)}</span>
            </Link>
          </li>
        ))}
        {isAllDeleted && (
          <li className="flex h-[188px] w-full items-center justify-center text-[13px] text-ink-sub">이 자리 사진이 모두 지워졌어요.</li>
        )}
        {status === "loading" && (
          <li className="w-[150px] shrink-0">
            <div className={`${photoBoxClassName} motion-safe:animate-pulse`} />
            <span role="status" className="sr-only">
              사진을 불러오는 중…
            </span>
          </li>
        )}
        {status === "failed" && (
          <li className="flex w-[150px] shrink-0 flex-col items-center justify-center gap-2 text-center">
            <p role="alert" className="text-[12px] text-ink-sub">
              사진을 불러오지 못했어요.
            </p>
            <button type="button" onClick={() => setStatus("loading")} className="press-icon min-h-11 px-3 text-[13px] text-ink underline">
              다시 시도
            </button>
          </li>
        )}
        {shouldWatchEnd && <li ref={sentinelRef} aria-hidden="true" className="w-px shrink-0" />}
      </ul>
    </MapSheet>
  );
};
