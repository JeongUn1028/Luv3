import { LOGIN_PATH } from "@/lib/auth/paths";

/**
 * 시작 화면 바로 뒤에서 실행해, 앱 안에서 옮겨 온 문서이거나 로그인 화면이면 시작 화면을 숨긴다. 그리기 전에 돌아야 해서 문서에 직접 넣는다.
 * 앱을 켤 때는 이전 페이지가 없고, 앱 안에서 문서를 새로 받을 때(로그인, 로그아웃, 오류 화면의 홈으로)는 이전 페이지가 같은 사이트다.
 * 뒤로 가기와 앞으로 가기도 앱 안의 이동으로 본다. 로그인 화면은 자기 로고를 직접 그리므로(#198) 시작 화면까지 그리면 하트가 두 번 나온다.
 * 판단할 수 없으면 시작 화면이 한 번 더 나올 뿐이라 오류를 무시한다.
 */
export const SKIP_STARTUP_SPLASH_SCRIPT = `try{const entry=performance.getEntriesByType("navigation")[0];const referrer=document.referrer;if(location.pathname===${JSON.stringify(LOGIN_PATH)}||entry.type==="back_forward"||(entry.type==="navigate"&&referrer&&new URL(referrer).origin===location.origin))document.querySelector("[data-startup-splash]").style.display="none"}catch{}`;
