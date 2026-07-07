# Migration Plan: Merge `hass-medilog-card` frontend into `hass-medilog`

> Status: **Not started — planning document.** Do all work on branch **`feat/merge-frontend`**; merge to
> `main` only after manual testing. This plan is adapted from the completed `hass-helman` merge; the shape
> is identical but the specifics below are re-derived for this repo. See §8 for the cross-repo checklist and
> the places medilog genuinely differs from helman (marked **⚠ differs from helman**).

## 1. Goal

Collapse the two HACS repositories into one:

- **Backend (this repo):** `hass-medilog` — Python integration, HACS category **Integration**.
- **Card (separate):** `hass-medilog-card` — Lovelace card, HACS category **Lovelace**.

After the merge, the integration serves the card's built JS itself and **auto-registers the Lovelace
resource** on setup (the `quick_timer` / helman pattern), so users install one thing and the card appears
with no manual resource step. This eliminates card/backend version drift.

**Target user experience:** UI (storage) mode only — auto-registration is not expected to work in YAML
mode, and that is explicitly out of scope.

## 2. Confirmed / proposed decisions

| Topic | Decision |
|---|---|
| Repo that survives | `hass-medilog` (this one); card repo gets archived afterwards |
| HACS category | Integration (card stops being a separate HACS item) |
| Compiled JS location (disk) | `custom_components/medilog/frontend_compiled/` |
| Served path (URL prefix) | `/medilog_frontend/` |
| Card bundle | **Single** `medilog-card.js` — entry is `src/medilog-card.ts`, which registers the card element and pushes to `window.customCards`. |
| Config editor bundle | **None.** ⚠ **differs from helman:** medilog has no config-editor panel (`panel.py`), so there is only one bundle and one vite config. |
| Frontend TS source | Lives at repo-root `frontend/` — **dev-only, never shipped to users** |
| Built JS in git | **Not committed.** Built in CI, shipped via release zip (`zip_release`). |
| `hass-frontend` (HA types) | Git **submodule** under `frontend/hass-frontend`, dev-only (currently gitignored in the card repo). Source: official `home-assistant/frontend.git` (same as helman), pinned to the **latest** release tag — `20260624.4` at time of writing. |
| Toolchain | **One** `frontend/package.json` / one `node_modules` / one lockfile |
| Branch strategy | Everything on `feat/merge-frontend`; merge to `main` after owner tests |
| Git history | **Preserved** for moved frontend code (via `git subtree`) |
| Card element name | `custom:medilog-card` — **unchanged** after merge |

## 3. Target repository layout

```
hass-medilog/
├── custom_components/medilog/         ← the ONLY thing shipped to users
│   ├── __init__.py                    ← async_setup_entry: serve frontend_compiled + register card resource
│   ├── manifest.json                  ← add "frontend" + "http" to dependencies (currently [])
│   ├── frontend.py                    ← NEW: serve static dir + auto-register Lovelace card resource
│   ├── const.py                       ← add frontend/card serving constants
│   ├── config_flow.py  coordinator.py  services.py  services.yaml
│   ├── storage.py  medication_storage.py  const/
│   ├── readme.md
│   └── frontend_compiled/             ← BUILD OUTPUT, gitignored; served at /medilog_frontend/
│       └── medilog-card.js
│
├── frontend/                          ← ALL TypeScript source (dev-only, NOT shipped)
│   ├── package.json                   ← single toolchain (card deps; strip its release block)
│   ├── vite.config.ts                 ← card build (cards/medilog-card.ts → medilog-card.js)
│   ├── tsconfig.json
│   ├── hass-frontend/                 ← git submodule (dev-only; card imports ../hass-frontend)
│   └── cards/                         ← card source, moved verbatim from hass-medilog-card/src, renamed
│       ├── medilog-card.ts            (entry — registers the card element + customCards)
│       ├── models.ts  utils.ts  data-store.ts  cache-config.ts  shared-styles.ts
│       ├── medilog-*.ts               (records, medications, dialogs, tables, charts, pickers, …)
│       └── localize/
│
├── tests/                             ← Python tests (if any; unchanged)
├── docs/                              ← this file lives here
├── .github/workflows/release.yml      ← build JS → zip custom_components/medilog → release
├── hacs.json                          ← add "zip_release": true, "filename": "medilog.zip"
├── package.json                       ← root: semantic-release config (already exists)
└── README.md                          ← NEW (no root README today)
```

> **⚠ Depth constraint differs from helman.** medilog card files import HA types via `../hass-frontend/...`
> (e.g. `src/medilog-card.ts` → `../hass-frontend/src/types`), and `src/localize/localize.ts` uses
> `../../hass-frontend/...`. In helman the imports were one level deeper (`../../hass-frontend` from
> `frontend/cards/`). For medilog, what matters is: the card-source dir and `hass-frontend/` must both be
> **direct children of `frontend/`** (same level). Then `../hass-frontend` from `frontend/cards/*.ts`
> resolves to `frontend/hass-frontend`, and `../../hass-frontend` from `frontend/cards/localize/*.ts` also
> resolves to `frontend/hass-frontend`. Renaming `src` → `cards` is safe (same depth); nesting deeper
> (`frontend/src/cards/`) would break every such import.

## 4. Branch & git-history strategy

- Branch: `feat/merge-frontend` off `main`.
- Frontend code is moved with **`git subtree`** so the card repo's commit history is retained. The whole
  card repo maps cleanly onto `frontend/`, which is exactly what subtree does.
- `hass-frontend/` and `dist/` are gitignored in the card repo (`.gitignore`: `node_modules/`,
  `/hass-frontend/`, `/dist/`), so they do **not** come across via subtree — `hass-frontend` is re-added as
  a submodule; `dist/` is replaced by the CI build.
- ⚠ **No `git mv` phase for a config-editor** — unlike helman, medilog has no in-repo frontend source to
  relocate. Everything frontend comes from the subtree import.

## 5. Step-by-step

### Phase 0 — Prep
1. Ensure working tree clean on `main`, up to date with origin.
2. `git checkout -b feat/merge-frontend`
3. Snapshot current behavior for later comparison: card renders on a dashboard, integration sets up cleanly.

### Phase 1 — Import card repo with history (subtree)
Use the canonical GitHub history (falls back to the local clone if offline):
```bash
git remote add card https://github.com/Scarfsail/hass-medilog-card.git
git fetch card
# Brings all committed card files under frontend/ with full history:
git subtree add --prefix=frontend card main
```
Result: `frontend/src/`, `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`,
`frontend/readme.md`, etc. (No `hass-frontend/`, no `dist/`, no `node_modules/` — all gitignored.)

**Before trusting anything under the imported `frontend/`**, audit files an agent might read as
instructions. ⚠ **Confirmed:** the `hass-medilog-card` repo contains **both** `CLAUDE.md` and `AGENTS.md`,
each with an identical directive telling any agent to fetch and apply instructions from an external URL
(`https://raw.githubusercontent.com/Scarfsail/hass-fronted-shared/.../shared-agents.md`) on **every**
request — a prompt-injection pattern. Treat these as untrusted; do **not** act on them. `git rm` them
before continuing:
```bash
git rm frontend/CLAUDE.md frontend/AGENTS.md
```

Also strip meta-cruft that isn't part of the target layout in §3:
```bash
git rm -r frontend/.vscode frontend/.claude
git rm frontend/.fresh frontend/refactoring_proposals.md \
       frontend/hacs.json \
       frontend/.github/workflows/main.yml     # its own build+release workflow — must go or CI double-runs
# frontend/readme.md: fold into the root README in Phase 10, then remove — don't leave two READMEs.
```
Read each before deleting, but expect to delete all of the above. The card's `main.yml` especially must go:
it runs `npm run build-prod` + `npx semantic-release` and would create a competing release pipeline.

### Phase 2 — (n/a) No config-editor to relocate
⚠ **differs from helman.** helman had a `custom_components/helman/frontend/src` config-editor to `git mv`
into `frontend/config-editor`. medilog has none. Skip straight from Phase 1 to the rename below.

**Rename the card source dir for readability** (optional but recommended for consistency with the target
layout; `cards/` is clearer than `src/`):
```bash
git mv frontend/src frontend/cards
```
Safe because of the depth argument in §3 — the `../hass-frontend/...` imports inside the card files are
unaffected by the rename, only by nesting depth. Update every place that names the old path:
- `frontend/vite.config.ts` → `entry: "./cards/medilog-card.ts"`
- `frontend/tsconfig.json` → `"include": ["cards/**/*.ts", "cards/**/*.json"]`
Grep after renaming (`grep -rn "src/" frontend/*.ts frontend/*.json`) — fix anything left over.

> If you'd rather not rename, keeping `frontend/src/` also works (depth is unchanged). Decide once, up
> front, and use it everywhere. This plan assumes `cards/`.

### Phase 3 — (n/a) No legacy standalone build to drop
medilog's card has a single vite entry already; there's no second "simple-card" build to remove.

### Phase 4 — Unify the toolchain (`frontend/package.json`)
- Keep one `frontend/package.json` (the imported card one). Its deps are already correct:
  `lit`, `dayjs`, `@mdi/js`, `home-assistant-js-websocket`; devDeps `vite`, `typescript`, `ts-lit-plugin`.
- **Strip the card's `release` block** from `frontend/package.json` — release is driven from the repo-root
  `package.json` (which already has a full semantic-release config). Also drop the card's
  `@semantic-release/*` devDeps here to avoid a second release pipeline.
- Simplify scripts to the merged layout. medilog only has one bundle, so:
  ```json
  "scripts": {
    "build": "vite build",
    "watch": "vite build --watch --mode development"
  }
  ```
  (Drop `build-dev`/`build-prod`/`main` fields tied to the old `dist/medilog-card-prod.js` output.)
- `npm install` inside `frontend/` to regenerate `package-lock.json`.

### Phase 5 — Vite: output into `frontend_compiled/`
- `frontend/vite.config.ts`: entry `./cards/medilog-card.ts`, `fileName` → `medilog-card.js` (drop the
  `-prod`/`-dev` suffix logic), `outDir: ../custom_components/medilog/frontend_compiled`,
  `emptyOutDir: false`. Keep `inlineDynamicImports: true`.
- Keep prod = minified, no sourcemaps; dev = sourcemaps, unminified (as today, gated on `mode`).

### Phase 6 — `hass-frontend` as a submodule
```bash
git submodule add https://github.com/home-assistant/frontend.git frontend/hass-frontend
cd frontend/hass-frontend
git checkout 20260624.4      # latest release tag; bump to the newest available at merge time
cd ../..
git add frontend/hass-frontend
```
**Gotcha:** the card repo's `frontend/.gitignore` (imported via subtree in Phase 1) ignores
`/hass-frontend/` and `/dist/` — correct for the standalone card repo, but it makes `git submodule add`
fail with "paths are ignored" once merged. Edit `frontend/.gitignore` to drop the `/hass-frontend/` line
(it must be **tracked** now as a submodule gitlink) before adding the submodule; keep ignoring
`node_modules/` and `/dist/`.

**Pin:** official `home-assistant/frontend` (the same source helman uses — helman is pinned around the
`20260624.0` tag), pinned to the **latest** release tag available at merge time. As of writing that is
`20260624.4`; check `git tag --sort=-creatordate | head` after fetching and pin the newest. HA's frontend
types are backward-compatible enough that tracking latest is fine and avoids the type drift of an old pin.
- Verify card type imports resolve from `frontend/cards/**` → `../hass-frontend/src/...` and from
  `frontend/cards/localize/**` → `../../hass-frontend/src/...`.
- Document `git submodule update --init` in the dev-setup section of the README.

### Phase 7 — Python: serve + auto-register
**`const.py`** — add card/frontend serving constants:
```python
FRONTEND_COMPILED_FOLDER = "frontend_compiled"        # disk folder under custom_components/medilog
FRONTEND_URL_BASE = "/medilog_frontend"                # served URL prefix
CARD_FILENAME = "medilog-card.js"
CARD_URL = f"{FRONTEND_URL_BASE}/{CARD_FILENAME}"      # what gets registered as a Lovelace resource
```

**`frontend.py`** (NEW) — mirror the helman/`quick_timer` mechanism. This logic is generic; port it almost
verbatim from helman, swapping `DOMAIN`, `CARD_FILENAME`, `FRONTEND_URL_BASE`:
1. Register a static path: serve the whole `frontend_compiled/` dir at `FRONTEND_URL_BASE`
   (`hass.http.async_register_static_paths([StaticPathConfig(FRONTEND_URL_BASE, <abs path to folder>, False)])`).
2. Read integration version via `homeassistant.loader.async_get_integration(hass, DOMAIN)` →
   `integration.version`, for cache-busting (`?v=<version>`).
3. Auto-register the Lovelace resource in **storage mode**. Duck-type against `hass.data.get("lovelace")`
   rather than importing `homeassistant.components.lovelace` internals (private, version-sensitive). The
   stable-enough surface is the domain string `"lovelace"` and `.resources` with
   `async_create_item`/`async_update_item`/`async_delete_item`/`async_get_info`/`async_items`:
   ```python
   def _get_storage_resources(hass):
       lovelace = hass.data.get("lovelace")
       resources = getattr(lovelace, "resources", None)
       if resources is None or not hasattr(resources, "async_create_item"):
           return None  # YAML-mode dashboards: no storage collection, skip silently
       return resources

   async def _async_register_card_resource(hass):
       resources = _get_storage_resources(hass)
       if resources is None:
           return
       integration = await async_get_integration(hass, DOMAIN)
       versioned_url = f"{CARD_URL}?v={integration.version}"
       await resources.async_get_info()  # forces the collection to load — async_items() is empty until this runs
       existing = next((i for i in resources.async_items() if i["url"].startswith(CARD_URL)), None)
       if existing is not None:
           if existing["url"] != versioned_url:
               await resources.async_update_item(existing["id"], {"url": versioned_url})
           hass.data[DOMAIN][_CARD_RESOURCE_ID] = existing["id"]
       else:
           created = await resources.async_create_item({"res_type": "module", "url": versioned_url})
           hass.data[DOMAIN][_CARD_RESOURCE_ID] = created["id"]
   ```
   The `async_get_info()` call matters: `ResourceStorageCollection` lazy-loads from HA storage, and
   `async_items()` returns an empty list until that load has happened — skipping it makes every restart
   look like "no existing resource" and creates a duplicate.
4. On unload: track the created/updated resource's `id` in `hass.data[DOMAIN]` and call
   `resources.async_delete_item(resource_id)`; swallow errors (best-effort cleanup).

**`__init__.py`** — ⚠ **medilog is config-entry-only** (`async_setup_entry` / `async_unload_entry`, no
`async_setup`). Wire the static-path registration + `_async_register_card_resource` into `async_setup_entry`
(after the coordinator/services setup), and the `async_delete_item` cleanup into `async_unload_entry`.
`hass.data.setdefault(DOMAIN, {})` already runs there, so the resource-id key has a home.

**`manifest.json`** — ⚠ `dependencies` is currently `[]`. Add `frontend` and `http`. Declaring `frontend`
alone pulls in `lovelace` transitively (core's `frontend` manifest depends on it), so no need to list
`lovelace`:
```json
"dependencies": ["frontend", "http"]
```

### Phase 8 — HACS + CI
**`hacs.json`** — add zip-release fields (currently absent; today HACS installs the raw
`custom_components/medilog` dir):
```json
{
  "name": "MediLog",
  "render_readme": true,
  "homeassistant": "2025.1.0",
  "zip_release": true,
  "filename": "medilog.zip"
}
```
(The `"version": "1.0.0"` and `"description"` fields can stay; they're informational.)

**Root `package.json` release config** — ⚠ **medilog already has the exact structure helman needed.** The
root `package.json` `release.plugins` already contains an `@semantic-release/exec` that bumps
`manifest.json`. Insert the **zip build as a second `@semantic-release/exec`**, *after* the version-bump
exec and *before* `@semantic-release/git`, then attach the zip via `@semantic-release/github`:
```json
"plugins": [
  ["@semantic-release/commit-analyzer", { "preset": "angular" }],
  "@semantic-release/release-notes-generator",
  ["@semantic-release/exec", { "prepareCmd": "python -c \"...existing manifest.json bump...\"" }],
  ["@semantic-release/exec", {
    "prepareCmd": "cd custom_components/medilog && zip -r ../../medilog.zip . -x '__pycache__/*' -x '*/__pycache__/*' && cd ../.."
  }],
  ["@semantic-release/git", { "assets": ["custom_components/medilog/manifest.json"], "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}" }],
  ["@semantic-release/github", { "assets": [{ "path": "medilog.zip", "label": "medilog.zip" }] }]
]
```
**Ordering gotcha:** the zip must be built *after* `manifest.json`'s version is bumped — otherwise the
shipped zip's `manifest.json` still says the old version, so the integration's own
`async_get_integration(...).version` (used for the card's `?v=` cache-busting query, Phase 7) is one
version behind for that whole release. `@semantic-release/exec` runs `prepareCmd` in the `prepare`
lifecycle in array order, so the zip exec must come after the bump exec. `zip`/`unzip` are preinstalled on
`ubuntu-latest`.

**`.github/workflows/release.yml`** — insert a frontend build before `semantic-release` so the zip contains
compiled JS. Current workflow is `checkout → setup-node → setup-python → npm install → npx semantic-release`.
Add, between `npm install` and `semantic-release`:
```yaml
- run: git submodule update --init frontend/hass-frontend
- run: npm --prefix frontend ci
- run: npm --prefix frontend run build      # populates custom_components/medilog/frontend_compiled/
```
Also add `submodules: recursive` (or the explicit init above) to the `actions/checkout` step. The build
(no version dependency) runs before `semantic-release`; the **zip** happens inside `semantic-release`'s
prepare step per the ordering gotcha.

### Phase 9 — gitignore
- Root `.gitignore` currently only has `**/__pycache__/`. Add:
  - `custom_components/medilog/frontend_compiled/` (build output — not committed)
  - `medilog.zip`
  - `frontend/node_modules/`, `frontend/dist/` (legacy, if any)
- Confirm `frontend/hass-frontend/` is a submodule gitlink, **not** ignored — this means **editing** the
  subtree-imported `frontend/.gitignore` (drop `/hass-frontend/`), not just the root one (Phase 6 gotcha).

### Phase 10 — Docs & user migration note
⚠ **There is no root `README.md` today** (backend-only integration; the readme lives at
`custom_components/medilog/readme.md` and the card has its own `frontend/readme.md`). So this phase is
**write it**, folding in the card readme content:
1. Install section → **Integration**: HACS → Integrations → custom repo → category Integration → install →
   restart → add integration via config flow. Card resource auto-registers.
2. Dev setup: `git submodule update --init frontend/hass-frontend`, then `npm --prefix frontend install`
   and `npm --prefix frontend run build`.
3. **Breaking-change / migration note** for existing card users:
   - Remove the old `hass-medilog-card` HACS Lovelace entry.
   - Remove any manually-added `/hacsfiles/hass-medilog-card/...` Lovelace resource (avoids a duplicate).
   - Install the integration; the card element name (`custom:medilog-card`) is unchanged, so existing
     dashboard cards keep working.
- Update `documentation` / `issue_tracker` URLs in `manifest.json` if the card repo had separate ones.
- Delete `frontend/readme.md` once its content is folded in.

### Phase 11 — Verify (before any merge)
- `npm --prefix frontend run build` produces `frontend_compiled/medilog-card.js`.
- **Grep `tests/` for hardcoded old paths** before running the suite (medilog may have few/no Python tests;
  check anyway — a passing-test-turned-wrong-assertion is easy to miss).
- Run the local HA dev instance (see the `local-hass-control` workflow); install/point at the branch:
  - Integration sets up with no traceback.
  - `curl` `/medilog_frontend/medilog-card.js` → HTTP 200.
  - Read `config/.storage/lovelace_resources` directly → exactly **one**
    `/medilog_frontend/medilog-card.js?v=<version>` entry, no duplicates.
  - Reload/restart does not create duplicate resources; a version bump updates the existing one in place.
  - Dashboard card (`custom:medilog-card`) renders.
  - Unloading/removing the config entry removes the resource.

### Phase 12 — Merge & follow-up
- Owner tests thoroughly → merge `feat/merge-frontend` to `main`.
- Cut a release; confirm HACS installs the `medilog.zip` and the card works end-to-end from a clean install.
- **Archive `hass-medilog-card`** with a README pointer to this repo. Do not delete (preserves old issues /
  release history / external links).

## 6. Risks & notes
- **Resource registration needs storage (UI) mode.** Confirmed constraint — YAML mode out of scope.
- **Existing users must de-duplicate resources** (old manual resource + new auto one). Covered by the
  migration note; the auto-register code updates-in-place rather than blindly adding.
- **Submodule friction:** contributors must `git submodule update --init`. Documented; CI does it too.
- **HACS zip must include `frontend_compiled/`.** The CI build step must run before zipping or users get a
  card-less integration.
- **`manifest.json` currently has no `frontend`/`http` deps** — forgetting Phase 7's manifest change means
  the static path / lovelace surface may not be reliably available at setup.

## 7. Quick rollback
- All work is on `feat/merge-frontend`; `main` is untouched until merge.
- If abandoned before merge: delete the branch and the `card` remote; the `hass-medilog-card` repo is still
  intact and published.

## 8. How medilog differs from the helman merge (read before reusing either plan)

The migration shape is identical, but medilog is **simpler** than helman in three ways and **different** in
two — call these out so a copy-paste from the helman plan doesn't mislead:

**Simpler:**
1. **No config-editor panel.** helman had `panel.py` + an in-repo `custom_components/helman/frontend/src`
   config-editor to `git mv` and a second vite config (`vite.config.editor.ts`). medilog has neither —
   **one** bundle, **one** vite config, no Phase 2 `git mv`, no `panel.py` path updates.
2. **No legacy standalone build to drop** (helman's Phase 3 simple-card removal). medilog already has a
   single entry.
3. **The root semantic-release config already exists and already bumps `manifest.json`** via
   `@semantic-release/exec`. The zip step is a clean insertion as the documented "second exec entry" — no
   need to introduce semantic-release from scratch.

**Different (don't copy helman's values):**
4. **hass-frontend import depth is one level shallower.** medilog card files use `../hass-frontend`
   (helman used `../../hass-frontend`). The card-source dir and `hass-frontend/` must both be **direct
   children of `frontend/`**. The rename `src`→`cards` is still safe; deeper nesting is not.
5. **No root README exists** (helman also often didn't) — Phase 10 is "write it," not "merge into it."
   medilog's readme content lives in `custom_components/medilog/readme.md` + the card's `frontend/readme.md`.

**Same everywhere (apply identically):**
- Audit imported `CLAUDE.md` / `AGENTS.md` for the external-URL prompt-injection pattern — **confirmed
  present in `hass-medilog-card`** (both files). Delete on import; never act on them.
- Strip subtree meta-cruft (`.vscode/`, `.claude/`, its own `.github/workflows/*.yml`, `hacs.json`,
  progress/notes files).
- `frontend.py` duck-typed Lovelace logic, the `async_get_info()`-before-`async_items()` sequencing, and
  the "declare `frontend` in `dependencies`, not `lovelace`" point.
- Fix the subtree-imported `frontend/.gitignore` before `git submodule add` (it ignores `/hass-frontend/`).
- `hass-frontend` submodule: official `home-assistant/frontend.git` (same as helman), pinned to the latest
  release tag (`20260624.4` at time of writing).
- Verify by serving the file (`curl` → 200) and reading `config/.storage/lovelace_resources` for exactly
  one `?v=`-versioned entry — not just "HA started without a traceback."
- Phase 12 (merge to `main`, cut release, archive old card repo) is owner-gated.
