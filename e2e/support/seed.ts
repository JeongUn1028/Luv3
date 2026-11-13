import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { toKstDate } from "@/lib/anniversary";
import { PHOTO_GROUP_LOCATION_COLUMNS } from "@/lib/dates/photo-groups";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import { COUPLE_PHOTO_PATH, E2E_EVENTS, E2E_MEMBER, E2E_TODOS, PERIOD_RECORD, PHOTO_COUNT, PHOTO_FIXTURE_PATH, PHOTO_RECORD } from "./constants";
import { readLocalSupabase } from "./local-supabase";
import { getMonthCrossingPeriod } from "./period";

type AdminClient = SupabaseClient<Database>;

const createAdminClient = (): AdminClient => {
  const { url, serviceRoleKey } = readLocalSupabase();
  return createClient<Database>(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
};

/** 닉네임이 다른 작성자가 필요한 테스트의 임시 계정. 다음 실행이 이 앞글자로 찾아 지운다 */
const E2E_AUTHOR_EMAIL_PREFIX = "e2e-author-";

const assertNoError = ({ error }: { error: { message: string } | null }, step: string): void => {
  if (error) throw new Error(`E2E 데이터 준비 실패(${step}): ${error.message}`);
};

type PhotoGroupLocation = { place: string; lat: number; lng: number };

/**
 * 시드 기록의 사진 모음 위치. 모음은 위치가 꼭 있어야 한다(#297).
 * 나란히 도는 지도 테스트의 위치(createUniqueLocation: 위도 33~38, 경도 125~130)와 겹치지 않게 그 범위 밖에 둔다
 */
const SEED_GROUP_LOCATION: PhotoGroupLocation = { place: "E2E 기본 위치", lat: 39.5, lng: 131.5 };

/** 기록에 사진 모음을 하나 만들고 id를 돌려준다 */
const insertPhotoGroup = async (
  admin: AdminClient,
  {
    recordId,
    sortOrder,
    location,
    caption,
    placeName,
  }: { recordId: string; sortOrder: number; location: PhotoGroupLocation; caption?: string | undefined; placeName?: string | undefined },
): Promise<string> => {
  const id = randomUUID();
  assertNoError(
    await admin
      .from("photo_groups")
      .insert({ id, date_id: recordId, sort_order: sortOrder, place: location.place, place_lat: location.lat, place_lng: location.lng, caption, place_name: placeName }),
    "사진 모음",
  );
  return id;
};

/** 기록의 첫 사진 모음 id. 위치 없이 더하는 사진은 이 모음에 넣는다 */
const getFirstGroupId = async (admin: AdminClient, recordId: string): Promise<string> => {
  const { data, error } = await admin.from("photo_groups").select("id").eq("date_id", recordId).order("sort_order").limit(1).single();
  assertNoError({ error }, "첫 사진 모음 읽기");
  if (!data) throw new Error("E2E 데이터 준비 실패(첫 사진 모음 읽기): 모음이 없습니다");
  return data.id;
};

const uploadPhoto = async (admin: AdminClient, path: string): Promise<void> => {
  const { error } = await admin.storage
    .from(ALBUM_BUCKET)
    .upload(path, readFileSync(PHOTO_FIXTURE_PATH), { contentType: "image/jpeg", upsert: true });
  assertNoError({ error }, `사진 ${path}`);
};

/**
 * 테스트 하나에서만 쓰는 사진 1장짜리 기록을 만든다. 돌려준 함수는 상대가 기록을 지운 것처럼 행과 폴더의 파일을 모두 지운다.
 * 여러 번 불러도 되므로 테스트가 중간에 실패해도 남지 않게 마지막에 한 번 더 부른다.
 *
 * `eventLink`를 주면 그 일정의 그날에서 남긴 기록으로 잇는다.
 *
 * @example const deleteRecord = await createDisposableRecord({ id: randomUUID(), title: "지울 기록" })
 */
export const createDisposableRecord = async ({
  id,
  title,
  date,
  endDate,
  eventLink,
}: {
  id: string;
  title: string;
  eventLink?: { eventId: string; eventDate: string };
  // 날짜를 주지 않으면 어제다. 끝 날짜만 주면 시작일보다 앞설 수 있어 날짜와 함께만 받는다
} & ({ date?: undefined; endDate?: undefined } | { date: string; endDate?: string })): Promise<() => Promise<void>> => {
  const admin = createAdminClient();
  const authorId = await getMemberId(admin);

  const path = `${id}/${randomUUID()}.jpg`;
  await uploadPhoto(admin, path);
  // 오늘 날짜면 나란히 도는 홈 테스트의 "최근 기록" 자리를 잠깐 차지하므로 어제로 둔다
  const yesterday = toKstDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  assertNoError(
    await admin.from("dates").insert({
      id,
      date: date ?? yesterday,
      end_date: endDate,
      title,
      author_id: authorId,
      event_id: eventLink?.eventId,
      event_date: eventLink?.eventDate,
    }),
    "기록",
  );
  const photoId = randomUUID();
  const groupId = await insertPhotoGroup(admin, { recordId: id, sortOrder: 0, location: SEED_GROUP_LOCATION });
  assertNoError(await admin.from("photos").insert({ id: photoId, date_id: id, group_id: groupId, path, thumb_path: path, sort_order: 0 }), "사진 행");
  assertNoError(await admin.from("dates").update({ cover_photo_id: photoId }).eq("id", id), "대표 사진");

  return () => deleteRecordWithFiles(id);
};

/**
 * 묶음으로 나눠 받는 것을 보려고 사진 없는 기록을 `count`개 한 번에 만든다. 제목은 `${titlePrefix} ${번호}`이고,
 * 나란히 도는 테스트의 그리드 앞쪽을 가리지 않게 2000년부터 하루씩 둔다(번호가 클수록 최근). 돌려준 함수는 모두 지운다.
 *
 * @example const deleteRecords = await createDisposableRecords({ count: 65, titlePrefix: "E2E 묶음 찾기abc" })
 */
export const createDisposableRecords = async ({ count, titlePrefix }: { count: number; titlePrefix: string }): Promise<() => Promise<void>> => {
  const admin = createAdminClient();
  const authorId = await getMemberId(admin);
  const firstDay = Date.UTC(2000, 0, 1);
  const rows = Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    date: new Date(firstDay + index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    title: `${titlePrefix} ${index}`,
    author_id: authorId,
  }));
  assertNoError(await admin.from("dates").insert(rows), "기록 여러 개");
  const ids = rows.map(({ id }) => id);
  return async () => {
    assertNoError(await admin.from("dates").delete().in("id", ids), "기록 여러 개 지우기");
    // 지운 기록의 사진은 트리거가 휴지통(#311)에 남기므로 함께 지운다
    assertNoError(await admin.from("photo_trash").delete().in("date_id", ids), "기록 여러 개의 휴지통 지우기");
  };
};

/**
 * 기록의 태그를 바꾼다.
 *
 * @example await setRecordTags(id, ["카페"])
 */
export const setRecordTags = async (id: string, tags: string[]): Promise<void> => {
  assertNoError(await createAdminClient().from("dates").update({ tags }).eq("id", id), "기록 태그");
};

/**
 * 기록의 정리 글과 모음 한마디(#309)를 채운다(찾기 테스트). 한마디는 기록의 모든 모음에 같은 값을 넣는다.
 *
 * @example await setRecordSearchFields(id, { memo: "오래 걸었다", caption: "노을" })
 */
export const setRecordSearchFields = async (id: string, { memo, caption }: { memo: string; caption: string }): Promise<void> => {
  const admin = createAdminClient();
  assertNoError(await admin.from("dates").update({ memo }).eq("id", id), "기록 글");
  assertNoError(await admin.from("photo_groups").update({ caption }).eq("date_id", id), "모음 한마디");
};

/**
 * 기록의 모든 사진 모음에 같은 위치를 넣는다(#249, #297). 위치는 모음마다 하나라 사진이 아닌 모음 위치를 바꾼다.
 * `createDisposableRecord`의 사진 1장짜리 기록(모음 하나)에 쓴다.
 *
 * @example await setRecordGroupsLocation(id, { place: "어니언 성수", lat: 37.54, lng: 127.05 })
 */
export const setRecordGroupsLocation = async (recordId: string, { place, lat, lng }: PhotoGroupLocation): Promise<void> => {
  assertNoError(
    await createAdminClient().from("photo_groups").update({ place, place_lat: lat, place_lng: lng }).eq("date_id", recordId),
    "사진 모음 위치",
  );
};

/**
 * `createDisposableRecord`로 만든 기록에 사진을 한 장 더 붙인다. 파일은 기록 폴더에 올려 기록을 지울 때 함께 지워진다.
 * 위치를 주면 그 위치의 모음을 새로 만들어 넣고, 주지 않으면 첫 모음에 넣는다(위치는 모음마다 하나다, #297).
 * `groupCaption`은 사진이 들어간 모음의 한마디다(한마디는 모음마다 하나다, #309). `groupPlaceName`은 새로 만드는 모음의 장소 이름이다(#317).
 * `hasSeparateThumb`를 주면 썸네일을 원본과 다른 파일(`-thumb.jpg`)로 올린다. 주지 않으면 원본 파일을 썸네일로도 쓴다.
 *
 * @example const photoId = await addRecordPhoto(id, { sortOrder: 1, groupCaption: "창가 자리", location: FOREST })
 */
export const addRecordPhoto = async (
  recordId: string,
  {
    sortOrder,
    groupCaption,
    groupPlaceName,
    location,
    takenAt,
    hasSeparateThumb = false,
  }: {
    sortOrder: number;
    groupCaption?: string;
    groupPlaceName?: string;
    location?: { place: string; lat: number; lng: number };
    takenAt?: string;
    hasSeparateThumb?: boolean;
  },
): Promise<string> => {
  const admin = createAdminClient();
  const fileName = randomUUID();
  const path = `${recordId}/${fileName}.jpg`;
  await uploadPhoto(admin, path);
  const thumbPath = hasSeparateThumb ? `${recordId}/${fileName}-thumb.jpg` : path;
  if (hasSeparateThumb) await uploadPhoto(admin, thumbPath);
  const id = randomUUID();
  const groupId = location
    ? await insertPhotoGroup(admin, { recordId, sortOrder, location, caption: groupCaption, placeName: groupPlaceName })
    : await getFirstGroupId(admin, recordId);
  if (!location && groupCaption !== undefined) {
    assertNoError(await admin.from("photo_groups").update({ caption: groupCaption }).eq("id", groupId), "첫 모음 한마디");
  }
  assertNoError(
    await admin.from("photos").insert({
      id,
      date_id: recordId,
      group_id: groupId,
      path,
      thumb_path: thumbPath,
      sort_order: sortOrder,
      taken_at: takenAt,
    }),
    "사진 행 더하기",
  );
  return id;
};

/**
 * 기록을 만들 때 붙은 첫 사진 모음을 그 사진과 함께 지운다. 시드 모음은 기본 위치가 있어, 더한 사진의 위치만 보려는 테스트(동선)에 쓴다.
 * 대표 사진이 지워지면 기록의 대표 사진은 비워진다(외래 키 on delete set null).
 *
 * @example await deleteFirstPhotoGroup(id)
 */
export const deleteFirstPhotoGroup = async (recordId: string): Promise<void> => {
  const admin = createAdminClient();
  const groupId = await getFirstGroupId(admin, recordId);
  assertNoError(await admin.from("photo_groups").delete().eq("id", groupId), "첫 사진 모음 지우기");
  // 지운 모음의 사진은 트리거가 휴지통(#311)에 남긴다. 테스트 준비라 행만 지우고, 파일은 기록을 지울 때 함께 지운다
  assertNoError(await admin.from("photo_trash").delete().eq("date_id", recordId), "첫 사진 모음의 휴지통 지우기");
};

/**
 * 기록에 같은 위치의 사진 모음을 하나 만들어 사진 행을 `count`개 더한다. 파일은 새로 올리지 않고 첫 사진 파일을 같이 가리켜, 많은 사진이 필요한 테스트를 빠르게 준비한다.
 * 기록을 지우면 행도 함께 지워진다. 돌려준 id는 사진 순서대로다.
 *
 * @example const photoIds = await addLocatedPhotoRows(id, { count: 13, location: FOREST })
 */
export const addLocatedPhotoRows = async (
  recordId: string,
  { count, location }: { count: number; location: { place: string; lat: number; lng: number } },
): Promise<string[]> => {
  const admin = createAdminClient();
  const { data: first, error } = await admin.from("photos").select("path").eq("date_id", recordId).order("sort_order").limit(1).single();
  assertNoError({ error }, "첫 사진 읽기");
  if (!first) throw new Error("E2E 데이터 준비 실패(첫 사진 읽기): 사진이 없습니다");
  const groupId = await insertPhotoGroup(admin, { recordId, sortOrder: 1, location });
  const rows = Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    date_id: recordId,
    group_id: groupId,
    path: first.path,
    thumb_path: first.path,
    sort_order: index + 1,
  }));
  assertNoError(await admin.from("photos").insert(rows), "사진 행 여러 개 더하기");
  return rows.map(({ id }) => id);
};

/**
 * 기록의 사진 id를 사진 순서대로 읽는다.
 *
 * @example const [firstPhotoId] = await getRecordPhotoIds(id)
 */
export const getRecordPhotoIds = async (recordId: string): Promise<string[]> => {
  const { data, error } = await createAdminClient().from("photos").select("id").eq("date_id", recordId).order("sort_order");
  if (error) throw new Error(`사진 id 읽기 실패: ${error.message}`);
  return data.map(({ id }) => id);
};

/**
 * 기록의 사진 위치(사진이 속한 모음의 위치)를 사진 순서대로 읽는다.
 *
 * @example expect(await getRecordPhotoLocations(id)).toEqual([{ place: "성수동", place_lat: 37.54, place_lng: 127.05 }])
 */
export const getRecordPhotoLocations = async (recordId: string): Promise<{ place: string; place_lat: number; place_lng: number }[]> => {
  const { data, error } = await createAdminClient()
    .from("photos")
    .select(PHOTO_GROUP_LOCATION_COLUMNS)
    .eq("date_id", recordId)
    .order("sort_order");
  if (error) throw new Error(`사진 위치 읽기 실패: ${error.message}`);
  return data.map(({ group }) => group);
};

/**
 * 기록의 모음 한마디를 모음 순서대로 읽는다(#309). 한마디가 없는 모음은 null이다.
 *
 * @example expect(await getRecordGroupCaptions(id)).toEqual(["카페", null])
 */
export const getRecordGroupCaptions = async (recordId: string): Promise<(string | null)[]> => {
  const { data, error } = await createAdminClient().from("photo_groups").select("caption").eq("date_id", recordId).order("sort_order");
  if (error) throw new Error(`모음 한마디 읽기 실패: ${error.message}`);
  return data.map(({ caption }) => caption);
};

/**
 * 기록의 모음 장소 이름을 모음 순서대로 읽는다(#317). 이름이 없는 모음은 null이다.
 *
 * @example expect(await getRecordGroupPlaceNames(id)).toEqual(["골목 끝 카페", null])
 */
export const getRecordGroupPlaceNames = async (recordId: string): Promise<(string | null)[]> => {
  const { data, error } = await createAdminClient().from("photo_groups").select("place_name").eq("date_id", recordId).order("sort_order");
  if (error) throw new Error(`모음 장소 이름 읽기 실패: ${error.message}`);
  return data.map(({ place_name: placeName }) => placeName);
};

/**
 * 기록의 대표 사진이 사진 순서에서 몇 번째(0부터)인지 읽는다. 사진 순서를 바꿔 저장했는지 볼 때 쓴다.
 *
 * @example expect(await getRecordCoverPhotoIndex(id)).toBe(1)
 */
export const getRecordCoverPhotoIndex = async (recordId: string): Promise<number> => {
  const admin = createAdminClient();
  const { data: record, error: recordError } = await admin.from("dates").select("cover_photo_id").eq("id", recordId).single();
  if (recordError) throw new Error(`대표 사진 읽기 실패: ${recordError.message}`);
  const { data: photos, error } = await admin.from("photos").select("id").eq("date_id", recordId).order("sort_order");
  if (error) throw new Error(`사진 순서 읽기 실패: ${error.message}`);
  return photos.findIndex(({ id }) => id === record.cover_photo_id);
};

/**
 * 기록의 사진마다 위치·찍은 시각과 원본 파일 경로를 사진 순서대로 읽는다.
 *
 * @example const [photo] = await getRecordPhotoDetails(id)
 */
export const getRecordPhotoDetails = async (
  recordId: string,
): Promise<{ place: string; place_lat: number; place_lng: number; taken_at: string | null; path: string }[]> => {
  const { data, error } = await createAdminClient()
    .from("photos")
    .select(`taken_at, path, ${PHOTO_GROUP_LOCATION_COLUMNS}`)
    .eq("date_id", recordId)
    .order("sort_order");
  if (error) throw new Error(`사진 정보 읽기 실패: ${error.message}`);
  return data.map(({ group, taken_at: takenAt, path }) => ({ ...group, taken_at: takenAt, path }));
};

/**
 * 앨범 버킷에 올라간 파일을 받는다. 올린 사진에 위치 정보가 남지 않았는지 볼 때 쓴다.
 *
 * @example const bytes = await downloadAlbumFile(photo.path)
 */
export const downloadAlbumFile = async (path: string): Promise<Uint8Array> => {
  const { data, error } = await createAdminClient().storage.from(ALBUM_BUCKET).download(path);
  if (error) throw new Error(`사진 받기 실패: ${error.message}`);
  return new Uint8Array(await data.arrayBuffer());
};

/**
 * 화면에서 저장한 기록의 id를 제목으로 찾는다. 제목은 `createTestName`으로 만들어 다른 테스트·실행의 기록을 잡지 않게 한다.
 *
 * @example for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id)
 */
export const getRecordIdsByTitle = async (title: string): Promise<string[]> => {
  const { data, error } = await createAdminClient().from("dates").select("id").eq("title", title);
  if (error) throw new Error(`기록 찾기 실패: ${error.message}`);
  return data.map(({ id }) => id);
};

/**
 * 상대가 고친 것처럼 기록 제목을 바꾼다.
 *
 * @example await renameRecord(id, "상대가 고친 제목")
 */
export const renameRecord = async (id: string, title: string): Promise<void> => {
  assertNoError(await createAdminClient().from("dates").update({ title }).eq("id", id), "기록 제목 바꾸기");
};

/**
 * 기록 행과 폴더의 파일, 지울 때 생긴 휴지통 행(#311)을 모두 지운다. 여러 번 불러도 된다.
 *
 * @example await deleteRecordWithFiles(id)
 */
export const deleteRecordWithFiles = async (id: string): Promise<void> => {
  const admin = createAdminClient();
  assertNoError(await admin.from("dates").delete().eq("id", id), "기록 지우기");
  const names = await listRecordFiles(id);
  if (names.length > 0) assertNoError(await admin.storage.from(ALBUM_BUCKET).remove(names.map((name) => `${id}/${name}`)), "사진 지우기");
  assertNoError(await admin.from("photo_trash").delete().eq("date_id", id), "휴지통 지우기");
};

/**
 * 상대가 앱에서 기록을 지운 것처럼 기록 행만 지운다. 사진은 트리거가 휴지통(#311)에 남기고 파일은 그대로 둔다.
 * 파일과 휴지통 행은 테스트 끝에 `deleteRecordWithFiles`로 지운다.
 *
 * @example await moveRecordToTrash(id)
 */
export const moveRecordToTrash = async (id: string): Promise<void> => {
  assertNoError(await createAdminClient().from("dates").delete().eq("id", id), "기록을 휴지통으로");
};

/**
 * 기록을 지우거나 사진을 뺄 때 휴지통에 남은 사진 id 목록(#311).
 *
 * @example expect(await listTrashedPhotoIds(id)).toHaveLength(1)
 */
export const listTrashedPhotoIds = async (recordId: string): Promise<string[]> => {
  const { data, error } = await createAdminClient().from("photo_trash").select("photo_id").eq("date_id", recordId);
  assertNoError({ error }, "휴지통 조회");
  return (data ?? []).map(({ photo_id }) => photo_id);
};

const deleteAccountWithContent = async (admin: AdminClient, userId: string): Promise<void> => {
  const { data: records, error } = await admin.from("dates").select("id").eq("author_id", userId);
  assertNoError({ error }, "기록 조회");
  // 내용이 작성자(members)를 참조하므로 먼저 지운다. 사진 행과 남이 단 댓글은 기록과 함께 지워진다
  for (const table of ["comments", "dates", "events", "todos"] as const) {
    assertNoError(await admin.from(table).delete().eq("author_id", userId), `${table} 지우기`);
  }
  // 기록을 지우면 사진이 휴지통에 남는다(#311). 테스트 데이터라 바로 비운다
  const recordIds = (records ?? []).map(({ id }) => id);
  if (recordIds.length > 0) assertNoError(await admin.from("photo_trash").delete().in("date_id", recordIds), "휴지통 지우기");
  // members는 계정을 지우면 함께 지워진다
  assertNoError(await admin.auth.admin.deleteUser(userId), "계정 지우기");
};

const getMemberId = async (admin: AdminClient): Promise<string> => {
  const { data, error } = await admin.from("members").select("id").eq("email", E2E_MEMBER.email).single();
  assertNoError({ error }, "계정 조회");
  if (!data) throw new Error("E2E 데이터 준비 실패(계정 조회): 전용 계정이 없습니다");
  return data.id;
};

/**
 * 기록에 댓글을 단다. `authorId`가 없으면 E2E 전용 계정이 단 댓글이 된다. 기록을 지우면 함께 지워진다.
 *
 * @example await createComment({ recordId, content: "또 가자", authorId: partnerId })
 */
export const createComment = async ({ recordId, content, authorId }: { recordId: string; content: string; authorId?: string }): Promise<void> => {
  const admin = createAdminClient();
  assertNoError(await admin.from("comments").insert({ date_id: recordId, content, author_id: authorId ?? (await getMemberId(admin)) }), "댓글");
};

/**
 * 테스트 하나에서만 쓰는 하고 싶은 것을 만든다. `completedAt`을 주면 완료한 항목이 된다. 돌려준 함수는 그 항목을 지운다.
 * `sortOrder`를 주지 않으면 DB가 목록 맨 뒤 순서를 붙인다.
 *
 * @example const deleteTodo = await createDisposableTodo({ id: randomUUID(), content: "고칠 항목" })
 */
export const createDisposableTodo = async ({
  id,
  content,
  completedAt,
  sortOrder,
}: {
  id: string;
  content: string;
  completedAt?: string;
  sortOrder?: number;
}): Promise<() => Promise<void>> => {
  const admin = createAdminClient();
  assertNoError(
    await admin.from("todos").insert({
      id,
      content,
      author_id: await getMemberId(admin),
      ...(completedAt && { completed_at: completedAt }),
      ...(sortOrder !== undefined && { sort_order: sortOrder }),
    }),
    "하고 싶은 것",
  );
  return async () => assertNoError(await admin.from("todos").delete().eq("id", id), "하고 싶은 것 지우기");
};

/**
 * 상대가 고친 것처럼 하고 싶은 것의 내용을 바꾼다. 판 번호는 DB 트리거가 새로 매긴다(#161).
 *
 * @example await renameTodo(id, "상대가 고친 내용")
 */
export const renameTodo = async (id: string, content: string): Promise<void> => {
  assertNoError(await createAdminClient().from("todos").update({ content }).eq("id", id), "하고 싶은 것 고치기");
};

/**
 * 상대가 하고 싶은 것을 해냄으로 표시하고 순서를 옮긴 상황을 만든다. 내용이 아니라 판 번호는 그대로다(#161).
 *
 * @example await completeAndMoveTodo(id)
 */
export const completeAndMoveTodo = async (id: string): Promise<void> => {
  assertNoError(
    await createAdminClient().from("todos").update({ completed_at: new Date().toISOString(), sort_order: -1 }).eq("id", id),
    "하고 싶은 것 해냄 표시",
  );
};

/**
 * 하고 싶은 것의 지금 내용.
 *
 * @example expect(await getTodoContent(id)).toBe("벚꽃 보기")
 */
export const getTodoContent = async (id: string): Promise<string | undefined> => {
  const { data, error } = await createAdminClient().from("todos").select("content").eq("id", id).maybeSingle();
  if (error) throw new Error(`하고 싶은 것 읽기 실패: ${error.message}`);
  return data?.content;
};

/**
 * 로그인해 쓸 수 있는 임시 멤버 계정을 만든다. 비밀번호를 바꾸는 테스트처럼 전용 계정을 쓰면 다른 테스트의 로그인이 끊기는 경우에 쓴다.
 * `remove`는 계정을 지운다. 실행이 중간에 끊겨 남은 것은 다음 실행의 `seedE2eData`가 지운다.
 *
 * @example const { email, remove } = await createDisposableMember(password)
 */
export const createDisposableMember = async (password: string, nickname = "임시"): Promise<{ id: string; email: string; remove: () => Promise<void> }> => {
  const admin = createAdminClient();
  const email = `${E2E_AUTHOR_EMAIL_PREFIX}${randomUUID()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assertNoError({ error }, "임시 멤버 계정");
  const memberId = data.user?.id;
  if (!memberId) throw new Error("E2E 데이터 준비 실패(임시 멤버 계정): 계정 id가 없습니다");

  const remove = (): Promise<void> => deleteAccountWithContent(admin, memberId);
  try {
    assertNoError(await admin.from("members").insert({ id: memberId, email, nickname }), "임시 멤버");
  } catch (insertError) {
    await remove();
    throw insertError;
  }
  return { id: memberId, email, remove };
};

/**
 * 멤버가 알림을 켠 기기 주소들(#363). 계정을 지우면 구독도 함께 지워진다.
 *
 * @example expect(await getPushSubscriptionEndpoints(memberId)).toHaveLength(1)
 */
export const getPushSubscriptionEndpoints = async (memberId: string): Promise<string[]> => {
  const { data, error } = await createAdminClient().from("push_subscriptions").select("endpoint").eq("member_id", memberId);
  assertNoError({ error }, "알림 구독 조회");
  return (data ?? []).map(({ endpoint }) => endpoint);
};

/**
 * 멤버의 앱 아이콘 숫자(서버가 세는 "앱을 연 뒤 받은 알림 수", #364)를 정한다. 계정을 지우면 함께 지워진다.
 *
 * @example await setPushBadgeCount(memberId, 3)
 */
export const setPushBadgeCount = async (memberId: string, count: number): Promise<void> => {
  assertNoError(await createAdminClient().from("push_settings").upsert({ member_id: memberId, badge_count: count }), "앱 아이콘 숫자 정하기");
};

/**
 * 멤버의 앱 아이콘 숫자(#364). 아직 알림을 받은 적이 없으면 0이다.
 *
 * @example expect(await getPushBadgeCount(memberId)).toBe(0)
 */
export const getPushBadgeCount = async (memberId: string): Promise<number> => {
  const { data, error } = await createAdminClient().from("push_settings").select("badge_count").eq("member_id", memberId).maybeSingle();
  assertNoError({ error }, "앱 아이콘 숫자 조회");
  return data?.badge_count ?? 0;
};

/**
 * 임시 멤버가 쓴 기록(사진 없음)·한 사람 일정을 만든다. 멤버의 `remove`가 함께 지운다.
 *
 * @example const { recordId, eventId } = await createMemberContent({ memberId, label: "내 글" })
 */
export const createMemberContent = async ({ memberId, label }: { memberId: string; label: string }): Promise<{ recordId: string; eventId: string }> => {
  const admin = createAdminClient();
  const recordId = randomUUID();
  const eventId = randomUUID();
  const today = toKstDate(new Date());
  // 오늘 날짜면 나란히 도는 홈 테스트의 "최근 기록" 자리를 잠깐 차지하므로 어제로 둔다
  const yesterday = toKstDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  assertNoError(await admin.from("dates").insert({ id: recordId, date: yesterday, title: `${label} 기록`, author_id: memberId }), "기록");
  assertNoError(await admin.from("events").insert({ id: eventId, date: today, title: `${label} 일정`, is_together: false, author_id: memberId }), "일정");
  return { recordId, eventId };
};

/**
 * 화면에서 저장한 하고 싶은 것을 내용으로 찾아 지운다. 내용은 `createTestName`으로 만들어 다른 테스트·실행의 항목을 지우지 않게 한다.
 *
 * @example await deleteTodosByContent("저장한 항목")
 */
export const deleteTodosByContent = async (content: string): Promise<void> => {
  assertNoError(await createAdminClient().from("todos").delete().eq("content", content), "하고 싶은 것 지우기");
};

/**
 * 내용이 같은 하고 싶은 것의 id 목록. 같은 항목이 둘 생겼는지 볼 때 쓴다.
 *
 * @example expect(await getTodoIdsByContent(content)).toHaveLength(1)
 */
export const getTodoIdsByContent = async (content: string): Promise<string[]> => {
  const { data, error } = await createAdminClient().from("todos").select("id").eq("content", content);
  if (error) throw new Error(`하고 싶은 것 찾기 실패: ${error.message}`);
  return data.map(({ id }) => id);
};

/**
 * 상대가 다른 기기에서 기록에 사진을 더해 저장한 상태를 만든다. 판 번호도 함께 바뀐다.
 *
 * @example await addPhotoAsPartner(recordId)
 */
export const addPhotoAsPartner = async (recordId: string): Promise<void> => {
  const admin = createAdminClient();
  const photoId = randomUUID();
  const path = `${recordId}/${photoId}.jpg`;
  await uploadPhoto(admin, path);
  const groupId = await getFirstGroupId(admin, recordId);
  assertNoError(
    await admin.from("photos").insert({ id: photoId, date_id: recordId, group_id: groupId, path, thumb_path: path, sort_order: 1 }),
    "상대의 사진 행",
  );
  assertNoError(await admin.from("dates").update({ revision: randomUUID() }).eq("id", recordId), "판 번호");
};

/**
 * 테스트 하나에서만 쓰는 일정을 만든다. 날짜를 주지 않으면 오늘이다. 돌려준 함수는 그 일정을 지운다.
 *
 * @example const deleteEvent = await createDisposableEvent({ id: randomUUID(), title: "고칠 일정" })
 */
export const createDisposableEvent = async ({
  id,
  title,
  isTogether = true,
  date = toKstDate(new Date()),
  memo,
}: {
  id: string;
  title: string;
  isTogether?: boolean;
  date?: string;
  memo?: string;
}): Promise<() => Promise<void>> => {
  const admin = createAdminClient();
  assertNoError(await admin.from("events").insert({ id, title, date, memo, is_together: isTogether, author_id: await getMemberId(admin) }), "일정");
  return async () => assertNoError(await admin.from("events").delete().eq("id", id), "일정 지우기");
};

/** 테스트 하나에서만 쓰는 반복 일정 */
interface DisposableRepeatingEvent {
  id: string;
  title: string;
  date: string;
  repeatRule: "weekly" | "monthly" | "yearly";
  repeatUntil?: string;
  exceptionDates?: string[];
}

/**
 * 테스트 하나에서만 쓰는 반복 일정을 만든다. 돌려준 함수는 일정과 건너뛰는 날을 함께 지운다.
 *
 * @example const deleteEvent = await createDisposableRepeatingEvent({ id: randomUUID(), title: "수영", date: "2031-01-08", repeatRule: "weekly" })
 */
export const createDisposableRepeatingEvent = async ({
  id,
  title,
  date,
  repeatRule,
  repeatUntil,
  exceptionDates = [],
}: DisposableRepeatingEvent): Promise<() => Promise<void>> => {
  const admin = createAdminClient();
  assertNoError(
    await admin.from("events").insert({
      id,
      title,
      date,
      repeat_rule: repeatRule,
      repeat_until: repeatUntil,
      author_id: await getMemberId(admin),
    }),
    "반복 일정",
  );
  if (exceptionDates.length > 0) {
    assertNoError(
      await admin.from("event_exceptions").insert(exceptionDates.map((exceptionDate) => ({ event_id: id, date: exceptionDate }))),
      "건너뛰는 날",
    );
  }
  return async () => assertNoError(await admin.from("events").delete().eq("id", id), "반복 일정 지우기");
};

/**
 * 테스트 하나에서만 쓰는 기간 일정을 만든다. 돌려준 함수는 일정을 지운다.
 *
 * @example const deleteEvent = await createDisposablePeriodEvent({ id: randomUUID(), title: "여행", date: "2020-03-10", endDate: "2020-03-12" })
 */
export const createDisposablePeriodEvent = async ({
  id,
  title,
  date,
  endDate,
}: {
  id: string;
  title: string;
  date: string;
  endDate: string;
}): Promise<() => Promise<void>> => {
  const admin = createAdminClient();
  assertNoError(await admin.from("events").insert({ id, title, date, end_date: endDate, author_id: await getMemberId(admin) }), "기간 일정");
  return async () => assertNoError(await admin.from("events").delete().eq("id", id), "기간 일정 지우기");
};

/**
 * 상대가 그날을 고치거나 지운 상황을 만든다.
 *
 * @example await skipEventDate(id, "2044-03-09")
 */
export const skipEventDate = async (id: string, date: string): Promise<void> => {
  assertNoError(await createAdminClient().from("event_exceptions").insert({ event_id: id, date }), "건너뛰는 날");
};

/**
 * 상대가 일정을 지운 상황을 만든다.
 *
 * @example await deleteEventById(id)
 */
export const deleteEventById = async (id: string): Promise<void> => {
  assertNoError(await createAdminClient().from("events").delete().eq("id", id), "일정 지우기");
};

/**
 * 상대가 반복을 끈 상황을 만든다.
 *
 * @example await stopEventRepeat(id)
 */
export const stopEventRepeat = async (id: string): Promise<void> => {
  assertNoError(await createAdminClient().from("events").update({ repeat_rule: null, repeat_until: null }).eq("id", id), "반복 끄기");
};

/**
 * 상대가 고친 것처럼 일정 제목을 바꾼다. 판 번호는 DB 트리거가 새로 매긴다(#161).
 *
 * @example await renameEvent(id, "상대가 고친 제목")
 */
export const renameEvent = async (id: string, title: string): Promise<void> => {
  assertNoError(await createAdminClient().from("events").update({ title }).eq("id", id), "일정 제목 바꾸기");
};

/**
 * 반복 일정에서 따로 고쳤거나 건너뛰는 날 목록.
 *
 * @example expect(await getEventExceptionDates(id)).toEqual([])
 */
export const getEventExceptionDates = async (id: string): Promise<string[]> => {
  const { data, error } = await createAdminClient().from("event_exceptions").select("date").eq("event_id", id);
  if (error) throw new Error(`건너뛰는 날 찾기 실패: ${error.message}`);
  return data.map(({ date }) => date);
};

/**
 * 반복 일정에서 이 날만 고쳐 따로 나온 일정의 id 목록.
 *
 * @example expect(await getDetachedEventIds(id)).toHaveLength(1)
 */
export const getDetachedEventIds = async (parentId: string): Promise<string[]> => {
  const { data, error } = await createAdminClient().from("events").select("id").eq("repeat_parent_id", parentId);
  if (error) throw new Error(`따로 나온 일정 찾기 실패: ${error.message}`);
  return data.map(({ id }) => id);
};

/**
 * 화면에서 저장한 일정을 제목으로 찾아 지운다. 제목은 `createTestName`으로 만들어 다른 테스트·실행의 일정을 지우지 않게 한다.
 *
 * @example await deleteEventsByTitle("저장한 일정")
 */
export const deleteEventsByTitle = async (title: string): Promise<void> => {
  assertNoError(await createAdminClient().from("events").delete().eq("title", title), "일정 지우기");
};

/**
 * 제목이 같은 일정의 id 목록. 같은 일정이 둘 생겼는지 볼 때 쓴다.
 *
 * @example expect(await getEventIdsByTitle(title)).toHaveLength(1)
 */
export const getEventIdsByTitle = async (title: string): Promise<string[]> => {
  const { data, error } = await createAdminClient().from("events").select("id").eq("title", title);
  if (error) throw new Error(`일정 찾기 실패: ${error.message}`);
  return data.map(({ id }) => id);
};

/**
 * 기록 폴더에 남은 파일 이름 목록.
 *
 * @example expect(await listRecordFiles(id)).toEqual([])
 */
export const listRecordFiles = async (recordId: string): Promise<string[]> => {
  const { data, error } = await createAdminClient().storage.from(ALBUM_BUCKET).list(recordId);
  assertNoError({ error }, "사진 조회");
  return (data ?? []).map(({ name }) => name);
};

/**
 * 로그인은 되지만 허용목록(members)에는 없는 계정을 만든다. 돌려준 함수는 계정을 지운다.
 *
 * @example const deleteAccount = await createNonMemberAccount("x@example.com", password)
 */
export const createNonMemberAccount = async (email: string, password: string): Promise<() => Promise<void>> => {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assertNoError({ error }, "허용목록 밖 계정");
  const userId = data.user?.id;
  if (!userId) throw new Error("E2E 데이터 준비 실패(허용목록 밖 계정): 계정 id가 없습니다");
  return async () => assertNoError(await admin.auth.admin.deleteUser(userId), "허용목록 밖 계정 지우기");
};

const clearAccount = async (admin: AdminClient): Promise<void> => {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  assertNoError({ error }, "계정 조회");
  const users = data.users.filter(({ email }) => email === E2E_MEMBER.email || email?.startsWith(E2E_AUTHOR_EMAIL_PREFIX));
  for (const user of users) await deleteAccountWithContent(admin, user.id);
};

const clearStorage = async (admin: AdminClient): Promise<void> => {
  const storage = admin.storage.from(ALBUM_BUCKET);
  const { data, error } = await storage.list(PHOTO_RECORD.id);
  assertNoError({ error }, "사진 조회");
  const paths = [COUPLE_PHOTO_PATH, ...(data ?? []).map(({ name }) => `${PHOTO_RECORD.id}/${name}`)];
  assertNoError(await storage.remove(paths), "사진 지우기");
};

const seedRecords = async (admin: AdminClient, authorId: string): Promise<void> => {
  const period = getMonthCrossingPeriod();
  assertNoError(
    await admin.from("dates").insert([
      { id: PHOTO_RECORD.id, date: toKstDate(new Date()), title: PHOTO_RECORD.title, author_id: authorId },
      { id: PERIOD_RECORD.id, date: period.startDate, end_date: period.endDate, title: PERIOD_RECORD.title, author_id: authorId },
    ]),
    "기록",
  );

  const groupId = await insertPhotoGroup(admin, { recordId: PHOTO_RECORD.id, sortOrder: 0, location: SEED_GROUP_LOCATION });
  const photos = Array.from({ length: PHOTO_COUNT }, (_, index) => {
    const path = `${PHOTO_RECORD.id}/${randomUUID()}.jpg`;
    return { id: randomUUID(), date_id: PHOTO_RECORD.id, group_id: groupId, path, thumb_path: path, sort_order: index };
  });
  await Promise.all(photos.map(({ path }) => uploadPhoto(admin, path)));
  assertNoError(await admin.from("photos").insert(photos), "사진 행");
  assertNoError(await admin.from("dates").update({ cover_photo_id: photos[0]?.id }).eq("id", PHOTO_RECORD.id), "대표 사진");
};

const seedEventsAndTodos = async (admin: AdminClient, authorId: string): Promise<void> => {
  const today = toKstDate(new Date());
  assertNoError(
    await admin.from("events").insert(E2E_EVENTS.map(({ id, title }) => ({ id, title, date: today, author_id: authorId }))),
    "일정",
  );
  // 로컬 DB에 다른 항목이 있어도 맨 위에 오도록 순서 값을 음수로 둔다
  assertNoError(
    await admin
      .from("todos")
      .insert(E2E_TODOS.map(({ id, content }, index) => ({ id, content, author_id: authorId, sort_order: index - E2E_TODOS.length }))),
    "하고 싶은 것",
  );
};

const readCouplePhotoPath = async (admin: AdminClient): Promise<string | null> => {
  const { data, error } = await admin.from("couple_photo").select("path").single();
  assertNoError({ error }, "커플 사진 조회");
  return data?.path ?? null;
};

/** 커플 사진이 비어 있을 때만 E2E 사진을 넣는다. 로컬에 이미 있는 사진은 건드리지 않아 잃을 일이 없다 */
const seedCouplePhoto = async (admin: AdminClient): Promise<void> => {
  const path = await readCouplePhotoPath(admin);
  if (path && path !== COUPLE_PHOTO_PATH) return;
  await uploadPhoto(admin, COUPLE_PHOTO_PATH);
  assertNoError(await admin.from("couple_photo").update({ path: COUPLE_PHOTO_PATH }).eq("id", true), "커플 사진");
};

/**
 * 지금 커플 사진의 경로. 없으면 undefined다.
 *
 * @example expect(await getCouplePhotoPath()).not.toBe(COUPLE_PHOTO_PATH)
 */
export const getCouplePhotoPath = async (): Promise<string | undefined> => (await readCouplePhotoPath(createAdminClient())) ?? undefined;

/** 커플 사진 폴더(`couple/`)의 파일 경로 목록 */
const listCouplePhotoFiles = async (admin: AdminClient): Promise<string[]> => {
  const { data, error } = await admin.storage.from(ALBUM_BUCKET).list("couple", { limit: 1000 });
  assertNoError({ error }, "커플 사진 파일 조회");
  return (data ?? []).map(({ name }) => `couple/${name}`);
};

/**
 * 커플 사진을 실제로 바꾸는 테스트를 위해 커플 사진을 E2E 사진으로 바꿔 둔다. 이 함수를 쓰는 스펙은 `SHARED_DATA_SPECS`에 넣는다.
 * 앱은 사진을 바꾸면 밀려난 파일을 지우므로, 로컬에 원래 있던 사진은 경로만 기억해 두고 파일은 앱이 건드리지 않게 한다.
 * 돌려준 함수는 원래 경로로 되돌리고, 그 사이 `couple/`에 새로 생긴 파일(저장하지 못하고 남은 파일 포함)을 지운다.
 * 원래 경로가 E2E 사진이면 앱이 지운 파일을 다시 올린다. 브라우저의 올리기·저장이 끝난 뒤(화면을 닫은 뒤)에 부른다.
 *
 * @example const restore = await switchToE2eCouplePhoto()
 */
export const switchToE2eCouplePhoto = async (): Promise<() => Promise<void>> => {
  const admin = createAdminClient();
  const originalPath = await readCouplePhotoPath(admin);
  const filesBefore = new Set(await listCouplePhotoFiles(admin));
  await uploadPhoto(admin, COUPLE_PHOTO_PATH);
  assertNoError(await admin.from("couple_photo").update({ path: COUPLE_PHOTO_PATH }).eq("id", true), "E2E 커플 사진으로 바꾸기");

  return async () => {
    if (originalPath === COUPLE_PHOTO_PATH) await uploadPhoto(admin, COUPLE_PHOTO_PATH);
    assertNoError(await admin.from("couple_photo").update({ path: originalPath }).eq("id", true), "커플 사진 되돌리기");
    const keptPaths = new Set([...filesBefore, COUPLE_PHOTO_PATH]);
    const addedPaths = (await listCouplePhotoFiles(admin)).filter((path) => !keptPaths.has(path));
    if (addedPaths.length > 0) assertNoError(await admin.storage.from(ALBUM_BUCKET).remove(addedPaths), "테스트가 올린 커플 사진 지우기");
  };
};

const clearCouplePhoto = async (admin: AdminClient): Promise<void> => {
  assertNoError(await admin.from("couple_photo").update({ path: null }).eq("path", COUPLE_PHOTO_PATH), "커플 사진 비우기");
};

/**
 * 로컬 Supabase에 E2E 전용 계정과 내용을 만든다. 지난 실행이 남긴 것이 있으면 먼저 지운다.
 *
 * @returns 만든 것을 지우는 함수
 * @example const clear = await seedE2eData(password)
 */
export const seedE2eData = async (password: string): Promise<() => Promise<void>> => {
  const admin = createAdminClient();
  await clearCouplePhoto(admin);
  await clearAccount(admin);
  await clearStorage(admin);

  const { data, error } = await admin.auth.admin.createUser({ email: E2E_MEMBER.email, password, email_confirm: true });
  assertNoError({ error }, "계정 만들기");
  const authorId = data.user?.id;
  if (!authorId) throw new Error("E2E 계정을 만들지 못했습니다.");

  assertNoError(await admin.from("members").insert({ id: authorId, ...E2E_MEMBER }), "허용목록");
  await seedRecords(admin, authorId);
  await seedEventsAndTodos(admin, authorId);
  await seedCouplePhoto(admin);

  return async () => {
    await clearCouplePhoto(admin);
    await clearAccount(admin);
    await clearStorage(admin);
  };
};

/**
 * 다른 닉네임의 작성자(상대)가 만든 오늘 일정을 만든다. 돌려준 함수는 일정과 계정을 지운다.
 *
 * @example const deleteEvent = await createDisposableAuthorEvent({ id: randomUUID(), title: "상대 일정", nickname: "상대" })
 */
export const createDisposableAuthorEvent = async ({ id, title, nickname }: { id: string; title: string; nickname: string }): Promise<() => Promise<void>> => {
  const { id: authorId, remove } = await createDisposableMember(randomUUID(), nickname);
  try {
    const date = toKstDate(new Date());
    assertNoError(await createAdminClient().from("events").insert({ id, title, date, is_together: false, author_id: authorId }), "상대 일정");
  } catch (insertError) {
    await remove();
    throw insertError;
  }
  return remove;
};
