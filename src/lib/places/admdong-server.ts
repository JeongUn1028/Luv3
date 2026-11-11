import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { decodeAdmdongBoundaries, type AdmdongBoundaries } from "./admdong";

/** 행정동 경계 파일(리포 루트 기준). 서버 함수에 함께 실리도록 next.config의 outputFileTracingIncludes에도 적는다 */
export const ADMDONG_FILE_PATH = "data/admdong-boundaries.json";

let loading: Promise<AdmdongBoundaries> | undefined;

/**
 * 행정동 경계를 읽어 둔다. 서버가 켜진 뒤 처음 부를 때만 파일을 읽고(약 3MB, 수십 ms) 그다음부터는 읽어 둔 것을 쓴다.
 * 읽다 실패하면 다음 요청에서 다시 읽는다.
 *
 * @throws {AdmdongFileError} 파일 모양이 다를 때
 * @example const name = findAdmdongName(await loadAdmdongBoundaries(), location)
 */
export const loadAdmdongBoundaries = (): Promise<AdmdongBoundaries> => {
  if (!loading) {
    loading = readFile(path.join(process.cwd(), ADMDONG_FILE_PATH), "utf8").then((text) => decodeAdmdongBoundaries(JSON.parse(text)));
    loading.catch(() => {
      loading = undefined;
    });
  }
  return loading;
};
