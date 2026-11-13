import { describe, expect, it } from "vitest";
import { sumClusterPhotoCount } from "./cluster-count";

describe("sumClusterPhotoCount", () => {
  it("2장 장소와 1장 장소가 묶이면 장소 수(2)가 아닌 사진 수 합 3을 돌려준다", () => {
    // Arrange
    const photoCounts = new Map([
      ["성수", 2],
      ["서울숲", 1],
    ]);

    // Act
    const count = sumClusterPhotoCount({ pins: ["성수", "서울숲"], photoCountOf: (pin) => photoCounts.get(pin) });

    // Assert
    expect(count).toBe(3);
  });

  it("사진 수를 모르는 핀이 있으면 그 핀은 1장으로 센다", () => {
    // Arrange
    const photoCounts = new Map([["성수", 4]]);

    // Act
    const count = sumClusterPhotoCount({ pins: ["성수", "모르는 핀"], photoCountOf: (pin) => photoCounts.get(pin) });

    // Assert
    expect(count).toBe(5);
  });

  it("묶인 핀이 없으면 0을 돌려준다", () => {
    // Arrange
    const pins: string[] = [];

    // Act
    const count = sumClusterPhotoCount({ pins, photoCountOf: () => 3 });

    // Assert
    expect(count).toBe(0);
  });
});
