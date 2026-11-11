import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { toAdmdongFeature, toAdmdongFile } from "./lib.mts";

// 사진 좌표의 동네 이름을 계산할 행정동 경계 파일을 만든다(#249).
//
// 원본: vuski/admdongkor(https://github.com/vuski/admdongkor)의 `ver20261001/HangJeongDong_ver20261001.geojson`(약 35MB, WGS84).
// 원자료는 통계청 SGIS 행정동 경계(공공누리 제1유형), 가공분은 CC BY 4.0이다. 출처 문구는 README "데이터 출처"와 앱 설정 화면에 둔다.
//
// 행정동이 바뀌면(새 `ver…` 판이 나오면):
//   1. 새 판 GeoJSON을 내려받는다(리포 밖 아무 곳)
//   2. pnpm admdong:build <내려받은 파일> <판 이름>   예: pnpm admdong:build ~/Downloads/HangJeongDong_ver20270101.geojson ver20270101
//   3. data/admdong-boundaries.json이 바뀐 것을 커밋하고, src/lib/places/admdong.ts의 ADMDONG_SOURCE(설정 화면 출처)와 README의 판 이름을 고친다.
//      둘이 다르면 admdong-server.test.ts가 실패한다
//
// 줄이는 방법(lib.mts): 고리마다 더글러스-포이커로 약 10m보다 덜 튀어나온 굴곡을 버리고, 좌표를 1e5배 정수(약 1m)로 바꿔 앞 점과의 차이로 적는다.
// 이름은 "시·군·구 + 행정동"으로 미리 만들어 둔다.

const [sourcePath, version] = process.argv.slice(2);
if (!sourcePath || !version) {
  console.error("사용법: pnpm admdong:build <HangJeongDong_ver….geojson> <판 이름(예: ver20261001)>");
  process.exit(1);
}

const geojson: unknown = JSON.parse(readFileSync(sourcePath, "utf8"));
if (typeof geojson !== "object" || geojson === null || !("features" in geojson) || !Array.isArray(geojson.features)) {
  throw new Error("행정동 경계 GeoJSON이 아닙니다");
}
const features = geojson.features.map(toAdmdongFeature);
const file = toAdmdongFile({ features, source: `vuski/admdongkor ${version}` });
const outputPath = path.join(import.meta.dirname, "../../data/admdong-boundaries.json");
writeFileSync(outputPath, `${JSON.stringify(file)}\n`);

const pointCount = file.regions.reduce((sum, region) => sum + region.rings.reduce((ringSum, ring) => ringSum + ring.length / 2, 0), 0);
console.log(`동 ${file.regions.length}개, 점 ${pointCount}개 → ${outputPath}`);
