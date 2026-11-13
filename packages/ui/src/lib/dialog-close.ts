export interface DialogCloseAction {
  /** Move focus back to where it was before the dialog opened. */
  restoreFocus: boolean;
  /** Tell the owner the dialog closed (`onOpenChange(false)`). */
  notify: boolean;
}

/**
 * What to do when a `<dialog>` fires `close`. The event is dispatched after
 * the dialog has closed, as a separate task, so it can arrive after the
 * dialog was opened again. Such a late event must be ignored, or it would
 * close the dialog the user just opened.
 */
export function dialogCloseAction(
  /** Whether the element is open when the event arrives. */
  elementOpen: boolean,
  /** Whether the owner currently wants it open. */
  wantedOpen: boolean,
): DialogCloseAction {
  if (elementOpen) return { restoreFocus: false, notify: false };
  return { restoreFocus: true, notify: wantedOpen };
}
