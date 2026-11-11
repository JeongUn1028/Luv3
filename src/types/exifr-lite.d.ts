// exifr의 lite 묶음(JPEG·HEIC만 읽음)은 따로 타입 파일이 없다. 함수 모양은 전체 묶음과 같다
declare module "exifr/dist/lite.esm.mjs" {
  export * from "exifr";
}
