import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createSessionAwareFetch, isSessionLostError, isUnauthorizedResponse } from "./session-lost";

const REST_URL = "https://x.supabase.co/rest/v1/todos";
const STORAGE_URL = "https://x.supabase.co/storage/v1/object/album/a/b.jpg";
const AUTH_URL = "https://x.supabase.co/auth/v1/token?grant_type=password";

const createStorageResponse = () => new Response(JSON.stringify({ statusCode: "403" }), { status: 400 });

describe("isUnauthorizedResponse", () => {
  it.each([
    { name: "DB의 401", url: REST_URL, response: new Response(null, { status: 401 }) },
    { name: "사진 저장소의 400", url: STORAGE_URL, response: createStorageResponse() },
  ])("$name 응답이면 세션 문제일 수 있다고 본다", ({ url, response }) => {
    expect(isUnauthorizedResponse(url, response)).toBe(true);
  });

  it.each([
    { name: "성공한 DB", url: REST_URL, response: new Response("[]") },
    { name: "DB의 403", url: REST_URL, response: new Response(null, { status: 403 }) },
    { name: "DB의 500", url: REST_URL, response: new Response(null, { status: 500 }) },
    { name: "성공한 사진 저장소", url: STORAGE_URL, response: new Response("{}") },
    { name: "사진 저장소의 502", url: STORAGE_URL, response: new Response("x", { status: 502 }) },
    { name: "틀린 비밀번호 로그인", url: AUTH_URL, response: new Response(null, { status: 401 }) },
  ])("$name 응답이면 세션 문제로 보지 않는다", ({ url, response }) => {
    expect(isUnauthorizedResponse(url, response)).toBe(false);
  });
});

describe("createSessionAwareFetch", () => {
  it("로그인 문제로 거절되면 알리고 응답 본문은 부르는 쪽이 그대로 읽는다", async () => {
    const onUnauthorized = vi.fn();
    const baseFetch = vi.fn(async () => createStorageResponse());

    const response = await createSessionAwareFetch(baseFetch, onUnauthorized)(STORAGE_URL);

    expect(onUnauthorized).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toEqual({ statusCode: "403" });
  });

  it("Request로 불러도 주소를 읽어 판단한다", async () => {
    const onUnauthorized = vi.fn();
    const baseFetch = vi.fn(async () => new Response(null, { status: 401 }));

    await createSessionAwareFetch(baseFetch, onUnauthorized)(new Request(REST_URL));

    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("다른 실패면 알리지 않는다", async () => {
    const onUnauthorized = vi.fn();
    const baseFetch = vi.fn(async () => new Response(null, { status: 500 }));

    await createSessionAwareFetch(baseFetch, onUnauthorized)(REST_URL);

    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe("isSessionLostError", () => {
  it.each([
    { name: "세션 없음", error: new AuthSessionMissingError(), expected: true },
    { name: "잘못된 토큰(403)", error: new AuthApiError("bad_jwt", 403, "bad_jwt"), expected: true },
    { name: "갱신 토큰 없음(400)", error: new AuthApiError("x", 400, "refresh_token_not_found"), expected: true },
    { name: "요청 제한", error: new AuthApiError("x", 429, "over_request_rate_limit"), expected: false },
    { name: "서버 오류", error: new AuthApiError("x", 500, undefined), expected: false },
    { name: "인터넷 끊김", error: new AuthRetryableFetchError("x", 0), expected: false },
    { name: "오류 없음", error: undefined, expected: false },
  ])("$name 이면 $expected 를 돌려준다", ({ error, expected }) => {
    expect(isSessionLostError(error)).toBe(expected);
  });
});
