import { describe, expect, it } from "vitest";
import type { DateRecordDraft, DraftPhotoGroup, PhotoLocation } from "./form";
import {
  MAX_GROUP_PHOTOS,
  MAX_GROUPS,
  addPhotoGroup,
  addPhotosToGroup,
  applyPhotoInfo,
  getDraftPhotos,
  moveGroupPhoto,
  moveItem,
  placeGroupByTakenAt,
  removeGroupPhoto,
  removePhotoGroup,
  setGroupLocation,
} from "./photo-group-draft";

const SEONGSU: PhotoLocation = { place: "성동구 성수1가1동", lat: 37.5444, lng: 127.0396 };
const FOREST: PhotoLocation = { place: "성동구 성수1가2동", lat: 37.5444, lng: 127.0374 };

interface TestPhoto {
  id: string;
  caption: string;
  takenAt?: string;
  isReadingInfo: boolean;
}

const photo = (id: string, takenAt?: string): TestPhoto => ({ id, caption: "", takenAt, isReadingInfo: false });
const reading = (id: string): TestPhoto => ({ id, caption: "", isReadingInfo: true });
const group = (id: string, photos: TestPhoto[], location: PhotoLocation = SEONGSU): DraftPhotoGroup<TestPhoto> => ({
  id,
  location,
  locationSource: "saved",
  pendingLocationPhotoId: undefined,
  photos,
});
const draft = (groups: DraftPhotoGroup<TestPhoto>[], coverPhotoId = groups[0]?.photos[0]?.id): DateRecordDraft<TestPhoto> => ({
  date: "2026-11-01",
  endDate: undefined,
  title: "성수 데이트",
  memo: "",
  groups,
  coverPhotoId,
  tags: [],
});
const ids = (groups: DraftPhotoGroup<TestPhoto>[]): string[] => groups.map(({ id }) => id);
const photoIds = (groups: DraftPhotoGroup<TestPhoto>[]): string[][] => groups.map(({ photos }) => photos.map(({ id }) => id));

describe("getDraftPhotos", () => {
  it("모음 순서, 모음 안 순서대로 사진을 펼친다", () => {
    expect(getDraftPhotos([group("g1", [photo("a"), photo("b")]), group("g2", [photo("c")])]).map(({ id }) => id)).toEqual(["a", "b", "c"]);
  });
});

describe("addPhotoGroup", () => {
  it("고른 사진으로 위치를 읽을 모음을 뒤에 붙이고, 대표 사진이 없으면 첫 사진을 대표로 정한다", () => {
    // Arrange
    const empty = draft([], undefined);

    // Act
    const result = addPhotoGroup(empty, { groupId: "g1", photos: [reading("a"), reading("b")] });

    // Assert
    expect(result.draft.groups).toEqual([
      { id: "g1", location: undefined, locationSource: undefined, pendingLocationPhotoId: "a", photos: [reading("a"), reading("b")] },
    ]);
    expect(result.draft.coverPhotoId).toBe("a");
    expect(result.droppedCount).toBe(0);
  });

  it("한 번에 10장을 넘게 고르면 넘는 사진은 버리고 대표 사진은 그대로 둔다", () => {
    // Arrange
    const many = Array.from({ length: 12 }, (_, index) => reading(`n${index}`));

    // Act
    const result = addPhotoGroup(draft([group("g1", [photo("a")])]), { groupId: "g2", photos: many });

    // Assert
    expect(result.draft.groups[1]?.photos).toHaveLength(MAX_GROUP_PHOTOS);
    expect(result.droppedCount).toBe(2);
    expect(result.draft.coverPhotoId).toBe("a");
  });

  it("모음이 이미 10개면 모음을 만들지 않고 고른 사진을 모두 버린다", () => {
    // Arrange
    const full = draft(Array.from({ length: MAX_GROUPS }, (_, index) => group(`g${index}`, [photo(`p${index}`)])));

    // Act
    const result = addPhotoGroup(full, { groupId: "new", photos: [reading("a"), reading("b")] });

    // Assert
    expect(result.draft).toBe(full);
    expect(result.droppedCount).toBe(2);
  });
});

describe("addPhotosToGroup", () => {
  it("그 모음 뒤에 사진을 더하고 10장을 넘는 사진은 버린다", () => {
    // Arrange
    const nine = Array.from({ length: 9 }, (_, index) => photo(`p${index}`));
    const start = draft([group("g1", nine), group("g2", [photo("x")])]);

    // Act
    const result = addPhotosToGroup(start, { groupId: "g1", photos: [reading("a"), reading("b")] });

    // Assert
    expect(photoIds(result.draft.groups)[0]?.slice(-2)).toEqual(["p8", "a"]);
    expect(result.draft.groups[1]).toBe(start.groups[1]);
    expect(result.droppedCount).toBe(1);
  });

  it("없는 모음이면 그대로 두고 고른 사진을 모두 버린다", () => {
    const start = draft([group("g1", [photo("a")])]);
    expect(addPhotosToGroup(start, { groupId: "gone", photos: [reading("b")] })).toEqual({ draft: start, droppedCount: 1 });
  });
});

describe("removePhotoGroup", () => {
  it("모음을 빼고, 대표 사진이 그 모음에 있었으면 남은 첫 사진이 대표가 된다", () => {
    // Arrange
    const start = draft([group("g1", [photo("a")]), group("g2", [photo("b"), photo("c")])], "a");

    // Act
    const result = removePhotoGroup(start, "g1");

    // Assert
    expect(ids(result.groups)).toEqual(["g2"]);
    expect(result.coverPhotoId).toBe("b");
  });

  it("대표 사진이 다른 모음에 있으면 그대로 둔다", () => {
    expect(removePhotoGroup(draft([group("g1", [photo("a")]), group("g2", [photo("b")])], "b"), "g1").coverPhotoId).toBe("b");
  });
});

describe("removeGroupPhoto", () => {
  it("사진을 빼고, 대표 사진을 빼면 남은 첫 사진이 대표가 된다", () => {
    // Arrange
    const start = draft([group("g1", [photo("a"), photo("b")])], "a");

    // Act
    const result = removeGroupPhoto(start, "a");

    // Assert
    expect(photoIds(result.groups)).toEqual([["b"]]);
    expect(result.coverPhotoId).toBe("b");
  });

  it("모음의 마지막 사진을 빼면 모음도 빠지고, 사진이 하나도 없으면 대표 사진을 비운다", () => {
    // Arrange
    const start = draft([group("g1", [photo("a")]), group("g2", [photo("b")])], "a");

    // Act
    const once = removeGroupPhoto(start, "a");
    const twice = removeGroupPhoto(once, "b");

    // Assert
    expect(ids(once.groups)).toEqual(["g2"]);
    expect(twice).toEqual({ ...start, groups: [], coverPhotoId: undefined });
  });

  it("위치를 읽던 첫 사진을 빼면 그 정보를 기다리지 않고 위치 없음으로 둔다", () => {
    // Arrange
    const start = draft([{ ...group("g1", [reading("a"), reading("b")]), location: undefined, locationSource: undefined, pendingLocationPhotoId: "a" }]);

    // Act
    const [changed] = removeGroupPhoto(start, "a").groups;

    // Assert
    expect(changed?.pendingLocationPhotoId).toBeUndefined();
    expect(changed?.location).toBeUndefined();
  });
});

describe("moveItem", () => {
  it("앞뒤로 바꾸고, 맨 앞·맨 뒤를 넘어가면 그대로 둔다", () => {
    const items = ["a", "b", "c"];
    expect([moveItem(items, 2, -1), moveItem(items, 0, 1), moveItem(items, 0, -1), moveItem(items, 2, 1)]).toEqual([
      ["a", "c", "b"],
      ["b", "a", "c"],
      items,
      items,
    ]);
  });
});

describe("moveGroupPhoto", () => {
  it("그 사진이 있는 모음 안에서만 순서를 바꾼다", () => {
    // Arrange
    const groups = [group("g1", [photo("a"), photo("b")]), group("g2", [photo("c")])];

    // Act
    const moved = moveGroupPhoto(groups, { photoId: "b", offset: -1 });
    const atEdge = moveGroupPhoto(groups, { photoId: "c", offset: -1 });

    // Assert
    expect(photoIds(moved)).toEqual([["b", "a"], ["c"]]);
    expect(photoIds(atEdge)).toEqual([["a", "b"], ["c"]]);
  });
});

describe("setGroupLocation", () => {
  it("그 모음 위치만 고른 위치로 바꾸고, 읽던 사진 정보는 더 기다리지 않는다", () => {
    // Arrange
    const groups = [{ ...group("g1", [reading("a")]), location: undefined, pendingLocationPhotoId: "a" }, group("g2", [photo("b")])];

    // Act
    const changed = setGroupLocation(groups, { groupId: "g1", location: FOREST });

    // Assert
    expect(changed[0]).toMatchObject({ location: FOREST, locationSource: "picked", pendingLocationPhotoId: undefined });
    expect(changed[1]).toBe(groups[1]);
  });
});

describe("placeGroupByTakenAt", () => {
  it("첫 사진을 그보다 늦게 찍은 첫 모음 앞으로 옮기고, 찍은 시각을 모르는 모음은 견주지 않는다", () => {
    // Arrange
    const groups = [
      group("morning", [photo("a", "2026-11-08T10:00:00+09:00")]),
      group("unknown", [photo("b")]),
      group("evening", [photo("c", "2026-11-08T19:00:00+09:00")]),
      group("lunch", [photo("d", "2026-11-08T03:30:00Z")]),
    ];

    // Act & Assert
    expect(ids(placeGroupByTakenAt(groups, "lunch"))).toEqual(["morning", "unknown", "lunch", "evening"]);
  });

  it("가장 늦게 찍었으면 맨 뒤로, 찍은 시각을 모르면 그대로 둔다", () => {
    const groups = [group("late", [photo("a", "2026-11-08T20:00:00+09:00")]), group("early", [photo("b", "2026-11-08T09:00:00+09:00")]), group("unknown", [photo("c")])];
    expect([ids(placeGroupByTakenAt(groups, "late")), ids(placeGroupByTakenAt(groups, "unknown"))]).toEqual([
      ["early", "unknown", "late"],
      ["late", "early", "unknown"],
    ]);
  });
});

describe("applyPhotoInfo", () => {
  const pendingGroup = (id: string, photos: TestPhoto[]): DraftPhotoGroup<TestPhoto> => ({
    ...group(id, photos),
    location: undefined,
    locationSource: undefined,
    pendingLocationPhotoId: photos[0]?.id,
  });

  it("모음을 만들 때의 첫 사진 정보가 오면 모음 위치를 채우고 찍은 시각 순서 자리로 옮긴다", () => {
    // Arrange
    const groups = [group("evening", [photo("x", "2026-11-08T19:00:00+09:00")]), pendingGroup("new", [reading("a"), reading("b")])];

    // Act
    const changed = applyPhotoInfo(groups, { photoId: "a", info: { location: SEONGSU, takenAt: "2026-11-08T12:00:00+09:00" } });

    // Assert
    expect(ids(changed)).toEqual(["new", "evening"]);
    expect(changed[0]).toMatchObject({ location: SEONGSU, locationSource: "photo", pendingLocationPhotoId: undefined });
    expect(changed[0]?.photos[0]).toEqual({ ...reading("a"), isReadingInfo: false, takenAt: "2026-11-08T12:00:00+09:00" });
  });

  it("정보를 읽는 사이 사진 순서를 바꿔도 모음을 만들 때의 첫 사진 시각으로 자리를 옮긴다", () => {
    // Arrange: a로 모음을 만든 뒤 b를 앞으로 옮겼다
    const groups = [group("evening", [photo("x", "2026-11-08T19:00:00+09:00")]), { ...pendingGroup("new", [reading("a"), reading("b")]), photos: [reading("b"), reading("a")] }];

    // Act
    const changed = applyPhotoInfo(groups, { photoId: "a", info: { location: SEONGSU, takenAt: "2026-11-08T12:00:00+09:00" } });

    // Assert
    expect(ids(changed)).toEqual(["new", "evening"]);
  });

  it("첫 사진에 위치가 없으면 위치 없음으로 두어 지도에서 고르게 한다", () => {
    const [changed] = applyPhotoInfo([pendingGroup("g1", [reading("a")])], { photoId: "a", info: { location: undefined, takenAt: undefined } });
    expect(changed).toMatchObject({ location: undefined, locationSource: undefined, pendingLocationPhotoId: undefined });
  });

  it("첫 사진이 아닌 사진 정보는 찍은 시각만 채우고 모음 위치·순서는 그대로 둔다", () => {
    // Arrange
    const groups = [group("g1", [photo("x", "2026-11-08T19:00:00+09:00")]), group("g2", [photo("y"), reading("b")])];

    // Act
    const changed = applyPhotoInfo(groups, { photoId: "b", info: { location: FOREST, takenAt: "2026-11-08T09:00:00+09:00" } });

    // Assert
    expect(ids(changed)).toEqual(["g1", "g2"]);
    expect(changed[1]?.location).toEqual(SEONGSU);
    expect(changed[1]?.photos[1]).toMatchObject({ isReadingInfo: false, takenAt: "2026-11-08T09:00:00+09:00" });
  });

  it("사진 정보가 오기 전에 지도에서 고른 위치는 덮지 않는다", () => {
    // Arrange
    const picked = setGroupLocation([pendingGroup("g1", [reading("a")])], { groupId: "g1", location: FOREST });

    // Act
    const [changed] = applyPhotoInfo(picked, { photoId: "a", info: { location: SEONGSU, takenAt: undefined } });

    // Assert
    expect(changed).toMatchObject({ location: FOREST, locationSource: "picked" });
  });
});
