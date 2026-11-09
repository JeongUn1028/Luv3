import { toCouplePhotoMediumPath } from "@/lib/photos/paths";
import type { GetSignedUrls, SigningBucket } from "@/lib/photos/signed-urls";

/** 커플 사진 주소를 받은 결과. 둘 다 서명하지 못했으면 `signedUrl`이 없다 */
export type CouplePhotoUrlResult = { signedUrl: string | undefined; error?: undefined } | { signedUrl?: undefined; error: Error };

/** 커플 사진 원본 경로로 홈 카드에 쓸 서명 주소를 받는다 */
export type SignCouplePhoto = (bucket: SigningBucket, path: string) => Promise<CouplePhotoUrlResult>;

/**
 * 홈 카드용 중간 크기가 있으면 그 주소를, 없으면 원본 주소를 받는 함수를 만든다.
 * 중간 크기를 만들기 전(#218)에 올린 사진은 원본만 있다. 중간 크기는 경로를 저장하기 전에 올리고 경로를 다시 쓰지 않아
 * 한 번 없던 중간 크기는 나중에도 없으므로, 기억해 두고 다시 서명하지 않는다(서명 보관 함수는 실패한 경로를 다시 서명한다).
 *
 * @example
 * const signCouplePhoto = createCouplePhotoSigner(getSignedUrls)
 * const { signedUrl, error } = await signCouplePhoto(supabase.storage.from(ALBUM_BUCKET), path)
 */
export const createCouplePhotoSigner = (getSignedUrls: GetSignedUrls): SignCouplePhoto => {
  const missingMediumPaths = new Set<string>();

  return async (bucket, path) => {
    const mediumPath = toCouplePhotoMediumPath(path);
    const paths = missingMediumPaths.has(mediumPath) ? [path] : [mediumPath, path];
    const { data, error } = await getSignedUrls(bucket, paths);
    if (error) return { error };

    const findUrl = (target: string): string | undefined => data.find((signed) => signed.path === target)?.signedUrl ?? undefined;
    const mediumUrl = paths.includes(mediumPath) ? findUrl(mediumPath) : undefined;
    const originalUrl = findUrl(path);
    // 원본까지 없으면 파일이 지워진 경우라 중간 크기도 기억하지 않는다
    if (paths.includes(mediumPath) && !mediumUrl && originalUrl) missingMediumPaths.add(mediumPath);
    return { signedUrl: mediumUrl ?? originalUrl };
  };
};
