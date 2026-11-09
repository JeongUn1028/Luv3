import { toCouplePhotoMediumPath } from "@/lib/photos/paths";
import { toRememberablePhoto, type RememberablePhoto } from "@/lib/photos/remembered-url";
import type { GetSignedUrls, SigningBucket } from "@/lib/photos/signed-urls";

/** 커플 사진 주소를 받은 결과. 둘 다 서명하지 못했으면 `photo`가 없다 */
export type CouplePhotoUrlResult = { photo: RememberablePhoto | undefined; error?: undefined } | { photo?: undefined; error: Error };

/** 커플 사진 원본 경로로 홈 카드에 쓸 서명 주소를 받는다 */
export type SignCouplePhoto = (bucket: SigningBucket, path: string) => Promise<CouplePhotoUrlResult>;

/**
 * 홈 카드용 중간 크기가 있으면 그 주소를, 없으면 원본 주소를 받는 함수를 만든다.
 * 휴대폰이 주소를 경로로 기억할 수 있게 고른 파일의 경로·주소·만료 시각을 함께 준다(#219).
 * 중간 크기를 만들기 전(#218)에 올린 사진은 원본만 있다. 중간 크기는 경로를 저장하기 전에 올리고 경로를 다시 쓰지 않아
 * 한 번 없던 중간 크기는 나중에도 없으므로, 기억해 두고 다시 서명하지 않는다(서명 보관 함수는 실패한 경로를 다시 서명한다).
 *
 * @example
 * const signCouplePhoto = createCouplePhotoSigner(getHomePhotoSignedUrls)
 * const { photo, error } = await signCouplePhoto(supabase.storage.from(ALBUM_BUCKET), path)
 */
export const createCouplePhotoSigner = (getSignedUrls: GetSignedUrls): SignCouplePhoto => {
  const missingMediumPaths = new Set<string>();

  return async (bucket, path) => {
    const mediumPath = toCouplePhotoMediumPath(path);
    const paths = missingMediumPaths.has(mediumPath) ? [path] : [mediumPath, path];
    const { data, error } = await getSignedUrls(bucket, paths);
    if (error) return { error };

    const findPhoto = (target: string): RememberablePhoto | undefined => toRememberablePhoto(data.find((signed) => signed.path === target));
    const medium = paths.includes(mediumPath) ? findPhoto(mediumPath) : undefined;
    const original = findPhoto(path);
    // 원본까지 없으면 파일이 지워진 경우라 중간 크기도 기억하지 않는다
    if (paths.includes(mediumPath) && !medium && original) missingMediumPaths.add(mediumPath);
    return { photo: medium ?? original };
  };
};
