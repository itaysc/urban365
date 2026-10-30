import { useCallback, useLayoutEffect, useRef } from 'react';
import { useBeforeUnload, useBlocker, type Blocker } from 'react-router-dom';

/**
 * Stops someone walking away from work they have not saved.
 *
 * Two different exits, so two mechanisms. Moving to another page of the app is ours to
 * intercept, and `useBlocker` holds the navigation while we ask. Closing the tab or
 * hitting reload is the browser's, and all we can do there is raise its own warning —
 * the wording is the browser's and cannot be changed, which is why the in-app case gets
 * a dialog that can actually say what will be lost.
 *
 * `shouldBlock` is called rather than read, and through a ref, because the answer
 * changes as the form is filled in and again the instant it is submitted. A boolean
 * captured when the guard was installed would be the wrong answer by the time anybody
 * tries to leave.
 */
export function useLeaveGuard(shouldBlock: () => boolean): Blocker {
  const latest = useRef(shouldBlock);
  // In a layout effect rather than during render: committed before anything the user
  // does with the painted page, which is the only moment this is read.
  useLayoutEffect(() => {
    latest.current = shouldBlock;
  });

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        latest.current() && currentLocation.pathname !== nextLocation.pathname,
      [],
    ),
  );

  useBeforeUnload(
    useCallback((event: BeforeUnloadEvent) => {
      if (!latest.current()) return;
      event.preventDefault();
      // Ignored by current browsers, which show their own wording, but still required
      // by some for the prompt to appear at all.
      event.returnValue = '';
    }, []),
  );

  return blocker;
}
