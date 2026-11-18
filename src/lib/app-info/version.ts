import packageJson from "../../../package.json";

/** 지금 앱 버전. 릴리스 PR(release-please)이 `package.json`의 `version`을 올린다(README "버전과 릴리스") */
export const APP_VERSION: string = packageJson.version;
