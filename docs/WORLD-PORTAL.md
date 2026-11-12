# World Portal 2.0

The existing portal NPC opens a separate, responsive dark-fantasy destination browser. It shows the current region and World Tier, the unlocked destination count and the highest unlocked Tier. Select a card, then use the single Travel button in the footer. The current location is marked and cannot be selected for travel. Founding Lands have a distinct treatment, remain searchable by Tiers 1–7, and have a dedicated shortcut.

Search accepts a Tier number, region name, biome ID or English/Hungarian biome name. Text search is case- and accent-insensitive and matches all entered terms. Numeric searches are exact Tier lookups. The Find tier control performs the same direct lookup without paging through earlier regions. Typing is debounced by 350 ms; response IDs prevent older replies overwriting a newer search. Page, search and collection changes clear the selected destination until fresh server data arrives.

The client requests 12 destination cards per page. It never receives or renders the entire world list. Cards show Tier, region, biome, recommended levels, World Boss status, current population, a favorite toggle and the current-location marker. The scrollable results area preserves the footer controls; compact/coarse-pointer styling provides single-column cards and larger touch targets. Existing desktop dragging/window positioning and compact-window bounds remain in effect. English fallback strings and Hungarian translations use the existing localization infrastructure.

## Favorites and recent destinations

Preferences live only in `localStorage`, scoped by origin, character name and the existing public universe identity. They store numeric map IDs, not copied region descriptors. Favorites are capped at 256; recent destinations at 20. Recents are deduplicated and ordered newest first. Initial/current locations and server-confirmed travels count as visits; clicking a card or sending an unconfirmed travel does not.

Collection requests send the bounded preference IDs to the server. It intersects them with indexed, currently unlocked runtime destinations before returning cards. Locked, stale and nonexistent preference IDs never produce a travel action. Preferences are not travel authorization and do not modify character or universe saves.

## Destination protocol

The existing `portal` WebSocket message now supports a one-based paginated listing:

```json
{"t":"portal","op":"list","requestId":42,"page":1,"limit":12,"query":"glacier","scope":"all"}
```

Optional `tier` requests a direct World Tier lookup. Optional `scope` is `all`, `favorites` or `recent`. The latter two supply `indices`, a bounded list of preferred map IDs. Recent results retain the input order; favorite/all results list the highest World Tier first, including filtered searches and across page boundaries. The Founding Lands appear last in those lists and remain available through their dedicated shortcut. `tier` and numeric queries look up the shared Founding Lands destination for values 1–7.

The response retains `t`, `here`, `tier` and `maps`, with additional navigation metadata:

```json
{
  "t":"portal","op":"list","requestId":42,
  "page":1,"limit":12,"pages":3,"total":29,"unlockedTotal":401,
  "here":147,"tier":407,
  "current":{"index":147,"tier":154,"name":"…","biome":"glacier","levels":[100,135],"boss":"…","defeated":true,"players":1},
  "maps":[],
  "limits":{"pageSize":25,"maxPageSize":25,"queryLength":80,"favorites":256,"recent":20}
}
```

`maps` contains only the requested page, with the existing destination fields. `total` counts filtered results; `unlockedTotal` counts all reachable unlocked destinations. A page beyond the last match clamps to the last page. Empty results still report page 1 of 1. Current population and boss progression status are evaluated at response time.

Page, limit, Tier, request ID and preference IDs must be safe integers. Page starts at 1; limit is 1–25; query is at most 80 characters with no control characters. Preference IDs are valid runtime map IDs (0–65535), with at most 256 favorites or 20 recents. Invalid requests return a bounded `portal` response with `op: "list"`, `error: "invalidRequest"` and an empty `maps` array. The client shows localized feedback and does not enable stale travel controls. Request IDs are echoed when valid.

## Travel and compatibility

The existing command remains valid:

```json
{"t":"travel","map":147}
```

The new UI adds a `requestId`. The server then replies with `{"t":"portal","op":"travel","requestId":43,"ok":true,"map":147}` on successful travel, or `ok:false` without a destination on failure. Legacy travel commands without an ID do not receive this extra acknowledgment. Portal proximity, death restrictions, destination placement and movement reset behavior remain unchanged. The destination must also exist in the server's runtime metadata index, remain unlocked, and have its saved region descriptor. The server rejects locked/nonexistent/invalid destinations regardless of preference state.

Legacy `{"t":"portal"}` requests receive the first bounded page (default 25) with the familiar `here`, `tier` and `maps` fields. They no longer receive an unbounded full-world list. Update client and server together and reload cached clients to access pagination and the full navigation UI. The new UI requires echoed request IDs; it deliberately does not reinterpret an unsolicited old-server full-list response as its current page.

## Implementation and scaling

`src/world/portal-directory.js` builds compact metadata and normalized search strings from existing maps and saved region descriptors. Tier/map lookups use Maps, and newly opened regions register after normal initialization. Listing never calls `regionFor`, generates a region, materializes a plan or opens another map. The unlocked metadata list/count is cached until registration or World Tier changes. Ordinary pagination slices this cached list. Text search scans only cached lightweight strings; direct Tier lookup uses the Tier index; preference filtering examines only the bounded supplied IDs. Only current/page descriptors are serialized. Population counting still examines online players. These are algorithmic bounds, not benchmark claims.

The existing runtime capacity (65535 generated maps plus the Founding Lands) is unchanged. The metadata index is designed to browse 10,000+ unlocked Tiers without thousands of DOM nodes or full-list WebSocket payloads. All server configuration and save formats remain unchanged.

## Files

- `src/world/portal-directory.js`: indexed metadata, bounded request parsing, filtering and paginated responses.
- `src/world/regions.js`: directory registration/listing and authoritative travel eligibility.
- `src/player/player-session.js`: forwards list parameters and optionally acknowledges travel.
- `public/portal-ui.js`, `public/portal-ui.css`: extracted UI, selection, preferences, request lifecycle and responsive presentation.
- `public/ui.js`, `public/game.js`, `public/index.html`: window/network/world hooks and asset loading; old portal rendering removed.
- `public/locales/hu.js`, `README.md`, this document: translations and usage/protocol documentation.

No tests were added or modified. No tests, builds, lint, syntax/verification commands or browser visual checks were run for this change, as requested.
