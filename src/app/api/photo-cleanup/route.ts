import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isAuthorizedCronRequest } from "@/lib/cron";
import { getSupabaseEnv } from "@/lib/env";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import { cleanupOrphanPhotos, shouldDeleteOrphans, type PhotoFileReferences } from "@/lib/photos/orphan-cleanup";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import type { Database } from "@/lib/supabase/database.types";

const NO_STORE = { "Cache-Control": "no-store" };

// 읽는 칸은 FILE_PATH_COLUMNS(src/lib/photos/album-files.ts)와 같아야 한다
const readPhotoFileReferences = async (supabase: SupabaseClient<Database>): Promise<PhotoFileReferences> => {
  const photos = await readAllRows({
    fetchPage: (afterId, limit) => {
      const query = supabase.from("photos").select("id, path, thumb_path");
      return (afterId ? query.gt("id", afterId) : query).order("id").limit(limit);
    },
    toError: (cause) => new Error("사진 기록을 읽지 못했습니다.", { cause }),
  });
  const { data, error } = await supabase.from("couple_photo").select("path").maybeSingle();
  if (error) throw new Error(`커플 사진 기록을 읽지 못했습니다: ${error.message}`);
  const trash = await readAllRows({
    fetchPage: (afterId, limit) => {
      const query = supabase.from("photo_trash").select("id, path, thumb_path, deleted_at");
      return (afterId ? query.gt("id", afterId) : query).order("id").limit(limit);
    },
    toError: (cause) => new Error("휴지통을 읽지 못했습니다.", { cause }),
  });

  return { photos, couplePhotoPath: data?.path ?? undefined, trash };
};

const deletePhotoTrashRows = async (supabase: SupabaseClient<Database>, ids: string[]): Promise<void> => {
  const { error } = await supabase.from("photo_trash").delete().in("id", ids);
  if (error) throw new Error(`휴지통 행을 지우지 못했습니다: ${error.message}`, { cause: error });
};

/**
 * Vercel Cron이 매달 1일 부르는 경로(vercel.json, #31). album 버킷에서 기록·커플 사진·휴지통이 가리키지 않고 올린 지
 * 하루 넘은 파일과, 휴지통에서 보관 기간(30일, #311)이 지난 파일을 찾는다. 환경 변수 `PHOTO_CLEANUP_DELETE=true`일 때만 지우고, 아니면 지울 목록만 돌려준다.
 * `?preview=1`로 부르면 그 값과 상관없이 지우지 않아 지우기 전에 목록을 볼 수 있다. CRON_SECRET이 맞는 요청만 받는다.
 * 지울 목록이 이상해 멈추면(`blocked`) Vercel 실행 기록에 실패로 보이도록 409를 돌려준다.
 * 응답의 버킷 파일 수·크기 합계는 GitHub Actions의 저장 공간 월간 점검(storage-check.yml, #310)이 미리 보기로 읽는다.
 */
export const GET = async (request: Request): Promise<Response> => {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ code: "UNAUTHORIZED", message: "허락되지 않은 요청입니다." }, { status: 401, headers: NO_STORE });
  }

  // 회원이 아닌 서버가 모든 파일 목록을 읽고 지우려면 RLS를 넘는 비밀 키가 필요하다. 이 경로에서만 쓴다
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    console.error("사진 정리: SUPABASE_SECRET_KEY가 없습니다");
    return Response.json(
      { code: "CLEANUP_NOT_CONFIGURED", message: "사진 정리 설정이 없습니다." },
      { status: 500, headers: NO_STORE },
    );
  }

  try {
    const supabase = createClient<Database>(getSupabaseEnv().url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await cleanupOrphanPhotos({
      storage: supabase.storage.from(ALBUM_BUCKET),
      readReferences: () => readPhotoFileReferences(supabase),
      now: new Date(),
      deleteTrashRows: (ids) => deletePhotoTrashRows(supabase, ids),
      shouldDelete: shouldDeleteOrphans({ requestUrl: request.url, deleteFlag: process.env.PHOTO_CLEANUP_DELETE }),
    });
    // Hobby 플랜의 Cron 로그는 1시간 뒤 사라지지만, 그 안에 실행 기록에서 무엇을 지웠는지 볼 수 있게 남긴다
    console.info("사진 정리", JSON.stringify(result));
    return Response.json(result, { status: result.status === "blocked" ? 409 : 200, headers: NO_STORE });
  } catch (error) {
    console.error("사진 정리 실패", error);
    return Response.json({ code: "CLEANUP_FAILED", message: "사진을 정리하지 못했습니다." }, { status: 502, headers: NO_STORE });
  }
};
