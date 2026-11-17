import { describe, expect, it } from "vitest";
import { DOUBLE_TAP_ZOOM_SCALE, MAX_ZOOM_SCALE, NO_ZOOM, clampPhotoZoom, isDoubleTap, toDoubleTapZoom, toPinchZoom } from "./photo-zoom";

const FRAME = { width: 400, height: 800 };
// 가로 사진: 틀 너비에 맞춰 400×300으로 보인다
const PHOTO = { width: 400, height: 300 };

describe("clampPhotoZoom", () => {
  it("배율이 1보다 작으면 원래 크기·제자리로 되돌린다", () => {
    expect(clampPhotoZoom({ zoom: { scale: 0.6, x: 30, y: -20 }, photo: PHOTO, frame: FRAME })).toEqual(NO_ZOOM);
  });

  it("배율이 가장 큰 배율을 넘으면 가장 큰 배율로 줄인다", () => {
    expect(clampPhotoZoom({ zoom: { scale: 9, x: 0, y: 0 }, photo: PHOTO, frame: FRAME }).scale).toBe(MAX_ZOOM_SCALE);
  });

  it("확대한 사진의 가장자리가 틀 안으로 들어오지 않게 옮긴 거리를 막는다", () => {
    // Arrange: 2배면 800×600. 가로는 (800-400)/2=200까지 옮길 수 있고, 세로는 틀(800)보다 작아 가운데에 둔다
    const zoom = { scale: 2, x: 500, y: 100 };

    // Act
    const clamped = clampPhotoZoom({ zoom, photo: PHOTO, frame: FRAME });

    // Assert
    expect(clamped).toEqual({ scale: 2, x: 200, y: 0 });
  });

  it("범위 안이면 그대로 둔다", () => {
    expect(clampPhotoZoom({ zoom: { scale: 2, x: -150, y: 0 }, photo: PHOTO, frame: FRAME })).toEqual({ scale: 2, x: -150, y: 0 });
  });
});

describe("toPinchZoom", () => {
  it("두 손가락 사이가 두 배로 벌어지면 두 배로 키우고, 손가락 가운데의 사진 지점을 그 자리에 둔다", () => {
    // Arrange: 틀 가운데에서 오른쪽 100px 지점을 벌린다
    const center = { x: 100, y: 0 };

    // Act
    const zoom = toPinchZoom({ start: NO_ZOOM, startCenter: center, startDistance: 100, center, distance: 200 });

    // Assert: 사진 지점 100이 2배로 200이 되므로 -100만큼 옮겨야 화면의 100에 남는다
    expect(zoom).toEqual({ scale: 2, x: -100, y: 0 });
  });

  it("벌리면서 손가락을 옮기면 사진도 따라 옮긴다", () => {
    const zoom = toPinchZoom({ start: { scale: 2, x: 0, y: 0 }, startCenter: { x: 0, y: 0 }, startDistance: 100, center: { x: 30, y: -40 }, distance: 100 });

    expect(zoom).toEqual({ scale: 2, x: 30, y: -40 });
  });

  it("오므려서 배율이 1보다 작아져도 1에서 멈춘다", () => {
    expect(toPinchZoom({ start: NO_ZOOM, startCenter: { x: 0, y: 0 }, startDistance: 200, center: { x: 0, y: 0 }, distance: 50 }).scale).toBe(1);
  });

  it("가장 큰 배율을 넘게 벌려도 가장 큰 배율에서 멈춘다", () => {
    expect(toPinchZoom({ start: { scale: 3, x: 0, y: 0 }, startCenter: { x: 0, y: 0 }, startDistance: 100, center: { x: 0, y: 0 }, distance: 300 }).scale).toBe(MAX_ZOOM_SCALE);
  });

  it("시작할 때 두 손가락이 같은 자리였으면 배율을 바꾸지 않는다", () => {
    expect(toPinchZoom({ start: NO_ZOOM, startCenter: { x: 0, y: 0 }, startDistance: 0, center: { x: 0, y: 0 }, distance: 80 })).toEqual(NO_ZOOM);
  });
});

describe("toDoubleTapZoom", () => {
  it("원래 크기에서 두 번 누르면 누른 지점을 그 자리에 두고 확대한다", () => {
    const zoom = toDoubleTapZoom({ zoom: NO_ZOOM, point: { x: 100, y: -40 } });

    expect(zoom.scale).toBe(DOUBLE_TAP_ZOOM_SCALE);
    expect(zoom.x).toBeCloseTo(100 - DOUBLE_TAP_ZOOM_SCALE * 100);
    expect(zoom.y).toBeCloseTo(-40 + DOUBLE_TAP_ZOOM_SCALE * 40);
  });

  it("확대한 상태에서 두 번 누르면 원래 크기로 돌아간다", () => {
    expect(toDoubleTapZoom({ zoom: { scale: 1.4, x: 20, y: 10 }, point: { x: 0, y: 0 } })).toEqual(NO_ZOOM);
  });
});

describe("isDoubleTap", () => {
  it("짧은 사이에 가까운 곳을 두 번 누르면 두 번 누르기다", () => {
    expect(isDoubleTap({ previous: { x: 10, y: 10, time: 1000 }, current: { x: 20, y: 18, time: 1250 } })).toBe(true);
  });

  it("첫 누르기가 없으면 두 번 누르기가 아니다", () => {
    expect(isDoubleTap({ previous: undefined, current: { x: 10, y: 10, time: 1000 } })).toBe(false);
  });

  it("사이가 길면 두 번 누르기가 아니다", () => {
    expect(isDoubleTap({ previous: { x: 10, y: 10, time: 1000 }, current: { x: 10, y: 10, time: 1400 } })).toBe(false);
  });

  it("떨어진 곳을 누르면 두 번 누르기가 아니다", () => {
    expect(isDoubleTap({ previous: { x: 10, y: 10, time: 1000 }, current: { x: 80, y: 10, time: 1100 } })).toBe(false);
  });
});
