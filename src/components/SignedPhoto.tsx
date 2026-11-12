"use client";

import { useRouter } from "next/navigation";
import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type SyntheticEvent,
} from "react";
import { refreshSignedInScreen } from "@/lib/navigation/refresh-signed-in";
import { photoRefreshGate } from "@/lib/photos/photo-retry";

export interface SignedPhotoProps extends Omit<ComponentPropsWithoutRef<"img">, "src" | "onError"> {
  /** 서명 주소. 유효 시간이 지나면 받지 못한다 */
  src: string;
  alt: string;
  /** 받지 못했을 때 먼저 불린다. true를 돌려주면 부른 쪽이 다른 주소로 다시 그리므로 화면을 새로 받지 않는다 */
  onLoadFailed?: () => boolean;
  /**
   * 사진을 다 받으면 불린다. 서버가 그린 사진을 화면이 연결되기 전에 다 받아 `onLoad`를 놓쳐도, 붙은 뒤에 알린다.
   * 받은 사진 요소를 넘겨 크기(`naturalWidth`·`naturalHeight`)를 읽을 수 있다. 같은 사진에 두 번 불릴 수 있다
   */
  onLoaded?: (image: HTMLImageElement) => void;
}

/**
 * 서명 주소로 받는 사진. 받지 못하면 화면을 새로 받아 새 주소로 한 번 더 받는다(#163).
 * 화면을 오래 열어 두면 주소가 만료돼, 나중에 받는(lazy) 사진이 빈 칸으로 남는다.
 * 같은 주소가 다시 오면(잠깐 끊긴 경우 등) 그 주소로 한 번만 더 받아, 계속 실패해도 되풀이하지 않는다.
 * 다른 사진이 먼저 새로 받기를 시작했으면 기다린다. 그 화면이 오면 이 사진도 새 주소를 받는다.
 *
 * @example <SignedPhoto src={tile.thumbUrl} alt={tile.title} loading="lazy" className="size-full object-cover" />
 */
export const SignedPhoto = ({ src, alt, onLoadFailed, onLoad, onLoaded, ...props }: SignedPhotoProps): ReactElement => {
  const router = useRouter();
  const imageRef = useRef<HTMLImageElement>(null);
  const [retriedSrc, setRetriedSrc] = useState<string>();
  const isRetried = retriedSrc === src;

  const handleError = async () => {
    if (onLoadFailed?.() || isRetried || !photoRefreshGate.tryClaim()) return;
    // 새 화면이 올 때 함께 다시 그려, 새 주소면 그 주소로, 같은 주소면 새 요소로 다시 받는다
    await refreshSignedInScreen(() =>
      startTransition(() => {
        setRetriedSrc(src);
        router.refresh();
      }),
    );
  };

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    onLoad?.(event);
    onLoaded?.(event.currentTarget);
  };

  const handleBrokenBeforeMount = useEffectEvent(handleError);
  const handleLoadedBeforeMount = useEffectEvent((image: HTMLImageElement) => onLoaded?.(image));

  // 서버가 그린 사진은 화면이 연결되기 전에 끝나면 onLoad·onError를 놓치므로, 붙은 뒤에 이미 받았거나 깨졌는지 본다
  useEffect(() => {
    const image = imageRef.current;
    if (!image?.complete) return;
    if (image.naturalWidth === 0) handleBrokenBeforeMount();
    else handleLoadedBeforeMount(image);
  }, [src]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 업로드 때 이미 줄인 사진이라 next/image 최적화를 다시 거치지 않는다
    <img key={isRetried ? `${src}#retry` : src} ref={imageRef} src={src} alt={alt} onError={handleError} onLoad={handleLoad} {...props} />
  );
};
