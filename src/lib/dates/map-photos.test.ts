import { describe, expect, it } from "vitest";
import {
  formatMapPhotoDate,
  MAP_PHOTOS_MAX_IDS,
  MapPhotosError,
  parseMapPhotoIds,
  parseMapPhotos,
  planThumbRequests,
  toMapPhotos,
  toMapPhotosHref,
  toInitialStripPhotos,
  toPhotosWithKnownThumbs,
  type CachedThumb,
  type MapPhoto,
  type MapPhotoDetailRow,
} from "./map-photos";

const toUuid = (index: number): string => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;

describe("toMapPhotosHref", () => {
  it("사진 id를 쉼표로 이어 붙인다", () => {
    expect(toMapPhotosHref(["a", "b"])).toBe("/api/records/map-photos?ids=a%2Cb");
  });
});

describe("parseMapPhotoIds", () => {
  it("쉼표로 나눈 id를 겹치지 않게 읽는다", () => {
    expect(parseMapPhotoIds(`${toUuid(1)},${toUuid(2)},${toUuid(1)}`)).toEqual([toUuid(1), toUuid(2)]);
  });

  it("40개까지 받는다", () => {
    const ids = Array.from({ length: MAP_PHOTOS_MAX_IDS }, (_, index) => toUuid(index));
    expect(parseMapPhotoIds(ids.join(","))).toHaveLength(MAP_PHOTOS_MAX_IDS);
  });

  it.each([null, "", "abc", `${toUuid(1)},`])("형식이 틀리면(%s) undefined다", (text) => {
    expect(parseMapPhotoIds(text)).toBeUndefined();
  });
});

describe("toMapPhotos", () => {
  const createRow = (id: string, thumbPath: string): MapPhotoDetailRow => ({
    id,
    thumb_path: thumbPath,
    taken_at: null,
    record: { id: "r1", title: "성수 산책", date: "2026-11-10" },
  });

  it("요청한 순서대로 돌려주고, 지워진 사진은 빼며, 찍은 시각이 없으면 undefined다", () => {
    // Arrange
    const rows = [createRow("p2", "t2.jpg"), { ...createRow("p1", "t1.jpg"), taken_at: "2026-11-10T05:03:22+00:00" }];
    const signed = [
      { path: "t2.jpg", signedUrl: "https://x.test/t2", expiresAt: 20 },
      { path: "t1.jpg", signedUrl: "https://x.test/t1", expiresAt: 10 },
    ];

    // Act
    const photos = toMapPhotos(["p1", "지워짐", "p2"], rows, signed);

    // Assert
    expect(photos).toEqual([
      { id: "p1", recordId: "r1", title: "성수 산책", date: "2026-11-10", takenAt: "2026-11-10T05:03:22+00:00", thumbUrl: "https://x.test/t1", expiresAt: 10 },
      { id: "p2", recordId: "r1", title: "성수 산책", date: "2026-11-10", takenAt: undefined, thumbUrl: "https://x.test/t2", expiresAt: 20 },
    ]);
  });

  it("서명하지 못한 썸네일은 주소와 만료 시각이 없다", () => {
    const [photo] = toMapPhotos(["p1"], [createRow("p1", "t1.jpg")], [{ path: "t1.jpg", signedUrl: null, expiresAt: undefined }]);
    expect(photo).toMatchObject({ thumbUrl: undefined, expiresAt: undefined });
  });
});

describe("parseMapPhotos", () => {
  it("빠진 칸은 undefined로 읽는다", () => {
    const item = { id: "p1", recordId: "r1", title: "산책", date: "2026-11-10" };
    expect(parseMapPhotos({ items: [item] })).toEqual([item]);
  });

  it.each([undefined, {}, { items: [{ id: "p1" }] }, { items: [{ id: "p1", recordId: "r1", title: "산책", date: "2026-11-10", expiresAt: "1" }] }])(
    "모양이 다르면 실패한다",
    (body) => {
      expect(() => parseMapPhotos(body)).toThrow(MapPhotosError);
    },
  );
});

describe("formatMapPhotoDate", () => {
  it("찍은 시각이 있으면 한국 날짜와 시각을 쓴다", () => {
    expect(formatMapPhotoDate({ date: "2026-11-09", takenAt: "2026-11-09T15:30:00Z" })).toBe("2026.11.10 · 오전 12:30");
  });

  it("오후 시각을 쓴다", () => {
    expect(formatMapPhotoDate({ date: "2026-11-10", takenAt: "2026-11-10T05:03:22+00:00" })).toBe("2026.11.10 · 오후 2:03");
  });

  it("찍은 시각이 없으면 기록 날짜만 쓴다", () => {
    expect(formatMapPhotoDate({ date: "2026-03-14", takenAt: undefined })).toBe("2026.03.14");
  });
});

describe("planThumbRequests", () => {
  const NOW = 1_000_000_000;
  const thumb = (minutesLeft: number): Pick<CachedThumb, "thumbUrl" | "expiresAt"> => ({
    thumbUrl: `https://x.test/${minutesLeft}`,
    expiresAt: NOW + minutesLeft * 60 * 1000,
  });

  it("받아 둔 주소는 바로 쓰고, 없는 사진만 새로 받는다", () => {
    // Act
    const plan = planThumbRequests({ photoIds: ["a", "b", "a"], cached: new Map([["a", thumb(60)]]), pending: new Set(), unavailable: new Set(), now: NOW });

    // Assert
    expect(plan).toEqual({ ready: [["a", "https://x.test/60"]], batches: [["b"]] });
  });

  it("만료가 5분 안으로 남은 주소는 새로 받는다", () => {
    const plan = planThumbRequests({ photoIds: ["a"], cached: new Map([["a", thumb(4)]]), pending: new Set(), unavailable: new Set(), now: NOW });
    expect(plan).toEqual({ ready: [], batches: [["a"]] });
  });

  it("받는 중인 사진은 다시 받지 않는다", () => {
    expect(planThumbRequests({ photoIds: ["a"], cached: new Map(), pending: new Set(["a"]), unavailable: new Set(), now: NOW }).batches).toEqual([]);
  });

  it("받아 봤지만 주소가 없던 사진은 다시 받지 않는다", () => {
    expect(planThumbRequests({ photoIds: ["a", "b"], cached: new Map(), pending: new Set(), unavailable: new Set(["a"]), now: NOW }).batches).toEqual([["b"]]);
  });

  it("40장씩 나눠 받는다", () => {
    const photoIds = Array.from({ length: 85 }, (_, index) => `p${index}`);
    const { batches } = planThumbRequests({ photoIds, cached: new Map(), pending: new Set(), unavailable: new Set(), now: NOW });
    expect(batches.map((batch) => batch.length)).toEqual([40, 40, 5]);
  });
});

describe("toInitialStripPhotos", () => {
  const NOW = 1_000_000_000;
  const createCached = (id: string, minutesLeft: number): CachedThumb => ({
    id,
    recordId: "r1",
    title: "성수 산책",
    date: "2026-11-10",
    takenAt: undefined,
    thumbUrl: `https://x.test/${id}`,
    expiresAt: NOW + minutesLeft * 60 * 1000,
  });

  it("핀 썸네일과 함께 받아 둔 대표 사진이 있으면 사진 줄 첫 칸으로 돌려준다", () => {
    // Arrange
    const cached = new Map([["p1", createCached("p1", 60)]]);

    // Act
    const photos = toInitialStripPhotos({ coverId: "p1", cached, now: NOW });

    // Assert
    expect(photos).toEqual([createCached("p1", 60)]);
  });

  it("받아 둔 적이 없거나 주소 만료가 5분 안으로 남았으면 비워 둔다", () => {
    const cached = new Map([["p1", createCached("p1", 4)]]);
    expect(toInitialStripPhotos({ coverId: "p1", cached, now: NOW })).toEqual([]);
    expect(toInitialStripPhotos({ coverId: "p2", cached, now: NOW })).toEqual([]);
  });
});

describe("toPhotosWithKnownThumbs", () => {
  const createPhoto = (id: string, thumbUrl: string | undefined, title = "성수 산책"): MapPhoto => ({
    id,
    recordId: "r1",
    title,
    date: "2026-11-10",
    takenAt: undefined,
    thumbUrl,
    expiresAt: thumbUrl ? 10 : undefined,
  });

  it("이미 보여 준 사진은 썸네일 주소를 그대로 두어 다시 내려받지 않고, 나머지 내용은 새로 받은 것으로 바꾼다", () => {
    // Arrange
    const known = [{ ...createPhoto("p1", "https://x.test/known"), expiresAt: 99 }];
    const fresh = [createPhoto("p1", "https://x.test/new", "고친 제목"), createPhoto("p2", "https://x.test/p2")];

    // Act
    const photos = toPhotosWithKnownThumbs(fresh, known);

    // Assert
    expect(photos).toEqual([{ ...createPhoto("p1", "https://x.test/known", "고친 제목"), expiresAt: 99 }, createPhoto("p2", "https://x.test/p2")]);
  });

  it("그사이 지워져 새로 받은 목록에 없는 사진은 뺀다", () => {
    expect(toPhotosWithKnownThumbs([createPhoto("p2", "https://x.test/p2")], [createPhoto("p1", "https://x.test/p1")])).toEqual([
      createPhoto("p2", "https://x.test/p2"),
    ]);
  });
});
