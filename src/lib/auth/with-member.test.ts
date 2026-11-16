import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentMember, type Member } from "@/lib/auth/member";
import { withCurrentMember } from "./with-member";

vi.mock("@/lib/auth/member", () => ({ getCurrentMember: vi.fn() }));
vi.mock("server-only", () => ({}));

const MEMBER: Member = { id: "member-1", nickname: "하나" };

/** 밖에서 끝낼 수 있는 약속. 두 일이 서로를 기다리지 않는지 보려고 쓴다 */
const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};

describe("withCurrentMember", () => {
  afterEach(() => {
    vi.mocked(getCurrentMember).mockReset();
  });

  it("회원 확인이 끝나기 전에 조회를 시작하고, 둘 다 끝나면 회원과 결과를 함께 돌려준다", async () => {
    // Arrange
    const member = deferred<Member>();
    vi.mocked(getCurrentMember).mockReturnValue(member.promise);
    const load = vi.fn(async () => ["행"]);

    // Act
    const result = withCurrentMember(load);

    // Assert
    expect(load).toHaveBeenCalledTimes(1);
    member.resolve(MEMBER);
    await expect(result).resolves.toEqual([MEMBER, ["행"]]);
  });

  it("회원이 아니면 조회가 먼저 끝나도 결과를 돌려주지 않고 회원 확인의 이동을 그대로 던진다", async () => {
    // Arrange
    const redirect = new Error("NEXT_REDIRECT");
    vi.mocked(getCurrentMember).mockRejectedValue(redirect);

    // Act & Assert
    await expect(withCurrentMember(async () => "비밀 행")).rejects.toBe(redirect);
  });

  it("회원이 아니면 조회가 실패해도 조회 에러가 아닌 회원 확인의 이동을 던진다", async () => {
    // Arrange
    const redirect = new Error("NEXT_REDIRECT");
    const member = deferred<Member>();
    vi.mocked(getCurrentMember).mockReturnValue(member.promise);
    const load = deferred<string>();

    // Act
    const result = withCurrentMember(() => load.promise);
    load.reject(new Error("조회 실패"));
    member.reject(redirect);

    // Assert
    await expect(result).rejects.toBe(redirect);
  });

  it("회원이면 조회 에러를 그대로 던진다", async () => {
    // Arrange
    vi.mocked(getCurrentMember).mockResolvedValue(MEMBER);
    const failure = new Error("조회 실패");

    // Act & Assert
    await expect(withCurrentMember(() => Promise.reject(failure))).rejects.toBe(failure);
  });
});
