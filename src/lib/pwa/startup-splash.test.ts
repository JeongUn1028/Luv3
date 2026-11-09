import { describe, expect, it } from "vitest";
import { SKIP_STARTUP_SPLASH_SCRIPT } from "./startup-splash";

interface RunParams {
  pathname: string;
  navigationType: string;
  referrer: string;
}

const ORIGIN = "https://luv3.example";

/** 문서 시작 스크립트를 가짜 브라우저 값으로 실행하고, 시작 화면이 숨겨졌는지 돌려준다 */
const runScript = ({ pathname, navigationType, referrer }: RunParams): boolean => {
  const splash = { style: { display: "" } };
  const performance = { getEntriesByType: () => [{ type: navigationType }] };
  const document = { referrer, querySelector: () => splash };
  const location = { origin: ORIGIN, pathname };
  new Function("performance", "document", "location", SKIP_STARTUP_SPLASH_SCRIPT)(performance, document, location);
  return splash.style.display === "none";
};

describe("SKIP_STARTUP_SPLASH_SCRIPT", () => {
  it("앱을 새로 켜서 홈을 열면 시작 화면을 보여 준다", () => {
    // Arrange
    const params = { pathname: "/", navigationType: "navigate", referrer: "" };

    // Act
    const isHidden = runScript(params);

    // Assert
    expect(isHidden).toBe(false);
  });

  it("앱을 새로 켜도 로그인 화면이면 로그인 로고가 그려지므로 시작 화면을 건너뛴다", () => {
    // Arrange
    const params = { pathname: "/login", navigationType: "navigate", referrer: "" };

    // Act
    const isHidden = runScript(params);

    // Assert
    expect(isHidden).toBe(true);
  });

  it("다시 불러오기여도 로그인 화면이면 시작 화면을 건너뛴다", () => {
    // Arrange
    const params = { pathname: "/login", navigationType: "reload", referrer: "" };

    // Act
    const isHidden = runScript(params);

    // Assert
    expect(isHidden).toBe(true);
  });

  it("로그인 화면과 이름만 비슷한 주소는 건너뛰지 않는다", () => {
    // Arrange
    const params = { pathname: "/login-help", navigationType: "navigate", referrer: "" };

    // Act
    const isHidden = runScript(params);

    // Assert
    expect(isHidden).toBe(false);
  });

  it("같은 사이트에서 옮겨 온 문서이면 시작 화면을 숨긴다", () => {
    // Arrange
    const params = { pathname: "/", navigationType: "navigate", referrer: `${ORIGIN}/login` };

    // Act
    const isHidden = runScript(params);

    // Assert
    expect(isHidden).toBe(true);
  });

  it("다른 사이트에서 들어오면 시작 화면을 보여 준다", () => {
    // Arrange
    const params = { pathname: "/", navigationType: "navigate", referrer: "https://other.example/" };

    // Act
    const isHidden = runScript(params);

    // Assert
    expect(isHidden).toBe(false);
  });

  it("뒤로 가기로 돌아온 문서이면 시작 화면을 숨긴다", () => {
    // Arrange
    const params = { pathname: "/", navigationType: "back_forward", referrer: "" };

    // Act
    const isHidden = runScript(params);

    // Assert
    expect(isHidden).toBe(true);
  });
});
