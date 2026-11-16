import { withCurrentMember } from "@/lib/auth/with-member";
import { parseMapPhotoIds } from "@/lib/dates/map-photos";
import { getMapPhotos, MapPhotoLoadError } from "@/lib/dates/map-queries";
import { catchLoadError } from "@/lib/load";
import { NO_STORE_HEADERS, toErrorResponse } from "@/lib/api-response";

/**
 * 지도 사진(#249). 고른 사진 id(최대 40개)의 썸네일 서명 주소와 기록 제목·날짜를 돌려준다.
 * 화면 안 핀의 썸네일과 핀을 눌렀을 때의 사진 줄이 쓴다. 허용목록 멤버만 받는다(아니면 로그인 화면으로 보낸다).
 */
export const GET = async (request: Request): Promise<Response> => {
  const photoIds = parseMapPhotoIds(new URL(request.url).searchParams.get("ids"));
  // 멤버 확인과 사진 읽기를 함께 시작한다(#344). 고른 사진이 잘못됐어도 멤버가 아니면 400보다 멤버 확인의 이동이 먼저다
  const [, photos] = await withCurrentMember(async () =>
    photoIds ? catchLoadError(() => getMapPhotos(photoIds), MapPhotoLoadError) : undefined,
  );
  if (!photos) return toErrorResponse("INVALID_IDS", "사진을 다시 골라 주세요.", 400);
  if (photos instanceof MapPhotoLoadError) return toErrorResponse("MAP_PHOTOS_FAILED", photos.message, 502);
  return Response.json({ items: photos }, { headers: NO_STORE_HEADERS });
};
