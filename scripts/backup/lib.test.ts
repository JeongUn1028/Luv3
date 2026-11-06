import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compareCounts,
  countRowsByTable,
  describeBackupVersion,
  filterDump,
  findFilesToDownload,
  findLatestSnapshot,
  formatStorageUsage,
  isInsideGitWorkTree,
  listPublicTables,
  listReferencedPaths,
  parseLastMigration,
  pickServiceKey,
  toBackupFile,
  toContentType,
  toSnapshotName,
} from "./lib.mts";

const DUMP = [
  "SET session_replication_role = replica;",
  "",
  'COPY "auth"."refresh_tokens" ("id", "token") FROM stdin;',
  "1\tsecret-token",
  "\\.",
  "",
  'COPY "auth"."users" ("id", "email") FROM stdin;',
  "u1\ta@example.com",
  "u2\tb@example.com",
  "\\.",
  "",
  'COPY "auth"."identities" ("id") FROM stdin;',
  "i1",
  "\\.",
  "",
  'COPY "public"."dates" ("id", "memo") FROM stdin;',
  "d1\tSELECT pg_catalog.setval('\"auth\".\"x_seq\"', 1, true);",
  "\\.",
  "",
  'COPY "public"."todos" ("id") FROM stdin;',
  "\\.",
  "",
  "SELECT pg_catalog.setval('\"auth\".\"refresh_tokens_id_seq\"', 1, true);",
  "RESET ALL;",
  "",
].join("\n");

describe("filterDump", () => {
  it("auth 스키마에서 계정 표만 남기고 세션·토큰은 지운다", () => {
    const filtered = filterDump(DUMP);

    expect(filtered).toContain('COPY "auth"."users"');
    expect(filtered).toContain('COPY "auth"."identities"');
    expect(filtered).not.toContain("refresh_tokens");
    expect(filtered).not.toContain("secret-token");
  });

  it("앞으로 새로 생기는 auth 표도 허용 목록에 없으면 지운다", () => {
    const dump = 'COPY "auth"."new_secret_table" ("id") FROM stdin;\nleak\n\\.\n';

    expect(filterDump(dump)).not.toContain("leak");
  });

  it("public 표의 내용은 setval처럼 보이는 글자까지 그대로 둔다", () => {
    const filtered = filterDump(DUMP);

    expect(filtered).toContain("d1\tSELECT pg_catalog.setval");
    expect(filtered).toContain('COPY "public"."todos"');
    expect(filtered).toContain("SET session_replication_role = replica;");
    expect(filtered).toContain("RESET ALL;");
  });

  it("표가 빠지면 함께 쓸모없어지는 auth 시퀀스 설정도 지운다", () => {
    expect(filterDump(DUMP)).not.toContain("refresh_tokens_id_seq");
  });
});

describe("countRowsByTable", () => {
  it("표마다 행 수를 세고 빈 표는 0으로 센다", () => {
    expect(countRowsByTable(filterDump(DUMP))).toEqual({
      "auth.users": 2,
      "auth.identities": 1,
      "public.dates": 1,
      "public.todos": 0,
    });
  });
});

describe("listPublicTables", () => {
  it("덤프에 들어 있는 public 표 이름만 돌려준다", () => {
    expect(listPublicTables(DUMP)).toEqual(["public.dates", "public.todos"]);
  });
});

describe("findFilesToDownload", () => {
  const remote = [
    { path: "a/1.jpg", size: 100 },
    { path: "a/2.jpg", size: 200 },
    { path: "couple/3.jpg", size: 300 },
  ];

  it("이미 받은 파일은 건너뛰고 없는 파일만 고른다", () => {
    const local = new Map([["a/1.jpg", 100]]);

    expect(findFilesToDownload(remote, local).map((file) => file.path)).toEqual(["a/2.jpg", "couple/3.jpg"]);
  });

  it("크기가 다른 파일은 받다 끊긴 것으로 보고 다시 받는다", () => {
    const local = new Map([
      ["a/1.jpg", 40],
      ["a/2.jpg", 200],
      ["couple/3.jpg", 300],
    ]);

    expect(findFilesToDownload(remote, local).map((file) => file.path)).toEqual(["a/1.jpg"]);
  });
});

describe("formatStorageUsage", () => {
  it("파일 수와 크기, 1GB 중 비율을 보여 준다", () => {
    const { message, isNearLimit } = formatStorageUsage(253, 5_242_880);

    expect(message).toContain("253");
    expect(message).toContain("5.0 MB");
    expect(message).toContain("0.5%");
    expect(isNearLimit).toBe(false);
  });

  it("80%를 넘으면 경고 대상으로 표시한다", () => {
    const GIGABYTE = 1024 ** 3;

    expect(formatStorageUsage(1, GIGABYTE * 0.79).isNearLimit).toBe(false);
    expect(formatStorageUsage(1, GIGABYTE * 0.8).isNearLimit).toBe(true);
  });
});

describe("isInsideGitWorkTree", () => {
  const createTempDirectory = (): string => mkdtempSync(path.join(tmpdir(), "luv3-backup-"));

  it("Git 리포 안이면 아직 없는 폴더여도 true를 돌려준다", () => {
    const repo = createTempDirectory();
    spawnSync("git", ["init", "-q"], { cwd: repo });

    expect(isInsideGitWorkTree(repo)).toBe(true);
    expect(isInsideGitWorkTree(path.join(repo, "backups/2026"))).toBe(true);
    expect(isInsideGitWorkTree(path.join(repo, "..backups"))).toBe(true);
  });

  it("Git 리포 밖이면 false를 돌려준다", () => {
    expect(isInsideGitWorkTree(path.join(createTempDirectory(), "backups"))).toBe(false);
  });

  it("Git을 실행할 수 없으면 어떤 경로인지 알려 주는 에러를 낸다", () => {
    // 없는 드라이브처럼 Git을 실행할 수 없는 경우. 운영체제와 상관없이 만들 수 있게 파일 아래 경로로 재현한다
    const file = path.join(createTempDirectory(), "not-a-folder");
    writeFileSync(file, "");
    const target = path.join(file, "backups");

    expect(() => isInsideGitWorkTree(target)).toThrow(`백업 폴더를 확인하지 못했습니다: ${target}`);
  });
});

describe("toBackupFile", () => {
  it("저장 경로와 크기로 파일 항목을 만든다", () => {
    expect(toBackupFile("a/1.jpg", 100)).toEqual({ path: "a/1.jpg", size: 100 });
  });

  it("크기를 알 수 없는 파일이면 어떤 파일인지 알려 주는 에러를 낸다", () => {
    expect(() => toBackupFile("a/1.jpg", undefined)).toThrow("a/1.jpg");
  });
});

describe("listReferencedPaths", () => {
  it("기록 사진·썸네일·커플 사진 경로를 모으고 빈 커플 사진은 뺀다", () => {
    const dump = [
      'COPY "public"."photos" ("id", "date_id", "path", "thumb_path") FROM stdin;',
      "p1\td1\td1/p1.jpg\td1/p1_thumb.jpg",
      "\\.",
      'COPY "public"."couple_photo" ("id", "path") FROM stdin;',
      "t\tcouple/c1.jpg",
      "\\.",
      'COPY "public"."dates" ("id", "path") FROM stdin;',
      "d1\tnot-a-file",
      "\\.",
    ].join("\n");

    expect(listReferencedPaths(dump)).toEqual(["d1/p1.jpg", "d1/p1_thumb.jpg", "couple/c1.jpg"]);
  });

  it("커플 사진이 비어 있으면 경로로 치지 않는다", () => {
    const dump = 'COPY "public"."couple_photo" ("id", "path") FROM stdin;\nt\t\\N\n\\.\n';

    expect(listReferencedPaths(dump)).toEqual([]);
  });
});

describe("pickServiceKey", () => {
  it("service_role 키를 고른다", () => {
    const keys = [
      { name: "anon", type: "legacy", api_key: "anon-key" },
      { name: "service_role", type: "legacy", api_key: "service-key" },
    ];

    expect(pickServiceKey(keys)).toBe("service-key");
  });

  it("옛 키가 꺼져 있으면 새 secret 키를 고른다", () => {
    const keys = [
      { name: "anon", type: "legacy", api_key: null },
      { name: "service_role", type: "legacy", api_key: null },
      { name: "publishable", type: "publishable", api_key: "sb_publishable_x" },
      { name: "default", type: "secret", api_key: "sb_secret_x" },
    ];

    expect(pickServiceKey(keys)).toBe("sb_secret_x");
  });

  it("쓸 수 있는 키가 없으면 키 값을 드러내지 않고 에러를 낸다", () => {
    const keys = [{ name: "anon", type: "legacy", api_key: "anon-key" }];

    expect(() => pickServiceKey(keys)).toThrow("서비스 키");
    expect(() => pickServiceKey(keys)).not.toThrow("anon-key");
  });
});

describe("toSnapshotName", () => {
  it("윈도우 폴더 이름에 쓸 수 있고 시간순으로 정렬되는 이름을 만든다", () => {
    expect(toSnapshotName(new Date("2026-11-04T09:05:07.123Z"))).toBe("2026-11-04T09-05-07Z");
  });
});

describe("findLatestSnapshot", () => {
  it("이름이 가장 늦은 시점을 고른다", () => {
    expect(findLatestSnapshot(["2026-10-01T00-00-00Z", "2026-11-01T00-00-00Z", "2026-09-01T00-00-00Z"])).toBe(
      "2026-11-01T00-00-00Z",
    );
  });

  it("시점이 하나도 없으면 undefined를 돌려준다", () => {
    expect(findLatestSnapshot([])).toBeUndefined();
  });
});

describe("toContentType", () => {
  it("버킷이 받는 형식으로 확장자를 바꾼다", () => {
    expect(toContentType("a/1.jpg")).toBe("image/jpeg");
    expect(toContentType("a/1_thumb.JPG")).toBe("image/jpeg");
    expect(toContentType("a/1.webp")).toBe("image/webp");
  });

  it("버킷이 받지 않는 파일이면 에러를 낸다", () => {
    expect(() => toContentType("a/1.png")).toThrow("a/1.png");
  });
});

describe("compareCounts", () => {
  it("원본과 다른 항목만 돌려준다", () => {
    const expected = { "public.dates": 6, "public.photos": 8 };
    const actual = { "public.dates": 6, "public.photos": 7 };

    expect(compareCounts(expected, actual)).toEqual([{ name: "public.photos", expected: 8, actual: 7 }]);
  });

  it("되살린 쪽에 없는 항목은 0으로 비교한다", () => {
    expect(compareCounts({ "public.dates": 1 }, {})).toEqual([{ name: "public.dates", expected: 1, actual: 0 }]);
  });

  it("모두 같으면 빈 목록을 돌려준다", () => {
    expect(compareCounts({ "public.dates": 1 }, { "public.dates": 1 })).toEqual([]);
  });
});

describe("parseLastMigration", () => {
  it("rows로 감싼 조회 결과에서 마지막 마이그레이션을 읽는다", () => {
    const output = JSON.stringify({ boundary: "b", rows: [{ version: "20261106050000" }], warning: "w" });

    expect(parseLastMigration(output)).toBe("20261106050000");
  });

  it("목록만 있는 조회 결과에서도 읽는다", () => {
    expect(parseLastMigration('[{"version":"20261106050000"}]')).toBe("20261106050000");
  });

  it.each([
    ["JSON이 아니면", "연결 실패"],
    ["행이 없으면", '{"rows":[]}'],
    ["적용된 마이그레이션이 없으면", '{"rows":[{"version":null}]}'],
  ])("%s undefined를 돌려준다", (_name, output) => {
    expect(parseLastMigration(output)).toBeUndefined();
  });
});

describe("describeBackupVersion", () => {
  it("커밋과 마지막 마이그레이션을 함께 보여 준다", () => {
    expect(describeBackupVersion({ commit: "abc123", lastMigration: "20261106050000" })).toBe(
      "커밋 abc123, 마지막 마이그레이션 20261106050000",
    );
  });

  it("두 칸을 넣기 전에 받은 시점이면 기록 없음으로 보여 준다", () => {
    expect(describeBackupVersion({})).toBe("커밋 기록 없음, 마지막 마이그레이션 기록 없음");
  });
});
