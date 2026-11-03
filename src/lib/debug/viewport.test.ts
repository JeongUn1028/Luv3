import { describe, expect, it } from "vitest";
import { toViewportRows, type ViewportSnapshot } from "./viewport";

const SNAPSHOT: ViewportSnapshot = {
  at: 120,
  isStandalone: true,
  screenHeight: 852,
  innerHeight: 793,
  visualViewportHeight: 793,
  clientHeight: 793,
  vh: 793,
  dvh: 793,
  svh: 793,
  lvh: 793,
  fixedInsetHeight: 793,
  safeAreaTop: 59,
  safeAreaBottom: 34,
  mainBottom: 793,
  scrollY: 0,
};

const findRow = (rows: ReturnType<typeof toViewportRows>, label: string) => rows.find((row) => row.label === label);

describe("toViewportRows", () => {
  it("화면 높이에서 100dvh와 fixed inset-0 높이를 뺀 차이를 보여 준다", () => {
    const rows = toViewportRows(SNAPSHOT, { ...SNAPSHOT, dvh: 852 });

    expect(findRow(rows, "화면 − 100dvh")).toMatchObject({ first: "59", current: "0", isChanged: true });
    expect(findRow(rows, "화면 − fixed inset-0")).toMatchObject({ first: "59", current: "59", isChanged: false });
  });

  it("처음과 값이 달라진 줄만 바뀐 것으로 표시하고 잰 시점은 표시하지 않는다", () => {
    const rows = toViewportRows(SNAPSHOT, { ...SNAPSHOT, at: 5000, innerHeight: 852 });

    expect(rows.filter((row) => row.isChanged).map((row) => row.label)).toEqual(["innerHeight"]);
    expect(findRow(rows, "잰 시점(ms)")).toMatchObject({ first: "120", current: "5000" });
  });

  it("값이 없으면 -로, 소수는 한 자리까지 보여 준다", () => {
    const rows = toViewportRows(
      { ...SNAPSHOT, visualViewportHeight: undefined, mainBottom: 792.345 },
      { ...SNAPSHOT, visualViewportHeight: undefined, mainBottom: 792.345 },
    );

    expect(findRow(rows, "visualViewport.height")).toMatchObject({ first: "-", current: "-" });
    expect(findRow(rows, "main 아래 끝")).toMatchObject({ first: "792.3" });
  });
});
