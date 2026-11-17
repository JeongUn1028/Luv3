import type { OpenSourceLicense } from "../../src/lib/app-info/licenses.ts";
import { isObject } from "../../src/lib/guards.ts";

// 앱에 들어가는 의존성의 라이선스 목록을 만든다(#436). 만드는 방법은 build.mts 주석에 있다

/** `LICENSE`, `LICENSE.md`, `LICENCE-MIT`, `COPYING` 같은 라이선스 파일 이름 */
const LICENSE_FILE_NAME = /^(?:licen[cs]e|copying)(?:[-.][\w.-]+)?$/i;

/** 저작권 줄로 시작하는 말. "(c)"·"©"는 뒤에 연도가 올 때만 저작권 줄이다(Apache 본문의 "(c) You must retain…" 조항을 빼려고) */
const COPYRIGHT_LINE = /^(?:copyright\b|(?:\(c\)|©)\s*\d{4})/i;

/** 라이선스 본문에서 "copyright"로 시작하지만 저작권 줄이 아닌 것(Apache 본문의 "copyright license to…", 빈칸 양식 "[yyyy]") */
const NOT_COPYRIGHT_LINE = /^copyright\s+(?:license|notice|owner|holder|statement)|\[yyyy\]/i;

/**
 * 꾸러미 폴더의 파일 이름 중 라이선스 파일을 고른다. 여럿이면 이름순 첫 번째.
 *
 * @example findLicenseFileName(["README.md", "license.md", "package.json"]) // "license.md"
 */
export const findLicenseFileName = (fileNames: readonly string[]): string | undefined =>
  fileNames.filter((fileName) => LICENSE_FILE_NAME.test(fileName)).toSorted()[0];

/**
 * package.json의 `license`(글자 또는 `{ type }`)나 옛 `licenses` 배열에서 라이선스 이름을 읽는다. 없으면 빌드를 멈춘다.
 *
 * @example toLicenseName({ name: "react", license: "MIT" }) // "MIT"
 */
export const toLicenseName = (packageJson: Record<string, unknown>): string => {
  const { license, licenses } = packageJson;
  if (typeof license === "string" && license.trim() !== "") return license.trim();
  if (isObject(license) && typeof license.type === "string") return license.type;
  if (Array.isArray(licenses)) {
    const types = licenses.flatMap((item: unknown) => (isObject(item) && typeof item.type === "string" ? [item.type] : []));
    if (types.length > 0) return types.join(" OR ");
  }
  throw new Error(`${String(packageJson.name)}: package.json에 라이선스가 없어요. 직접 확인한 뒤 목록에 넣는 방법을 정해야 해요`);
};

/**
 * 라이선스 글에서 저작권 줄만 뽑는다. 같은 줄은 한 번만 둔다.
 *
 * @example extractCopyrightLines("MIT License\n\nCopyright (c) 2020 Supabase\n\nPermission is hereby granted") // ["Copyright (c) 2020 Supabase"]
 */
export const extractCopyrightLines = (licenseText: string): string[] => [
  ...new Set(
    licenseText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => COPYRIGHT_LINE.test(line) && !NOT_COPYRIGHT_LINE.test(line)),
  ),
];

/**
 * package.json의 `author`(글자 `"이름 <메일> (주소)"` 또는 `{ name }`)에서 이름만 읽는다.
 *
 * @example toAuthorName("Donald <donald@example.com>") // "Donald"
 */
export const toAuthorName = (author: unknown): string | undefined => {
  const raw = isObject(author) ? author.name : author;
  if (typeof raw !== "string") return undefined;
  const name = raw.replace(/<[^>]*>|\([^)]*\)/g, "").trim();
  return name === "" ? undefined : name;
};

interface ToLicenseEntryParams {
  /** 앱 package.json의 dependencies에 적힌 이름 */
  name: string;
  /** 설치된 꾸러미의 package.json */
  packageJson: Record<string, unknown>;
  /** 꾸러미에 든 라이선스 파일 글. 파일이 없으면 `undefined` */
  licenseText: string | undefined;
}

/**
 * 설치된 꾸러미 하나를 화면에 보일 라이선스 항목으로 바꾼다. 저작권 줄이 없으면 만든 사람 이름을 대신 둔다.
 *
 * @example toLicenseEntry({ name: "react", packageJson: { version: "19.3.1", license: "MIT" }, licenseText: "Copyright (c) Meta" })
 */
export const toLicenseEntry = ({ name, packageJson, licenseText }: ToLicenseEntryParams): OpenSourceLicense => {
  const { version } = packageJson;
  if (typeof version !== "string") throw new Error(`${name}: package.json에 버전이 없어요`);
  const text = licenseText?.replace(/\r\n/g, "\n").trim();
  const copyright = text ? extractCopyrightLines(text) : [];
  const author = copyright.length === 0 ? toAuthorName(packageJson.author) : undefined;
  return {
    name,
    version,
    license: toLicenseName({ ...packageJson, name }),
    copyright,
    ...(author && { author }),
    ...(text && { text }),
  };
};

/**
 * 항목을 이름순으로 늘어놓는다. 빌드할 때마다 같은 순서라 파일을 비교하기 쉽다.
 *
 * @example sortLicenses([{ name: "react", … }, { name: "next", … }]) // next, react 순서
 */
export const sortLicenses = (entries: readonly OpenSourceLicense[]): OpenSourceLicense[] =>
  entries.toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
