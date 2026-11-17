import packageJson from "../../../package.json";

/** 지금 앱 버전. 릴리스할 때 `package.json`의 `version`만 바꾼다(README "버전과 릴리스") */
export const APP_VERSION: string = packageJson.version;
