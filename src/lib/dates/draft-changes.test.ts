import { describe, expect, it } from "vitest";
import { createDraftGroup, createDraftPhoto, createRecordDraft, createUnlocatedGroup, FOREST_LOCATION, ONION_LOCATION } from "@/test-utils/record-draft";
import { hasRecordDraftChanges, isSameExceptReadingPhotoInfo } from "./draft-changes";
import type { DateRecordDraft, DraftPhotoGroup } from "./form";

describe("hasRecordDraftChanges", () => {
  it("쓴 내용(칸·모음·사진·모음 한마디·태그·모음 위치·장소 이름)이 처음과 다르면 바뀌었다고 본다", () => {
    const initial = createRecordDraft();

    expect([
      hasRecordDraftChanges(initial, createRecordDraft({ title: "두 번째 데이트" })),
      hasRecordDraftChanges(initial, createRecordDraft({ groups: [createDraftGroup("g1", [createDraftPhoto("p1"), createDraftPhoto("p2")])] })),
      hasRecordDraftChanges(initial, createRecordDraft({ groups: [createDraftGroup("g1", [createDraftPhoto("p1")]), createDraftGroup("g2", [createDraftPhoto("p2")])] })),
      hasRecordDraftChanges(initial, createRecordDraft({ groups: [createDraftGroup("g1", [createDraftPhoto("p1")], ONION_LOCATION, "카페")] })),
      hasRecordDraftChanges(initial, createRecordDraft({ tags: ["산책"] })),
      hasRecordDraftChanges(initial, createRecordDraft({ groups: [createDraftGroup("g1", [createDraftPhoto("p1")], FOREST_LOCATION)] })),
      hasRecordDraftChanges(initial, createRecordDraft({ groups: [{ ...createDraftGroup("g1", [createDraftPhoto("p1")]), placeName: "골목 끝 카페" }] })),
    ]).toEqual([true, true, true, true, true, true, true]);
  });

  // 저장 시도에 쓰는 판 번호와, 다시 연 폼에서 새로 만드는 미리보기 주소, 위치를 정한 곳은 쓴 내용이 아니다
  it("판 번호나 사진 미리보기 주소, 위치를 정한 곳만 다르면 바뀌지 않았다고 본다", () => {
    const initial = { ...createRecordDraft(), groups: [createDraftGroup("g1", [{ ...createDraftPhoto("p1"), previewUrl: "blob:a" }])] };
    const current = {
      ...createRecordDraft({ expectedRevisions: ["r1", "r2"], nextRevision: "r3", hasConflict: true }),
      groups: [{ ...createDraftGroup("g1", [{ ...createDraftPhoto("p1"), previewUrl: "blob:b" }]), locationSource: "picked" as const }],
    };

    expect(hasRecordDraftChanges(initial, current)).toBe(false);
  });
});

describe("isSameExceptReadingPhotoInfo", () => {
  const reading = (id: string, takenAt: string | undefined = undefined) => ({ ...createDraftPhoto(id), takenAt, isReadingInfo: takenAt === undefined });
  type ReadingPhoto = ReturnType<typeof reading>;
  const pending = (id: string, photos: ReadingPhoto[]): DraftPhotoGroup<ReadingPhoto> => ({
    ...createUnlocatedGroup(id, photos),
    pendingLocationPhotoId: photos[0]?.id,
  });
  const withGroups = (groups: DraftPhotoGroup<ReadingPhoto>[]): DateRecordDraft<ReadingPhoto> => ({ ...createRecordDraft(), groups });

  // 나가기를 고른 뒤 늦게 온 사진 정보가 #284의 되돌리기를 막지 않게 한다
  it("읽는 중이던 모음에 위치가 채워지고 찍은 시각 자리로 옮겨진 것뿐이면 같다고 본다", () => {
    // Arrange
    const done = createDraftGroup("g2", [reading("p2", "2026-11-10T15:00:00+09:00")]);
    const discarded = withGroups([done, pending("g1", [reading("p1")])]);
    const current = withGroups([{ ...createDraftGroup("g1", [reading("p1", "2026-11-10T14:00:00+09:00")], FOREST_LOCATION), locationSource: "photo" }, done]);

    // Act & Assert
    expect(isSameExceptReadingPhotoInfo(discarded, current)).toBe(true);
  });

  it("다른 칸이나 다 읽은 모음의 위치가 바뀌었으면 다르다고 본다", () => {
    // Arrange
    const discarded = withGroups([pending("g1", [reading("p1")]), createDraftGroup("g2", [reading("p2", "2026-11-10T15:00:00+09:00")])]);
    const titleChanged = { ...discarded, title: "두 번째 데이트" };
    const readLocationChanged = withGroups([pending("g1", [reading("p1")]), createDraftGroup("g2", [reading("p2", "2026-11-10T15:00:00+09:00")], FOREST_LOCATION)]);

    // Act & Assert
    expect([isSameExceptReadingPhotoInfo(discarded, titleChanged), isSameExceptReadingPhotoInfo(discarded, readLocationChanged)]).toEqual([false, false]);
  });
});
