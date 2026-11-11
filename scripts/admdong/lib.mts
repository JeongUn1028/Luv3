import { distanceToSegmentSquared, type AdmdongFile, type AdmdongFileRegion } from "../../src/lib/places/admdong.ts";

// 원본 행정동 경계(GeoJSON)를 앱이 서버에서 읽을 작은 파일로 줄인다(#249). 만드는 방법은 build.mts 주석에 있다

/** 정수로 바꿀 때 곱하는 값. 1e5면 약 1m 단위라 줄인 모양을 거의 그대로 담는다 */
export const ADMDONG_SCALE = 100_000;
/** 경계를 줄일 때 버리는 굴곡의 크기(도). 약 10m. GPS 오차(수 m~수십 m)보다 작아 동을 고르는 데는 차이가 거의 없다 */
export const SIMPLIFY_TOLERANCE_DEGREES = 0.0001;

type Point = [number, number];

interface AdmdongProperties {
  adm_nm: string;
  sidonm: string;
  sggnm: string | null;
}

/** 원본 GeoJSON의 동 하나 */
export interface AdmdongFeature {
  properties: AdmdongProperties;
  geometry: { type: "Polygon"; coordinates: Point[][] } | { type: "MultiPolygon"; coordinates: Point[][][] };
}

/**
 * 화면에 쓸 이름을 만든다: 시·군·구 + 행정동. 일반구가 있는 시는 원본이 붙여 쓴 것을 띄어 쓴다.
 * 시·군·구가 없으면 시·도 이름을 앞에 쓴다(#249 사용자 결정).
 *
 * @example toAdmdongName({ adm_nm: "경기도 수원시영통구 매탄1동", sidonm: "경기도", sggnm: "수원시영통구" }) // "수원시 영통구 매탄1동"
 */
export const toAdmdongName = ({ adm_nm: fullName, sidonm, sggnm }: AdmdongProperties): string => {
  const dong = fullName.trim().split(/\s+/).at(-1) ?? fullName;
  const district = sggnm?.trim().replace(/^(.+시)(.+구)$/, "$1 $2");
  return `${district || sidonm.trim()} ${dong}`;
};

const distanceToLineSquared = (point: Point, start: Point, end: Point): number =>
  distanceToSegmentSquared({ x: point[0], y: point[1], x1: start[0], y1: start[1], x2: end[0], y2: end[1] });

/**
 * 더글러스-포이커로 선을 줄인다. 양 끝은 남기고, `tolerance`보다 덜 튀어나온 점을 버린다.
 *
 * @example simplifyLine([[0, 0], [1, 0.00001], [2, 0]], 0.0001) // [[0, 0], [2, 0]]
 */
export const simplifyLine = (points: Point[], tolerance: number): Point[] => {
  if (points.length <= 2) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  // 깊은 재귀를 피하려고 구간을 쌓아 두고 꺼내 쓴다(동 하나에 점이 수만 개일 수 있다)
  const stack: [number, number][] = [[0, points.length - 1]];
  const toleranceSquared = tolerance * tolerance;
  while (stack.length > 0) {
    const [first, last] = stack.pop() ?? [0, 0];
    let [farthest, farthestDistance] = [-1, toleranceSquared];
    for (let index = first + 1; index < last; index += 1) {
      const distance = distanceToLineSquared(points[index] ?? [0, 0], points[first] ?? [0, 0], points[last] ?? [0, 0]);
      if (distance > farthestDistance) [farthest, farthestDistance] = [index, distance];
    }
    if (farthest < 0) continue;
    keep[farthest] = true;
    stack.push([first, farthest], [farthest, last]);
  }
  return points.filter((_, index) => keep[index]);
};

/** 닫힌 고리를 줄인다. 첫 점에서 가장 먼 점으로 둘로 나눠 줄여야 고리가 한 점으로 무너지지 않는다 */
const simplifyRing = (ring: Point[], tolerance: number): Point[] => {
  const open = ring.slice(0, -1);
  if (open.length < 3) return ring;
  const start = open[0] ?? [0, 0];
  let farthest = 1;
  open.forEach((point, index) => {
    const current = open[farthest] ?? start;
    if ((point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2 > (current[0] - start[0]) ** 2 + (current[1] - start[1]) ** 2) farthest = index;
  });
  const firstHalf = simplifyLine(open.slice(0, farthest + 1), tolerance);
  const secondHalf = simplifyLine([...open.slice(farthest), start], tolerance);
  return [...firstHalf, ...secondHalf.slice(1)];
};

/** 정수로 바꾸고 이어진 같은 점을 지운 뒤, 첫 점 + 차이로 적는다. 넓이가 없어진 고리(점 셋 미만)는 undefined */
const encodeRing = (ring: Point[], scale: number): number[] | undefined => {
  const integers: Point[] = [];
  for (const [lng, lat] of ring) {
    const point: Point = [Math.round(lng * scale), Math.round(lat * scale)];
    const previous = integers.at(-1);
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) integers.push(point);
  }
  // 닫는 점(첫 점과 같음)까지 넷 이상이어야 삼각형 이상이다
  if (integers.length < 4) return undefined;
  return integers.flatMap(([x, y], index) => {
    const previous = integers[index - 1];
    return previous ? [x - previous[0], y - previous[1]] : [x, y];
  });
};

const toRings = (geometry: AdmdongFeature["geometry"]): Point[][] =>
  geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();

/**
 * 원본 동 하나를 앱이 읽는 모양으로 바꾼다. 줄이다 무너진 고리는 줄이지 않은 모양으로 남긴다.
 * 작은 고리를 빼면 섬이 사라지거나, 구멍(다른 동을 품은 자리)이 메워져 안쪽 동의 사진을 바깥 동으로 읽는다.
 *
 * @example const region = toAdmdongFileRegion(feature, { tolerance: SIMPLIFY_TOLERANCE_DEGREES, scale: ADMDONG_SCALE })
 */
export const toAdmdongFileRegion = (feature: AdmdongFeature, { tolerance, scale }: { tolerance: number; scale: number }): AdmdongFileRegion => {
  const sourceRings = toRings(feature.geometry);
  const rings = sourceRings
    .map((ring) => encodeRing(simplifyRing(ring, tolerance), scale) ?? encodeRing(ring, scale))
    .filter((ring) => ring !== undefined);
  const name = toAdmdongName(feature.properties);
  if (rings.length === 0) throw new Error(`${name}의 경계가 비었습니다`);
  // 점이 수십만 개인 동은 Math.min(...)에 펼치면 인자 수 제한에 걸려 하나씩 견준다
  const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of sourceRings.flat()) {
    const [x, y] = [Math.round(lng * scale), Math.round(lat * scale)];
    bbox[0] = Math.min(bbox[0], x);
    bbox[1] = Math.min(bbox[1], y);
    bbox[2] = Math.max(bbox[2], x);
    bbox[3] = Math.max(bbox[3], y);
  }
  return { name, bbox, rings };
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/**
 * 원본 GeoJSON의 동 하나가 이 스크립트가 아는 모양인지 확인한다. 새 판에서 모양이 바뀌면 어느 동인지 알려 주며 멈춘다.
 *
 * @throws {Error} 이름이 없거나 경계가 Polygon·MultiPolygon이 아닐 때
 * @example const features = geojson.features.map(toAdmdongFeature)
 */
export const toAdmdongFeature = (value: unknown, index: number): AdmdongFeature => {
  const properties = isRecord(value) && isRecord(value.properties) ? value.properties : undefined;
  const label = typeof properties?.adm_nm === "string" ? properties.adm_nm : `${index}번째 동`;
  if (typeof properties?.adm_nm !== "string" || typeof properties.sidonm !== "string") throw new Error(`${label}: 이름(adm_nm·sidonm)이 없습니다`);
  const geometry = isRecord(value) && isRecord(value.geometry) ? value.geometry : undefined;
  if ((geometry?.type !== "Polygon" && geometry?.type !== "MultiPolygon") || !Array.isArray(geometry.coordinates)) {
    throw new Error(`${label}: 경계가 Polygon·MultiPolygon이 아닙니다(${String(geometry?.type)})`);
  }
  return value as unknown as AdmdongFeature;
};

/**
 * 원본 GeoJSON 전체를 앱이 읽는 경계 파일로 바꾼다.
 *
 * @example const file = toAdmdongFile({ features, source: "vuski/admdongkor ver20261001" })
 */
export const toAdmdongFile = ({ features, source }: { features: AdmdongFeature[]; source: string }): AdmdongFile => ({
  source,
  scale: ADMDONG_SCALE,
  regions: features.map((feature) => toAdmdongFileRegion(feature, { tolerance: SIMPLIFY_TOLERANCE_DEGREES, scale: ADMDONG_SCALE })),
});
