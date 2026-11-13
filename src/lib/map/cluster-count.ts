/**
 * 숫자 동그라미(묶음)에 보일 숫자: 묶인 핀들의 사진 수 합(#343). 카카오 묶음 기능은 기본으로 묶인 핀 개수를 쓰는데,
 * 핀 하나는 가까운 사진을 모은 자리라 핀 개수와 사진 수가 다르다. 사진 수를 모르는 핀은 1장으로 센다(핀은 사진이 있어야 생긴다).
 *
 * @example sumClusterPhotoCount({ pins: cluster.getMarkers(), photoCountOf: (pin) => photoCounts.get(pin) }) // 2장 + 1장 → 3
 */
export const sumClusterPhotoCount = <Pin>({ pins, photoCountOf }: { pins: readonly Pin[]; photoCountOf: (pin: Pin) => number | undefined }): number =>
  pins.reduce((sum, pin) => sum + (photoCountOf(pin) ?? 1), 0);
