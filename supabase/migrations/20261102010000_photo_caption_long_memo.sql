-- 데이트 하나에 사진마다 짧은 한마디를 달고, 맨 아래에 그날 전체를 정리하는 긴 글을 쓸 수 있게 한다.

-- 사진을 넘길 때 함께 보이는 짧은 한마디. 비워 둘 수 있다.
alter table public.photos
  add column caption text check (char_length(caption) <= 100);

-- 메모가 짧은 한 줄에서 하루 전체를 정리하는 자유 글로 바뀌어 2,000자에서 10,000자로 늘린다
alter table public.dates
  drop constraint dates_memo_check,
  add constraint dates_memo_check check (char_length(memo) <= 10000);
