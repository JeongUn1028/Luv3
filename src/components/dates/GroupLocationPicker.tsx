"use client";

import { useEffect, useEffectEvent, useRef, useState, type ReactElement } from "react";
import { MapPinIcon } from "@/components/icons";
import { SINGLE_PIN_LEVEL } from "@/components/dates/map/map-drawing";
import { MapLoadStatus } from "@/components/dates/map/MapLoadStatus";
import { useKakaoMap } from "@/components/dates/map/use-kakao-map";
import type { PhotoLocation } from "@/lib/dates/form";
import { isSameMapSpot, type OtherGroupLocation } from "@/lib/dates/group-location";
import type { PlaceLocation } from "@/lib/places/location";
import { fetchPlaceRegionName, UNKNOWN_PHOTO_PLACE } from "@/lib/places/region";
import { formatRegionName } from "@/lib/places/region-name";
import { toGroupName } from "@/lib/dates/group-name";

interface GroupLocationPickerProps {
  appKey: string;
  /** 지도를 처음 놓을 자리. 이름이 있으면 찾지 않고 그대로 보여 준다. 없으면 서울시청에서 시작한다 */
  initialLocation: PhotoLocation | undefined;
  otherLocations: OtherGroupLocation[];
  onChoose: (location: PhotoLocation) => void;
}

/** 내 위치를 이만큼만 기다린다. 답이 없으면 지도를 직접 움직이게 한다 */
const MY_LOCATION_TIMEOUT_MS = 10_000;

const optionClassName =
  "press-wide flex min-h-12 shrink-0 flex-col items-start justify-center rounded-[10px] border border-line bg-background px-3.5 py-1.5 text-left text-[14px] text-ink";

/**
 * 모음 위치를 고르는 지도(#298). 지도를 움직여 가운데 핀을 맞추면 그 자리의 동네 이름(행정동, #290)을 바로 보여 준다.
 * 카카오 장소 찾기는 쓰지 않고, 다른 모음과 같은 곳이나 내 위치로 바로 옮길 수 있다. 창이 열려 있을 때만 그려 지도 SDK를 그때 부른다.
 *
 * @example {isOpen && <GroupLocationPicker appKey={key} initialLocation={group.location} otherLocations={others} onChoose={save} />}
 */
export const GroupLocationPicker = ({ appKey, initialLocation, otherLocations, onChoose }: GroupLocationPickerProps): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { kakao, status, retry } = useKakaoMap({ containerRef, appKey, initialLevel: SINGLE_PIN_LEVEL });
  // 부모가 다시 그려져도 사용자가 옮긴 지도를 처음 자리로 되돌리지 않게 열 때의 값만 쓴다
  const [startLocation] = useState(initialLocation);
  // 지금 가운데 좌표와, 그 자리의 이름을 받았으면 이름이 붙은 위치. 둘이 다르면 이름을 찾는 중이다
  const [center, setCenter] = useState<PlaceLocation>();
  const [named, setNamed] = useState<PhotoLocation | undefined>(initialLocation);
  const [myLocationNotice, setMyLocationNotice] = useState<string>();
  const lookupRef = useRef(0);
  const isLooking = center !== undefined && (named === undefined || !isSameMapSpot(named, center));

  const lookUpCenter = (location: PlaceLocation) => {
    // 내 위치로 옮기면 지도가 멈춘 뒤 같은 자리를 한 번 더 알린다
    if (isSameMapSpot(center, location)) return;
    setCenter(location);
    // 이름을 이미 받은 자리로 돌아와도 번호를 올려, 그 전에 다른 자리로 보낸 찾기가 늦게 와서 이름을 덮지 못하게 한다
    const lookup = (lookupRef.current += 1);
    if (isSameMapSpot(named, location)) return;
    // 이름을 받지 못해도(경계 밖, 실패) 좌표는 쓸 수 있어 사진 정보와 같이 "찍은 곳"으로 둔다(#249)
    void fetchPlaceRegionName({ location })
      .catch(() => undefined)
      .then((name) => {
        if (lookup === lookupRef.current) setNamed({ place: name ?? UNKNOWN_PHOTO_PLACE, ...location });
      });
  };
  // 지도 이벤트는 처음 한 번만 붙이므로, 그때의 상태가 아니라 지금 상태로 견주게 한다
  const handleMapIdle = useEffectEvent(lookUpCenter);

  // 지도(외부 라이브러리)를 처음 자리에 놓고, 움직임이 멈출 때마다 가운데 자리의 이름을 찾는다
  useEffect(() => {
    if (!kakao) return;
    const { maps, map } = kakao;
    if (startLocation) map.setCenter(new maps.LatLng(startLocation.lat, startLocation.lng));
    const readCenter = () => {
      const latLng = map.getCenter();
      handleMapIdle({ lat: latLng.getLat(), lng: latLng.getLng() });
    };
    readCenter();
    maps.event.addListener(map, "idle", readCenter);
    return () => maps.event.removeListener(map, "idle", readCenter);
  }, [kakao, startLocation]);

  const moveTo = (location: PlaceLocation) => {
    if (!kakao) return;
    kakao.map.setCenter(new kakao.maps.LatLng(location.lat, location.lng));
    lookUpCenter(location);
  };

  const handleMyLocation = () => {
    setMyLocationNotice(undefined);
    if (!("geolocation" in navigator)) {
      setMyLocationNotice("이 기기에서는 내 위치를 쓸 수 없어요. 지도를 움직여 맞춰 주세요.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => moveTo({ lat: coords.latitude, lng: coords.longitude }),
      () => setMyLocationNotice("내 위치를 알지 못했어요. 지도를 움직여 맞춰 주세요."),
      { enableHighAccuracy: true, timeout: MY_LOCATION_TIMEOUT_MS },
    );
  };

  return (
    <>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-surface">
        {/* isolate: SDK가 지도 안쪽에 주는 z-index가 핀과 버튼 위로 올라오지 않게 가둔다 */}
        {/* 지도는 손가락으로만 움직일 수 있어 화면 읽기 프로그램에는 감추고, 다른 모음과 같은 곳·내 위치로 고르게 한다 */}
        <div ref={containerRef} aria-hidden="true" className="isolate absolute inset-0" />
        <MapLoadStatus status={status} onRetry={retry} />
        {status === "ready" && (
          <>
            <p className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background/85 px-3.5 py-2 text-[13px] whitespace-nowrap text-ink">
              지도를 움직여 핀을 찍은 곳에 맞춰 주세요
            </p>
            {/* 핀 끝이 지도 가운데에 닿게 핀 높이만큼 올린다 */}
            <div aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center">
              <svg width="36" height="44" viewBox="0 0 24 28">
                <path d="M12 27s-9-8-9-15a9 9 0 0 1 18 0c0 7-9 15-9 15z" fill="var(--color-accent)" stroke="var(--color-background)" strokeWidth="1.2" />
                <circle cx="12" cy="12" r="3.4" fill="var(--color-background)" />
              </svg>
            </div>
            <button
              type="button"
              onClick={handleMyLocation}
              className="press-icon absolute right-4 bottom-4 z-10 flex size-11 items-center justify-center rounded-full bg-ink text-background shadow-md"
            >
              <span className="sr-only">내 위치로</span>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
            </button>
          </>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-2.5 border-t border-line bg-surface px-4 pt-4 pb-[max(1.5rem,var(--bottom-safe-inset))]">
        <div className="flex items-center gap-2">
          <MapPinIcon className="size-[18px] shrink-0 text-accent" />
          <div className="flex min-w-0 flex-col">
            {/* 이름이 바뀌면 화면 읽기 프로그램이 따로 찾지 않아도 알 수 있게 읽어 준다 */}
            <p aria-live="polite" className="truncate text-[16px] text-ink">
              {isLooking || !named ? "동네 이름 찾는 중…" : formatRegionName(named.place)}
            </p>
            <p className="text-[12px] text-ink-sub">핀 자리의 동네 이름이 모음 위치로 저장돼요</p>
          </div>
        </div>
        {myLocationNotice && (
          <p role="alert" className="text-[12px] text-accent">
            {myLocationNotice}
          </p>
        )}
        {otherLocations.length > 0 && (
          <ul aria-label="다른 모음과 같은 곳" className="-mx-4 flex gap-2 overflow-x-auto px-4">
            {otherLocations.map(({ groupNumber, location }) => (
              <li key={groupNumber} className="flex">
                <button type="button" onClick={() => onChoose(location)} className={optionClassName}>
                  {toGroupName(groupNumber, "와")} 같은 곳
                  <span className="text-[12px] text-ink-sub">{formatRegionName(location.place)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          disabled={isLooking || !named || status !== "ready"}
          onClick={() => {
            if (named) onChoose(named);
          }}
          className="press-wide h-[50px] w-full rounded-[10px] bg-accent font-display text-[16px] text-background disabled:opacity-50"
        >
          이 위치로
        </button>
      </div>
    </>
  );
};
