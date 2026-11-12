-- 휴지통 화면(#311 PR2): 두 사람이 설정 > 휴지통에서 지운 사진을 보고 휴대폰에 저장할 수 있게 휴지통 읽기만 연다.
-- 넣기·고치기·지우기는 여전히 트리거와 정리 작업(비밀 키)만 한다. 지운 시각을 회원이 바꾸면 일찍 지워질 수 있기 때문이다.
-- 사진 파일은 이미 회원이 album 버킷 전체를 읽을 수 있어(album_select_members) 서명 주소를 만들 수 있다
grant select on table public.photo_trash to authenticated;

create policy "photo_trash_select_members" on public.photo_trash
  for select to authenticated
  using ((select public.is_member()));
