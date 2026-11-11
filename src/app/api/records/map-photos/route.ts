import { getCurrentMember } from "@/lib/auth/member";
import { parseMapPhotoIds } from "@/lib/dates/map-photos";
import { getMapPhotos, MapPhotoLoadError } from "@/lib/dates/map-queries";
import { catchLoadError } from "@/lib/load";

const NO_STORE = { "Cache-Control": "no-store" };

const toErrorResponse = (code: string, message: string, status: number): Response =>
  Response.json({ code, message }, { status, headers: NO_STORE });

/**
 * 지도 사진(#249). 고른 사진 id(최대 40개)의 썸네일 서명 주소와 기록 제목·날짜를 돌려준다.
 * 화면 안 핀의 썸네일과 핀을 눌렀을 때의 사진 줄이 쓴다. 허용목록 멤버만 받는다(아니면 로그인 화면으로 보낸다).
 */
export const GET = async (request: Request): Promise<Response> => {
  await getCurrentMember();

  const photoIds = parseMapPhotoIds(new URL(request.url).searchParams.get("ids"));
  if (!photoIds) return toErrorResponse("INVALID_IDS", "사진을 다시 골라 주세요.", 400);

  const photos = await catchLoadError(() => getMapPhotos(photoIds), MapPhotoLoadError);
  if (photos instanceof MapPhotoLoadError) return toErrorResponse("MAP_PHOTOS_FAILED", photos.message, 502);
  return Response.json({ items: photos }, { headers: NO_STORE });
};
