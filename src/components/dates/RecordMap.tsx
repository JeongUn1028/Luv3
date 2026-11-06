"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { CloseIcon } from "@/components/icons";
import { formatRecordPeriod } from "@/lib/dates/detail";
import { toMapPinsSignature, type MapPin } from "@/lib/dates/map";
import { loadKakaoMaps, type KakaoMap, type KakaoMarker, type KakaoMaps } from "@/lib/map/kakao-sdk";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";

/** 핀이 하나일 때의 확대 레벨. 동네가 보이는 정도다 */
const SINGLE_PIN_LEVEL = 3;

type MapStatus = "loading" | "ready" | "failed";

interface RecordMapProps {
  /** 하나 이상. 없으면 지도를 부르지 않고 안내를 보여 준다(무료 한도를 아낀다) */
  pins: MapPin[];
  appKey: string;
}

const toRecordHref = (id: string): string => `/dates/${id}`;

const drawMarkers = (maps: KakaoMaps, map: KakaoMap, pins: MapPin[], onPress: (pin: MapPin) => void): KakaoMarker[] => {
  const bounds = new maps.LatLngBounds();
  const markers = pins.map((pin) => {
    const position = new maps.LatLng(pin.lat, pin.lng);
    const marker = new maps.Marker({ position, title: pin.place, clickable: true });
    marker.setMap(map);
    maps.event.addListener(marker, "click", () => onPress(pin));
    bounds.extend(position);
    return marker;
  });
  // 핀 하나로 범위를 맞추면 가장 크게 확대되므로 자리만 옮기고 레벨은 그대로 둔다
  const [onlyPin] = pins;
  if (pins.length === 1 && onlyPin) map.setCenter(new maps.LatLng(onlyPin.lat, onlyPin.lng));
  else map.setBounds(bounds);
  return markers;
};

/**
 * 좌표가 있는 기록을 핀으로 보여 주는 지도. 핀에 기록이 하나면 바로 그 기록으로 가고, 여러 개면 목록을 띄운다.
 * cacheComponents가 화면을 Activity로 숨기면 effect가 정리됐다가 다시 돌므로, 지도는 ref에 두어 돌아왔을 때 보던 자리를 지킨다.
 *
 * @example <RecordMap pins={pins} appKey={appKey} />
 */
export const RecordMap = ({ pins, appKey }: RecordMapProps): ReactElement => {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | undefined>(undefined);
  const markersRef = useRef<KakaoMarker[]>([]);
  const drawnSignatureRef = useRef<string | undefined>(undefined);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [openPinKey, setOpenPinKey] = useState<string | undefined>();
  const openPin = pins.find(({ key }) => key === openPinKey);

  useEffect(() => {
    const container = containerRef.current;
    const [firstPin] = pins;
    if (!container || !firstPin) return;
    let isActive = true;

    const handlePinPress = (pin: MapPin) => {
      const [record] = pin.records;
      if (pin.records.length === 1 && record) {
        // 화면이 숨겨져도 상태는 남으므로, 돌아왔을 때 방금 본 기록과 상관없는 목록이 덮고 있지 않게 닫는다
        setOpenPinKey(undefined);
        router.push(toRecordHref(record.id), { transitionTypes: FORWARD_TRANSITION });
      } else {
        setOpenPinKey(pin.key);
      }
    };

    loadKakaoMaps(appKey)
      .then((maps) => {
        if (!isActive) return;
        if (!mapRef.current) {
          mapRef.current = new maps.Map(container, { center: new maps.LatLng(firstPin.lat, firstPin.lng), level: SINGLE_PIN_LEVEL });
          maps.event.addListener(mapRef.current, "click", () => setOpenPinKey(undefined));
        }
        // 숨겨졌던 동안에는 크기를 잴 수 없어 지도 조각이 어긋날 수 있다
        mapRef.current.relayout();
        // 돌아온 화면은 서버에서 다시 받아 배열이 새것이어도 내용이 같을 수 있다. 내용이 바뀌었을 때만 다시 그려 보던 자리를 지킨다
        const signature = toMapPinsSignature(pins);
        if (drawnSignatureRef.current !== signature) {
          markersRef.current.forEach((marker) => marker.setMap(null));
          markersRef.current = drawMarkers(maps, mapRef.current, pins, handlePinPress);
          drawnSignatureRef.current = signature;
        }
        setStatus("ready");
      })
      .catch((error: unknown) => {
        // 다시 시도해도 실패할 때(키·도메인 설정, 코드 오류) 원인을 찾을 수 있게 남긴다
        console.error("지도 불러오기 실패", error);
        if (isActive) setStatus("failed");
      });

    const resizeObserver = new ResizeObserver(() => mapRef.current?.relayout());
    resizeObserver.observe(container);
    return () => {
      isActive = false;
      resizeObserver.disconnect();
    };
  }, [appKey, loadAttempt, pins, router]);

  const handleRetry = () => {
    setStatus("loading");
    setLoadAttempt((attempt) => attempt + 1);
  };

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      {/* isolate: SDK가 지도 안쪽에 주는 z-index가 아래 목록 위로 올라오지 않게 가둔다 */}
      <div ref={containerRef} className="isolate absolute inset-0 bg-surface" />

      {status === "loading" && (
        <p role="status" className="absolute inset-0 flex items-center justify-center text-[13px] text-ink-sub">
          지도를 불러오는 중…
        </p>
      )}
      {status === "failed" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
          <p role="alert" className="text-[13px] text-ink-sub">
            지도를 불러오지 못했어요.
          </p>
          <button type="button" onClick={handleRetry} className="press-icon min-h-11 px-4 text-[13px] text-ink underline">
            다시 시도
          </button>
        </div>
      )}

      {/* 지도의 핀은 스크린 리더로 읽을 수 없어 같은 기록을 목록으로도 둔다 */}
      <ul aria-label="지도에 있는 기록" className="sr-only">
        {pins.flatMap(({ key, records }) =>
          records.map(({ id, title, place }) => (
            <li key={`${key}:${id}`}>
              <Link href={toRecordHref(id)} transitionTypes={FORWARD_TRANSITION}>
                {title} · {place}
              </Link>
            </li>
          )),
        )}
      </ul>

      {openPin && (
        // 바깥 칸은 목록이 올라올 수 있는 높이만 정한다. 비어 있는 자리의 지도는 그대로 움직일 수 있다
        <div className="pointer-events-none absolute inset-x-0 top-[40%] bottom-0 z-10 flex flex-col justify-end">
          <section
            aria-label={`${openPin.place} 기록`}
            className="pointer-events-auto relative max-h-full overflow-y-auto rounded-t-[14px] border-t border-line bg-surface"
          >
            <div className="flex items-center justify-between pl-4">
              <h2 className="min-w-0 truncate text-[15px] text-ink">{openPin.place}</h2>
              <button
                type="button"
                aria-label="목록 닫기"
                onClick={() => setOpenPinKey(undefined)}
                className="press-icon flex size-11 shrink-0 items-center justify-center text-ink-sub"
              >
                <CloseIcon className="size-5" />
              </button>
            </div>
            <ul>
              {openPin.records.map(({ id, title, date, endDate, place }) => (
                <li key={id} className="border-t border-line">
                  <Link href={toRecordHref(id)} transitionTypes={FORWARD_TRANSITION} className="press-card flex min-h-11 flex-col justify-center px-4 py-2">
                    <span className="text-[15px] break-words text-ink">{title}</span>
                    <span className="text-[12px] break-words text-ink-sub">
                      {formatRecordPeriod({ date, endDate })}
                      {place !== openPin.place && ` · ${place}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
};
