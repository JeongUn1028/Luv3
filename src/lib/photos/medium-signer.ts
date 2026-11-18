import { findMediumPhotoPath } from "./paths";
import { toSignedByPath, type CachedSignedUrlsResult, type GetSignedUrls, type SigningBucket } from "./signed-urls";

export interface SignWithMediumParams {
  /** 원본 경로. 옆의 중간 크기(`_medium.jpg`) 경로도 함께 서명한다 */
  originalPaths: string[];
  /** 같은 요청에 함께 서명할 다른 경로(썸네일 등) */
  otherPaths?: string[];
}

/** 원본과 그 옆의 중간 크기를 함께 서명한다. 결과는 `toSignedByPath`로 경로마다 찾는다 */
export type SignWithMedium = (bucket: SigningBucket, params: SignWithMediumParams) => Promise<CachedSignedUrlsResult>;

/**
 * 원본 경로 옆의 중간 크기(커플 사진 #218, 기록 상세 #411)까지 한 번에 서명하는 함수를 만든다. 중간 크기는 경로를 DB에 두지 않아
 * 이름 규칙으로 찾고, 중간 크기를 만들기 전에 올린 사진에는 없다. 중간 크기는 원본 경로를 저장하기 전에 올리고 덮어쓰지 않아
 * 한 번 없던 중간 크기는 나중에도 없으므로, 원본은 서명됐는데 중간 크기가 없던 경로는 기억해 다시 서명하지 않는다
 * (서명 보관 함수는 서명하지 못한 경로를 보관하지 않아 매번 다시 묻는다). 기억은 서버 인스턴스마다 따로이며,
 * 예전 사진 수만큼만 늘어난다.
 *
 * @example
 * const signWithMedium = createMediumPhotoSigner(getSignedUrls)
 * const { data, error } = await signWithMedium(supabase.storage.from(ALBUM_BUCKET), { originalPaths, otherPaths: [thumbPath] })
 */
export const createMediumPhotoSigner = (getSignedUrls: GetSignedUrls): SignWithMedium => {
  const missingMediumPaths = new Set<string>();

  return async (bucket, { originalPaths, otherPaths = [] }) => {
    const mediumPaths = originalPaths.flatMap((path) => findMediumPhotoPath(path) ?? []).filter((path) => !missingMediumPaths.has(path));
    const result = await getSignedUrls(bucket, [...mediumPaths, ...originalPaths, ...otherPaths]);
    if (result.error) return result;

    const signedByPath = toSignedByPath(result.data);
    const isSigned = (path: string): boolean => Boolean(signedByPath.get(path)?.signedUrl);
    const requestedMediumPaths = new Set(mediumPaths);
    for (const path of originalPaths) {
      const mediumPath = findMediumPhotoPath(path);
      // 원본까지 없으면 파일이 지워졌거나 잠깐 실패한 경우라 중간 크기가 없다고 단정하지 않는다
      if (mediumPath && requestedMediumPaths.has(mediumPath) && !isSigned(mediumPath) && isSigned(path)) missingMediumPaths.add(mediumPath);
    }
    return result;
  };
};
