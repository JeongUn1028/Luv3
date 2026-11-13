"use client";

import { useEffect, useId, useRef, type ReactElement } from "react";
import { formatRecordMonthDay } from "@/lib/dates/detail";
import type { PhotoRoute } from "@/lib/dates/route";
import { SINGLE_PIN_LEVEL } from "@/components/dates/map/map-drawing";
import { MapLoadStatus } from "@/components/dates/map/MapLoadStatus";
import { useKakaoMap } from "@/components/dates/map/use-kakao-map";
import { drawRoute, getRouteLineColor } from "./route-drawing";
import { useRouteMapStart } from "./use-route-map-start";

interface RecordRouteProps {
  route: PhotoRoute;
  appKey: string;
}

/**
 * 기록 상세의 "이날 다닌 곳" 작은 지도(#251). 모음 위치를 모음 순서대로 선으로 잇고 점에 번호를 적는다(#299).
 * 페이지를 내리는 손가락을 지도가 가로채지 않게 지도는 누르거나 움직일 수 없다. 순서는 화면 읽기 프로그램에 목록으로 읽어 준다.
 * 지도는 화면에 가까워지고 첫 사진을 받은 뒤에 불러와, 상세를 열자마자 첫 사진과 회선을 나눠 쓰지 않는다(#313).
 *
 * @example {record.route && <RecordRoute route={record.route} appKey={appKey} />}
 */
export const RecordRoute = ({ route, appKey }: RecordRouteProps): ReactElement => {
  const headingId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldLoad = useRouteMapStart(containerRef);
  const { kakao, status, retry } = useKakaoMap({ containerRef, appKey, initialLevel: SINGLE_PIN_LEVEL, shouldLoad });
  const isTrip = route.lines.length > 1;

  // 지도(외부 라이브러리)에 선과 점을 그린다. 기록이 바뀌면 지우고 다시 그린다
  useEffect(() => {
    if (!kakao) return;
    return drawRoute({ ...kakao, route });
  }, [kakao, route]);

  return (
    <section aria-labelledby={headingId} className="mt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-[13px] text-label">
          이날 다닌 곳
        </h2>
        <p className="text-[12px] text-ink-sub">
          {route.points.length}곳 · 모음 순서
        </p>
      </div>
      <div className="relative mt-2 h-52 overflow-hidden rounded-2xl bg-surface">
        {/* isolate: SDK가 지도 안쪽에 주는 z-index가 머리글 위로 올라오지 않게 가둔다 */}
        <div ref={containerRef} aria-hidden="true" className="pointer-events-none isolate absolute inset-0" />
        <MapLoadStatus status={status} onRetry={retry} />
      </div>
      {isTrip && (
        <ul aria-label="날짜별 선 색" className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-sub">
          {route.lines.map(({ date }, lineIndex) => (
            <li key={date ?? lineIndex} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-1 w-[18px] rounded-full" style={{ backgroundColor: getRouteLineColor(lineIndex) }} />
              {date && formatRecordMonthDay(date)}
            </li>
          ))}
        </ul>
      )}
      <ol aria-label="다닌 순서" className="sr-only">
        {route.points.map(({ number, place, photoIds }) => (
          <li key={number}>
            {number}. {place} 사진 {photoIds.length}장
          </li>
        ))}
      </ol>
    </section>
  );
};
