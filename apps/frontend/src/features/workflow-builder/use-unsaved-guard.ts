/**
 * G-027 — don't lose the editing session.
 *
 * Reloading the editor, closing the tab, or clicking a link out of it used to
 * discard every unsaved edit with no prompt at all. Two halves, because the
 * browser only knows about one of them:
 *
 *   - `beforeunload` covers reload / close / typing a new URL. It is the first
 *     `beforeunload` in the frontend.
 *   - React Router's `useBlocker` covers in-app navigation, which never fires
 *     the browser event because no document unload happens. `useBlocker` is
 *     stable in react-router 7 (the installed version) and requires a data
 *     router, which `App.tsx` provides via `createBrowserRouter`.
 *
 * This hook owns no notion of "dirty" — the editor already has exactly one
 * (a reference compare against the last-hydrated config, §4.4) and it is
 * passed in. Adding a second would guarantee the two drift apart.
 */
import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

export const UNSAVED_CHANGES_MESSAGE =
  "This workflow has unsaved changes. Leave and discard them?";

export interface UnsavedGuardOptions {
  /**
   * Reactive dirty flag. Drives whether the `beforeunload` listener is bound
   * at all, so a clean editor adds no unload cost and never blocks bfcache.
   */
  isDirty: boolean;
  /**
   * Authoritative re-check, evaluated at event time. The editor's dirty signal
   * is a compare between two refs, and a programmatic re-baseline (the
   * navigate that follows a successful create-save) updates those refs in the
   * same tick as the navigation — before React re-renders and before `isDirty`
   * can catch up. Consulting a getter here means a just-saved workflow is
   * never accused of having unsaved changes. Defaults to `isDirty`.
   */
  isDirtyNow?: () => boolean;
  /** Confirmation copy for the in-app navigation prompt. */
  message?: string;
}

export function useUnsavedGuard({
  isDirty,
  isDirtyNow,
  message = UNSAVED_CHANGES_MESSAGE,
}: UnsavedGuardOptions): void {
  // Kept in a ref so the blocker predicate registered with the router stays
  // referentially stable while still reading the latest value at event time.
  const isDirtyNowRef = useRef<() => boolean>(() => isDirty);
  isDirtyNowRef.current = isDirtyNow ?? (() => isDirty);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyNowRef.current()) return;
      // `preventDefault` is the modern signal; `returnValue` is still required
      // by some browsers. Neither controls the copy — browsers show their own.
      event.preventDefault();
      event.returnValue = message;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, message]);

  const blocker = useBlocker(
    useCallback(
      ({
        currentLocation,
        nextLocation,
      }: {
        currentLocation: { pathname: string };
        nextLocation: { pathname: string };
      }) =>
        isDirtyNowRef.current() &&
        currentLocation.pathname !== nextLocation.pathname,
      [],
    ),
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    // A Mantine modal cannot answer a `beforeunload` — keeping both halves of
    // the guard on the same primitive keeps the two prompts consistent, and
    // matches the editor's existing native-confirm idiom for destructive
    // choices.
    // biome-ignore lint/suspicious/noAlert: native confirm is the only prompt that can pair with beforeunload.
    if (window.confirm(message)) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, message]);
}
