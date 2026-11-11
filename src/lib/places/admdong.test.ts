import { describe, expect, it } from "vitest";
import { AdmdongFileError, decodeAdmdongBoundaries, findAdmdongName, type AdmdongFile } from "./admdong";

const SCALE = 100_000;

/** 경도·위도(도) 꼭짓점으로 파일의 고리를 만든다(첫 점 + 차이, 닫는 점 포함) */
const toRing = (points: [number, number][]): number[] => {
  const closed = [...points, points[0] ?? [0, 0]].map(([lng, lat]) => [Math.round(lng * SCALE), Math.round(lat * SCALE)] as const);
  return closed.flatMap(([x, y], index) => {
    const previous = closed[index - 1];
    return previous ? [x - previous[0], y - previous[1]] : [x, y];
  });
};

const square = (west: number, south: number, size: number): [number, number][] => [
  [west, south],
  [west + size, south],
  [west + size, south + size],
  [west, south + size],
];

const toBbox = (points: [number, number][]): [number, number, number, number] => {
  const xs = points.map(([lng]) => Math.round(lng * SCALE));
  const ys = points.map(([, lat]) => Math.round(lat * SCALE));
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

// 가운데에 구멍(안쪽 동)이 있는 바깥 동과 그 오른쪽에 붙은 동
const OUTER = square(127, 37, 0.01);
const HOLE = square(127.004, 37.004, 0.002);
const EAST = square(127.01, 37, 0.01);
const FILE: AdmdongFile = {
  source: "테스트",
  scale: SCALE,
  regions: [
    { name: "바깥구 가동", bbox: toBbox(OUTER), rings: [toRing(OUTER), toRing(HOLE)] },
    { name: "바깥구 안동", bbox: toBbox(HOLE), rings: [toRing(HOLE)] },
    { name: "옆구 나동", bbox: toBbox(EAST), rings: [toRing(EAST)] },
  ],
};

describe("findAdmdongName", () => {
  const boundaries = decodeAdmdongBoundaries(FILE);

  it("좌표가 든 동의 이름을 돌려준다", () => {
    expect(findAdmdongName(boundaries, { lat: 37.001, lng: 127.001 })).toBe("바깥구 가동");
    expect(findAdmdongName(boundaries, { lat: 37.005, lng: 127.015 })).toBe("옆구 나동");
  });

  it("다른 동에 둘러싸인 동은 바깥 동의 구멍으로 보아 안쪽 동을 돌려준다", () => {
    expect(findAdmdongName(boundaries, { lat: 37.005, lng: 127.005 })).toBe("바깥구 안동");
  });

  it("경계 바로 밖(약 50m 안)이면 가장 가까운 동으로 본다", () => {
    // 남쪽 경계에서 약 33m 아래
    expect(findAdmdongName(boundaries, { lat: 36.9997, lng: 127.002 })).toBe("바깥구 가동");
  });

  // 위도 37도에서 경도 0.00055도는 약 49m, 0.0006도는 약 53m다
  it("경계 밖 거리는 경도 방향도 실제 거리(약 50m)로 잰다", () => {
    expect(findAdmdongName(boundaries, { lat: 37.005, lng: 126.99945 })).toBe("바깥구 가동");
    expect(findAdmdongName(boundaries, { lat: 37.005, lng: 126.9994 })).toBeUndefined();
  });

  // 이웃 동을 따로 줄이면 경계가 몇 m 겹친다. 파일 순서가 아니라 더 안쪽에 있는 동을 고른다
  it("두 동의 경계가 겹친 곳에서는 경계에서 더 안쪽에 있는 동을 고른다", () => {
    // Arrange: 서쪽 동의 동쪽 끝과 동쪽 동의 서쪽 끝이 0.0001도 겹친다. 동쪽 동이 파일에서 먼저 나온다
    const west = square(127, 37, 0.01);
    const east = square(127.0099, 37, 0.01);
    const overlapping = decodeAdmdongBoundaries({
      ...FILE,
      regions: [
        { name: "옆구 동쪽동", bbox: toBbox(east), rings: [toRing(east)] },
        { name: "옆구 서쪽동", bbox: toBbox(west), rings: [toRing(west)] },
      ],
    });

    // Act & Assert: 서쪽 동 경계까지 0.00008도, 동쪽 동 경계까지 0.00002도
    expect(findAdmdongName(overlapping, { lat: 37.005, lng: 127.00992 })).toBe("옆구 서쪽동");
  });

  it("경계에서 멀면(해외·먼바다) undefined를 돌려준다", () => {
    expect(findAdmdongName(boundaries, { lat: 36.99, lng: 127.002 })).toBeUndefined();
    expect(findAdmdongName(boundaries, { lat: 48.8584, lng: 2.2945 })).toBeUndefined();
  });
});

describe("decodeAdmdongBoundaries", () => {
  it("모양이 다르면 실패를 던진다", () => {
    expect(() => decodeAdmdongBoundaries({ regions: [] })).toThrow(AdmdongFileError);
    expect(() => decodeAdmdongBoundaries({ ...FILE, regions: [{ ...FILE.regions[0], name: " " }] })).toThrow(AdmdongFileError);
    expect(() => decodeAdmdongBoundaries({ ...FILE, regions: [{ ...FILE.regions[0], bbox: [1, 2, 3] }] })).toThrow(AdmdongFileError);
    expect(() => decodeAdmdongBoundaries({ ...FILE, regions: [{ ...FILE.regions[0], rings: [[1, 2, 3, 4, 5, 6]] }] })).toThrow(AdmdongFileError);
    expect(() => decodeAdmdongBoundaries({ ...FILE, regions: [{ ...FILE.regions[0], rings: [] }] })).toThrow(AdmdongFileError);
  });
});
