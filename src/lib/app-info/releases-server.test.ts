import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchReleases, isCurrentReleaseReady, loadReleases, ReleaseLoadError, RELEASES_URL, toReleasesCacheLife } from "./releases-server";

vi.mock("server-only", () => ({}));

const RELEASE = { tag_name: "v1.2.0", published_at: "2026-11-16T02:06:00Z", body: "- **지도**: 숫자를 고쳤어요", draft: false, prerelease: false };

describe("fetchReleases", () => {
  it("공개 리포의 릴리스 목록을 토큰 없이 묻고 요약으로 바꾼다", async () => {
    // Arrange
    const fetcher = vi.fn(async () => Response.json([RELEASE]));

    // Act
    const releases = await fetchReleases(fetcher);

    // Assert
    expect(releases).toEqual([{ version: "1.2.0", publishedOn: "2026-11-16", notes: [{ kind: "item", label: "지도", text: "숫자를 고쳤어요" }] }]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(RELEASES_URL);
    expect(new Headers(init.headers).get("authorization")).toBeNull();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("거절되면(요청 한도 초과 등) 상태 코드를 담아 실패로 알린다", async () => {
    // Arrange
    const fetcher = vi.fn(async () => Response.json({ message: "API rate limit exceeded" }, { status: 403 }));

    // Act & Assert
    await expect(fetchReleases(fetcher)).rejects.toMatchObject({ name: "ReleaseLoadError", status: 403 });
  });

  it("답이 목록이 아니면 실패로 알린다", async () => {
    // Arrange
    const fetcher = vi.fn(async () => Response.json({ name: "v1.2.0" }));

    // Act & Assert
    await expect(fetchReleases(fetcher)).rejects.toBeInstanceOf(ReleaseLoadError);
  });

  it("연결이 끊기면 원인을 담아 실패로 알린다", async () => {
    // Arrange
    const cause = new TypeError("fetch failed");
    const fetcher = vi.fn(async () => Promise.reject(cause));

    // Act & Assert
    await expect(fetchReleases(fetcher)).rejects.toMatchObject({ name: "ReleaseLoadError", cause });
  });
});

describe("isCurrentReleaseReady", () => {
  const notes = [{ kind: "item" as const, label: undefined, text: "고쳤어요" }];

  it("지금 버전의 Release에 요약이 있어야 다 된 것으로 본다", () => {
    expect(isCurrentReleaseReady([{ version: "1.2.0", publishedOn: "2026-11-16", notes }], "1.2.0")).toBe(true);
    expect(isCurrentReleaseReady([{ version: "1.2.0", publishedOn: "2026-11-16", notes: [] }], "1.2.0")).toBe(false);
    expect(isCurrentReleaseReady([{ version: "1.2.0", publishedOn: "2026-11-16", notes }], "1.3.0")).toBe(false);
  });
});

describe("loadReleases", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("받으면 릴리스 목록을 돌려준다", async () => {
    await expect(loadReleases(async () => Response.json([RELEASE]))).resolves.toHaveLength(1);
  });

  it("받지 못하면 화면은 그대로 두도록 undefined를 돌려주고 원인을 로그에 남긴다", async () => {
    // Act
    const releases = await loadReleases(async () => new Response("", { status: 502 }));

    // Assert
    expect(releases).toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("업데이트 기록 조회 실패", expect.objectContaining({ status: 502 }));
  });
});

describe("toReleasesCacheLife", () => {
  const READY = { version: "1.3.0", publishedOn: "2026-11-18", notes: [{ kind: "item" as const, label: "지도", text: "숫자를 고쳤어요" }] };

  it("지금 버전의 요약까지 받았으면 하루 기억한다", () => {
    expect(toReleasesCacheLife([READY], "1.3.0")).toBe("days");
  });

  // 릴리스 PR을 머지하면 배포가 Release·요약보다 먼저 끝나, 오래 기억하면 새 버전이 늦게 보인다(#470)
  it("지금 버전의 Release나 요약이 아직 없으면 몇 분만 기억해 곧 다시 묻는다", () => {
    expect([toReleasesCacheLife([READY], "1.4.0"), toReleasesCacheLife([{ ...READY, notes: [] }], "1.3.0")]).toEqual(["minutes", "minutes"]);
  });

  it("받지 못했으면 몇 분만 기억한다", () => {
    expect(toReleasesCacheLife(undefined, "1.3.0")).toBe("minutes");
  });
});
