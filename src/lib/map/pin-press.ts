/**
 * 핀을 누른 뒤 이 시간(ms) 안에 지도가 받은 누름은 같은 손가락의 누름으로 본다.
 * 휴대폰 카카오 지도는 핀(CustomOverlay, clickable) 누름 뒤에 지도 자체의 누름을 늦게 알릴 수 있어(#300, 실기기 확인 #14),
 * 그 누름이 방금 연 칸을 바로 닫지 않게 한다. 사람이 핀을 누르고 다시 빈 곳을 누르기까지는 이보다 길다.
 */
export const PIN_PRESS_MAP_CLICK_WINDOW_MS = 500;

/**
 * 지도가 받은 누름이 방금 누른 핀에서 이어진 것인지. 그렇다면 열린 칸을 닫지 않는다.
 *
 * @example if (isMapClickFromPinPress({ pinPressedAt: pinPressedAtRef.current, now: performance.now() })) return
 */
export const isMapClickFromPinPress = ({ pinPressedAt, now }: { pinPressedAt: number | undefined; now: number }): boolean =>
  pinPressedAt !== undefined && now - pinPressedAt < PIN_PRESS_MAP_CLICK_WINDOW_MS;
