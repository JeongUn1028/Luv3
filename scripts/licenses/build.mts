import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isObject } from "../../src/lib/guards.ts";
import { findLicenseFileName, sortLicenses, toLicenseEntry } from "./lib.mts";

// 앱 정보 > 오픈소스 라이선스 화면(#436)에 보일 목록을 만든다.
//
// 앱 package.json의 dependencies(앱에 실제로 들어가는 꾸러미)마다 node_modules에 설치된 꾸러미의
// package.json(버전·라이선스·만든 사람)과 라이선스 파일(저작권 줄·전문)을 읽어 src/lib/app-info/licenses.generated.json에 쓴다.
// 손으로 관리하지 않도록 이 파일은 커밋하지 않고, pnpm build·dev·type-check가 매번 먼저 이 스크립트를 실행한다.
// 의존성을 더하거나 올리면 다음 빌드에 저절로 반영된다. 라이선스가 적혀 있지 않은 꾸러미가 있으면 빌드를 멈춘다.

const rootDir = path.join(import.meta.dirname, "../..");
const rootPackage: unknown = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
if (!isObject(rootPackage) || !isObject(rootPackage.dependencies)) throw new Error("package.json에 dependencies가 없어요");

const entries = Object.keys(rootPackage.dependencies).map((name) => {
  const packageDir = path.join(rootDir, "node_modules", name);
  const packageJson: unknown = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
  if (!isObject(packageJson)) throw new Error(`${name}: package.json을 읽지 못했어요`);
  // 이름이 license인 폴더를 고르지 않도록 파일만 본다
  const fileNames = readdirSync(packageDir, { withFileTypes: true }).flatMap((entry) => (entry.isFile() ? [entry.name] : []));
  const licenseFileName = findLicenseFileName(fileNames);
  const licenseText = licenseFileName ? readFileSync(path.join(packageDir, licenseFileName), "utf8") : undefined;
  return toLicenseEntry({ name, packageJson, licenseText });
});

const outputPath = path.join(rootDir, "src/lib/app-info/licenses.generated.json");
const content = `${JSON.stringify({ packages: sortLicenses(entries) }, null, 2)}\n`;
// 내용이 같으면 다시 쓰지 않는다. dev 서버가 떠 있을 때 type-check를 돌려도 화면을 괜히 다시 만들지 않는다
if (!existsSync(outputPath) || readFileSync(outputPath, "utf8") !== content) writeFileSync(outputPath, content);
console.log(`오픈소스 라이선스 ${entries.length}개 → ${path.relative(rootDir, outputPath)}`);
