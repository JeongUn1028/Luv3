import { describe, expect, it } from "vitest";
import { buildPhotoRoute, type RoutePhotoRow } from "./route";

const SEONGSU = { lat: 37.5444, lng: 127.0396 };
const SEOUL_FOREST = { lat: 37.5443, lng: 127.0374 };
const TTUKSEOM = { lat: 37.5317, lng: 127.0667 };
/** 위도 0.0001도는 약 11m */
const NEARBY_LAT = SEONGSU.lat + 0.0003;

const createPhotoRow = (overrides: Partial<RoutePhotoRow> = {}): RoutePhotoRow => ({
  id: "p1",
  sort_order: 0,
  place: "성동구 성수2가3동",
  place_lat: SEONGSU.lat,
  place_lng: SEONGSU.lng,
  taken_at: null,
  ...overrides,
});

const toRow = ({ lat, lng }: { lat: number; lng: number }): Pick<RoutePhotoRow, "place_lat" | "place_lng"> => ({ place_lat: lat, place_lng: lng });

const getPointIds = (route: ReturnType<typeof buildPhotoRoute>): string[][] => route?.points.map(({ photoIds }) => photoIds) ?? [];

describe("buildPhotoRoute", () => {
  it("위치가 있는 사진이 모두 찍은 시각을 가지면 앨범 순서와 상관없이 찍은 시각 순서로 잇는다", () => {
    // Arrange
    const rows = [
      createPhotoRow({ id: "p1", sort_order: 0, taken_at: "2026-11-08T07:00:00+00:00" }),
      createPhotoRow({ id: "p2", sort_order: 1, ...toRow(SEOUL_FOREST), taken_at: "2026-11-08T05:00:00+00:00" }),
      createPhotoRow({ id: "p3", sort_order: 2, ...toRow(TTUKSEOM), taken_at: "2026-11-08T06:00:00+00:00" }),
    ];

    // Act
    const route = buildPhotoRoute(rows);

    // Assert
    expect(route?.order).toBe("takenAt");
    expect(route?.points.map(({ number, photoIds }) => [number, photoIds])).toEqual([
      [1, ["p2"]],
      [2, ["p3"]],
      [3, ["p1"]],
    ]);
  });

  it("위치가 있는 사진 중 하나라도 찍은 시각이 없으면 앨범 순서로 잇고 한 줄로 그린다", () => {
    // Arrange
    const rows = [
      createPhotoRow({ id: "p1", sort_order: 1, taken_at: "2026-11-08T05:00:00+00:00" }),
      createPhotoRow({ id: "p2", sort_order: 0, ...toRow(SEOUL_FOREST), taken_at: null }),
      createPhotoRow({ id: "p3", sort_order: 2, ...toRow(TTUKSEOM), taken_at: "2026-11-09T05:00:00+00:00" }),
    ];

    // Act
    const route = buildPhotoRoute(rows);

    // Assert
    expect(route?.order).toBe("album");
    expect(getPointIds(route)).toEqual([["p2"], ["p1"], ["p3"]]);
    expect(route?.lines).toEqual([{ date: undefined, path: [SEOUL_FOREST, SEONGSU, TTUKSEOM] }]);
  });

  it("찍은 시각이 모두 없으면 앨범 순서로 잇는다", () => {
    // Arrange
    const rows = [createPhotoRow({ id: "p1", sort_order: 1 }), createPhotoRow({ id: "p2", sort_order: 0, ...toRow(TTUKSEOM) })];

    // Act
    const route = buildPhotoRoute(rows);

    // Assert
    expect(route?.order).toBe("album");
    expect(getPointIds(route)).toEqual([["p2"], ["p1"]]);
  });

  it("위치가 없는 사진은 빼고, 시각 순서를 고를 때도 세지 않는다", () => {
    // Arrange
    const rows = [
      createPhotoRow({ id: "p1", sort_order: 0, taken_at: "2026-11-08T06:00:00+00:00" }),
      createPhotoRow({ id: "p2", sort_order: 1, place: null, place_lat: null, place_lng: null, taken_at: null }),
      createPhotoRow({ id: "p3", sort_order: 2, ...toRow(TTUKSEOM), taken_at: "2026-11-08T05:00:00+00:00" }),
    ];

    // Act
    const route = buildPhotoRoute(rows);

    // Assert
    expect(route?.order).toBe("takenAt");
    expect(getPointIds(route)).toEqual([["p3"], ["p1"]]);
  });

  it("50m 안에서 연달아 찍은 사진은 점 하나로 합치고, 다른 곳에 들렀다 돌아오면 새 점으로 센다", () => {
    // Arrange
    const rows = [
      createPhotoRow({ id: "p1", sort_order: 0 }),
      createPhotoRow({ id: "p2", sort_order: 1, place_lat: NEARBY_LAT }),
      createPhotoRow({ id: "p3", sort_order: 2, ...toRow(TTUKSEOM) }),
      createPhotoRow({ id: "p4", sort_order: 3 }),
    ];

    // Act
    const route = buildPhotoRoute(rows);

    // Assert
    expect(route?.points).toEqual([
      { number: 1, ...SEONGSU, place: "성동구 성수2가3동", photoIds: ["p1", "p2"], lineIndex: 0 },
      { number: 2, ...TTUKSEOM, place: "성동구 성수2가3동", photoIds: ["p3"], lineIndex: 0 },
      { number: 3, ...SEONGSU, place: "성동구 성수2가3동", photoIds: ["p4"], lineIndex: 0 },
    ]);
  });

  it("장소 이름이 없는 사진의 점은 '찍은 곳'으로 부른다", () => {
    // Arrange
    const rows = [createPhotoRow({ id: "p1", place: null }), createPhotoRow({ id: "p2", sort_order: 1, ...toRow(TTUKSEOM) })];

    // Act
    const route = buildPhotoRoute(rows);

    // Assert
    expect(route?.points[0]?.place).toBe("찍은 곳");
  });

  it("여러 날 기록은 한국 날짜로 줄을 나누고, 다음 날 줄은 전날 마지막 점에서 시작하며 번호는 이어 센다", () => {
    // Arrange: 11-08 23:30과 11-09 00:10(한국 시각)은 UTC로는 같은 날이다
    const rows = [
      createPhotoRow({ id: "p1", sort_order: 0, taken_at: "2026-11-08T05:00:00+00:00" }),
      createPhotoRow({ id: "p2", sort_order: 1, ...toRow(SEOUL_FOREST), taken_at: "2026-11-08T14:30:00+00:00" }),
      createPhotoRow({ id: "p3", sort_order: 2, ...toRow(TTUKSEOM), taken_at: "2026-11-08T15:10:00+00:00" }),
    ];

    // Act
    const route = buildPhotoRoute(rows);

    // Assert
    expect(route?.points.map(({ number, lineIndex }) => [number, lineIndex])).toEqual([
      [1, 0],
      [2, 0],
      [3, 1],
    ]);
    expect(route?.lines).toEqual([
      { date: "2026-11-08", path: [SEONGSU, SEOUL_FOREST] },
      { date: "2026-11-09", path: [SEOUL_FOREST, TTUKSEOM] },
    ]);
  });

  it("날이 바뀌면 같은 자리에서 찍었어도 점을 합치지 않는다", () => {
    // Arrange
    const rows = [
      createPhotoRow({ id: "p1", sort_order: 0, taken_at: "2026-11-08T13:00:00+00:00" }),
      createPhotoRow({ id: "p2", sort_order: 1, taken_at: "2026-11-09T00:00:00+00:00" }),
    ];

    // Act
    const route = buildPhotoRoute(rows);

    // Assert
    expect(getPointIds(route)).toEqual([["p1"], ["p2"]]);
    expect(route?.lines.map(({ date }) => date)).toEqual(["2026-11-08", "2026-11-09"]);
  });

  it("찍은 시각이 같으면 앨범 순서로 정한다", () => {
    // Arrange
    const takenAt = "2026-11-08T05:00:00+00:00";
    const rows = [
      createPhotoRow({ id: "p1", sort_order: 1, taken_at: takenAt }),
      createPhotoRow({ id: "p2", sort_order: 0, ...toRow(TTUKSEOM), taken_at: takenAt }),
    ];

    // Act
    const route = buildPhotoRoute(rows);

    // Assert
    expect(getPointIds(route)).toEqual([["p2"], ["p1"]]);
  });

  it("이을 점이 둘 미만이면 동선을 만들지 않는다", () => {
    // Arrange
    const onePhoto = [createPhotoRow()];
    const sameSpot = [createPhotoRow({ id: "p1" }), createPhotoRow({ id: "p2", sort_order: 1, place_lat: NEARBY_LAT })];
    const noLocation = [createPhotoRow({ place: null, place_lat: null, place_lng: null }), createPhotoRow({ id: "p2", place: null, place_lat: null, place_lng: null })];

    // Act
    const routes = [buildPhotoRoute(onePhoto), buildPhotoRoute(sameSpot), buildPhotoRoute(noLocation), buildPhotoRoute([])];

    // Assert
    expect(routes).toEqual([undefined, undefined, undefined, undefined]);
  });
});
