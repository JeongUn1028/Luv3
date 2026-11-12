import { describe, expect, it } from "vitest";
import { SIGNED_URL_MIN_REMAINING } from "@/lib/photos/limits";
import type { AlbumTile } from "./album";
import { appendAlbumPage, appendNewItems, createAlbumPages, syncAlbumFirstPage, toAlbumItems, type AlbumFirstPage } from "./album-pages";
import type { RecordCursor } from "./search-api";

const tile = (id: string, thumbUrl?: string): AlbumTile => ({
  id,
  date: "2026-11-02",
  endDate: undefined,
  title: id,
  tags: [],
  thumbUrl,
});

const cursor = (id: string): RecordCursor => ({ date: "2026-11-02", createdAt: "2026-11-02T03:04:05.123456+00:00", id });

const LOADED_AT = Date.UTC(2026, 10, 10, 12);
const MINUTE_MS = 60_000;

const firstPage = (overrides: Partial<AlbumFirstPage> = {}): AlbumFirstPage => ({
  items: [tile("a"), tile("b")],
  next: cursor("b"),
  version: "v1",
  loadedAt: LOADED_AT,
  ...overrides,
});

const ids = (tiles: AlbumTile[]): string[] => tiles.map(({ id }) => id);

describe("appendNewItems", () => {
  it("이미 받은 기록은 빼고 뒤에 붙인다", () => {
    expect(ids(appendNewItems([tile("a"), tile("b")], [tile("b"), tile("c")]))).toEqual(["a", "b", "c"]);
  });
});

describe("appendAlbumPage", () => {
  it("다음 묶음을 붙이고 다음 자리를 그 묶음의 것으로 바꾼다", () => {
    // Arrange
    const pages = { ...createAlbumPages(firstPage()), isLoadingMore: true };

    // Act
    const appended = appendAlbumPage(pages, { items: [tile("c")], next: undefined, loadedAt: LOADED_AT + MINUTE_MS });

    // Assert
    expect(ids(toAlbumItems(appended))).toEqual(["a", "b", "c"]);
    expect(appended.next).toBeUndefined();
    expect(appended.isLoadingMore).toBe(false);
  });

  it("이어 받은 때는 가장 먼저 받은 묶음의 것을 지킨다", () => {
    // Arrange
    const once = appendAlbumPage(createAlbumPages(firstPage()), { items: [tile("c")], next: cursor("c"), loadedAt: LOADED_AT + MINUTE_MS });

    // Act
    const twice = appendAlbumPage(once, { items: [tile("d")], next: undefined, loadedAt: LOADED_AT + 2 * MINUTE_MS });

    // Assert
    expect(twice.moreLoadedAt).toBe(LOADED_AT + MINUTE_MS);
  });
});

describe("syncAlbumFirstPage", () => {
  const withMore = () =>
    appendAlbumPage(createAlbumPages(firstPage()), { items: [tile("c")], next: cursor("c"), loadedAt: LOADED_AT + MINUTE_MS });

  it("기록이 그대로면 이어 받은 기록을 지키고 첫 묶음의 사진 주소만 새것으로 바꾼다", () => {
    // Arrange
    const refreshed = firstPage({ items: [tile("a", "새 주소"), tile("b")], loadedAt: LOADED_AT + 30 * MINUTE_MS });

    // Act
    const synced = syncAlbumFirstPage(withMore(), refreshed);

    // Assert
    expect(toAlbumItems(synced).map(({ id, thumbUrl }) => [id, thumbUrl])).toEqual([
      ["a", "새 주소"],
      ["b", undefined],
      ["c", undefined],
    ]);
    expect(synced.next).toEqual(cursor("c"));
  });

  it("기록이 바뀌었으면(판 번호가 다르면) 첫 묶음부터 다시 시작한다", () => {
    // Arrange
    const pages = { ...withMore(), isMoreFailed: true };

    // Act
    const synced = syncAlbumFirstPage(pages, firstPage({ items: [tile("new"), tile("a")], next: cursor("a"), version: "v2" }));

    // Assert
    expect(ids(toAlbumItems(synced))).toEqual(["new", "a"]);
    expect(synced.next).toEqual(cursor("a"));
    expect(synced.isMoreFailed).toBe(false);
    expect(synced.generation).toBe(pages.generation + 1);
  });

  it("이어 받은 사진 주소를 다시 쓸 수 있는 시간이 지나면 첫 묶음부터 다시 시작한다", () => {
    // Arrange: 이어 받은 주소는 받은 뒤로 SIGNED_URL_MIN_REMAINING 동안만 쓸 수 있다고 본다
    const pages = withMore();
    const expiresAt = LOADED_AT + MINUTE_MS + SIGNED_URL_MIN_REMAINING * 1000;

    // Act
    const beforeExpiry = syncAlbumFirstPage(pages, firstPage({ loadedAt: expiresAt - 1 }));
    const afterExpiry = syncAlbumFirstPage(pages, firstPage({ loadedAt: expiresAt }));

    // Assert
    expect(ids(toAlbumItems(beforeExpiry))).toEqual(["a", "b", "c"]);
    expect(ids(toAlbumItems(afterExpiry))).toEqual(["a", "b"]);
  });

  it("이어 받지 않았으면 오래 지나도 다음 자리를 새 첫 묶음의 것으로 바꾼다", () => {
    // Arrange
    const pages = createAlbumPages(firstPage());

    // Act
    const synced = syncAlbumFirstPage(pages, firstPage({ next: undefined, loadedAt: LOADED_AT + 24 * 60 * MINUTE_MS }));

    // Assert
    expect(synced.next).toBeUndefined();
    expect(synced.generation).toBe(pages.generation);
  });
});
