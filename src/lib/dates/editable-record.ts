import type { SignedUrl } from "@/lib/photos/signed-urls";
import { sortPhotos, toCaptionByGroupId, toUrlByPath, type DetailRow } from "./detail";
import type { PhotoLocation } from "./form";
import { groupPhotosInOrder } from "./photo-groups";

/** 수정 화면 초기값. 글은 입력칸에 바로 넣도록 빈 값을 빈 문자열로 둔다 */
export interface EditableRecord {
  id: string;
  /** 불러온 때의 판 번호. 저장할 때 보내 그사이 바뀌었는지 확인한다 */
  revision: string;
  date: string;
  endDate: string | undefined;
  title: string;
  memo: string;
  coverPhotoId: string | undefined;
  tags: string[];
  /** 이미 저장된 사진 모음(#298). 모음 순서, 모음 안 순서대로다 */
  groups: EditableGroup[];
}

/** 수정 화면의 저장된 모음. 사진 미리보기는 썸네일 서명 URL */
export interface EditableGroup {
  id: string;
  /** 모음은 위치가 꼭 있다(#297) */
  location: PhotoLocation;
  /** 모음 한마디(#309). 없으면 빈 문자열 */
  caption: string;
  /** 사용자가 붙인 장소 이름(#317). 없으면 빈 문자열 */
  placeName: string;
  photos: { id: string; takenAt: string | undefined; previewUrl: string | undefined }[];
}

const toPhotoLocation = ({ place, place_lat: lat, place_lng: lng }: DetailRow["photos"][number]): PhotoLocation => ({ place, lat, lng });

/** 사진 순서대로 놓인 사진을 모음으로 묶는다. 떨어진 같은 모음 사진도 한 모음으로 모아 고쳐 저장할 때 같은 모음 id를 두 번 넘기지 않는다 */
const toEditableGroups = ({
  photos,
  urlByPath,
  captionByGroupId,
}: {
  photos: DetailRow["photos"];
  urlByPath: Map<string, string>;
  captionByGroupId: Map<string, string>;
}): EditableGroup[] =>
  groupPhotosInOrder(photos).map((groupPhotos) => ({
    id: groupPhotos[0].group_id,
    location: toPhotoLocation(groupPhotos[0]),
    caption: captionByGroupId.get(groupPhotos[0].group_id) ?? "",
    placeName: groupPhotos[0].place_name ?? "",
    photos: groupPhotos.map((photo) => ({ id: photo.id, takenAt: photo.taken_at ?? undefined, previewUrl: urlByPath.get(photo.thumb_path) })),
  }));

/**
 * 조회한 행을 수정 화면 초기값으로 바꾼다. 미리보기는 썸네일 서명 URL을 쓴다.
 *
 * @example toEditableRecord(row, signedThumbs)
 */
export const toEditableRecord = (row: DetailRow, signedThumbs: SignedUrl[]): EditableRecord => {
  const urlByPath = toUrlByPath(signedThumbs);
  const photos = sortPhotos(row.photos);
  return {
    id: row.id,
    revision: row.revision,
    date: row.date,
    endDate: row.end_date ?? undefined,
    title: row.title,
    memo: row.memo ?? "",
    coverPhotoId: row.cover_photo_id ?? photos[0]?.id,
    tags: row.tags,
    groups: toEditableGroups({ photos, urlByPath, captionByGroupId: toCaptionByGroupId(row.groups) }),
  };
};
