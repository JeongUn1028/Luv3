import generated from "./licenses.generated.json";

/** 앱에 들어가는 오픈소스 꾸러미 하나의 라이선스 정보(#436) */
export interface OpenSourceLicense {
  name: string;
  version: string;
  /** package.json에 적힌 라이선스 이름(SPDX, 예: `MIT`) */
  license: string;
  /** 라이선스 파일의 저작권 줄. 파일이 없거나 저작권 줄이 없으면 빈 배열 */
  copyright: string[];
  /** 저작권 줄이 없을 때만 package.json의 만든 사람 이름 */
  author?: string;
  /** 라이선스 파일 전문. 꾸러미에 파일이 없으면 없음 */
  text?: string;
}

/**
 * 오픈소스 라이선스 화면의 목록. `pnpm build`·`dev`·`type-check`가 먼저 `scripts/licenses/build.mts`로
 * node_modules에서 만든다(커밋하지 않는 파일).
 *
 * @example OPEN_SOURCE_LICENSES.map(({ name, license }) => `${name} ${license}`)
 */
export const OPEN_SOURCE_LICENSES: readonly OpenSourceLicense[] = generated.packages;
