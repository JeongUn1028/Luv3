import { describe, expect, it } from "vitest";
import { createScrollRestorer, forgetScrollPosition, type Scroller } from "./scroll-memory";

/** 내용 높이를 바꿔 가며 쓸 수 있는 가짜 스크롤 영역. 브라우저처럼 위치를 내용 높이 안으로 제한한다 */
const createScroller = (scrollHeight: number): Scroller & { setScrollHeight: (height: number) => void } => {
  let top = 0;
  let height = scrollHeight;
  return {
    clientHeight: 600,
    get scrollHeight() {
      return height;
    },
    get scrollTop() {
      return top;
    },
    set scrollTop(value) {
      top = Math.min(value, Math.max(height - 600, 0));
    },
    setScrollHeight: (next) => {
      height = next;
    },
  };
};

describe("createScrollRestorer", () => {
  it("저장한 위치가 있으면 만들 때 그 위치로 되돌린다", () => {
    const scroller = createScroller(2000);

    createScrollRestorer(scroller, "records", new Map([["records", 300]]));

    expect(scroller.scrollTop).toBe(300);
  });

  it("저장한 위치가 없으면 위치를 건드리지 않는다", () => {
    const scroller = createScroller(2000);

    createScrollRestorer(scroller, "records", new Map());

    expect(scroller.scrollTop).toBe(0);
  });

  it("사용자가 스크롤하면 그 위치를 화면 이름별로 저장한다", () => {
    const memory = new Map<string, number>();
    const scroller = createScroller(2000);
    const restorer = createScrollRestorer(scroller, "records", memory);

    scroller.scrollTop = 450;
    restorer.handleScroll();

    expect(memory.get("records")).toBe(450);
    expect(memory.has("todos")).toBe(false);
  });

  it("내용이 아직 짧으면 내용이 늘어난 뒤 저장한 위치까지 되돌린다", () => {
    const scroller = createScroller(600);
    const restorer = createScrollRestorer(scroller, "records", new Map([["records", 300]]));
    expect(scroller.scrollTop).toBe(0);

    scroller.setScrollHeight(2000);
    restorer.retry();

    expect(scroller.scrollTop).toBe(300);
  });

  it("되돌리기를 기다리는 동안 생긴 스크롤은 저장한 위치를 덮어쓰지 않는다", () => {
    const memory = new Map([["records", 300]]);
    const scroller = createScroller(700);
    const restorer = createScrollRestorer(scroller, "records", memory);

    expect(scroller.scrollTop).toBe(100);
    restorer.handleScroll();

    expect(memory.get("records")).toBe(300);
  });

  it("사용자가 먼저 만지면 내용이 늘어나도 위치를 옮기지 않고 그 뒤 위치를 저장한다", () => {
    const memory = new Map([["records", 300]]);
    const scroller = createScroller(600);
    const restorer = createScrollRestorer(scroller, "records", memory);

    restorer.cancel();
    scroller.setScrollHeight(2000);
    restorer.retry();
    expect(scroller.scrollTop).toBe(0);

    scroller.scrollTop = 50;
    restorer.handleScroll();
    expect(memory.get("records")).toBe(50);
  });

  it("한번 되돌린 뒤에는 내용이 바뀌어도 사용자가 옮긴 위치를 다시 되돌리지 않는다", () => {
    const scroller = createScroller(2000);
    const restorer = createScrollRestorer(scroller, "records", new Map([["records", 300]]));

    scroller.scrollTop = 900;
    restorer.handleScroll();
    restorer.retry();

    expect(scroller.scrollTop).toBe(900);
  });
});

describe("되돌릴 수 없는 위치", () => {
  it("목록이 짧아져 닿을 수 없을 때 사용자가 움직이면 그 위치를 저장하고 다시 되돌리지 않는다", () => {
    const memory = new Map([["records", 1000]]);
    const scroller = createScroller(1000);
    const restorer = createScrollRestorer(scroller, "records", memory);
    expect(scroller.scrollTop).toBe(400);

    scroller.scrollTop = 100;
    restorer.handleScroll();
    restorer.retry();

    expect(memory.get("records")).toBe(100);
    expect(scroller.scrollTop).toBe(100);
  });

  it("소수점 위치도 1px 안쪽이면 되돌리기를 끝낸다", () => {
    const memory = new Map([["records", 200.5]]);
    const scroller = createScroller(800);
    const restorer = createScrollRestorer(scroller, "records", memory);

    scroller.scrollTop = 50;
    restorer.handleScroll();

    expect(memory.get("records")).toBe(50);
  });
});

describe("forgetScrollPosition", () => {
  it("저장한 위치를 지우면 다음에 열 때 맨 위에서 시작한다", () => {
    const memory = new Map([["records", 300]]);
    const scroller = createScroller(2000);

    forgetScrollPosition("records", memory);
    createScrollRestorer(scroller, "records", memory);

    expect(scroller.scrollTop).toBe(0);
  });
});
