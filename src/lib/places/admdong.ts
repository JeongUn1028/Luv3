import type { PlaceLocation } from "./location";

// 행정동 경계로 좌표의 동네 이름을 찾는다(#249). 카카오 로컬 API 결과는 저장할 수 없어(약관) 공개 경계 데이터로 계산한다.
// 경계 파일은 scripts/admdong/build.mts가 만든다. 데이터 출처: 통계청 SGIS 행정동 경계(공공누리 제1유형)를 vuski/admdongkor가 가공(CC BY 4.0)

/**
 * 경계 파일(`data/admdong-boundaries.json`)의 모양. 좌표는 `scale`을 곱한 정수이고,
 * 고리(ring)마다 첫 점은 그대로, 다음 점부터는 앞 점과의 차이를 `[x, y, dx, dy, …]`로 적는다(x는 경도, y는 위도).
 */
export interface AdmdongFile {
  /** 원본 판. 예: `vuski/admdongkor ver20261001` */
  source: string;
  scale: number;
  regions: AdmdongFileRegion[];
}

export interface AdmdongFileRegion {
  /** 화면에 쓸 이름. 예: `성동구 성수1가1동` */
  name: string;
  /** `[최소 x, 최소 y, 최대 x, 최대 y]` (정수 좌표) */
  bbox: [number, number, number, number];
  rings: number[][];
}

/**
 * 리포에 둔 경계 파일의 원본 판. 설정 화면의 출처 문구가 쓰고, 파일의 `source`와 같은지 테스트가 본다(admdong-server.test.ts).
 * 새 판으로 다시 만들면 함께 고친다
 */
export const ADMDONG_SOURCE = "vuski/admdongkor ver20261001";

/** 찾기 좋게 풀어 둔 동 하나. 고리는 절대 정수 좌표 `[x0, y0, x1, y1, …]` */
interface Region {
  name: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  rings: Int32Array[];
}

/** 풀어 둔 경계 */
export interface AdmdongBoundaries {
  scale: number;
  regions: Region[];
}

/**
 * 경계 바로 밖에 찍힌 사진도 가까운 동으로 본다(도). 경계를 줄이면서 이웃 동 사이에 생긴 틈과
 * 줄어든 해안선 바로 밖(항구·해변)을 메운다. 위도 0.00045도는 약 50m
 */
const NEAR_DEGREES = 0.00045;

/** 경계 파일이 잘못됐을 때. 빌드에 실린 파일이 깨진 것이라 서버 오류로 본다 */
export class AdmdongFileError extends Error {
  constructor(message: string) {
    super(`행정동 경계 파일이 잘못됐습니다: ${message}`);
    this.name = "AdmdongFileError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isIntegerArray = (value: unknown): value is number[] => Array.isArray(value) && value.every(Number.isInteger);

const decodeRing = (ring: number[]): Int32Array => {
  const points = new Int32Array(ring.length);
  let [x, y] = [0, 0];
  for (let index = 0; index < ring.length; index += 2) {
    x = index === 0 ? (ring[0] ?? 0) : x + (ring[index] ?? 0);
    y = index === 0 ? (ring[1] ?? 0) : y + (ring[index + 1] ?? 0);
    points[index] = x;
    points[index + 1] = y;
  }
  return points;
};

const decodeRegion = (region: unknown, index: number): Region => {
  if (!isRecord(region) || typeof region.name !== "string" || region.name.trim() === "") throw new AdmdongFileError(`${index}번째 동의 이름`);
  const { bbox, rings } = region;
  if (!isIntegerArray(bbox) || bbox.length !== 4) throw new AdmdongFileError(`${region.name}의 범위`);
  // 고리는 점 셋 이상(닫는 점 포함 넷)이어야 넓이가 있다
  if (!Array.isArray(rings) || rings.length === 0 || !rings.every((ring) => isIntegerArray(ring) && ring.length >= 8 && ring.length % 2 === 0)) {
    throw new AdmdongFileError(`${region.name}의 경계`);
  }
  const [minX = 0, minY = 0, maxX = 0, maxY = 0] = bbox;
  return { name: region.name, minX, minY, maxX, maxY, rings: rings.map(decodeRing) };
};

/**
 * 경계 파일 내용을 찾기 좋은 모양으로 푼다. 서버가 처음 한 번만 부른다.
 *
 * @throws {AdmdongFileError} 파일 모양이 다를 때
 * @example const boundaries = decodeAdmdongBoundaries(JSON.parse(text))
 */
export const decodeAdmdongBoundaries = (file: unknown): AdmdongBoundaries => {
  if (!isRecord(file) || typeof file.scale !== "number" || !(file.scale > 0) || !Array.isArray(file.regions)) throw new AdmdongFileError("전체 모양");
  return { scale: file.scale, regions: file.regions.map(decodeRegion) };
};

/** 짝홀 규칙: 점에서 오른쪽으로 그은 선이 경계를 홀수 번 지나면 안이다. 구멍(다른 동을 품은 동)도 함께 맞게 센다 */
const containsPoint = (region: Region, x: number, y: number): boolean => {
  let isInside = false;
  for (const ring of region.rings) {
    for (let index = 0, previous = ring.length - 2; index < ring.length; previous = index, index += 2) {
      const [x1, y1, x2, y2] = [ring[index] ?? 0, ring[index + 1] ?? 0, ring[previous] ?? 0, ring[previous + 1] ?? 0];
      if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) isInside = !isInside;
    }
  }
  return isInside;
};

/**
 * 점에서 선분까지 거리의 제곱. 경계를 줄이는 스크립트(scripts/admdong/lib.mts)도 같은 계산을 쓴다.
 *
 * @example distanceToSegmentSquared({ x: 0, y: 1, x1: -1, y1: 0, x2: 1, y2: 0 }) // 1
 */
export const distanceToSegmentSquared = ({ x, y, x1, y1, x2, y2 }: { x: number; y: number; x1: number; y1: number; x2: number; y2: number }): number => {
  const [dx, dy] = [x2 - x1, y2 - y1];
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
  const [nearX, nearY] = [x1 + ratio * dx, y1 + ratio * dy];
  return (x - nearX) ** 2 + (y - nearY) ** 2;
};

/** 경계까지 거리의 제곱(위도 기준 단위). 경도 1도는 위도 1도보다 짧아(cos 위도배) 경도 차이를 줄여 잰다 */
const distanceToRegionSquared = ({ region, x, y, longitudeRatio }: { region: Region; x: number; y: number; longitudeRatio: number }): number => {
  let nearest = Number.POSITIVE_INFINITY;
  for (const ring of region.rings) {
    for (let index = 2; index < ring.length; index += 2) {
      const segment = {
        x: x * longitudeRatio,
        y,
        x1: (ring[index - 2] ?? 0) * longitudeRatio,
        y1: ring[index - 1] ?? 0,
        x2: (ring[index] ?? 0) * longitudeRatio,
        y2: ring[index + 1] ?? 0,
      };
      nearest = Math.min(nearest, distanceToSegmentSquared(segment));
    }
  }
  return nearest;
};

const isInBox = (region: Region, x: number, y: number, margin: number): boolean =>
  x >= region.minX - margin && x <= region.maxX + margin && y >= region.minY - margin && y <= region.maxY + margin;

/**
 * 좌표가 든 행정동 이름을 찾는다. 경계 바로 밖(약 50m 안)이면 가장 가까운 동으로 보고, 그보다 멀면(해외·먼바다) undefined.
 * 이웃 동을 따로 줄여 경계가 조금 겹친 곳에서는 경계에서 더 안쪽에 있는 동을 고른다.
 *
 * @example findAdmdongName(boundaries, { lat: 37.5444, lng: 127.0396 }) // "성동구 성수1가1동"
 */
export const findAdmdongName = ({ scale, regions }: AdmdongBoundaries, { lat, lng }: PlaceLocation): string | undefined => {
  const [x, y] = [lng * scale, lat * scale];
  const longitudeRatio = Math.cos((lat * Math.PI) / 180);
  const margin = NEAR_DEGREES * scale;
  // 경도 방향 여유는 위도 방향과 같은 거리가 되게 넓힌다
  const boxMargin = margin / Math.max(longitudeRatio, 0.01);
  const containing: Region[] = [];
  const nearCandidates: Region[] = [];
  for (const region of regions) {
    if (!isInBox(region, x, y, boxMargin)) continue;
    if (isInBox(region, x, y, 0) && containsPoint(region, x, y)) containing.push(region);
    else nearCandidates.push(region);
  }
  if (containing.length === 1) return containing[0]?.name;
  const distances = (containing.length > 0 ? containing : nearCandidates).map((region) => ({
    name: region.name,
    distance: distanceToRegionSquared({ region, x, y, longitudeRatio }),
  }));
  if (containing.length > 1) return distances.reduce((deepest, current) => (current.distance > deepest.distance ? current : deepest)).name;
  return distances.filter(({ distance }) => distance <= margin * margin).sort((left, right) => left.distance - right.distance)[0]?.name;
};
