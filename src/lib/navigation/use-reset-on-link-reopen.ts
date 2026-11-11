import { useEffectEvent, useLayoutEffect, useRef } from "react";
import { getLastRouterNavigation, isReopenedByLink } from "./router-navigation";

/**
 * 숨겨 둔 화면(Activity)이 링크로 다시 열리면 `reset`을 부른다. 같은 주소로 다시 열어도 앱은 숨겨 둔 화면을 그대로 보여 주므로,
 * 주소가 가리키는 처음 상태로 돌려야 할 때 쓴다. 되돌아가기(뒤로 가기)로 돌아온 화면은 보던 그대로 둔다.
 * Next는 이동을 시작할 때 적고(`markRouterNavigation`) 화면은 그 뒤에 보이므로, 보일 때 마지막 이동을 읽으면 된다.
 *
 * @example useResetOnLinkReopen(() => emblaApi?.scrollTo(startIndex, true));
 */
export const useResetOnLinkReopen = (reset: () => void): void => {
  const onReopen = useEffectEvent(reset);
  const seenIdRef = useRef<number | undefined>(undefined);
  // layout effect는 숨겨질 때 정리되고 다시 보일 때 다시 돈다
  useLayoutEffect(() => {
    const navigation = getLastRouterNavigation();
    if (isReopenedByLink(seenIdRef.current, navigation)) onReopen();
    seenIdRef.current = navigation.id;
  }, []);
};
