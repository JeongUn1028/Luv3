import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentMember } from "@/lib/auth/member";
import { decodeAdmdongBoundaries } from "@/lib/places/admdong";
import { loadAdmdongBoundaries } from "@/lib/places/admdong-server";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/member", () => ({ getCurrentMember: vi.fn() }));
vi.mock("@/lib/places/admdong-server", () => ({ loadAdmdongBoundaries: vi.fn() }));

// 성수 근처를 덮는 네모 동 하나(1e5배 정수, 첫 점 + 차이)
const BOUNDARIES = decodeAdmdongBoundaries({
  source: "테스트",
  scale: 100_000,
  regions: [
    {
      name: "성동구 성수1가1동",
      bbox: [12_703_000, 3_754_000, 12_705_000, 3_755_000],
      rings: [[12_703_000, 3_754_000, 2000, 0, 0, 1000, -2000, 0, 0, -1000]],
    },
  ],
});

const requestWith = (params: Record<string, string>): Request =>
  new Request(`http://localhost/api/places/region?${new URLSearchParams(params).toString()}`);

describe("GET /api/places/region", () => {
  afterEach(() => {
    vi.mocked(getCurrentMember).mockReset();
    vi.mocked(loadAdmdongBoundaries).mockReset();
  });

  it("멤버가 아니면 경계를 읽지 않고 멤버 확인의 이동을 그대로 따른다", async () => {
    // Arrange
    const redirect = new Error("NEXT_REDIRECT");
    vi.mocked(getCurrentMember).mockRejectedValue(redirect);

    // Act & Assert
    await expect(GET(requestWith({ lat: "37.5444", lng: "127.0396" }))).rejects.toBe(redirect);
    expect(loadAdmdongBoundaries).not.toHaveBeenCalled();
  });

  it("좌표가 든 행정동 이름을 돌려주고 응답을 저장해 두지 않게 한다", async () => {
    // Arrange
    vi.mocked(loadAdmdongBoundaries).mockResolvedValue(BOUNDARIES);

    // Act
    const response = await GET(requestWith({ lat: "37.5444", lng: "127.0396" }));

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ name: "성동구 성수1가1동" });
  });

  it("경계 밖(해외)이면 이름을 null로 돌려준다", async () => {
    // Arrange
    vi.mocked(loadAdmdongBoundaries).mockResolvedValue(BOUNDARIES);

    // Act
    const response = await GET(requestWith({ lat: "48.8584", lng: "2.2945" }));

    // Assert
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ name: null });
  });

  it.each([
    ["위도가 없을 때", { lng: "127" }],
    ["위도가 빈 글자일 때", { lat: " ", lng: "127" }],
    ["위도가 범위 밖일 때", { lat: "91", lng: "127" }],
    ["경도가 범위 밖일 때", { lat: "37", lng: "-181" }],
    ["숫자가 아닐 때", { lat: "북위", lng: "127" }],
    ["16진수일 때", { lat: "0x10", lng: "127" }],
    ["지수 표기일 때", { lat: "3.7e1", lng: "127" }],
  ])("%s 400을 돌려주고 경계를 읽지 않는다", async (_case, params) => {
    // Act
    const response = await GET(requestWith(params));

    // Assert
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_LOCATION" });
    expect(loadAdmdongBoundaries).not.toHaveBeenCalled();
  });
});
