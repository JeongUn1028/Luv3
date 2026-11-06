import { describe, expect, it } from "vitest";
import {
  MAX_PHOTOS,
  addPhotos,
  addTag,
  getMinEndDate,
  movePhoto,
  normalizeTag,
  parseRecordPrefill,
  pickTagSuggestions,
  removePhoto,
  toCreateRecordArgs,
  toNewRecordHref,
  validateDraft,
  type DateRecordDraft,
} from "./form";

const TODAY = "2026-11-02";
const photo = (id: string, caption = "") => ({ id, caption });
const draft = (overrides: Partial<DateRecordDraft> = {}): DateRecordDraft => ({
  date: "2026-11-01",
  endDate: undefined,
  title: "첫 데이트",
  place: "",
  memo: "",
  photos: [photo("p1")],
  coverPhotoId: "p1",
  tags: [],
  location: undefined,
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
        place: "가".repeat(101),
        memo: "가".repeat(10_001),
        photos: [photo("p1", "가".repeat(101))],
      }),
      TODAY,
    );
    expect(errors.title).toBe("제목은 100자까지 적을 수 있어요.");
    expect(errors.place).toBe("장소는 100자까지 적을 수 있어요.");
    expect(errors.memo).toBe("정리 글은 10,000자까지 적을 수 있어요.");
    expect(errors["caption:p1"]).toBe("한마디는 100자까지 적을 수 있어요.");
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
    expect(validateDraft(draft({ photos: [], coverPhotoId: undefined }), TODAY).photos).toBe(
      "사진을 한 장 이상 골라 주세요.",
    );
  });
});

describe("addPhotos", () => {
  it("고른 사진을 뒤에 붙이고, 대표 사진이 없으면 첫 사진을 대표로 정한다", () => {
    const result = addPhotos(draft({ photos: [], coverPhotoId: undefined }), [photo("a"), photo("b")]);
    expect(result.draft.photos.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(result.draft.coverPhotoId).toBe("a");
    expect(result.droppedCount).toBe(0);
  });

  it("10장을 넘는 사진은 버리고 몇 장을 버렸는지 알려 준다", () => {
    const many = Array.from({ length: 12 }, (_, index) => photo(`n${index}`));
    const result = addPhotos(draft(), many);
    expect(result.draft.photos).toHaveLength(MAX_PHOTOS);
    expect(result.droppedCount).toBe(3);
    expect(result.draft.coverPhotoId).toBe("p1");
  });
});

describe("removePhoto", () => {
  it("대표 사진을 지우면 남은 첫 사진이 대표가 된다", () => {
    const result = removePhoto(draft({ photos: [photo("a"), photo("b")], coverPhotoId: "a" }), "a");
    expect(result.photos.map(({ id }) => id)).toEqual(["b"]);
    expect(result.coverPhotoId).toBe("b");
  });

  it("마지막 사진을 지우면 대표 사진도 비운다", () => {
    expect(removePhoto(draft(), "p1").coverPhotoId).toBeUndefined();
  });
});

describe("movePhoto", () => {
  it("사진 순서를 앞뒤로 바꾼다", () => {
    const photos = [photo("a"), photo("b"), photo("c")];
    expect(movePhoto(photos, 2, -1).map(({ id }) => id)).toEqual(["a", "c", "b"]);
    expect(movePhoto(photos, 0, 1).map(({ id }) => id)).toEqual(["b", "a", "c"]);
  });

  it("맨 앞·맨 뒤를 넘어가면 그대로 둔다", () => {
    const photos = [photo("a"), photo("b")];
    expect(movePhoto(photos, 0, -1)).toEqual(photos);
    expect(movePhoto(photos, 1, 1)).toEqual(photos);
  });
});

describe("toCreateRecordArgs", () => {
  it("기록 작성 함수 인자로 바꾸고 앞뒤 공백을 지운다", () => {
    const args = toCreateRecordArgs(
      "r1",
      draft({
        title: " 첫 데이트 ",
        place: " 성수 ",
        memo: "좋았다",
        photos: [photo("a", " 카페 "), photo("b")],
        coverPhotoId: "b",
      }),
    );
    expect(args).toEqual({
      p_id: "r1",
      p_date: "2026-11-01",
      p_title: "첫 데이트",
      p_place: "성수",
      p_memo: "좋았다",
      p_photos: [
        { id: "a", caption: "카페" },
        { id: "b", caption: "" },
      ],
      p_cover_photo_id: "b",
      p_tags: [],
      p_place_location: {},
    });
  });

  it("태그를 넘겨 다 지운 기록도 빈 목록으로 저장한다", () => {
    expect(toCreateRecordArgs("r1", draft({ tags: ["카페", "여행"] })).p_tags).toEqual(["카페", "여행"]);
    expect(toCreateRecordArgs("r1", draft()).p_tags).toEqual([]);
  });

  it("좌표가 있으면 넘기고, 없으면 지우라는 빈 객체를 넘긴다", () => {
    expect(toCreateRecordArgs("r1", draft({ location: { lat: 37.5, lng: 127 } })).p_place_location).toEqual({ lat: 37.5, lng: 127 });
    expect(toCreateRecordArgs("r1", draft()).p_place_location).toEqual({});
  });

  it("기간이면 끝 날짜를 넘기고, 하루짜리면 넘기지 않아 DB 함수가 비워 둔다", () => {
    const withPeriod = toCreateRecordArgs("r1", draft({ endDate: "2026-11-02" }));
    expect(withPeriod.p_end_date).toBe("2026-11-02");

    const oneDay = toCreateRecordArgs("r1", draft());
    expect(JSON.parse(JSON.stringify(oneDay))).not.toHaveProperty("p_end_date");
  });

  it("대표 사진이 없으면 코드 실수라 에러를 낸다", () => {
    expect(() => toCreateRecordArgs("r1", draft({ coverPhotoId: undefined }))).toThrow("대표 사진");
  });
});

describe("toNewRecordHref", () => {
  it("일정의 날짜·제목·장소를 작성 화면 주소 쿼리로 넘긴다", () => {
    expect(toNewRecordHref({ date: "2026-11-01", title: "전시 & 저녁", place: "국립현대미술관" })).toBe(
      "/dates/new?date=2026-11-01&title=%EC%A0%84%EC%8B%9C+%26+%EC%A0%80%EB%85%81&place=%EA%B5%AD%EB%A6%BD%ED%98%84%EB%8C%80%EB%AF%B8%EC%88%A0%EA%B4%80",
    );
  });

  it("장소가 없으면 장소 쿼리를 넣지 않는다", () => {
    expect(toNewRecordHref({ date: "2026-11-01", title: "산책", place: "" })).toBe(
      "/dates/new?date=2026-11-01&title=%EC%82%B0%EC%B1%85",
    );
  });

  it("기간 일정이면 끝 날짜도 넘긴다", () => {
    expect(toNewRecordHref({ date: "2026-10-30", endDate: "2026-11-01", title: "여행", place: "" })).toBe(
      "/dates/new?date=2026-10-30&title=%EC%97%AC%ED%96%89&endDate=2026-11-01",
    );
  });
});

describe("parseRecordPrefill", () => {
  it("쿼리가 없으면 채울 값이 없다", () => {
    expect(parseRecordPrefill({}, TODAY)).toBeUndefined();
  });

  it("주소 쿼리의 날짜·제목·장소를 작성 폼 처음 값으로 읽는다", () => {
    expect(parseRecordPrefill({ date: "2026-11-01", title: " 전시 보기 ", place: "미술관" }, TODAY)).toEqual({
      date: "2026-11-01",
      title: "전시 보기",
      place: "미술관",
    });
  });

  it("날짜 쿼리가 없으면 오늘로 둔다", () => {
    expect(parseRecordPrefill({ title: "a" }, TODAY)?.date).toBe(TODAY);
  });

  it("없는 날짜·앞으로의 날짜·여러 값은 다른 날로 바꾸지 않고 비워서 직접 고르게 한다", () => {
    expect(parseRecordPrefill({ date: "2026-02-31", title: "a" }, TODAY)?.date).toBe("");
    expect(parseRecordPrefill({ date: "2026-11-03", title: "a" }, TODAY)?.date).toBe("");
    expect(parseRecordPrefill({ date: ["2026-11-01", "2026-10-31"], title: "a" }, TODAY)?.date).toBe("");
  });

  it("글자 수 제한을 넘는 제목·장소는 제한까지만 채운다", () => {
    const prefill = parseRecordPrefill({ title: "가".repeat(150), place: "😀".repeat(120) }, TODAY);
    expect(prefill?.title).toBe("가".repeat(100));
    expect(prefill?.place).toBe("😀".repeat(100));
  });

  it("끝 날짜 쿼리를 작성 폼 처음 값으로 읽는다", () => {
    expect(parseRecordPrefill({ date: "2026-10-30", endDate: "2026-11-01", title: "여행" }, TODAY)?.endDate).toBe("2026-11-01");
    expect(parseRecordPrefill({ date: "2026-10-30", title: "여행" }, TODAY)?.endDate).toBeUndefined();
  });

  it("쓸 수 없는 끝 날짜는 받지 않아 하루 기록으로 시작한다", () => {
    const parseEndDate = (date: string, endDate: string | string[]) => parseRecordPrefill({ date, endDate, title: "a" }, TODAY)?.endDate;
    expect(parseEndDate("2026-10-30", "2026-02-31")).toBeUndefined();
    expect(parseEndDate("2026-10-30", "2026-11-03")).toBeUndefined();
    expect(parseEndDate("2026-10-30", "2026-10-30")).toBeUndefined();
    expect(parseEndDate("2026-11-03", "2026-11-02")).toBeUndefined();
    expect(parseEndDate("2026-10-30", ["2026-11-01", "2026-11-02"])).toBeUndefined();
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
