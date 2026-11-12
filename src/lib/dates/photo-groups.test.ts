import { describe, expect, it } from "vitest";
import { comparePhotoOrder, groupPhotosInOrder, toPhotoWithGroupLocation } from "./photo-groups";

describe("toPhotoWithGroupLocation", () => {
  it("붙여 읽은 모음 위치를 사진의 위치 칸으로 펴고 나머지 칸은 그대로 둔다", () => {
    // Arrange
    const row = { id: "a", sort_order: 2, group: { place: "성수동", place_lat: 37.5445, place_lng: 127.0561, place_name: null } };

    // Act
    const photo = toPhotoWithGroupLocation(row);

    // Assert
    expect(photo).toEqual({ id: "a", sort_order: 2, place: "성수동", place_lat: 37.5445, place_lng: 127.0561, place_name: null });
  });
});

describe("comparePhotoOrder", () => {
  it("사진 순서로 정렬하고, 순서가 같으면 id로 정한다", () => {
    // Arrange
    const photos = [
      { id: "c", sort_order: 1 },
      { id: "b", sort_order: 0 },
      { id: "a", sort_order: 1 },
    ];

    // Act
    const sorted = photos.toSorted(comparePhotoOrder);

    // Assert
    expect(sorted.map(({ id }) => id)).toEqual(["b", "a", "c"]);
  });
});

describe("groupPhotosInOrder", () => {
  it("놓인 순서대로 모음을 묶고, 같은 모음의 사진이 떨어져 있어도 첫 사진 자리의 모음 하나로 모은다", () => {
    // Arrange
    const photos = [
      { id: "a1", group_id: "g1" },
      { id: "b1", group_id: "g2" },
      { id: "a2", group_id: "g1" },
    ];

    // Act
    const groups = groupPhotosInOrder(photos);

    // Assert
    expect(groups.map((group) => group.map(({ id }) => id))).toEqual([["a1", "a2"], ["b1"]]);
  });
});
