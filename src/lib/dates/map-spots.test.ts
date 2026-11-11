import { describe, expect, it } from "vitest";
import { getDistanceMeters, toPhotoSpots, type MapPhotoRow } from "./map-spots";

const SEONGSU = { lat: 37.5444, lng: 127.0396 };
/** 위도 0.0001도는 약 11m */
const METERS_PER_LAT_STEP = 11.1;

const createPhotoRow = (overrides: Partial<MapPhotoRow> = {}): MapPhotoRow => ({
  id: "p1",
  date_id: "r1",
  sort_order: 0,
  place: "성동구 성수1가1동",
  place_lat: SEONGSU.lat,
  place_lng: SEONGSU.lng,
  record: { date: "2026-11-01", created_at: "2026-11-01T10:00:00+00:00" },
  ...overrides,
});

const northOf = (meters: number): number => SEONGSU.lat + (meters / METERS_PER_LAT_STEP) * 0.0001;

describe("getDistanceMeters", () => {
  it("남북으로 위도 0.0004도 떨어진 두 곳은 약 44m다", () => {
    expect(getDistanceMeters(SEONGSU, { lat: SEONGSU.lat + 0.0004, lng: SEONGSU.lng })).toBeCloseTo(44.5, 0);
  });

  it("같은 좌표는 0m다", () => {
    expect(getDistanceMeters(SEONGSU, SEONGSU)).toBe(0);
  });
});

describe("toPhotoSpots", () => {
  it("50m 안에서 찍은 사진은 한 자리로 묶고, 대표 사진 좌표에 핀을 꽂는다", () => {
    // Arrange
    const rows = [createPhotoRow({ id: "p1" }), createPhotoRow({ id: "p2", sort_order: 1, place_lat: northOf(40) })];

    // Act
    const spots = toPhotoSpots(rows);

    // Assert
    expect(spots).toEqual([{ key: "p1", lat: SEONGSU.lat, lng: SEONGSU.lng, place: "성동구 성수1가1동", photoIds: ["p1", "p2"] }]);
  });

  it("50m보다 멀면 자리를 나눈다", () => {
    const rows = [createPhotoRow({ id: "p1" }), createPhotoRow({ id: "p2", sort_order: 1, place_lat: northOf(60) })];
    expect(toPhotoSpots(rows).map(({ photoIds }) => photoIds)).toEqual([["p1"], ["p2"]]);
  });

  it("칸 경계를 사이에 둔 가까운 사진도 한 자리로 묶는다", () => {
    // Arrange: 0.0009도 칸의 경계 바로 양쪽
    const boundary = Math.ceil(SEONGSU.lat / 0.0009) * 0.0009;
    const rows = [createPhotoRow({ id: "p1", place_lat: boundary - 0.00001 }), createPhotoRow({ id: "p2", sort_order: 1, place_lat: boundary + 0.00001 })];

    // Act & Assert
    expect(toPhotoSpots(rows).map(({ photoIds }) => photoIds)).toEqual([["p1", "p2"]]);
  });

  it("최근 기록의 사진부터, 같은 기록 안에서는 사진 순서대로 담아 대표 사진은 가장 최근 기록의 첫 사진이다", () => {
    // Arrange
    const older = { date: "2026-03-14", created_at: "2026-03-14T10:00:00+00:00" };
    const newer = { date: "2026-11-10", created_at: "2026-11-10T10:00:00+00:00" };
    const rows = [
      createPhotoRow({ id: "예전", date_id: "r-old", record: older }),
      createPhotoRow({ id: "최근 둘째", date_id: "r-new", sort_order: 1, record: newer, place: "둘째 이름" }),
      createPhotoRow({ id: "최근 첫째", date_id: "r-new", sort_order: 0, record: newer, place: "첫째 이름" }),
    ];

    // Act
    const [spot] = toPhotoSpots(rows);

    // Assert
    expect(spot?.photoIds).toEqual(["최근 첫째", "최근 둘째", "예전"]);
    expect(spot?.key).toBe("최근 첫째");
    expect(spot?.place).toBe("첫째 이름");
  });

  it("같은 날 쓴 기록은 나중에 쓴 기록의 사진부터 담는다", () => {
    const rows = [
      createPhotoRow({ id: "먼저", date_id: "r1", record: { date: "2026-11-01", created_at: "2026-11-01T09:00:00+00:00" } }),
      createPhotoRow({ id: "나중", date_id: "r2", record: { date: "2026-11-01", created_at: "2026-11-01T18:00:00+00:00" } }),
    ];
    expect(toPhotoSpots(rows)[0]?.photoIds).toEqual(["나중", "먼저"]);
  });

  it("좌표가 없는 사진은 빼고, 이름이 없으면 '찍은 곳'으로 그린다", () => {
    const rows = [createPhotoRow({ id: "p1", place_lat: null, place_lng: null }), createPhotoRow({ id: "p2", place: null })];
    expect(toPhotoSpots(rows)).toEqual([expect.objectContaining({ key: "p2", place: "찍은 곳", photoIds: ["p2"] })]);
  });
});
