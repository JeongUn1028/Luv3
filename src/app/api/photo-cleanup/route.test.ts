import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FILE_PATH_COLUMNS } from "@/lib/photos/album-files";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import { GET } from "./route";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

const SECRET = "a".repeat(32);
const URL_PATH = "http://localhost/api/photo-cleanup";

// 하루 넘게 지난 시각. 이보다 최근에 올린 파일은 올리는 중일 수 있어 지우지 않는다
const OLD = "2020-01-01T00:00:00Z";
const DATE_ID = "10000000-0000-4000-8000-000000000001";
const uuid = (suffix: number) => `20000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const photoPaths = (suffix: number) => ({ id: uuid(suffix), path: `${DATE_ID}/${uuid(suffix)}.jpg`, thumb_path: `${DATE_ID}/${uuid(suffix)}_thumb.jpg` });

const requestWith = (authorization?: string, url = URL_PATH): Request =>
  new Request(url, authorization ? { headers: { authorization } } : undefined);

const authorized = (url?: string): Request => requestWith(`Bearer ${SECRET}`, url);

interface FakeDatabase {
  /** album 버킷의 파일 경로들. 모두 하루 넘게 지난 파일이다 */
  files: string[];
  photos?: { id: string; path: string; thumb_path: string }[];
  couplePhotoPath?: string;
  trash?: { id: string; path: string; thumb_path: string; deleted_at: string }[];
  /** 이 표를 읽으면 실패한다 */
  failingTable?: string;
  removeError?: { message: string };
}

/**
 * 경로가 쓰는 비밀 키 클라이언트를 흉내 낸다. 표마다 고른 칸과 Storage에서 지운 경로를 기록한다.
 * 목록은 한 쪽(1000행)보다 적어 한 번에 다 온다
 */
const fakeSecretClient = ({ files, photos = [], couplePhotoPath, trash = [], failingTable, removeError }: FakeDatabase) => {
  const selected: Record<string, string> = {};
  const removed: string[][] = [];
  const buckets: string[] = [];
  const deletedTrashIds: string[][] = [];

  const rowsOf: Record<string, unknown[]> = { photos, photo_trash: trash };
  const resultOf = (table: string, data: unknown) =>
    Promise.resolve(failingTable === table ? { data: null, error: { message: `${table} 읽기 실패` } } : { data, error: null });

  const client = {
    from: (table: string) => ({
      select: (columns: string) => {
        selected[table] = columns;
        const page = { order: () => ({ limit: () => resultOf(table, rowsOf[table] ?? []) }) };
        return { ...page, gt: () => page, maybeSingle: () => resultOf(table, couplePhotoPath ? { path: couplePhotoPath } : null) };
      },
      delete: () => ({
        in: (_column: string, ids: string[]) => {
          deletedTrashIds.push(ids);
          return Promise.resolve({ error: null });
        },
      }),
    }),
    storage: {
      from: (bucket: string) => {
        buckets.push(bucket);
        return {
          // 맨 위에는 폴더만, 폴더 안에는 파일만 둔다(album/{기록 id}/{사진}.jpg)
          list: (prefix: string) => {
            const inFolder = files.filter((file) => file.startsWith(`${prefix}/`)).map((file) => file.slice(prefix.length + 1));
            const data = prefix
              ? inFolder.map((name) => ({ name, id: `${prefix}/${name}`, created_at: OLD, metadata: { size: 1 } }))
              : [...new Set(files.map((file) => file.split("/")[0]))].map((name) => ({ name, id: null }));
            return Promise.resolve({ data, error: null });
          },
          remove: (paths: string[]) => {
            removed.push(paths);
            return Promise.resolve({ error: removeError ?? null });
          },
        };
      },
    },
  };
  vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);
  return { selected, removed, buckets, deletedTrashIds };
};

describe("GET /api/photo-cleanup", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  it("서버에 CRON_SECRET이 없으면 어떤 값을 보내도 401을 돌려준다", async () => {
    // Arrange
    vi.stubEnv("CRON_SECRET", "");

    // Act
    const response = await GET(requestWith(`Bearer ${SECRET}`));

    // Assert
    expect(response.status).toBe(401);
  });

  it("비밀 값이 틀리면 지우기 전에 401을 돌려준다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);

    const response = await GET(requestWith(`Bearer ${"b".repeat(32)}`));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("SUPABASE_SECRET_KEY가 없으면 500과 설정이 없다는 코드를 돌려준다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(requestWith(`Bearer ${SECRET}`));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "CLEANUP_NOT_CONFIGURED" });
  });
});

describe("GET /api/photo-cleanup 정리", () => {
  // 쓰는 사진 둘(기록 사진·커플 사진)과 주인 없는 사진 하나. 지울 파일이 쓰는 파일보다 많으면 멈추므로 쓰는 사진을 넉넉히 둔다
  const kept = photoPaths(1);
  const orphan = photoPaths(2);
  const couplePath = `couple/${uuid(3)}.jpg`;
  const trashed = photoPaths(4);
  const database = (): FakeDatabase => ({
    files: [kept.path, kept.thumb_path, orphan.path, orphan.thumb_path, couplePath, trashed.path, trashed.thumb_path],
    photos: [kept],
    couplePhotoPath: couplePath,
    // 보관 기간(30일)이 지나지 않은 휴지통 사진은 남긴다
    trash: [{ ...trashed, deleted_at: new Date().toISOString() }],
  });

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  // 읽는 칸이 빠지면 그 칸이 가리키는 파일을 주인 없는 파일로 보고 지운다(FILE_PATH_COLUMNS와 같아야 한다)
  it("PHOTO_CLEANUP_DELETE가 true면 기록·커플 사진·휴지통이 가리키는 칸을 모두 읽고, 주인 없는 파일만 지운다", async () => {
    // Arrange
    vi.stubEnv("PHOTO_CLEANUP_DELETE", "true");
    const fake = fakeSecretClient(database());

    // Act
    const response = await GET(authorized());

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ status: "deleted", orphanPaths: [orphan.path, orphan.thumb_path] });
    // 사진 경로 칸 목록(FILE_PATH_COLUMNS)에 칸이 더해졌는데 경로가 읽지 않으면 여기서 실패한다
    Object.entries(FILE_PATH_COLUMNS).forEach(([table, columns]) => {
      expect(fake.selected[table.replace(/^public\./, "")]?.split(", ")).toEqual(expect.arrayContaining([...columns]));
    });
    expect(fake.selected.photo_trash?.split(", ")).toEqual(expect.arrayContaining(["path", "thumb_path", "deleted_at"]));
    expect(new Set(fake.buckets)).toEqual(new Set([ALBUM_BUCKET]));
    expect(fake.removed).toEqual([[orphan.path, orphan.thumb_path]]);
    expect(fake.deletedTrashIds).toEqual([]);
  });

  it("휴지통에서 보관 기간(30일)이 지난 사진은 파일을 지운 뒤 휴지통 행도 지운다", async () => {
    // Arrange
    vi.stubEnv("PHOTO_CLEANUP_DELETE", "true");
    const expired = photoPaths(5);
    const base = database();
    const fake = fakeSecretClient({
      ...base,
      files: [...base.files, expired.path, expired.thumb_path],
      trash: [...(base.trash ?? []), { ...expired, deleted_at: OLD }],
    });

    // Act
    const response = await GET(authorized());

    // Assert
    expect(response.status).toBe(200);
    expect(fake.removed.flat()).toEqual(expect.arrayContaining([expired.path, expired.thumb_path]));
    expect(fake.removed.flat()).not.toContain(trashed.path);
    expect(fake.deletedTrashIds).toEqual([[expired.id]]);
  });

  it.each([
    ["PHOTO_CLEANUP_DELETE가 없으면", "", URL_PATH],
    ["PHOTO_CLEANUP_DELETE가 true가 아니면", "yes", URL_PATH],
    ["preview로 부르면 PHOTO_CLEANUP_DELETE가 true여도", "true", `${URL_PATH}?preview=1`],
  ])("%s 지우지 않고 지울 목록만 돌려준다", async (_, deleteFlag, url) => {
    // Arrange
    vi.stubEnv("PHOTO_CLEANUP_DELETE", deleteFlag);
    const fake = fakeSecretClient(database());

    // Act
    const response = await GET(authorized(url));

    // Assert
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "preview", orphanPaths: [orphan.path, orphan.thumb_path] });
    expect(fake.removed).toEqual([]);
  });

  // DB를 비어 있게 잘못 읽으면 모든 사진이 주인 없는 파일로 보인다. Vercel 실행 기록에 실패로 보이게 409로 답한다
  it("지울 목록이 쓰는 파일보다 많으면 지우지 않고 409와 멈춘 이유를 돌려준다", async () => {
    // Arrange
    vi.stubEnv("PHOTO_CLEANUP_DELETE", "true");
    const fake = fakeSecretClient({ files: [orphan.path, orphan.thumb_path] });

    // Act
    const response = await GET(authorized());

    // Assert
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ status: "blocked", reason: expect.stringContaining("쓰는 파일(0개)") });
    expect(fake.removed).toEqual([]);
  });

  it.each(["photos", "couple_photo", "photo_trash"])("%s를 읽지 못하면 아무것도 지우지 않고 502를 돌려준다", async (failingTable) => {
    // Arrange
    vi.stubEnv("PHOTO_CLEANUP_DELETE", "true");
    const fake = fakeSecretClient({ ...database(), failingTable });

    // Act
    const response = await GET(authorized());

    // Assert
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: "CLEANUP_FAILED" });
    expect(fake.removed).toEqual([]);
  });

  it("Storage가 지우기를 거부하면 502를 돌려주고 원인을 로그에 남긴다", async () => {
    // Arrange
    vi.stubEnv("PHOTO_CLEANUP_DELETE", "true");
    fakeSecretClient({ ...database(), removeError: { message: "permission denied" } });

    // Act
    const response = await GET(authorized());

    // Assert
    expect(response.status).toBe(502);
    expect(console.error).toHaveBeenCalledWith("사진 정리 실패", expect.objectContaining({ message: expect.stringContaining("permission denied") }));
  });
});
