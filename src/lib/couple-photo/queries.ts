import "server-only";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import type { RememberablePhoto } from "@/lib/photos/remembered-url";
import { getHomePhotoSignedUrls } from "@/lib/photos/signed-urls";
import { createClient } from "@/lib/supabase/server";
import { createCouplePhotoSigner } from "./photo-url";

const signCouplePhoto = createCouplePhotoSigner(getHomePhotoSignedUrls);

/** 커플 사진을 불러오지 못했을 때 */
export class CouplePhotoLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("커플 사진을 불러오지 못했어요.", options);
    this.name = "CouplePhotoLoadError";
  }
}

/**
 * 두 사람이 함께 보는 커플 사진의 서명 URL을 경로·만료 시각과 함께 돌려준다. 홈 카드용 중간 크기가 있으면 그 주소를, 없으면 원본 주소를 준다.
 *
 * @returns 커플 사진이 없으면 undefined
 * @throws {CouplePhotoLoadError} 조회나 서명 URL 발급이 실패했을 때
 * @example const photo = await getCouplePhoto()
 */
export const getCouplePhoto = async (): Promise<RememberablePhoto | undefined> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("couple_photo").select("path").maybeSingle();
  if (error) throw new CouplePhotoLoadError({ cause: error });
  if (!data?.path) return undefined;

  const { photo, error: signError } = await signCouplePhoto(supabase.storage.from(ALBUM_BUCKET), data.path);
  if (signError) throw new CouplePhotoLoadError({ cause: signError });
  if (!photo) throw new CouplePhotoLoadError({ cause: new Error(`서명 주소를 받지 못한 경로: ${data.path}`) });
  return photo;
};
