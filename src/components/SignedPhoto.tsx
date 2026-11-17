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
import { brokenPhotos, canRetryPhoto, photoRefreshGate } from "@/lib/photos/photo-retry";

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

interface PhotoRetry {
  src: string;
  count: number;
}

/**
 * 서명 주소로 받는 사진. 받지 못하면 화면을 새로 받아 새 주소로 한 번 더 받는다(#163).
 * 화면을 오래 열어 두면 주소가 만료돼, 나중에 받는(lazy) 사진이 빈 칸으로 남는다.
 * 같은 주소가 다시 오면(잠깐 끊긴 경우 등) 새 요소로 다시 받는다. 한 주소로 새로 받기를 시작하는 것은 한 번뿐이라, 계속 실패해도 되풀이하지 않는다.
 * 깨진 사진은 모두 목록에 적혀, 어느 사진이 새로 받기를 시작하든 그 화면에서 함께 다시 받는다(#407).
 * 끊긴 채 깨졌으면 새로 받지 못하므로, 깨진 사진은 다시 연결될 때 한 번 더 새로 받는다. 다시 받는 것은 주소마다 정한 횟수까지다.
 *
 * @example <SignedPhoto src={tile.thumbUrl} alt={tile.title} loading="lazy" className="size-full object-cover" />
 */
export const SignedPhoto = ({ src, alt, onLoadFailed, onLoad, onLoaded, ...props }: SignedPhotoProps): ReactElement => {
  const router = useRouter();
  const imageRef = useRef<HTMLImageElement>(null);
  const removeFromBrokenRef = useRef<() => void>(undefined);
  const [retry, setRetry] = useState<PhotoRetry>();
  const retryCount = retry?.src === src ? retry.count : 0;

  const forgetBroken = () => {
    removeFromBrokenRef.current?.();
    removeFromBrokenRef.current = undefined;
  };

  // 사진마다 듣지만 한 연결 알림에는 한 사진만 새로 받는다
  const handleOnline = (event: Event) => {
    if (brokenPhotos.tryClaimReconnect(event)) void refreshBrokenPhotos();
  };

  const markBroken = () => {
    forgetBroken();
    const removeFromList = brokenPhotos.add(() =>
      setRetry((previous) => ({ src, count: (previous?.src === src ? previous.count : 0) + 1 })),
    );
    window.addEventListener("online", handleOnline);
    removeFromBrokenRef.current = () => {
      removeFromList();
      window.removeEventListener("online", handleOnline);
    };
  };

  // 새 화면이 올 때 깨진 사진을 모두 함께 다시 그려, 새 주소면 그 주소로, 같은 주소면 새 요소로 다시 받는다
  const refreshBrokenPhotos = () =>
    refreshSignedInScreen(() =>
      startTransition(() => {
        for (const retryPhoto of brokenPhotos.takeAll()) retryPhoto();
        router.refresh();
      }),
    );

  const handleError = async () => {
    if (onLoadFailed?.() || !canRetryPhoto(retryCount)) return;
    markBroken();
    if (retryCount > 0 || !photoRefreshGate.tryClaim()) return;
    await refreshBrokenPhotos();
  };

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    forgetBroken();
    onLoad?.(event);
    onLoaded?.(event.currentTarget);
  };

  const handleBrokenBeforeMount = useEffectEvent(handleError);
  const handleLoadedBeforeMount = useEffectEvent((image: HTMLImageElement) => {
    forgetBroken();
    onLoaded?.(image);
  });

  // 서버가 그린 사진은 화면이 연결되기 전에 끝나면 onLoad·onError를 놓치므로, 붙은 뒤에 이미 받았거나 깨졌는지 본다
  useEffect(() => {
    const image = imageRef.current;
    if (!image?.complete) return;
    if (image.naturalWidth === 0) handleBrokenBeforeMount();
    else handleLoadedBeforeMount(image);
  }, [src]);

  useEffect(() => () => removeFromBrokenRef.current?.(), []);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 업로드 때 이미 줄인 사진이라 next/image 최적화를 다시 거치지 않는다
    <img
      key={retryCount === 0 ? src : `${src}#retry${retryCount}`}
      ref={imageRef}
      src={src}
      alt={alt}
      onError={handleError}
      onLoad={handleLoad}
      {...props}
    />
  );
};
