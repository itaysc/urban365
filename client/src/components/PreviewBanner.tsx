/**
 * Shown on every page while the site is still being stood up.
 *
 * Sticky, and exactly `2rem` tall: the site header sticks at `top-8` so the two stay
 * stacked instead of the header covering this once the page scrolls.
 */
export function PreviewBanner() {
  return (
    <div className="sticky top-0 z-40 flex h-8 items-center justify-center bg-yellow-300 px-4 text-sm font-medium text-yellow-950">
      אתר בהרצה
    </div>
  );
}
