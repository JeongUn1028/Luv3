import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FILE_PATH_COLUMNS, listAlbumObjects, type AlbumListStorage } from "./album-files";

type ListResult = Awaited<ReturnType<AlbumListStorage["list"]>>;
type ListItem = NonNullable<ListResult["data"]>[number];

const file = (name: string, size = 10): ListItem => ({
  name,
  id: `id-${name}`,
  created_at: "2026-11-01T00:00:00Z",
  metadata: { size },
});
const folder = (name: string): ListItem => ({ name, id: null });

describe("FILE_PATH_COLUMNS", () => {
  it("DB 타입의 경로 칸이 모두 들어 있어, 새 칸의 파일을 주인 없는 사진으로 지우지 않는다", () => {
    // Arrange
    // `new URL(..., import.meta.url)`로 읽으면 knip이 파일 전체를 쓰는 것으로 봐 안 쓰는 export 검사가 흐려진다
    const types = readFileSync(path.join(import.meta.dirname, "../supabase/database.types.ts"), "utf8");
    const pathColumns = [...types.matchAll(/"(\w+)": \{\s*Row: \{([^}]*)\}/g)].flatMap(([, table, row]) =>
      [...row.matchAll(/"(\w+)":/g)].map(([, column]) => column).filter((column) => column.includes("path")).map((column) => `public.${table}.${column}`),
    );

    // Act
    const listed = Object.entries(FILE_PATH_COLUMNS).flatMap(([table, columns]) => columns.map((column) => `${table}.${column}`));

    // Assert: 실패하면 FILE_PATH_COLUMNS와 photo-cleanup 경로의 읽기에 새 칸을 더한다(사진 경로가 아닌 칸이면 이 검사에서 뺀다)
    expect(pathColumns.length).toBeGreaterThan(0);
    expect(listed.toSorted()).toEqual(pathColumns.toSorted());
  });
});

describe("listAlbumObjects", () => {
  it("폴더를 따라 들어가 파일 경로·크기·올린 시각을 모으고 빈 폴더 표시 파일은 뺀다", async () => {
    // Arrange
    const pages: Record<string, ListItem[]> = {
      "": [folder("couple"), file(".emptyFolderPlaceholder")],
      couple: [file("c1.jpg", 30)],
    };
    const storage: AlbumListStorage = { list: vi.fn(async (prefix: string) => ({ data: pages[prefix], error: null })) };

    // Act
    const files = await listAlbumObjects(storage);

    // Assert
    expect(files).toEqual([{ path: "couple/c1.jpg", size: 30, createdAt: "2026-11-01T00:00:00Z" }]);
  });

  it("한 번에 1000개가 오면 다음 쪽을 이어서 읽는다", async () => {
    const fullPage = Array.from({ length: 1000 }, (_, index) => file(`p${index}.jpg`));
    const list = vi.fn<AlbumListStorage["list"]>(async (_prefix, { offset }) => ({
      data: offset === 0 ? fullPage : [file("last.jpg")],
      error: null,
    }));

    const files = await listAlbumObjects({ list });

    expect(files).toHaveLength(1001);
    expect(list).toHaveBeenLastCalledWith("", expect.objectContaining({ offset: 1000 }));
  });

  it("목록을 받지 못하면 어느 폴더인지 담아 에러를 낸다", async () => {
    const storage: AlbumListStorage = {
      list: async (prefix) =>
        prefix === "" ? { data: [folder("couple")], error: null } : { data: null, error: { message: "boom" } },
    };

    await expect(listAlbumObjects(storage)).rejects.toThrow("파일 목록을 받지 못했습니다(couple): boom");
  });
});
