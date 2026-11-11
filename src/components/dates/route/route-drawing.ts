import type { PhotoRoute } from "@/lib/dates/route";
import type { KakaoMap, KakaoMaps } from "@/lib/map/kakao-sdk";

/**
 * 날마다의 선 색(#251 시안). 카카오가 선을 SVG 속성으로 그려 CSS 변수를 쓸 수 없어 색 값을 직접 둔다.
 * 밝은 지도 위에서 잘 보이고, 날짜 설명(어두운 바탕)에서도 구분되도록 밝기를 조금씩 달리 골랐다. 날이 더 많으면 처음 색부터 다시 쓴다
 */
const ROUTE_LINE_COLORS = ["#d6457a", "#2f6fde", "#e08a1e", "#2a9d6e"] as const;
const [FIRST_LINE_COLOR] = ROUTE_LINE_COLORS;

/** 선 굵기(px)와 범위를 맞출 때 가장자리 여백(px). 번호 점(24px)이 잘리지 않을 만큼 */
const LINE_WEIGHT = 4;
const BOUNDS_PADDING = 28;

/**
 * 몇 번째 날의 선 색.
 *
 * @example getRouteLineColor(1) // "#2f6fde"
 */
export const getRouteLineColor = (lineIndex: number): string => ROUTE_LINE_COLORS[lineIndex % ROUTE_LINE_COLORS.length] ?? FIRST_LINE_COLOR;

/** 번호 점 요소. 카카오 지도의 CustomOverlay 안에 들어가 React가 그리지 않으므로 DOM으로 직접 만든다. 순서는 지도 아래 목록이 읽어 준다 */
const createPointElement = (number: number, color: string): HTMLSpanElement => {
  const element = document.createElement("span");
  element.ariaHidden = "true";
  element.className =
    "flex size-6 items-center justify-center rounded-full border-2 border-white font-display text-[13px] text-white shadow-[0_1px_4px_rgba(0,0,0,0.35)]";
  element.style.backgroundColor = color;
  element.textContent = number.toString();
  return element;
};

/**
 * 동선(날마다의 선과 번호 점)을 지도에 그리고, 모든 점이 보이게 범위를 맞춘다. 돌려준 함수를 부르면 지운다.
 * 점은 번호가 클수록 위에 놓여, 같은 자리에 다시 들렀을 때 나중 번호가 보인다.
 * 점이 모두 같은 좌표면(날마다 같은 자리에서만 찍은 여행) 넓이 없는 범위에 맞추면 가장 크게 확대되므로 그 자리로 옮기기만 한다.
 *
 * @example useEffect(() => kakao && drawRoute({ ...kakao, route }), [kakao, route])
 */
export const drawRoute = ({ maps, map, route }: { maps: KakaoMaps; map: KakaoMap; route: PhotoRoute }): (() => void) => {
  const toLatLng = ({ lat, lng }: { lat: number; lng: number }) => new maps.LatLng(lat, lng);

  const polylines = route.lines
    .map((line, lineIndex) => ({ path: line.path, color: getRouteLineColor(lineIndex) }))
    // 첫날 점이 하나뿐이면 이을 선이 없다. 그날은 점 색으로만 보인다(다음 날 줄은 전날 마지막 점에서 시작해 늘 둘 이상이다)
    .filter(({ path }) => path.length > 1)
    .map(({ path, color }) => new maps.Polyline({ path: path.map(toLatLng), strokeWeight: LINE_WEIGHT, strokeColor: color, strokeOpacity: 0.9 }));

  const bounds = new maps.LatLngBounds();
  const overlays = route.points.map((point) => {
    const position = toLatLng(point);
    bounds.extend(position);
    return new maps.CustomOverlay({
      position,
      content: createPointElement(point.number, getRouteLineColor(point.lineIndex)),
      xAnchor: 0.5,
      yAnchor: 0.5,
      clickable: false,
      zIndex: point.number,
    });
  });

  [...polylines, ...overlays].forEach((shape) => shape.setMap(map));
  // 숨겨졌다 돌아온 화면은 지도가 크기를 다시 재기 전에 여기로 올 수 있어, 범위를 맞추기 전에 잰다
  map.relayout();
  const [firstPoint] = route.points;
  const isSingleSpot = route.points.every(({ lat, lng }) => lat === firstPoint?.lat && lng === firstPoint.lng);
  if (firstPoint && isSingleSpot) map.setCenter(toLatLng(firstPoint));
  else map.setBounds(bounds, BOUNDS_PADDING, BOUNDS_PADDING, BOUNDS_PADDING, BOUNDS_PADDING);
  return () => [...polylines, ...overlays].forEach((shape) => shape.setMap(null));
};
