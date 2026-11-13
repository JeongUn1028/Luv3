import { describe, expect, it } from "vitest";
import { compareNewestFirst, toPhotoSpots, toPhotoSpotsSignature } from "./map-spots";
import type { MapPhotoRow } from "./map-spots";

describe("compareNewestFirst", () => {
  it("날짜가 늦은 기록부터, 같은 날이면 나중에 쓴 기록부터 줄 세운다", () => {
    // Arrange
    const rows = [
      { id: "a", date: "2026-11-01", created_at: "2026-11-01T10:00:00+00:00" },
      { id: "b", date: "2026-11-03", created_at: "2026-11-03T09:00:00+00:00" },
      { id: "c", date: "2026-11-01", created_at: "2026-11-02T08:00:00+00:00" },
    ];

    // Act
    const sorted = rows.toSorted(compareNewestFirst);

    // Assert
    expect(sorted.map(({ id }) => id)).toEqual(["b", "c", "a"]);
  });

  it("날짜와 작성 시각(밀리초까지)이 같으면 받은 순서와 상관없이 id로 같은 순서를 정한다", () => {
    const same = { date: "2026-11-01", created_at: "2026-11-01T10:00:00.123+00:00" };
    const toIds = (rows: { id: string }[]) => rows.map(({ id }) => id);

    expect(toIds([{ id: "a", ...same }, { id: "b", ...same }].toSorted(compareNewestFirst))).toEqual(["b", "a"]);
    expect(toIds([{ id: "b", ...same }, { id: "a", ...same }].toSorted(compareNewestFirst))).toEqual(["b", "a"]);
  });
});

const createPhotoRow = (overrides: Partial<MapPhotoRow> = {}): MapPhotoRow => ({
  id: "p1",
  date_id: "1",
  sort_order: 0,
  place: "성동구 성수1가1동",
  place_lat: 37.5444,
  place_lng: 127.0396,
  place_name: null,
  record: { date: "2026-11-01", created_at: "2026-11-01T10:00:00+00:00" },
  ...overrides,
});

describe("toPhotoSpotsSignature", () => {
  const withPhotos = (photos: MapPhotoRow[]) => toPhotoSpots(photos);

  it("새로 받았어도 내용이 같으면 같다", () => {
    expect(toPhotoSpotsSignature(withPhotos([createPhotoRow()]))).toBe(toPhotoSpotsSignature(withPhotos([createPhotoRow()])));
  });

  it("자리가 옮겨지면 달라진다", () => {
    expect(toPhotoSpotsSignature(withPhotos([createPhotoRow()]))).not.toBe(toPhotoSpotsSignature(withPhotos([createPhotoRow({ place_lat: 35 })])));
  });

  it("핀의 이름이 바뀌면 달라진다", () => {
    expect(toPhotoSpotsSignature(withPhotos([createPhotoRow()]))).not.toBe(toPhotoSpotsSignature(withPhotos([createPhotoRow({ place: "새 이름" })])));
  });

  it("사진 핀에 사진이 더해지면 달라진다", () => {
    const first = createPhotoRow();
    expect(toPhotoSpotsSignature(withPhotos([first]))).not.toBe(toPhotoSpotsSignature(withPhotos([first, createPhotoRow({ id: "p2", sort_order: 1 })])));
  });
});
