import { describe, expect, test } from "bun:test";
import { dialogCloseAction } from "../../src/lib/dialog-close";

describe("dialogCloseAction", () => {
  test("a close the owner asked for restores focus without notifying again", () => {
    expect(dialogCloseAction(false, false)).toEqual({
      restoreFocus: true,
      notify: false,
    });
  });

  test("a close the browser made on its own is reported to the owner", () => {
    expect(dialogCloseAction(false, true)).toEqual({ restoreFocus: true, notify: true });
  });

  test("a late close event after reopening is ignored", () => {
    expect(dialogCloseAction(true, true)).toEqual({ restoreFocus: false, notify: false });
  });
});
