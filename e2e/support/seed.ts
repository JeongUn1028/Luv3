import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { toKstDate } from "@/lib/anniversary";
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
  assertNoError(await admin.from("photos").insert({ id: photoId, date_id: id, path, thumb_path: path, sort_order: 0 }), "사진 행");
  assertNoError(await admin.from("dates").update({ cover_photo_id: photoId }).eq("id", id), "대표 사진");

  return () => deleteRecordWithFiles(id);
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
 * 기록의 장소·정리 글과 사진 한마디를 채운다(찾기 테스트).
 *
 * @example await setRecordSearchFields(id, { place: "성수동", memo: "오래 걸었다", caption: "노을" })
 */
export const setRecordSearchFields = async (id: string, { place, memo, caption }: { place: string; memo: string; caption: string }): Promise<void> => {
  const admin = createAdminClient();
  assertNoError(await admin.from("dates").update({ place, memo }).eq("id", id), "기록 장소·글");
  assertNoError(await admin.from("photos").update({ caption }).eq("date_id", id), "사진 한마디");
};

/**
 * 찾기로 고른 것처럼 기록의 장소와 좌표를 넣는다.
 *
 * @example await setRecordLocation(id, { place: "성수", lat: 37.54, lng: 127.05 })
 */
export const setRecordLocation = async (id: string, { place, lat, lng }: { place: string; lat: number; lng: number }): Promise<void> => {
  assertNoError(await createAdminClient().from("dates").update({ place, place_lat: lat, place_lng: lng }).eq("id", id), "기록 좌표");
};

/**
 * 기록에 저장된 좌표를 읽는다.
 *
 * @example expect(await getRecordLocation(id)).toEqual({ place_lat: null, place_lng: null })
 */
export const getRecordLocation = async (id: string): Promise<{ place_lat: number | null; place_lng: number | null }> => {
  const { data, error } = await createAdminClient().from("dates").select("place_lat, place_lng").eq("id", id).single();
  if (error) throw new Error(`기록 좌표 읽기 실패: ${error.message}`);
  return data;
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
 * 기록 행과 폴더의 파일을 모두 지운다. 여러 번 불러도 된다.
 *
 * @example await deleteRecordWithFiles(id)
 */
export const deleteRecordWithFiles = async (id: string): Promise<void> => {
  const admin = createAdminClient();
  assertNoError(await admin.from("dates").delete().eq("id", id), "기록 지우기");
  const names = await listRecordFiles(id);
  if (names.length > 0) assertNoError(await admin.storage.from(ALBUM_BUCKET).remove(names.map((name) => `${id}/${name}`)), "사진 지우기");
};

const deleteAccountWithContent = async (admin: AdminClient, userId: string): Promise<void> => {
  // 내용이 작성자(members)를 참조하므로 먼저 지운다. 사진 행과 남이 단 댓글은 기록과 함께 지워진다
  for (const table of ["comments", "dates", "events", "todos"] as const) {
    assertNoError(await admin.from(table).delete().eq("author_id", userId), `${table} 지우기`);
  }
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
 *
 * @example const deleteTodo = await createDisposableTodo({ id: randomUUID(), content: "고칠 항목" })
 */
export const createDisposableTodo = async ({ id, content, completedAt }: { id: string; content: string; completedAt?: string }): Promise<() => Promise<void>> => {
  const admin = createAdminClient();
  assertNoError(
    await admin.from("todos").insert({ id, content, author_id: await getMemberId(admin), ...(completedAt && { completed_at: completedAt }) }),
    "하고 싶은 것",
  );
  return async () => assertNoError(await admin.from("todos").delete().eq("id", id), "하고 싶은 것 지우기");
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
 * 상대가 다른 기기에서 기록에 사진을 더해 저장한 상태를 만든다. 판 번호도 함께 바뀐다.
 *
 * @example await addPhotoAsPartner(recordId)
 */
export const addPhotoAsPartner = async (recordId: string): Promise<void> => {
  const admin = createAdminClient();
  const photoId = randomUUID();
  const path = `${recordId}/${photoId}.jpg`;
  await uploadPhoto(admin, path);
  assertNoError(await admin.from("photos").insert({ id: photoId, date_id: recordId, path, thumb_path: path, sort_order: 1 }), "상대의 사진 행");
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
 * 화면에서 저장한 일정을 제목으로 찾아 지운다. 제목은 `createTestName`으로 만들어 다른 테스트·실행의 일정을 지우지 않게 한다.
 *
 * @example await deleteEventsByTitle("저장한 일정")
 */
export const deleteEventsByTitle = async (title: string): Promise<void> => {
  assertNoError(await createAdminClient().from("events").delete().eq("title", title), "일정 지우기");
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

  const photos = Array.from({ length: PHOTO_COUNT }, (_, index) => {
    const path = `${PHOTO_RECORD.id}/${randomUUID()}.jpg`;
    return { id: randomUUID(), date_id: PHOTO_RECORD.id, path, thumb_path: path, sort_order: index };
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

/** 커플 사진이 비어 있을 때만 E2E 사진을 넣는다. 로컬에 이미 있는 사진은 건드리지 않아 잃을 일이 없다 */
const seedCouplePhoto = async (admin: AdminClient): Promise<void> => {
  const { data, error } = await admin.from("couple_photo").select("path").single();
  assertNoError({ error }, "커플 사진 조회");
  if (data?.path && data.path !== COUPLE_PHOTO_PATH) return;
  await uploadPhoto(admin, COUPLE_PHOTO_PATH);
  assertNoError(await admin.from("couple_photo").update({ path: COUPLE_PHOTO_PATH }).eq("id", true), "커플 사진");
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
