import type { MapPin, MapPins } from "@/lib/dates/map";
import type { MapPhotoSpot } from "@/lib/dates/map-spots";
import type { KakaoClusterStyle, KakaoCustomOverlay, KakaoMap, KakaoMarker, KakaoMarkerClusterer, KakaoMaps } from "@/lib/map/kakao-sdk";
import { createPhotoPinElement, type PhotoPinElement } from "./photo-pin";

/** 핀이 하나일 때의 확대 레벨. 동네가 보이는 정도다 */
export const SINGLE_PIN_LEVEL = 3;

/** 이 화면 픽셀 칸 안에 들어온 핀끼리 숫자 동그라미로 묶는다. 사진 핀(52px)이 겹치지 않을 만큼 */
const CLUSTER_GRID_SIZE = 60;

/** 숫자 동그라미(#249 시안: 분홍 바탕에 진한 숫자). 카카오가 요소에 그대로 붙이는 CSS라 색은 토큰 변수로 준다 */
const CLUSTER_STYLE: KakaoClusterStyle = {
  width: "40px",
  height: "40px",
  lineHeight: "40px",
  borderRadius: "50%",
  background: "var(--color-accent)",
  color: "var(--color-background)",
  textAlign: "center",
  // 숫자는 다른 화면처럼 주아로 쓴다. 주아는 굵기가 하나뿐이라 굵게 하지 않는다(#134)
  fontFamily: "var(--font-display)",
  fontSize: "14px",
  boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
};

/** 그린 사진 핀 하나 */
export interface DrawnPhotoPin {
  spot: MapPhotoSpot;
  overlay: KakaoCustomOverlay;
  pin: PhotoPinElement;
}

/** 그린 핀 전체. 다시 그릴 때 지우려고 들고 있는다 */
export interface DrawnPins {
  photoPins: DrawnPhotoPin[];
  recordMarkers: KakaoMarker[];
}

interface DrawPinsParams {
  maps: KakaoMaps;
  map: KakaoMap;
  clusterer: KakaoMarkerClusterer;
  pins: MapPins;
  onPressSpot: (spot: MapPhotoSpot) => void;
  onPressRecordPin: (pin: MapPin) => void;
}

/**
 * 묶음 기능을 만든다. 지도 하나에 한 번만 만들고, 핀을 다시 그릴 때는 비우고 다시 넣는다.
 *
 * @example const clusterer = createClusterer(maps, map)
 */
export const createClusterer = (maps: KakaoMaps, map: KakaoMap): KakaoMarkerClusterer =>
  new maps.MarkerClusterer({ map, gridSize: CLUSTER_GRID_SIZE, minClusterSize: 2, averageCenter: true, styles: [CLUSTER_STYLE] });

/**
 * 사진 핀(동그라미)과 기록 장소 핀을 묶음 기능에 넣고, 모든 핀이 보이게 범위를 맞춘다. 앞서 그린 핀은 지운다.
 * 사진 핀은 대표 사진 좌표 한가운데에 놓는다.
 *
 * @example drawn = drawPins({ maps, map, clusterer, pins, onPressSpot, onPressRecordPin })
 */
export const drawPins = ({ maps, map, clusterer, pins, onPressSpot, onPressRecordPin }: DrawPinsParams): DrawnPins => {
  clusterer.clear();
  const bounds = new maps.LatLngBounds();

  const photoPins = pins.photoSpots.map((spot) => {
    const position = new maps.LatLng(spot.lat, spot.lng);
    const pin = createPhotoPinElement({ label: `${spot.place} 사진 ${spot.photoIds.length}장`, count: spot.photoIds.length, onPress: () => onPressSpot(spot) });
    // clickable: 핀을 누를 때 지도의 누름(열린 칸 닫기)까지 일어나지 않게 한다
    const overlay = new maps.CustomOverlay({ position, content: pin.element, xAnchor: 0.5, yAnchor: 0.5, clickable: true });
    bounds.extend(position);
    return { spot, overlay, pin };
  });

  const recordMarkers = pins.recordPins.map((recordPin) => {
    const position = new maps.LatLng(recordPin.lat, recordPin.lng);
    const marker = new maps.Marker({ position, title: recordPin.place, clickable: true });
    maps.event.addListener(marker, "click", () => onPressRecordPin(recordPin));
    bounds.extend(position);
    return marker;
  });

  clusterer.addMarkers([...photoPins.map(({ overlay }) => overlay), ...recordMarkers]);

  // 핀 하나로 범위를 맞추면 가장 크게 확대되므로 자리만 옮기고 레벨은 그대로 둔다
  const [onlySpot] = pins.photoSpots;
  const [onlyRecordPin] = pins.recordPins;
  const onlyPin = photoPins.length + recordMarkers.length === 1 ? (onlySpot ?? onlyRecordPin) : undefined;
  if (onlyPin) map.setCenter(new maps.LatLng(onlyPin.lat, onlyPin.lng));
  else if (photoPins.length + recordMarkers.length > 1) map.setBounds(bounds);
  return { photoPins, recordMarkers };
};

/**
 * 지금 화면 안에 낱개로 보이는 사진 핀. 숫자 동그라미 안으로 들어간 핀은 묶음 기능이 지도에서 내려 두므로 빠진다.
 *
 * @example const visible = findVisiblePhotoPins(map, drawn.photoPins)
 */
export const findVisiblePhotoPins = (map: KakaoMap, photoPins: DrawnPhotoPin[]): DrawnPhotoPin[] => {
  const bounds = map.getBounds();
  return photoPins.filter(
    ({ overlay, pin }) =>
      Boolean(overlay.getMap()) &&
      bounds.contain(overlay.getPosition()) &&
      // 화면이 숨겨지는 순간(Activity) 크기가 0이 된 지도를 다시 묶으면 모든 핀이 낱개로 풀려 보인다. 실제로 그려진 핀만 센다
      pin.element.getClientRects().length > 0,
  );
};
