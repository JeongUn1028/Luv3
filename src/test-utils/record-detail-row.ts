import type { DetailRow } from "@/lib/dates/detail";

/** 모음 둘(한마디는 g1만), 사진 둘인 기록 상세 조회 행. 상세·수정 화면 변환 테스트가 함께 쓴다 */
export const RECORD_DETAIL_ROW: DetailRow = {
  id: "r1",
  revision: "30000000-0000-4000-8000-000000000001",
  date: "2026-11-02",
  end_date: null,
  title: "산책",
  memo: "오래 걸었다",
  cover_photo_id: "p2",
  tags: ["카페", "여행"],
  author: { nickname: "진아" },
  event_date: null,
  event: null,
  groups: [
    { id: "g2", caption: null },
    { id: "g1", caption: "카페" },
  ],
  photos: [
    { id: "p2", group_id: "g2", path: "r1/p2.jpg", thumb_path: "r1/p2_thumb.jpg", sort_order: 1, place: "성수 서울숲", place_lat: 37.5443, place_lng: 127.0374, place_name: null, taken_at: null },
    { id: "p1", group_id: "g1", path: "r1/p1.jpg", thumb_path: "r1/p1_thumb.jpg", sort_order: 0, place: "어니언 성수", place_lat: 37.5447, place_lng: 127.0582, place_name: "골목 끝 카페", taken_at: null },
  ],
};
