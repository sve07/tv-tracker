---
name: Implement TV Tracker backlog
description: "Implement every unchecked item in BACKLOG.md with tests, mark each completed item, and create one Git commit per original backlog item."
---

# Implement the TV Tracker backlog

Implement all currently unchecked items in `BACKLOG.md`. Follow the plan below, preserve the existing Angular signals/Dexie/TMDB patterns, and make **one separate Git commit per original backlog checkbox**. Mark a checkbox complete only in that item's commit.

## Working rules

- Use local `YYYY-MM-DD` comparisons through `todayLocalDateKey()` for all TMDB `air_date` rules.
- Treat an episode as released on its TMDB `air_date`; TMDB does not provide a broadcast-time precision usable by this app.
- Do not reformat or change unrelated behavior.
- Run the applicable Vitest tests before each commit and run `npm run build` before completion.
- Do not combine backlog items in a single commit, even when they share implementation infrastructure.

## Phase 1 — Data and tracking

1. Add a `DbService`-level way to ensure a series is tracked before persisting a watched episode. Pass already-loaded TMDB metadata from episode-capable screens so automatically created `TrackedSeries` entries are complete. Verify manual tracking/untracking remains unchanged.
2. Add focused Vitest coverage for automatic tracking, including the no-duplicate case.
3. Check and commit the backlog item: **If I mark an episode, the series should be tracked automatically if not tracked yet**.

## Phase 2 — Watchlist behavior and presentation

1. Derive a per-series episode snapshot from TMDB season details: released episodes only, the next unwatched released episode, and latest released date. Load/cache asynchronously using the component's existing effect pattern.
2. Make an eligible watchlist card open its next unwatched episode detail. Retain a series-detail fallback only when no episode can be opened, and pass origin context for return navigation.
3. Check and commit: **Clicking in watch list should open the episode details, not the series overview**.
4. Exclude unaired episodes from progress and next-episode derivations via `todayLocalDateKey()`.
5. Check and commit: **An episode/series should only show up in the watch list after the episode aired**.
6. Sort active cards descending by latest relevant activity: the newer of last watched timestamp and latest relevant released episode date.
7. Check and commit: **Order of the series in the list should be sorted top to bottom based on release date (recent first) or the mark as watched date (recent first).**
8. Derive a **Not started yet** group for tracked shows with zero watched episodes. Make it collapsed by default, like **Up to date**.
9. Check and commit: **Series that are tracked but do not have marked episodes need to be in a separate subdivision "Not started yet". By default this section should be hidden, like the 'up-to-date' series section.**
10. Render the next eligible episode on each applicable card as a padded `S##E##` label.
11. Check and commit: **In the series card, the episode to watch next should be displayed e.g. S02E05**.
12. Add unit tests for pure watchlist derivation, grouping, and sorting helpers where practical.

## Phase 3 — Series overview timeline

1. Extend `SeriesDetailPage` to load episode metadata necessary for a compact chronological timeline, including prior/recent/future episodes around the next episode to watch. Scroll that target into view after render.
2. Add an accessible horizontal timeline above the episode list. Each card opens episode detail and includes the watch action for released episodes. For future episodes, replace that control with a days-until-air label.
3. Add practical component/unit coverage.
4. Check and commit the complete **Series overview** backlog item.

## Phase 4 — Notifications

1. Change notification discovery to persist a candidate only after its local air date has arrived—never from a future look-ahead window. Same-day releases count as aired because only date precision is available.
2. Add a NotificationService Vitest suite covering date boundaries and deduplication.
3. Check and commit: **Only send a push notification after the episode aired, not in advance**.
4. Add an eligibility predicate: notify only for a season with at least one watched episode, or for the first episode of a new season when all non-special episodes of the immediately preceding season are watched. Skip unstarted series/seasons and safely handle TMDB API failures.
5. Add tests for active-season, completed-prior-season, and ineligible-series cases.
6. Check and commit: **Only send notifications for episodes that are released and I am currently watching. This means, or the first episode of a new season, where I completed the previous one, or any new episode of a season I am currently watching.**

## Phase 5 — Intent-preserving episode navigation

1. Store an explicit return target when entering episode detail from the watchlist or series detail.
2. When Previous/Next changes the episode, replace rather than append browser history, so Back returns once to the original watchlist or series overview.
3. Use the same target for the page's in-app Back action, with series-detail as the safe direct-link fallback.
4. Add route-navigation method coverage if feasible.
5. Check and commit the complete **Navigation** backlog item.

## Files likely involved

- `src/app/core/data/db.service.ts`
- `src/app/core/models/domain.model.ts`
- `src/app/core/models/tmdb.model.ts`
- `src/app/core/services/notification.service.ts`
- `src/app/features/watchlist/watchlist-page.ts`
- `src/app/features/watchlist/watchlist-page.html`
- `src/app/features/series-detail/series-detail-page.ts`
- `src/app/features/series-detail/series-detail-page.html`
- `src/app/features/episode-detail/episode-detail-page.ts`
- `src/app/features/episode-detail/episode-detail-page.html`
- `BACKLOG.md`

## Final verification

1. Run `npm test` and `npm run build`.
2. Inspect diagnostics for every edited source file.
3. Confirm all original backlog entries are checked.
4. Confirm the Git log has one commit for each original backlog item, with the matching `BACKLOG.md` checkbox update in that commit.
