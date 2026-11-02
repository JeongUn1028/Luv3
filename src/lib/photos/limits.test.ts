import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUCKET_FILE_SIZE_LIMIT, UPLOAD_CONTENT_TYPE } from "./limits";

// album 버킷은 초기 마이그레이션에서 만들었다. 버킷 제한을 바꾸는 마이그레이션을 추가하면 이 테스트도 함께 고친다.
const migration = readFileSync(
  new URL("../../../supabase/migrations/20261102000000_init_album.sql", import.meta.url),
  "utf8",
);
const bucket = /values \('album', 'album', (true|false), (\d+), array\[([^\]]*)\]\)/.exec(migration);

describe("album 버킷 제한", () => {
  it("코드의 용량 제한이 버킷 설정과 같다", () => {
    expect(Number(bucket?.[2])).toBe(BUCKET_FILE_SIZE_LIMIT);
  });

  it("올리는 형식(JPEG)을 버킷이 허용한다", () => {
    expect(bucket?.[3]).toContain(`'${UPLOAD_CONTENT_TYPE}'`);
  });
});
