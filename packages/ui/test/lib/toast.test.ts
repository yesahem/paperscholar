import { describe, expect, test } from "bun:test";
import { MAX_TOASTS, toastReducer, type ToastMessage } from "../../src/lib/toast";

const toast = (id: number, title = `t${id}`): ToastMessage => ({
  id,
  title,
  variant: "info",
});

describe("toastReducer", () => {
  test("keeps the newest few and drops dismissed ones", () => {
    let state: ToastMessage[] = [];
    for (let id = 1; id <= MAX_TOASTS + 2; id += 1)
      state = toastReducer(state, { type: "add", toast: toast(id) });
    expect(state.map((entry) => entry.id)).toEqual([3, 4, 5]);
    expect(
      toastReducer(state, { type: "dismiss", id: 4 }).map((entry) => entry.id),
    ).toEqual([3, 5]);
  });

  test("the same message twice shows once, as the newest", () => {
    let state = toastReducer([], { type: "add", toast: toast(1, "Too many runs") });
    state = toastReducer(state, { type: "add", toast: toast(2, "Other") });
    state = toastReducer(state, { type: "add", toast: toast(3, "Too many runs") });
    expect(state.map((entry) => entry.id)).toEqual([2, 3]);
  });
});
