import { describe, expect, it } from "vitest";
import { toPhotoWithGroupLocation } from "./photo-groups";

describe("toPhotoWithGroupLocation", () => {
  it("붙여 읽은 모음 위치를 사진의 위치 칸으로 펴고 나머지 칸은 그대로 둔다", () => {
    // Arrange
    const row = { id: "a", sort_order: 2, group: { place: "성수동", place_lat: 37.5445, place_lng: 127.0561 } };

    // Act
    const photo = toPhotoWithGroupLocation(row);

    // Assert
    expect(photo).toEqual({ id: "a", sort_order: 2, place: "성수동", place_lat: 37.5445, place_lng: 127.0561 });
  });
});
