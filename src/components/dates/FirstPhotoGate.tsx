"use client";

import { createContext, use, useState, type ReactElement, type ReactNode } from "react";

interface FirstPhotoGateValue {
  /** 첫 사진의 원본을 다 받았는지. 받기 전에 다른 사진으로 넘겼으면 그 사진이라도 다 받았는지다 */
  isFirstPhotoShown: boolean;
  markFirstPhotoShown: () => void;
}

// 감싸지 않은 곳에는 먼저 받을 사진이 없으니 기다리지 않는다
const FirstPhotoGateContext = createContext<FirstPhotoGateValue>({ isFirstPhotoShown: true, markFirstPhotoShown: () => undefined });

interface FirstPhotoGateProps {
  children: ReactNode;
}

/**
 * 기록 상세에서 첫 사진을 다 받았는지 나눠 갖는 틀(#313). 사진은 `PhotoCarousel`이 알리고,
 * 동선 지도처럼 첫 화면에 꼭 필요하지 않은 것은 이 값을 보고 사진을 받은 뒤에 불러와 회선을 나눠 쓰지 않는다.
 *
 * @example <FirstPhotoGate><PhotoCarousel … /><RecordRoute … /></FirstPhotoGate>
 */
export const FirstPhotoGate = ({ children }: FirstPhotoGateProps): ReactElement => {
  const [isFirstPhotoShown, setIsFirstPhotoShown] = useState(false);
  return <FirstPhotoGateContext value={{ isFirstPhotoShown, markFirstPhotoShown: () => setIsFirstPhotoShown(true) }}>{children}</FirstPhotoGateContext>;
};

/**
 * 첫 사진을 다 받았는지와 받았다고 알리는 함수.
 *
 * @example const { isFirstPhotoShown } = useFirstPhotoGate()
 */
export const useFirstPhotoGate = (): FirstPhotoGateValue => use(FirstPhotoGateContext);
