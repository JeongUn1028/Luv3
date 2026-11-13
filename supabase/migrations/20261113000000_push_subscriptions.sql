-- 웹 푸시 알림 구독(#363). 기기(브라우저)마다 알림을 받을 주소(endpoint)와 암호화 키 두 개를 남긴다.
-- 각자 자기 기기의 구독만 읽고 지운다. 상대에게 보낼 때 상대 구독을 읽는 방법은 #364에서 정한다.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- 회원을 지우면 그 사람의 기기 구독도 쓸모가 없어 함께 지운다
  member_id uuid not null default auth.uid() references public.members (id) on delete cascade,
  -- 한 기기는 한 사람에게만 알림을 보낸다(아래 save_push_subscription이 주인을 바꾼다)
  endpoint text not null unique check (char_length(endpoint) between 9 and 2048 and endpoint like 'https://%'),
  -- 브라우저가 준 공개 키와 인증 비밀 값(base64url). 알림 내용을 이 기기만 풀 수 있게 암호화하는 데 쓴다
  p256dh text not null check (char_length(p256dh) between 1 and 200),
  auth text not null check (char_length(auth) between 1 and 100),
  created_at timestamptz not null default now()
);

-- 회원 한 사람의 기기들을 찾는다(시험 알림, #364 상대에게 보내기)
create index push_subscriptions_member_id_idx on public.push_subscriptions (member_id);

alter table public.push_subscriptions enable row level security;

-- 비로그인은 권한 단계에서 막고, 회원도 넣기·고치기는 아래 함수로만 한다(같은 기기를 다른 사람이 쓰던 경우 주인을 바꿔야 해서)
revoke all on table public.push_subscriptions from anon, authenticated;
grant select, delete on table public.push_subscriptions to authenticated;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated
  using ((select public.is_member()) and member_id = (select auth.uid()));

create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated
  using ((select public.is_member()) and member_id = (select auth.uid()));

-- 이 기기의 구독을 로그인한 사람 것으로 저장한다. 같은 기기를 다른 사람이 쓰다 바꿔 로그인했으면 주인을 바꾼다.
-- 브라우저는 같은 기기에서 같은 endpoint를 돌려주므로, 다시 켜거나 설정 화면을 열 때마다 불러도 한 행만 남는다
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 알림을 켤 수 있습니다' using errcode = '42501';
  end if;

  insert into public.push_subscriptions (member_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set
    member_id = excluded.member_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    created_at = now();
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
