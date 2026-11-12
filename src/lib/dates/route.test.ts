import { describe, expect, it } from "vitest";
import { buildGroupRoute, type RoutePhotoRow } from "./route";

const SEONGSU = { lat: 37.5444, lng: 127.0396 };
const SEOUL_FOREST = { lat: 37.5443, lng: 127.0374 };
const TTUKSEOM = { lat: 37.5317, lng: 127.0667 };
/** 위도 0.0001도는 약 11m */
const NEARBY = { lat: SEONGSU.lat + 0.0003, lng: SEONGSU.lng };

/** 모음 하나의 사진 행들. 위치는 모음마다 하나라 같은 모음의 사진은 위치가 같다(#297) */
const createGroupRows = ({
  groupId,
  photoIds,
  firstSortOrder,
  location = SEONGSU,
  place = "성동구 성수2가3동",
  placeName = null,
  takenAts = [],
}: {
  groupId: string;
  photoIds: string[];
  firstSortOrder: number;
  location?: { lat: number; lng: number };
  place?: string;
  placeName?: string | null;
  takenAts?: (string | null)[];
}): RoutePhotoRow[] =>
  photoIds.map((id, index) => ({
    id,
    group_id: groupId,
    sort_order: firstSortOrder + index,
    place,
    place_lat: location.lat,
    place_lng: location.lng,
    place_name: placeName,
    taken_at: takenAts[index] ?? null,
  }));

const getPointIds = (route: ReturnType<typeof buildGroupRoute>): string[][] => route?.points.map(({ photoIds }) => photoIds) ?? [];

describe("buildGroupRoute", () => {
  // 동선 목록("1. 골목 끝 카페 사진 2장")이 모음을 부르는 이름을 쓴다(#317)
  it("점 이름은 모음에 붙인 장소 이름을, 없으면 다듬은 동 이름을 쓴다", () => {
    // Arrange
    const rows = [
      ...createGroupRows({ groupId: "g1", photoIds: ["a1"], firstSortOrder: 0, placeName: "골목 끝 카페" }),
      ...createGroupRows({ groupId: "g2", photoIds: ["b1"], firstSortOrder: 1, location: SEOUL_FOREST }),
    ];

    // Act
    const route = buildGroupRoute(rows);

    // Assert
    expect(route?.points.map(({ place }) => place)).toEqual(["골목 끝 카페", "성수동"]);
  });

  it("모음 하나를 점 하나로, 찍은 시각과 상관없이 모음 순서(사진 순서)대로 잇는다", () => {
    // Arrange: 모음 순서는 g1 → g2 → g3이고, 찍은 시각은 g2가 가장 이르다
    const rows = [
      ...createGroupRows({ groupId: "g3", photoIds: ["c1"], firstSortOrder: 3, location: TTUKSEOM, place: "뚝섬", takenAts: ["2026-11-08T06:00:00+00:00"] }),
      ...createGroupRows({ groupId: "g1", photoIds: ["a1", "a2"], firstSortOrder: 0, place: "성수", takenAts: ["2026-11-08T05:00:00+00:00"] }),
      ...createGroupRows({ groupId: "g2", photoIds: ["b1"], firstSortOrder: 2, location: SEOUL_FOREST, place: "서울숲", takenAts: ["2026-11-08T04:00:00+00:00"] }),
    ];

    // Act
    const route = buildGroupRoute(rows);

    // Assert
    expect(route?.points.map(({ number, place, photoIds, lat, lng }) => ({ number, place, photoIds, lat, lng }))).toEqual([
      { number: 1, place: "성수", photoIds: ["a1", "a2"], ...SEONGSU },
      { number: 2, place: "서울숲", photoIds: ["b1"], ...SEOUL_FOREST },
      { number: 3, place: "뚝섬", photoIds: ["c1"], ...TTUKSEOM },
    ]);
    expect(route?.lines).toEqual([{ date: "2026-11-08", path: [SEONGSU, SEOUL_FOREST, TTUKSEOM] }]);
  });

  it("50m 안의 모음이 이어지면 점 하나로 합치고, 다른 곳에 들렀다 돌아오면 새 점으로 센다", () => {
    // Arrange
    const rows = [
      ...createGroupRows({ groupId: "g1", photoIds: ["a1"], firstSortOrder: 0 }),
      ...createGroupRows({ groupId: "g2", photoIds: ["b1", "b2"], firstSortOrder: 1, location: NEARBY }),
      ...createGroupRows({ groupId: "g3", photoIds: ["c1"], firstSortOrder: 3, location: TTUKSEOM }),
      ...createGroupRows({ groupId: "g4", photoIds: ["d1"], firstSortOrder: 4 }),
    ];

    // Act
    const route = buildGroupRoute(rows);

    // Assert: 합친 점은 앞 모음의 좌표와 이름을 쓴다
    expect(getPointIds(route)).toEqual([["a1", "b1", "b2"], ["c1"], ["d1"]]);
    expect(route?.points[0]).toMatchObject(SEONGSU);
  });

  it("모든 모음의 첫 사진에 찍은 시각이 있으면 그 한국 날짜로 줄을 나누고, 다음 날 줄은 전날 마지막 점에서 시작하며 번호는 이어 센다", () => {
    // Arrange: 11-08 23:30과 11-09 00:10(한국 시각)은 UTC로는 같은 날이다. 첫 사진이 아닌 사진의 시각은 보지 않는다
    const rows = [
      ...createGroupRows({ groupId: "g1", photoIds: ["a1"], firstSortOrder: 0, takenAts: ["2026-11-08T05:00:00+00:00"] }),
      ...createGroupRows({ groupId: "g2", photoIds: ["b1", "b2"], firstSortOrder: 1, location: SEOUL_FOREST, takenAts: ["2026-11-08T14:30:00+00:00", "2026-11-08T15:30:00+00:00"] }),
      ...createGroupRows({ groupId: "g3", photoIds: ["c1"], firstSortOrder: 3, location: TTUKSEOM, takenAts: ["2026-11-08T15:10:00+00:00"] }),
    ];

    // Act
    const route = buildGroupRoute(rows);

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

  it("첫 사진에 찍은 시각이 없는 모음이 하나라도 있으면 날짜를 나누지 않고 한 줄로 그린다", () => {
    // Arrange: g2는 둘째 사진에만 시각이 있다
    const rows = [
      ...createGroupRows({ groupId: "g1", photoIds: ["a1"], firstSortOrder: 0, takenAts: ["2026-11-08T05:00:00+00:00"] }),
      ...createGroupRows({ groupId: "g2", photoIds: ["b1", "b2"], firstSortOrder: 1, location: SEOUL_FOREST, takenAts: [null, "2026-11-09T05:00:00+00:00"] }),
      ...createGroupRows({ groupId: "g3", photoIds: ["c1"], firstSortOrder: 3, location: TTUKSEOM, takenAts: ["2026-11-10T05:00:00+00:00"] }),
    ];

    // Act
    const route = buildGroupRoute(rows);

    // Assert
    expect(route?.lines).toEqual([{ date: undefined, path: [SEONGSU, SEOUL_FOREST, TTUKSEOM] }]);
    expect(route?.points.map(({ lineIndex }) => lineIndex)).toEqual([0, 0, 0]);
  });

  it("모음 순서에서 첫 사진 날짜가 되돌아가면 같은 날짜가 두 번 나오지 않게 날짜를 나누지 않고 한 줄로 그린다", () => {
    // Arrange: 9일 → 8일 → 9일
    const rows = [
      ...createGroupRows({ groupId: "g1", photoIds: ["a1"], firstSortOrder: 0, takenAts: ["2026-11-09T05:00:00+00:00"] }),
      ...createGroupRows({ groupId: "g2", photoIds: ["b1"], firstSortOrder: 1, location: SEOUL_FOREST, takenAts: ["2026-11-08T05:00:00+00:00"] }),
      ...createGroupRows({ groupId: "g3", photoIds: ["c1"], firstSortOrder: 2, location: TTUKSEOM, takenAts: ["2026-11-09T07:00:00+00:00"] }),
    ];

    // Act
    const route = buildGroupRoute(rows);

    // Assert
    expect(route?.lines).toEqual([{ date: undefined, path: [SEONGSU, SEOUL_FOREST, TTUKSEOM] }]);
  });

  it("날이 바뀌면 같은 자리의 모음이어도 점을 합치지 않는다", () => {
    // Arrange
    const rows = [
      ...createGroupRows({ groupId: "g1", photoIds: ["a1"], firstSortOrder: 0, takenAts: ["2026-11-08T13:00:00+00:00"] }),
      ...createGroupRows({ groupId: "g2", photoIds: ["b1"], firstSortOrder: 1, takenAts: ["2026-11-09T00:00:00+00:00"] }),
    ];

    // Act
    const route = buildGroupRoute(rows);

    // Assert
    expect(getPointIds(route)).toEqual([["a1"], ["b1"]]);
    expect(route?.lines.map(({ date }) => date)).toEqual(["2026-11-08", "2026-11-09"]);
  });

  it("이을 점이 둘 미만이면 동선을 만들지 않는다", () => {
    // Arrange
    const oneGroup = createGroupRows({ groupId: "g1", photoIds: ["a1", "a2"], firstSortOrder: 0 });
    const sameSpot = [
      ...createGroupRows({ groupId: "g1", photoIds: ["a1"], firstSortOrder: 0 }),
      ...createGroupRows({ groupId: "g2", photoIds: ["b1"], firstSortOrder: 1, location: NEARBY }),
    ];

    // Act
    const routes = [buildGroupRoute(oneGroup), buildGroupRoute(sameSpot), buildGroupRoute([])];

    // Assert
    expect(routes).toEqual([undefined, undefined, undefined]);
  });
});
