import "server-only";
import { ALBUM_BUCKET, SIGNED_URL_EXPIRES_IN } from "@/lib/photos/limits";
import { createClient } from "@/lib/supabase/server";

/** 커플 사진을 불러오지 못했을 때 */
export class CouplePhotoLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("커플 사진을 불러오지 못했어요.", options);
    this.name = "CouplePhotoLoadError";
  }
}

/**
 * 두 사람이 함께 보는 커플 사진의 서명 URL을 발급한다.
 *
 * @returns 커플 사진이 없으면 undefined
 * @throws {CouplePhotoLoadError} 조회나 서명 URL 발급이 실패했을 때
 * @example const photoUrl = await getCouplePhotoUrl()
 */
export const getCouplePhotoUrl = async (): Promise<string | undefined> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("couple_photo").select("path").maybeSingle();
  if (error) throw new CouplePhotoLoadError({ cause: error });
  if (!data?.path) return undefined;

  const { data: signed, error: signError } = await supabase.storage
    .from(ALBUM_BUCKET)
    .createSignedUrl(data.path, SIGNED_URL_EXPIRES_IN);
  if (signError) throw new CouplePhotoLoadError({ cause: signError });
  return signed.signedUrl;
};
