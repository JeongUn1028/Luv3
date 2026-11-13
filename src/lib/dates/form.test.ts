import { describe, expect, it } from "vitest";
import {
  addTag,
  getMinEndDate,
  hasRecordDraftChanges,
  isSameExceptReadingPhotoInfo,
  normalizeTag,
  pickTagSuggestions,
  takeChars,
  toCreateRecordArgs,
  validateDraft,
  type DateRecordDraft,
  type DraftPhoto,
  type DraftPhotoGroup,
  type PhotoLocation,
} from "./form";

const ONION: PhotoLocation = { place: "성동구 성수2가1동", lat: 37.5447, lng: 127.0582 };
const FOREST: PhotoLocation = { place: "성동구 성수1가1동", lat: 37.5444, lng: 127.0374 };

const TODAY = "2026-11-02";
const photo = (id: string): DraftPhoto => ({ id });
const group = <Photo extends DraftPhoto>(id: string, photos: Photo[], location: PhotoLocation = ONION, caption = ""): DraftPhotoGroup<Photo> => ({
  id,
  location,
  locationSource: "saved",
  pendingLocationPhotoId: undefined,
  placeName: "",
  caption,
  photos,
});
/** 첫 사진에 위치가 없어 아직 위치를 고르지 않은 모음 */
const unlocatedGroup = <Photo extends DraftPhoto>(id: string, photos: Photo[]): DraftPhotoGroup<Photo> => ({
  ...group(id, photos),
  location: undefined,
  locationSource: undefined,
});
const draft = (overrides: Partial<DateRecordDraft> = {}): DateRecordDraft => ({
  date: "2026-11-01",
  endDate: undefined,
  title: "첫 데이트",
  memo: "",
  groups: [group("g1", [photo("p1")])],
  coverPhotoId: "p1",
  tags: [],
  ...overrides,
});

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
    expect(validateDraft(draft(), TODAY)).toEqual({});
  });

  it("위치가 없는 모음이 있으면 그 모음에 알려 준다(모음마다 위치가 필요하다)", () => {
    // Arrange
    const groups = [group("g1", [photo("a")]), unlocatedGroup("g2", [photo("b")])];

    // Act
    const errors = validateDraft(draft({ groups, coverPhotoId: "a" }), TODAY);

    // Assert
    expect(errors).toEqual({ "group:g2": "위치를 골라야 저장할 수 있어요." });
  });

  it("기간을 켜고 끝 날짜를 고르지 않았거나 없는 날이면 알려 준다", () => {
    expect(validateDraft(draft({ endDate: "" }), TODAY).endDate).toBe("끝 날짜를 골라 주세요.");
    expect(validateDraft(draft({ endDate: "2026-02-31" }), TODAY).endDate).toBe("끝 날짜를 골라 주세요.");
  });

  it("끝 날짜가 시작 날짜와 같거나 이르면 알려 준다", () => {
    const message = "끝 날짜는 시작 날짜보다 뒤여야 해요.";
    expect(validateDraft(draft({ endDate: "2026-11-01" }), TODAY).endDate).toBe(message);
    expect(validateDraft(draft({ endDate: "2026-10-31" }), TODAY).endDate).toBe(message);
  });

  it("끝 날짜가 오늘보다 뒤면 알려 준다", () => {
    expect(validateDraft(draft({ endDate: "2026-11-03" }), TODAY).endDate).toBe("끝 날짜는 오늘까지 고를 수 있어요.");
  });

  it("끝 날짜가 시작 다음 날부터 오늘까지면 에러가 없다", () => {
    expect(validateDraft(draft({ endDate: "2026-11-02" }), TODAY)).toEqual({});
  });

  it("제목이 비었거나 공백뿐이면 알려 준다", () => {
    expect(validateDraft(draft({ title: "   " }), TODAY).title).toBe("제목을 적어 주세요.");
  });

  it("글자 수 제한을 넘으면 칸마다 알려 준다", () => {
    const errors = validateDraft(
      draft({
        title: "가".repeat(101),
        memo: "가".repeat(10_001),
        groups: [{ ...group("g1", [photo("p1")], ONION, "가".repeat(101)), placeName: "가".repeat(31) }],
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
    const errors = validateDraft(draft({ groups: [{ ...group("g1", [photo("p1")]), placeName: ` ${"가".repeat(30)} ` }] }), TODAY);
    expect(errors["placeName:g1"]).toBeUndefined();
  });

  it("날짜가 없거나 오늘보다 뒤면 알려 준다", () => {
    expect(validateDraft(draft({ date: "" }), TODAY).date).toBe("날짜를 골라 주세요.");
    expect(validateDraft(draft({ date: "2026-02-31" }), TODAY).date).toBe("날짜를 골라 주세요.");
    expect(validateDraft(draft({ date: "2026-11-03" }), TODAY).date).toBe(
      "다녀온 날짜를 골라 주세요. 앞으로의 약속은 캘린더에 적어요.",
    );
    expect(validateDraft(draft({ date: TODAY }), TODAY).date).toBeUndefined();
  });

  it("사진이 없으면 알려 준다", () => {
    expect(validateDraft(draft({ groups: [], coverPhotoId: undefined }), TODAY).photos).toBe(
      "사진을 한 장 이상 골라 주세요.",
    );
  });
});

describe("toCreateRecordArgs", () => {
  it("기록 작성 함수 인자로 바꾸고 앞뒤 공백을 지운다", () => {
    const args = toCreateRecordArgs(
      "r1",
      draft({
        title: " 첫 데이트 ",
        memo: "좋았다",
        groups: [group("g1", [photo("a"), photo("b")], ONION, " 카페 ")],
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
          location: ONION,
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
    const withPreview = { ...photo("b"), previewUrl: "blob:b", isReadingInfo: false };
    const groups = [{ ...group("g2", [photo("c")], FOREST, "숲"), placeName: " 서울숲 산책 " }, group("g1", [photo("a"), withPreview], { ...ONION, place: " 성수 " })];

    // Act
    const args = toCreateRecordArgs("r1", draft({ groups, coverPhotoId: "a" }));

    // Assert
    expect(args.p_groups).toEqual([
      { id: "g2", location: FOREST, place_name: "서울숲 산책", caption: "숲", photos: [{ id: "c" }] },
      { id: "g1", location: { ...ONION, place: " 성수 " }, place_name: "", caption: "", photos: [{ id: "a" }, { id: "b" }] },
    ]);
  });

  it("위치가 없는 모음이 있으면 저장 인자를 만들지 않는다(검사를 거치지 않은 코드 실수)", () => {
    expect(() => toCreateRecordArgs("r1", draft({ groups: [unlocatedGroup("g1", [photo("a")])], coverPhotoId: "a" }))).toThrow(
      "위치가 없는 모음입니다: g1",
    );
  });

  it("찍은 시각은 있는 사진만 넘긴다", () => {
    // Arrange
    const taken = { ...photo("a"), takenAt: "2026-11-10T14:03:22+09:00" };

    // Act
    const args = toCreateRecordArgs("r1", draft({ groups: [group("g1", [taken, photo("b")])], coverPhotoId: "a" }));

    // Assert
    expect(args.p_groups).toEqual([
      {
        id: "g1",
        location: ONION,
        place_name: "",
        caption: "",
        photos: [{ id: "a", taken_at: "2026-11-10T14:03:22+09:00" }, { id: "b" }],
      },
    ]);
  });

  it("태그를 넘겨 다 지운 기록도 빈 목록으로 저장한다", () => {
    expect(toCreateRecordArgs("r1", draft({ tags: ["카페", "여행"] })).p_tags).toEqual(["카페", "여행"]);
    expect(toCreateRecordArgs("r1", draft()).p_tags).toEqual([]);
  });

  it("기간이면 끝 날짜를 넘기고, 하루짜리면 넘기지 않아 DB 함수가 비워 둔다", () => {
    const withPeriod = toCreateRecordArgs("r1", draft({ endDate: "2026-11-02" }));
    expect(withPeriod.p_end_date).toBe("2026-11-02");

    const oneDay = toCreateRecordArgs("r1", draft());
    expect(JSON.parse(JSON.stringify(oneDay))).not.toHaveProperty("p_end_date");
  });

  it("일정에서 남기면 어느 일정의 어느 날인지 넘기고, 직접 쓰면 넘기지 않는다", () => {
    const linked = toCreateRecordArgs("r1", draft({ eventLink: { eventId: "e1", eventDate: "2026-11-01" } }));
    expect([linked.p_event_id, linked.p_event_date]).toEqual(["e1", "2026-11-01"]);

    expect(JSON.parse(JSON.stringify(toCreateRecordArgs("r1", draft())))).not.toHaveProperty("p_event_id");
  });

  it("대표 사진이 없으면 코드 실수라 에러를 낸다", () => {
    expect(() => toCreateRecordArgs("r1", draft({ coverPhotoId: undefined }))).toThrow("대표 사진");
  });
});

describe("takeChars", () => {
  it("앞뒤 공백을 지우고 이모지도 한 글자로 세어 제한까지만 남긴다", () => {
    expect(takeChars(" 성수동 ", 2)).toBe("성수");
    expect(takeChars("😀".repeat(120), 100)).toBe("😀".repeat(100));
  });
});

describe("normalizeTag", () => {
  it("앞뒤 공백과 앞의 #을 지우고 안쪽 공백을 하나로 줄인다", () => {
    expect(normalizeTag("  #카페  ")).toBe("카페");
    expect(normalizeTag("## 한강   산책")).toBe("한강 산책");
  });

  it("글자가 없으면 빈 문자열이다", () => {
    expect(normalizeTag(" # ")).toBe("");
  });
});

describe("addTag", () => {
  it("다듬은 태그를 뒤에 붙인다", () => {
    expect(addTag(["카페"], " #여행 ")).toEqual({ tags: ["카페", "여행"] });
  });

  it("비어 있으면 그대로 둔다", () => {
    expect(addTag(["카페"], "  ")).toEqual({ tags: ["카페"] });
  });

  it("이미 있는 태그는 대소문자가 달라도 더하지 않고 알리지도 않는다", () => {
    expect(addTag(["Cafe"], "cafe")).toEqual({ tags: ["Cafe"] });
  });

  it("10자를 넘으면 더하지 않고 알려 준다", () => {
    expect(addTag([], "가".repeat(10))).toEqual({ tags: ["가".repeat(10)] });
    expect(addTag([], "가".repeat(11))).toEqual({ tags: [], error: "태그는 10자까지 적을 수 있어요." });
  });

  it("5개를 넘으면 더하지 않고 알려 준다", () => {
    const tags = ["가", "나", "다", "라", "마"];
    expect(addTag(tags, "바")).toEqual({ tags, error: "태그는 5개까지 붙일 수 있어요." });
  });

  it("이미 5개여도 있는 태그를 다시 적으면 그대로 둔다", () => {
    const tags = ["가", "나", "다", "라", "마"];
    expect(addTag(tags, "가")).toEqual({ tags });
  });

  it("#으로 나눠 적으면 각각의 태그로 더한다", () => {
    expect(addTag([], "#카페 #한강 산책")).toEqual({ tags: ["카페", "한강 산책"] });
    expect(addTag(["카페"], "카페#여행")).toEqual({ tags: ["카페", "여행"] });
  });

  it("나눠 적은 태그 중 하나라도 못 붙이면 하나도 더하지 않는다", () => {
    const tags = ["가", "나", "다", "라"];
    expect(addTag(tags, "#마 #바")).toEqual({ tags, error: "태그는 5개까지 붙일 수 있어요." });
    expect(addTag([], `#카페 #${"가".repeat(11)}`)).toEqual({ tags: [], error: "태그는 10자까지 적을 수 있어요." });
  });
});

describe("pickTagSuggestions", () => {
  it("이미 붙인 태그는 대소문자와 상관없이 뺀다", () => {
    expect(pickTagSuggestions(["cafe", "여행"], ["Cafe"])).toEqual(["여행"]);
  });

  it("붙인 태그를 뺀 뒤에 12개까지 고른다", () => {
    const suggestions = Array.from({ length: 20 }, (_, index) => `태그${index}`);
    const picked = pickTagSuggestions(suggestions, suggestions.slice(0, 5));
    expect(picked).toEqual(suggestions.slice(5, 17));
  });
});

describe("hasRecordDraftChanges", () => {
  it("쓴 내용(칸·모음·사진·모음 한마디·태그·모음 위치·장소 이름)이 처음과 다르면 바뀌었다고 본다", () => {
    const initial = draft();

    expect([
      hasRecordDraftChanges(initial, draft({ title: "두 번째 데이트" })),
      hasRecordDraftChanges(initial, draft({ groups: [group("g1", [photo("p1"), photo("p2")])] })),
      hasRecordDraftChanges(initial, draft({ groups: [group("g1", [photo("p1")]), group("g2", [photo("p2")])] })),
      hasRecordDraftChanges(initial, draft({ groups: [group("g1", [photo("p1")], ONION, "카페")] })),
      hasRecordDraftChanges(initial, draft({ tags: ["산책"] })),
      hasRecordDraftChanges(initial, draft({ groups: [group("g1", [photo("p1")], FOREST)] })),
      hasRecordDraftChanges(initial, draft({ groups: [{ ...group("g1", [photo("p1")]), placeName: "골목 끝 카페" }] })),
    ]).toEqual([true, true, true, true, true, true, true]);
  });

  // 저장 시도에 쓰는 판 번호와, 다시 연 폼에서 새로 만드는 미리보기 주소, 위치를 정한 곳은 쓴 내용이 아니다
  it("판 번호나 사진 미리보기 주소, 위치를 정한 곳만 다르면 바뀌지 않았다고 본다", () => {
    const initial = { ...draft(), groups: [group("g1", [{ ...photo("p1"), previewUrl: "blob:a" }])] };
    const current = {
      ...draft({ expectedRevisions: ["r1", "r2"], nextRevision: "r3", hasConflict: true }),
      groups: [{ ...group("g1", [{ ...photo("p1"), previewUrl: "blob:b" }]), locationSource: "picked" as const }],
    };

    expect(hasRecordDraftChanges(initial, current)).toBe(false);
  });
});

describe("isSameExceptReadingPhotoInfo", () => {
  const reading = (id: string, takenAt: string | undefined = undefined) => ({ ...photo(id), takenAt, isReadingInfo: takenAt === undefined });
  type ReadingPhoto = ReturnType<typeof reading>;
  const pending = (id: string, photos: ReadingPhoto[]): DraftPhotoGroup<ReadingPhoto> => ({
    ...unlocatedGroup(id, photos),
    pendingLocationPhotoId: photos[0]?.id,
  });
  const withGroups = (groups: DraftPhotoGroup<ReadingPhoto>[]): DateRecordDraft<ReadingPhoto> => ({ ...draft(), groups });

  // 나가기를 고른 뒤 늦게 온 사진 정보가 #284의 되돌리기를 막지 않게 한다
  it("읽는 중이던 모음에 위치가 채워지고 찍은 시각 자리로 옮겨진 것뿐이면 같다고 본다", () => {
    // Arrange
    const done = group("g2", [reading("p2", "2026-11-10T15:00:00+09:00")]);
    const discarded = withGroups([done, pending("g1", [reading("p1")])]);
    const current = withGroups([{ ...group("g1", [reading("p1", "2026-11-10T14:00:00+09:00")], FOREST), locationSource: "photo" }, done]);

    // Act & Assert
    expect(isSameExceptReadingPhotoInfo(discarded, current)).toBe(true);
  });

  it("다른 칸이나 다 읽은 모음의 위치가 바뀌었으면 다르다고 본다", () => {
    // Arrange
    const discarded = withGroups([pending("g1", [reading("p1")]), group("g2", [reading("p2", "2026-11-10T15:00:00+09:00")])]);
    const titleChanged = { ...discarded, title: "두 번째 데이트" };
    const readLocationChanged = withGroups([pending("g1", [reading("p1")]), group("g2", [reading("p2", "2026-11-10T15:00:00+09:00")], FOREST)]);

    // Act & Assert
    expect([isSameExceptReadingPhotoInfo(discarded, titleChanged), isSameExceptReadingPhotoInfo(discarded, readLocationChanged)]).toEqual([false, false]);
  });
});
