import { describe, expect, it } from "vitest";
import { parseBackupManifest } from "./manifest.mts";

const VALID = {
  createdAt: "2026-11-18T03:00:00.000Z",
  source: "linked",
  commit: "abc1234",
  lastMigration: "20261118010000",
  tables: { dates: 12, photos: 40 },
  files: [{ path: "e2e00000-0000-4000-8000-000000000001/p1.jpg", size: 120_000 }],
  totalBytes: 120_000,
};

describe("parseBackupManifest", () => {
  it("모양이 맞으면 그대로 돌려준다", () => {
    // Act & Assert
    expect(parseBackupManifest(JSON.stringify(VALID))).toEqual(VALID);
  });

  // commit·lastMigration은 이 칸을 넣기 전에 받은 시점에는 없다
  it("commit·lastMigration이 없는 예전 시점도 받는다", () => {
    // Arrange
    const older = { ...VALID, commit: undefined, lastMigration: undefined };

    // Act & Assert
    expect(parseBackupManifest(JSON.stringify(older))).toStrictEqual({ createdAt: VALID.createdAt, source: VALID.source, tables: VALID.tables, files: VALID.files, totalBytes: VALID.totalBytes });
  });

  it.each([
    ["JSON이 아니면", "{", "JSON"],
    ["객체가 아니면", "[]", "객체"],
    ["받은 곳이 linked·local이 아니면", JSON.stringify({ ...VALID, source: "prod" }), "source"],
    ["만든 시각이 없으면", JSON.stringify({ ...VALID, createdAt: undefined }), "createdAt"],
    ["commit이 글자가 아니면", JSON.stringify({ ...VALID, commit: 1 }), "commit"],
    ["표 개수가 음수면", JSON.stringify({ ...VALID, tables: { dates: -1 } }), "tables.dates"],
    ["표 이름에 SQL이 섞여 있으면", JSON.stringify({ ...VALID, tables: { "dates; drop table photos; --": 1 } }), "표 이름"],
    ["파일 목록이 배열이 아니면", JSON.stringify({ ...VALID, files: {} }), "files"],
    ["파일 경로가 비어 있으면", JSON.stringify({ ...VALID, files: [{ path: "", size: 1 }] }), "files[0].path"],
    ["파일 크기가 정수가 아니면", JSON.stringify({ ...VALID, files: [{ path: "a.jpg", size: 1.5 }] }), "files[0].size"],
    ["전체 크기가 없으면", JSON.stringify({ ...VALID, totalBytes: undefined }), "totalBytes"],
  ])("%s 되살리기 전에 멈춘다", (_, text, field) => {
    // Act & Assert
    expect(() => parseBackupManifest(text)).toThrow(field);
  });
});
