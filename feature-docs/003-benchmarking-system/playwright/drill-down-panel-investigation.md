# Drill-Down Panel Test Investigation

## Issue
Tests in `drill-down-panel.spec.ts` are failing because React onClick handlers are not firing when Playwright clicks elements.

## What Was Fixed
1. **Seed Data Structure** - Fixed `apps/shared/prisma/seed.ts`:
   - Changed per-sample results structure from individual `metricName`/`metricValue` fields
   - To a `metrics` object containing all metrics for each sample
   - This matches what the backend service expects

## What Remains Broken
The frontend drill-down page (`ResultsDrillDownPage.tsx`) has a fundamental issue where:
- The Drawer component renders correctly
- The view buttons are found by Playwright
- Clicking the buttons completes successfully
- BUT the React onClick handler never fires
- Therefore `setSelectedSample()` is never called
- And the drawer never opens

## Evidence
1. Test output shows: "Found 1 button(s)" and "Click completed"
2. But drawer remains hidden after click
3. Even a hardcoded test button with onClick doesn't work
4. Even clicking via `page.evaluate(() => button.click())` doesn't work

## Possible Causes
1. **Vite build cache** - Frontend may be serving stale code
2. **React hydration** - React event handlers may not be attached when Playwright clicks
3. **Timing issue** - Click happening before React is ready
4. **Mantine component issue** - ActionIcon or Button components may not properly attach onClick

## Next Steps
1. Restart Vite dev server and clear cache
2. Add explicit waits for React hydration before clicking
3. Try using `page.locator().dispatchEvent('click')` instead of `.click()`
4. Check browser console for JavaScript errors
5. Verify React DevTools shows components are mounted
6. Try using a different Mantine component or native button

## Files Modified (Need Cleanup)
- `apps/frontend/src/features/benchmarking/pages/ResultsDrillDownPage.tsx` - Remove debug logs and test button
- `tests/e2e/benchmarking/drill-down-panel.spec.ts` - Remove debug test
- `tests/e2e/pages/RunDrillDownPage.ts` - Remove debug console.logs
