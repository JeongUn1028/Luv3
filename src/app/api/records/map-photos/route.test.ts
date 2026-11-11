import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentMember } from "@/lib/auth/member";
import { getMapPhotos, MapPhotoLoadError } from "@/lib/dates/map-queries";
import { GET } from "./route";

vi.mock("@/lib/auth/member", () => ({ getCurrentMember: vi.fn() }));
vi.mock("@/lib/dates/map-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dates/map-queries")>()),
  getMapPhotos: vi.fn(),
}));
vi.mock("server-only", () => ({}));

const PHOTO_ID = "6f1c2a8e-3b7d-4c59-9e2a-1d4b8f0c7a31";
const OTHER_ID = "0b9d7e42-5a1c-4f83-8d26-7c3e9a1b5f04";
const PHOTO = { id: PHOTO_ID, recordId: OTHER_ID, title: "성수 산책", date: "2026-11-10", takenAt: undefined, thumbUrl: "https://x.test/t.jpg", expiresAt: 1 };

const requestWith = (ids: string): Request => new Request(`http://localhost/api/records/map-photos?${new URLSearchParams({ ids }).toString()}`);

describe("GET /api/records/map-photos", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getCurrentMember).mockReset();
    vi.mocked(getMapPhotos).mockReset();
  });

  it("멤버가 아니면 읽지 않고 멤버 확인의 이동을 그대로 따른다", async () => {
    // Arrange
    const redirect = new Error("NEXT_REDIRECT");
    vi.mocked(getCurrentMember).mockRejectedValue(redirect);

    // Act & Assert
    await expect(GET(requestWith(PHOTO_ID))).rejects.toBe(redirect);
    expect(getMapPhotos).not.toHaveBeenCalled();
  });

  it("고른 사진을 돌려주고 응답을 저장해 두지 않게 한다", async () => {
    // Arrange
    vi.mocked(getMapPhotos).mockResolvedValue([PHOTO]);

    // Act
    const response = await GET(requestWith(`${PHOTO_ID},${OTHER_ID},${PHOTO_ID}`));

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ items: [{ id: PHOTO_ID, recordId: OTHER_ID, title: "성수 산책", date: "2026-11-10", thumbUrl: "https://x.test/t.jpg", expiresAt: 1 }] });
    expect(getMapPhotos).toHaveBeenCalledWith([PHOTO_ID, OTHER_ID]);
  });

  it.each([
    ["비어 있으면", ""],
    ["id 형식이 아니면", "../secret"],
    ["40개를 넘으면", Array.from({ length: 41 }, (_, index) => PHOTO_ID.replace(/..$/, index.toString(16).padStart(2, "0"))).join(",")],
  ])("%s 읽지 않고 400을 돌려준다", async (_, ids) => {
    // Act
    const response = await GET(requestWith(ids));

    // Assert
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_IDS" });
    expect(getMapPhotos).not.toHaveBeenCalled();
  });

  it("읽지 못하면 502로 알린다", async () => {
    // Arrange
    vi.mocked(getMapPhotos).mockRejectedValue(new MapPhotoLoadError());

    // Act
    const response = await GET(requestWith(PHOTO_ID));

    // Assert
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: "MAP_PHOTOS_FAILED" });
  });
});
