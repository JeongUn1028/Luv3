import { describe, expect, it } from "vitest";
import { decodeAdmdongBoundaries, findAdmdongName } from "../../src/lib/places/admdong.ts";
import { simplifyLine, toAdmdongFeature, toAdmdongFile, toAdmdongFileRegion, toAdmdongName, type AdmdongFeature } from "./lib.mts";

type Point = [number, number];

const feature = (coordinates: Point[][][], name = "서울특별시 성동구 성수1가1동", sggnm: string | null = "성동구"): AdmdongFeature => ({
  properties: { adm_nm: name, sidonm: name.split(" ")[0] ?? "", sggnm },
  geometry: { type: "MultiPolygon", coordinates },
});

const closed = (points: Point[]): Point[] => [...points, points[0] ?? [0, 0]];

describe("toAdmdongName", () => {
  it("시·군·구와 행정동을 붙인다", () => {
    expect(toAdmdongName({ adm_nm: "서울특별시 성동구 성수1가1동", sidonm: "서울특별시", sggnm: "성동구" })).toBe("성동구 성수1가1동");
  });

  it("일반구가 있는 시는 시와 구를 띄어 쓴다", () => {
    expect(toAdmdongName({ adm_nm: "경기도 수원시영통구 매탄1동", sidonm: "경기도", sggnm: "수원시영통구" })).toBe("수원시 영통구 매탄1동");
  });

  it("시·군·구가 없으면 시·도 이름을 앞에 쓴다", () => {
    expect(toAdmdongName({ adm_nm: "세종특별자치시 한솔동", sidonm: "세종특별자치시", sggnm: null })).toBe("세종특별자치시 한솔동");
  });
});

describe("simplifyLine", () => {
  it("기준보다 덜 튀어나온 점은 버리고 더 튀어나온 점은 남긴다", () => {
    const points: Point[] = [
      [0, 0],
      [1, 0.00005],
      [2, 0],
      [3, 0.01],
      [4, 0],
    ];
    expect(simplifyLine(points, 0.0001)).toEqual([
      [0, 0],
      [2, 0],
      [3, 0.01],
      [4, 0],
    ]);
  });
});

describe("toAdmdongFileRegion", () => {
  const options = { tolerance: 0.0001, scale: 100_000 };

  it("정수 좌표의 첫 점 + 차이로 적고 범위를 함께 남긴다", () => {
    // Arrange
    const ring = closed([
      [127, 37],
      [127.01, 37],
      [127.01, 37.01],
      [127, 37.01],
    ]);

    // Act
    const region = toAdmdongFileRegion(feature([[ring]]), options);

    // Assert
    expect(region).toEqual({
      name: "성동구 성수1가1동",
      bbox: [12_700_000, 3_700_000, 12_701_000, 3_701_000],
      rings: [[12_700_000, 3_700_000, 1000, 0, 0, 1000, -1000, 0, 0, -1000]],
    });
  });

  it("줄이다 무너진 작은 섬은 줄이지 않은 모양으로 남긴다", () => {
    // Arrange: 큰 동 + 2m짜리 섬
    const big = closed([
      [127, 37],
      [127.01, 37],
      [127.01, 37.01],
      [127, 37.01],
    ]);
    const tiny = closed([
      [127.02, 37.02],
      [127.02002, 37.02],
      [127.02002, 37.02002],
      [127.02, 37.02002],
    ]);

    // Act
    const region = toAdmdongFileRegion(feature([[big], [tiny]]), { ...options, tolerance: 0.001 });

    // Assert
    expect(region.rings).toHaveLength(2);
  });

  // 구멍을 빼면 바깥 동이 그 자리를 덮어, 바깥 동이 파일에서 먼저 나오면 안쪽 동의 사진을 바깥 동으로 읽는다
  it("줄이다 무너진 구멍을 남겨 다른 동에 둘러싸인 동을 찾는다", () => {
    // Arrange
    const outer = closed([
      [127, 37],
      [127.01, 37],
      [127.01, 37.01],
      [127, 37.01],
    ]);
    const hole = closed([
      [127.005, 37.005],
      [127.0052, 37.005],
      [127.0052, 37.0052],
      [127.005, 37.0052],
    ]);
    const features = [feature([[outer, hole]], "서울특별시 바깥구 가동", "바깥구"), feature([[hole]], "서울특별시 바깥구 안동", "바깥구")];

    // Act
    const file = toAdmdongFile({ features, source: "테스트" });
    const name = findAdmdongName(decodeAdmdongBoundaries(file), { lat: 37.0051, lng: 127.0051 });

    // Assert
    expect(name).toBe("바깥구 안동");
  });
});

describe("toAdmdongFeature", () => {
  it("이름이나 경계 모양이 다르면 어느 동인지 알려 주며 멈춘다", () => {
    expect(() => toAdmdongFeature({ properties: { adm_nm: "가동", sidonm: "서울" }, geometry: null }, 0)).toThrow("가동");
    expect(() => toAdmdongFeature({ properties: { adm_nm: "가동", sidonm: "서울" }, geometry: { type: "GeometryCollection" } }, 0)).toThrow("GeometryCollection");
    expect(() => toAdmdongFeature({ properties: {}, geometry: { type: "Polygon", coordinates: [] } }, 3)).toThrow("3번째 동");
  });
});

describe("toAdmdongFile", () => {
  it("만든 파일로 앱이 같은 동을 찾는다", () => {
    // Arrange
    const ring = closed([
      [127.03, 37.54],
      [127.05, 37.54],
      [127.05, 37.55],
      [127.03, 37.55],
    ]);
    const file = toAdmdongFile({ features: [feature([[ring]])], source: "vuski/admdongkor ver20261001" });

    // Act
    const name = findAdmdongName(decodeAdmdongBoundaries(file), { lat: 37.5444, lng: 127.0396 });

    // Assert
    expect(file.source).toBe("vuski/admdongkor ver20261001");
    expect(name).toBe("성동구 성수1가1동");
  });
});
