// 백업 스크립트(scripts/backup)도 이 파일을 불러와 Node로 바로 실행하므로 `@/` 별칭이나 다른 모듈을 불러오지 않는다

/** album 버킷 목록의 항목 하나. 폴더는 id가 null이다 */
interface AlbumListItem {
  name: string;
  id: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** `supabase.storage.from("album")`에서 목록 읽기만 쓴다 */
export interface AlbumListStorage {
  list: (
    prefix: string,
    options: { limit: number; offset: number; sortBy: { column: string; order: string } },
  ) => Promise<{ data: AlbumListItem[] | null; error: { message: string } | null }>;
}

/** album 버킷의 파일 하나. 경로는 버킷 이름을 뺀 저장 경로다 */
export interface AlbumObject {
  path: string;
  /** Storage가 준 그대로의 크기. 쓰는 쪽에서 숫자인지 확인한다 */
  size: unknown;
  /** 올린 시각(ISO 문자열). Storage가 주지 않으면 undefined */
  createdAt: string | undefined;
}

/**
 * 기록이 album 파일을 가리키는 칸(`스키마.표` → 칸). 백업은 복구할 수 있는지 확인하는 데, 주인 없는 사진 정리(#31)는
 * 지우면 안 되는 파일을 고르는 데 쓴다. 칸을 더하면 `src/app/api/photo-cleanup/route.ts`의 읽기에도 더해야 그 칸의 파일이
 * 지워지지 않는다. `database.types.ts`에 경로 칸이 새로 생기면 테스트가 실패해 알려 준다
 */
export const FILE_PATH_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  "public.photos": ["path", "thumb_path"],
  "public.couple_photo": ["path"],
};

const LIST_PAGE_SIZE = 1000;
// 대시보드에서 폴더를 만들면 생기는 빈 표시 파일이다. 사진이 아니고 버킷 형식 제한에도 걸린다
const FOLDER_PLACEHOLDER = ".emptyFolderPlaceholder";

/**
 * album 버킷의 파일을 폴더까지 따라가며 모두 나열한다.
 *
 * @throws {Error} 목록을 받지 못하면(어느 폴더에서 실패했는지 담는다)
 * @example const files = await listAlbumObjects(supabase.storage.from(ALBUM_BUCKET));
 */
export const listAlbumObjects = async (storage: AlbumListStorage, prefix = ""): Promise<AlbumObject[]> => {
  const files: AlbumObject[] = [];

  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await storage.list(prefix, {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error || !data) throw new Error(`파일 목록을 받지 못했습니다(${prefix || "맨 위"}): ${error?.message ?? "응답 없음"}`);

    for (const item of data) {
      if (item.name === FOLDER_PLACEHOLDER) continue;

      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) files.push(...(await listAlbumObjects(storage, itemPath)));
      else files.push({ path: itemPath, size: item.metadata?.size, createdAt: item.created_at ?? undefined });
    }

    if (data.length < LIST_PAGE_SIZE) return files;
  }
};
