import type { DateRecordDraft, DraftPhoto, DraftPhotoGroup, PhotoLocation } from "@/lib/dates/form";

/** 성수2가1동 모음 위치. 기록 폼 테스트가 함께 쓴다 */
export const ONION_LOCATION: PhotoLocation = { place: "성동구 성수2가1동", lat: 37.5447, lng: 127.0582 };
/** 성수1가1동 모음 위치. 위치가 바뀐 경우를 볼 때 쓴다 */
export const FOREST_LOCATION: PhotoLocation = { place: "성동구 성수1가1동", lat: 37.5444, lng: 127.0374 };

/**
 * 파일 없이 id만 있는 사진.
 *
 * @example createDraftPhoto("p1") // { id: "p1" }
 */
export const createDraftPhoto = (id: string): DraftPhoto => ({ id });

/**
 * 위치가 정해진 저장된 모음.
 *
 * @example createDraftGroup("g1", [createDraftPhoto("p1")], ONION_LOCATION, "카페")
 */
export const createDraftGroup = <Photo extends DraftPhoto>(id: string, photos: Photo[], location: PhotoLocation = ONION_LOCATION, caption = ""): DraftPhotoGroup<Photo> => ({
  id,
  location,
  locationSource: "saved",
  pendingLocationPhotoId: undefined,
  placeName: "",
  caption,
  photos,
});

/**
 * 첫 사진에 위치가 없어 아직 위치를 고르지 않은 모음.
 *
 * @example createUnlocatedGroup("g1", [createDraftPhoto("p1")])
 */
export const createUnlocatedGroup = <Photo extends DraftPhoto>(id: string, photos: Photo[]): DraftPhotoGroup<Photo> => ({
  ...createDraftGroup(id, photos),
  location: undefined,
  locationSource: undefined,
});

/**
 * 사진 한 장짜리 모음 하나가 있는 하루 기록 입력값. 바꿀 칸만 넘긴다.
 *
 * @example createRecordDraft({ title: "두 번째 데이트" })
 */
export const createRecordDraft = (overrides: Partial<DateRecordDraft> = {}): DateRecordDraft => ({
  date: "2026-11-01",
  endDate: undefined,
  title: "첫 데이트",
  memo: "",
  groups: [createDraftGroup("g1", [createDraftPhoto("p1")])],
  coverPhotoId: "p1",
  tags: [],
  ...overrides,
});
