import { createClient } from "@/lib/supabase/client";
import { isWritingNow, refreshOutsideForm } from "./refresh-outside-form";
import { markAllScreensLoaded, markAllScreensStale, markScreenLoaded } from "./screen-freshness";

/**
 * 사용자가 누르지 않았는데 지금 화면을 새로 받을 때 쓴다(앱 복귀, 사진 실패 — #163).
 * - 폼을 쓰는 중이면 서버에 묻지 않고 돌아갈 때로 미룬다(#164).
 * - 로그인이 풀렸으면 서버가 로그인 화면으로 보내 숨겨 둔 폼까지 잃으므로 받지 않는다(#102). 인터넷이 끊겼을 때도 여기서 그만둔다.
 * - 확인하는 사이 다른 화면으로 옮겼으면 그 화면은 방금 받은 것이라 받지 않는다.
 * - 받으면 지금 화면도 방금 받은 것으로 적는다. 적힌 적이 없는 화면(뒤로 가서 돌아온 화면 등)은 앱에 돌아올 때마다 새로 받게 된다.
 *
 * @param refresh 새로 받는 일. 기다리는 표시나 함께 바꿀 상태가 있으면 transition으로 감싸 넘긴다
 * @returns 새로 받았는지
 * @example await refreshSignedInScreen(() => startTransition(() => router.refresh()));
 */
export const refreshSignedInScreen = async (refresh: () => void): Promise<boolean> => {
  if (isWritingNow()) {
    markAllScreensStale();
    return false;
  }
  const { href } = window.location;
  const { data } = await createClient().auth.getUser();
  if (!data.user || window.location.href !== href) return false;
  return refreshOutsideForm(() => {
    // router.refresh()는 숨겨 둔 화면까지 비워 돌아갈 때 Next가 새로 받으므로, 표시가 없으면 같은 요청과 사진을 두 번 받는다
    markAllScreensLoaded();
    markScreenLoaded(href, href);
    refresh();
  });
};
