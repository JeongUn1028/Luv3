import { describe, expect, it } from "vitest";
import { createDraftGroup, createDraftPhoto, createRecordDraft, createUnlocatedGroup, FOREST_LOCATION, ONION_LOCATION } from "@/test-utils/record-draft";
import { getMinEndDate, takeChars, toCreateRecordArgs, validateDraft } from "./form";

const TODAY = "2026-11-02";

describe("getMinEndDate", () => {
  it("시작 다음 날부터 고르게 한다", () => {
    expect(getMinEndDate("2026-10-31", TODAY)).toBe("2026-11-01");
  });

  it("시작이 오늘이거나 비어 있으면 제한을 두지 않는다", () => {
    expect(getMinEndDate(TODAY, TODAY)).toBeUndefined();
    expect(getMinEndDate("", TODAY)).toBeUndefined();
  });
});

describe("validateDraft", () => {
  it("필수 값이 모두 맞으면 에러가 없다", () => {
    expect(validateDraft(createRecordDraft(), TODAY)).toEqual({});
  });

  it("위치가 없는 모음이 있으면 그 모음에 알려 준다(모음마다 위치가 필요하다)", () => {
    // Arrange
    const groups = [createDraftGroup("g1", [createDraftPhoto("a")]), createUnlocatedGroup("g2", [createDraftPhoto("b")])];

    // Act
    const errors = validateDraft(createRecordDraft({ groups, coverPhotoId: "a" }), TODAY);

    // Assert
    expect(errors).toEqual({ "group:g2": "위치를 골라야 저장할 수 있어요." });
  });

  it("기간을 켜고 끝 날짜를 고르지 않았거나 없는 날이면 알려 준다", () => {
    expect(validateDraft(createRecordDraft({ endDate: "" }), TODAY).endDate).toBe("끝 날짜를 골라 주세요.");
    expect(validateDraft(createRecordDraft({ endDate: "2026-02-31" }), TODAY).endDate).toBe("끝 날짜를 골라 주세요.");
  });

  it("끝 날짜가 시작 날짜와 같거나 이르면 알려 준다", () => {
    const message = "끝 날짜는 시작 날짜보다 뒤여야 해요.";
    expect(validateDraft(createRecordDraft({ endDate: "2026-11-01" }), TODAY).endDate).toBe(message);
    expect(validateDraft(createRecordDraft({ endDate: "2026-10-31" }), TODAY).endDate).toBe(message);
  });

  it("끝 날짜가 오늘보다 뒤면 알려 준다", () => {
    expect(validateDraft(createRecordDraft({ endDate: "2026-11-03" }), TODAY).endDate).toBe("끝 날짜는 오늘까지 고를 수 있어요.");
  });

  it("끝 날짜가 시작 다음 날부터 오늘까지면 에러가 없다", () => {
    expect(validateDraft(createRecordDraft({ endDate: "2026-11-02" }), TODAY)).toEqual({});
  });

  it("제목이 비었거나 공백뿐이면 알려 준다", () => {
    expect(validateDraft(createRecordDraft({ title: "   " }), TODAY).title).toBe("제목을 적어 주세요.");
  });

  it("글자 수 제한을 넘으면 칸마다 알려 준다", () => {
    const errors = validateDraft(
      createRecordDraft({
        title: "가".repeat(101),
        memo: "가".repeat(10_001),
        groups: [{ ...createDraftGroup("g1", [createDraftPhoto("p1")], ONION_LOCATION, "가".repeat(101)), placeName: "가".repeat(31) }],
      }),
      TODAY,
    );
    expect(errors.title).toBe("제목은 100자까지 적을 수 있어요.");
    expect(errors.memo).toBe("정리 글은 10,000자까지 적을 수 있어요.");
    expect(errors["caption:g1"]).toBe("한마디는 100자까지 적을 수 있어요.");
    expect(errors["placeName:g1"]).toBe("장소 이름은 30자까지 적을 수 있어요.");
  });

  // 앞뒤 공백은 저장할 때 지우므로 세지 않는다. 30자 딱 맞으면 저장된다(DB 제약과 같다)
  it("장소 이름은 앞뒤 공백을 빼고 30자까지 받는다", () => {
    const errors = validateDraft(createRecordDraft({ groups: [{ ...createDraftGroup("g1", [createDraftPhoto("p1")]), placeName: ` ${"가".repeat(30)} ` }] }), TODAY);
    expect(errors["placeName:g1"]).toBeUndefined();
  });

  it("날짜가 없거나 오늘보다 뒤면 알려 준다", () => {
    expect(validateDraft(createRecordDraft({ date: "" }), TODAY).date).toBe("날짜를 골라 주세요.");
    expect(validateDraft(createRecordDraft({ date: "2026-02-31" }), TODAY).date).toBe("날짜를 골라 주세요.");
    expect(validateDraft(createRecordDraft({ date: "2026-11-03" }), TODAY).date).toBe(
      "다녀온 날짜를 골라 주세요. 앞으로의 약속은 캘린더에 적어요.",
    );
    expect(validateDraft(createRecordDraft({ date: TODAY }), TODAY).date).toBeUndefined();
  });

  it("사진이 없으면 알려 준다", () => {
    expect(validateDraft(createRecordDraft({ groups: [], coverPhotoId: undefined }), TODAY).photos).toBe(
      "사진을 한 장 이상 골라 주세요.",
    );
  });
});

describe("toCreateRecordArgs", () => {
  it("기록 작성 함수 인자로 바꾸고 앞뒤 공백을 지운다", () => {
    const args = toCreateRecordArgs(
      "r1",
      createRecordDraft({
        title: " 첫 데이트 ",
        memo: "좋았다",
        groups: [createDraftGroup("g1", [createDraftPhoto("a"), createDraftPhoto("b")], ONION_LOCATION, " 카페 ")],
        coverPhotoId: "b",
      }),
    );
    expect(args).toEqual({
      p_id: "r1",
      p_date: "2026-11-01",
      p_title: "첫 데이트",
      p_memo: "좋았다",
      p_groups: [
        {
          id: "g1",
          location: ONION_LOCATION,
          place_name: "",
          caption: "카페",
          photos: [{ id: "a" }, { id: "b" }],
        },
      ],
      p_cover_photo_id: "b",
      p_tags: [],
    });
  });

  it("모음을 화면 순서대로 모음마다의 위치·장소 이름·한마디·사진과 함께 넘기고, 화면에만 쓰는 값은 넘기지 않는다", () => {
    // Arrange
    const withPreview = { ...createDraftPhoto("b"), previewUrl: "blob:b", isReadingInfo: false };
    const groups = [{ ...createDraftGroup("g2", [createDraftPhoto("c")], FOREST_LOCATION, "숲"), placeName: " 서울숲 산책 " }, createDraftGroup("g1", [createDraftPhoto("a"), withPreview], { ...ONION_LOCATION, place: " 성수 " })];

    // Act
    const args = toCreateRecordArgs("r1", createRecordDraft({ groups, coverPhotoId: "a" }));

    // Assert
    expect(args.p_groups).toEqual([
      { id: "g2", location: FOREST_LOCATION, place_name: "서울숲 산책", caption: "숲", photos: [{ id: "c" }] },
      { id: "g1", location: { ...ONION_LOCATION, place: " 성수 " }, place_name: "", caption: "", photos: [{ id: "a" }, { id: "b" }] },
    ]);
  });

  it("위치가 없는 모음이 있으면 저장 인자를 만들지 않는다(검사를 거치지 않은 코드 실수)", () => {
    expect(() => toCreateRecordArgs("r1", createRecordDraft({ groups: [createUnlocatedGroup("g1", [createDraftPhoto("a")])], coverPhotoId: "a" }))).toThrow(
      "위치가 없는 모음입니다: g1",
    );
  });

  it("찍은 시각은 있는 사진만 넘긴다", () => {
    // Arrange
    const taken = { ...createDraftPhoto("a"), takenAt: "2026-11-10T14:03:22+09:00" };

    // Act
    const args = toCreateRecordArgs("r1", createRecordDraft({ groups: [createDraftGroup("g1", [taken, createDraftPhoto("b")])], coverPhotoId: "a" }));

    // Assert
    expect(args.p_groups).toEqual([
      {
        id: "g1",
        location: ONION_LOCATION,
        place_name: "",
        caption: "",
        photos: [{ id: "a", taken_at: "2026-11-10T14:03:22+09:00" }, { id: "b" }],
      },
    ]);
  });

  it("태그를 넘겨 다 지운 기록도 빈 목록으로 저장한다", () => {
    expect(toCreateRecordArgs("r1", createRecordDraft({ tags: ["카페", "여행"] })).p_tags).toEqual(["카페", "여행"]);
    expect(toCreateRecordArgs("r1", createRecordDraft()).p_tags).toEqual([]);
  });

  it("기간이면 끝 날짜를 넘기고, 하루짜리면 넘기지 않아 DB 함수가 비워 둔다", () => {
    const withPeriod = toCreateRecordArgs("r1", createRecordDraft({ endDate: "2026-11-02" }));
    expect(withPeriod.p_end_date).toBe("2026-11-02");

    const oneDay = toCreateRecordArgs("r1", createRecordDraft());
    expect(JSON.parse(JSON.stringify(oneDay))).not.toHaveProperty("p_end_date");
  });

  it("일정에서 남기면 어느 일정의 어느 날인지 넘기고, 직접 쓰면 넘기지 않는다", () => {
    const linked = toCreateRecordArgs("r1", createRecordDraft({ eventLink: { eventId: "e1", eventDate: "2026-11-01" } }));
    expect([linked.p_event_id, linked.p_event_date]).toEqual(["e1", "2026-11-01"]);

    expect(JSON.parse(JSON.stringify(toCreateRecordArgs("r1", createRecordDraft())))).not.toHaveProperty("p_event_id");
  });

  it("대표 사진이 없으면 코드 실수라 에러를 낸다", () => {
    expect(() => toCreateRecordArgs("r1", createRecordDraft({ coverPhotoId: undefined }))).toThrow("대표 사진");
  });
});

describe("takeChars", () => {
  it("앞뒤 공백을 지우고 이모지도 한 글자로 세어 제한까지만 남긴다", () => {
    expect(takeChars(" 성수동 ", 2)).toBe("성수");
    expect(takeChars("😀".repeat(120), 100)).toBe("😀".repeat(100));
  });
});
