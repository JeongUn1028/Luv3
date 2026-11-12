import { existsSync, readFileSync } from "node:fs";
import { evaluateCleanupPreview, toWorkflowCommand } from "./lib.mts";

// 저장 공간·사진 정리 월간 점검(.github/workflows/storage-check.yml, #310).
// 워크플로가 curl로 받은 미리 보기 응답을 판단해, 문제가 있으면 실패로 끝내 GitHub이 메일을 보내게 한다.
// 사용법: node scripts/storage-check/check.mts <응답 파일> <HTTP 상태 코드>
const [responsePath, httpStatus] = process.argv.slice(2);
if (!responsePath || !httpStatus) {
  console.error("사용법: node scripts/storage-check/check.mts <응답 파일> <HTTP 상태 코드>");
  process.exit(2);
}

// 본문이 빈 응답이면 curl이 파일을 만들지 않는다. 빈 본문으로 판단해 원인 문구를 남긴다
const body = existsSync(responsePath) ? readFileSync(responsePath, "utf8") : "";
const result = evaluateCleanupPreview({ httpStatus: Number(httpStatus), body });

result.summary.forEach((line) => console.log(line));
result.warnings.forEach((warning) => console.log(toWorkflowCommand("warning", warning)));
result.problems.forEach((problem) => console.log(toWorkflowCommand("error", problem)));
if (result.problems.length === 0) console.log("문제 없음");
process.exitCode = result.problems.length > 0 ? 1 : 0;
