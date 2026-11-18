import { createMediumPhotoSigner } from "@/lib/photos/medium-signer";
import { findMediumPhotoPath } from "@/lib/photos/paths";
import { toRememberablePhoto, type RememberablePhoto } from "@/lib/photos/remembered-url";
import { toSignedByPath, type GetSignedUrls, type SigningBucket } from "@/lib/photos/signed-urls";

/** 커플 사진 주소를 받은 결과. 둘 다 서명하지 못했으면 `photo`가 없다 */
export type CouplePhotoUrlResult = { photo: RememberablePhoto | undefined; error?: undefined } | { photo?: undefined; error: Error };

/** 커플 사진 원본 경로로 홈 카드에 쓸 서명 주소를 받는다 */
export type SignCouplePhoto = (bucket: SigningBucket, path: string) => Promise<CouplePhotoUrlResult>;

/**
 * 홈 카드용 중간 크기가 있으면 그 주소를, 없으면 원본 주소를 받는 함수를 만든다.
 * 휴대폰이 주소를 경로로 기억할 수 있게 고른 파일의 경로·주소·만료 시각을 함께 준다(#219).
 * 중간 크기를 만들기 전(#218)에 올린 사진은 원본만 있고, 그런 사진은 다시 중간 크기를 서명하지 않는다(`createMediumPhotoSigner`).
 *
 * @example
 * const signCouplePhoto = createCouplePhotoSigner(getHomePhotoSignedUrls)
 * const { photo, error } = await signCouplePhoto(supabase.storage.from(ALBUM_BUCKET), path)
 */
export const createCouplePhotoSigner = (getSignedUrls: GetSignedUrls): SignCouplePhoto => {
  const signWithMedium = createMediumPhotoSigner(getSignedUrls);

  return async (bucket, path) => {
    const { data, error } = await signWithMedium(bucket, { originalPaths: [path] });
    if (error) return { error };

    const signedByPath = toSignedByPath(data);
    const mediumPath = findMediumPhotoPath(path);
    const medium = mediumPath === undefined ? undefined : toRememberablePhoto(signedByPath.get(mediumPath));
    return { photo: medium ?? toRememberablePhoto(signedByPath.get(path)) };
  };
};
