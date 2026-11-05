import { describe, expect, it, vi } from "vitest";
import { readSourceLines } from "@/test-utils/source";
import { SIGNED_URL_EXPIRES_IN, SIGNED_URL_MIN_REMAINING } from "./limits";
import { createSignedUrlCache, type SigningBucket } from "./signed-urls";

const HOUR = 60 * 60 * 1000;

/** 서명할 때마다 다른 주소를 돌려주는 버킷(실제 서명 주소도 발급 시각에 따라 달라진다) */
const createBucket = () => {
  let issued = 0;
  const createSignedUrls = vi.fn<SigningBucket["createSignedUrls"]>(async (paths) => ({
    data: paths.map((path) => ({ path, signedUrl: `${path}?token=${++issued}` })),
    error: null,
  }));
  return { createSignedUrls };
};

const createClock = () => {
  const clock = { time: 0, now: () => clock.time };
  return clock;
};

describe("createSignedUrlCache", () => {
  it("같은 경로를 다시 요청하면 서명하지 않고 같은 주소를 돌려준다", async () => {
    const getSignedUrls = createSignedUrlCache();
    const bucket = createBucket();

    const first = await getSignedUrls(bucket, ["a.jpg", "b.jpg"]);
    const second = await getSignedUrls(bucket, ["a.jpg", "b.jpg"]);

    expect(second.data).toEqual(first.data);
    expect(bucket.createSignedUrls).toHaveBeenCalledTimes(1);
  });

  it("보관하지 않은 경로만 서명하고, 요청한 순서대로 돌려준다", async () => {
    const getSignedUrls = createSignedUrlCache();
    const bucket = createBucket();
    await getSignedUrls(bucket, ["b.jpg"]);

    const { data } = await getSignedUrls(bucket, ["a.jpg", "b.jpg", "c.jpg"]);

    expect(bucket.createSignedUrls).toHaveBeenLastCalledWith(["a.jpg", "c.jpg"], SIGNED_URL_EXPIRES_IN);
    expect(data?.map(({ path }) => path)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  it("한 요청에 같은 경로가 여러 번 있으면 한 번만 서명하고 같은 주소를 준다", async () => {
    const getSignedUrls = createSignedUrlCache();
    const bucket = createBucket();

    const { data } = await getSignedUrls(bucket, ["a.jpg", "a.jpg"]);

    expect(bucket.createSignedUrls).toHaveBeenCalledWith(["a.jpg"], SIGNED_URL_EXPIRES_IN);
    expect(data?.[0]?.signedUrl).toBe(data?.[1]?.signedUrl);
  });

  it("빈 목록이면 서명 요청을 보내지 않는다", async () => {
    const getSignedUrls = createSignedUrlCache();
    const bucket = createBucket();

    const { data } = await getSignedUrls(bucket, []);

    expect(data).toEqual([]);
    expect(bucket.createSignedUrls).not.toHaveBeenCalled();
  });

  it("다른 경로에는 보관한 주소를 쓰지 않는다(커플 사진을 바꾸면 새 경로라 새 주소가 된다)", async () => {
    const getSignedUrls = createSignedUrlCache();
    const bucket = createBucket();

    const before = await getSignedUrls(bucket, ["couple/old.jpg"]);
    const after = await getSignedUrls(bucket, ["couple/new.jpg"]);

    expect(after.data?.[0]?.signedUrl).toMatch(/^couple\/new\.jpg/);
    expect(after.data?.[0]?.signedUrl).not.toBe(before.data?.[0]?.signedUrl);
  });

  it("보관한 주소에 최소 유효 시간이 딱 남았으면 다시 쓴다", async () => {
    const clock = createClock();
    const getSignedUrls = createSignedUrlCache(clock.now);
    const bucket = createBucket();
    const first = await getSignedUrls(bucket, ["a.jpg"]);

    clock.time = (SIGNED_URL_EXPIRES_IN - SIGNED_URL_MIN_REMAINING) * 1000;
    const second = await getSignedUrls(bucket, ["a.jpg"]);

    expect(second.data).toEqual(first.data);
    expect(bucket.createSignedUrls).toHaveBeenCalledTimes(1);
  });

  it("남은 유효 시간이 최소보다 짧으면 새로 서명한 주소를 준다", async () => {
    const clock = createClock();
    const getSignedUrls = createSignedUrlCache(clock.now);
    const bucket = createBucket();
    const first = await getSignedUrls(bucket, ["a.jpg"]);

    clock.time = (SIGNED_URL_EXPIRES_IN - SIGNED_URL_MIN_REMAINING) * 1000 + 1;
    const second = await getSignedUrls(bucket, ["a.jpg"]);

    expect(second.data?.[0]?.signedUrl).not.toBe(first.data?.[0]?.signedUrl);
    expect(bucket.createSignedUrls).toHaveBeenCalledTimes(2);
  });

  it("서명 응답을 기다리는 동안 걸린 시간은 유효 시간에서 빼고 계산한다", async () => {
    const clock = createClock();
    const getSignedUrls = createSignedUrlCache(clock.now);
    const bucket = createBucket();
    const reuseWindow = (SIGNED_URL_EXPIRES_IN - SIGNED_URL_MIN_REMAINING) * 1000;
    bucket.createSignedUrls.mockImplementationOnce(async (paths) => {
      clock.time += HOUR / 2;
      return { data: paths.map((path) => ({ path, signedUrl: `${path}?token=slow` })), error: null };
    });
    await getSignedUrls(bucket, ["a.jpg"]);

    clock.time = reuseWindow + 1;
    const { data } = await getSignedUrls(bucket, ["a.jpg"]);

    expect(data?.[0]?.signedUrl).not.toBe("a.jpg?token=slow");
  });

  it("서명을 기다리는 사이 다시 쓰기로 한 주소의 재사용 시간이 끝나도 그 주소를 돌려준다", async () => {
    const clock = createClock();
    const getSignedUrls = createSignedUrlCache(clock.now);
    const bucket = createBucket();
    const first = await getSignedUrls(bucket, ["a.jpg"]);

    clock.time = (SIGNED_URL_EXPIRES_IN - SIGNED_URL_MIN_REMAINING) * 1000;
    bucket.createSignedUrls.mockImplementationOnce(async (paths) => {
      clock.time += 1;
      return { data: paths.map((path) => ({ path, signedUrl: `${path}?token=new` })), error: null };
    });
    const { data } = await getSignedUrls(bucket, ["a.jpg", "b.jpg"]);

    expect(data).toEqual([first.data?.[0], { path: "b.jpg", signedUrl: "b.jpg?token=new" }]);
  });

  it("서명 요청이 실패하면 오류를 그대로 돌려주고, 다음 요청에서 다시 서명한다", async () => {
    const getSignedUrls = createSignedUrlCache();
    const bucket = createBucket();
    const failure = new Error("서명 실패");
    bucket.createSignedUrls.mockResolvedValueOnce({ data: null, error: failure });

    const failed = await getSignedUrls(bucket, ["a.jpg"]);
    const retried = await getSignedUrls(bucket, ["a.jpg"]);

    expect(failed).toEqual({ data: null, error: failure });
    expect(retried.data?.[0]?.signedUrl).toBeTruthy();
  });

  it("경로 하나만 서명에 실패하면 그 경로만 빈 주소로 두고, 다음 요청에서 다시 서명한다", async () => {
    const getSignedUrls = createSignedUrlCache();
    const bucket = createBucket();
    bucket.createSignedUrls.mockResolvedValueOnce({
      data: [
        { path: "a.jpg", signedUrl: null },
        { path: "b.jpg", signedUrl: "b.jpg?token=ok" },
      ],
      error: null,
    });

    const { data } = await getSignedUrls(bucket, ["a.jpg", "b.jpg"]);
    await getSignedUrls(bucket, ["a.jpg", "b.jpg"]);

    expect(data).toEqual([
      { path: "a.jpg", signedUrl: null },
      { path: "b.jpg", signedUrl: "b.jpg?token=ok" },
    ]);
    expect(bucket.createSignedUrls).toHaveBeenLastCalledWith(["a.jpg"], SIGNED_URL_EXPIRES_IN);
  });

  it("같은 경로를 동시에 요청해도 모두 먼저 보관된 주소 하나를 받는다", async () => {
    const getSignedUrls = createSignedUrlCache();
    const bucket = createBucket();

    const [first, second] = await Promise.all([getSignedUrls(bucket, ["a.jpg"]), getSignedUrls(bucket, ["a.jpg"])]);

    expect(second.data).toEqual(first.data);
  });
});

describe("서명 주소 발급 위치", () => {
  it("서명 요청은 보관 함수 한곳에서만 보낸다", () => {
    const offenders = readSourceLines().flatMap(({ at, lines }) =>
      at === "lib/photos/signed-urls.ts" || !lines.some((line) => /\.createSignedUrls?\(/.test(line)) ? [] : [at],
    );

    expect(offenders).toEqual([]);
  });

  it("보관한 주소는 화면을 오래 열어 둘 시간을 남기고 쓴다", () => {
    expect(SIGNED_URL_MIN_REMAINING).toBeLessThan(SIGNED_URL_EXPIRES_IN);
    expect(SIGNED_URL_MIN_REMAINING * 1000).toBeGreaterThanOrEqual(HOUR);
  });
});
