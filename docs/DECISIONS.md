# DECISIONS.md — AVIAN

## D1 — FastAPI + pandas backend instead of DuckDB

- **Status**: Accepted
- **Context**: The prompt suggests DuckDB "if it provides meaningful
  benefits" for a dataset of ~11k records. The analytics are groupbys,
  masks, scipy tests, and sklearn models — all natural pandas/NumPy
  operations on an in-memory frame.
- **Decision**: Use pandas DataFrames held in process memory behind FastAPI;
  no DuckDB, no database server.
- **Rationale**: At 11k rows every query is sub-millisecond after the one
  parse; DuckDB would add a dependency and a second query dialect without a
  measurable win. Verified by E2E response times (PCA over 10,423 rows in
  ~1–2 s uncached, cached afterwards).
- **Alternatives considered**: DuckDB (rejected: redundant for this scale);
  SQLite (rejected: same reason, plus no vectorized stats).
- **Trade-offs**: Memory holds raw JSON (~300 MB as Python objects) plus the
  frame — acceptable on a laptop, but a much larger dataset would need the
  DuckDB path.
- **Evidence**: `backend/app/data/loader.py`, config note, README.
- **Revisit conditions**: dataset grows by orders of magnitude, or repeated
  ad-hoc SQL-style queries become a real workload.

## D2 — One shared Filters contract across all endpoints

- **Status**: Accepted
- **Context**: The prompt requires cross-module filtering, combinable
  filters, and consistent sample-size disclosure.
- **Decision**: A single pydantic `Filters` model (`backend/app/data/
  filters.py`) is the only way analyses see data; every endpoint accepts it
  (query params for GETs, JSON body for POSTs); analytics cache on its
  serialization.
- **Rationale**: One filter implementation = one place to keep the missing-
  data rules correct; the frontend store mirrors it 1:1 (`state/store.ts`,
  `lib/api.ts filtersToParams`), so exports, explorer, and every lab always
  agree.
- **Alternatives considered**: per-module filter params (rejected:
  divergence risk, prompt explicitly warns against filters that behave
  differently per module).
- **Trade-offs**: module-specific filters (e.g. morphology's log toggle)
  live outside `Filters` as endpoint params — a deliberate boundary.
- **Evidence**: `apply_filters` used by every analytics module; E2E check
  "Marine" filter → 264 species everywhere.

## D3 — No silent cleaning; flag suspicious values instead

- **Status**: Accepted
- **Context**: handWingIndex = 0.1 appears exactly 12 times (flightless
  birds); FIELDS.md documents no sentinel convention. The prompt forbids
  silently excluding or altering observations.
- **Decision**: Keep all source values in analyses; flag `handWingIndex ≤
  0.15` per row (`hwiSuspicious` in `loader.py`) and report it in the
  validation report and Data Quality Lab with the rule and policy text.
- **Rationale**: The values are plausibly genuine (flightless birds have
  near-zero hand-wing indices) and undocumented as sentinels; excluding them
  would fabricate coverage. Log-scale analyses naturally de-emphasize them.
- **Alternatives considered**: dropping values ≤ 0.15 (rejected: silent data
  loss); treating 0.1 as missing (rejected: no documentation support).
- **Evidence**: `backend/tests/test_avian.py::test_hwi_suspicious_flag`
  (asserts exactly 12), Quality Lab "Suspicious values" card.

## D4 — Geography stays textual/region-coded (no fabricated geometry)

- **Status**: Accepted
- **Context**: The source has range statements and IOC breeding-region codes
  only; the prompt forbids inventing coordinates or polygons.
- **Decision**: Geography Lab uses region-component counts (a species
  spanning "MA, SA" counts once per region), a region-by-taxon heatmap,
  full-text range search, and a short-description audit. Region code labels
  follow the IOC 15.2 convention (AF=Africa, MA=Middle America — verified
  against sample species: Central American tinamous/guans carry MA).
- **Alternatives considered**: choropleth maps with coarse region boxes
  (rejected: fabricates spatial claims); no map is shown at all.
- **Trade-offs**: no visually impressive map; honest regional statistics
  instead.
- **Evidence**: `backend/app/analytics/geography.py` (REGION_LABELS +
  documented `note`), Geography Lab disclaimers.

## D5 — Pre-aggregated quartile boxes instead of raw-point box plots

- **Status**: Accepted
- **Context**: Backend analytics return group quartiles; Plotly box traces
  normally need raw points.
- **Decision**: Draw box plots from min/Q1/median/Q3/max arrays
  (`boxpoints: false`), matching the table shown beneath.
- **Rationale**: Keeps payload small and statistics exactly consistent with
  the printed table; group n is always visible; no double computation.
- **Alternatives considered**: shipping raw arrays per group (rejected:
  redundant payload; strip-plot value is marginal).
- **Trade-offs**: no individual points on box plots; the free-form
  Relationship Lab and scatter views cover point-level inspection.
- **Evidence**: `MorphologyPage.tsx boxFromQuartiles`,
  `RelationshipsPage.tsx pairChart`.

## D6 — Tailwind v4 with CSS-variable theme tokens + mirrored Plotly palette

- **Status**: Accepted
- **Context**: The prompt requires light and dark as complete design systems
  and a restrained editorial look.
- **Decision**: Design tokens live as CSS custom properties in
  `styles/index.css` (parchment light / designed warm dark); Tailwind maps
  them via `@theme inline`; `lib/theme.ts` duplicates the concrete values
  for Plotly layouts (CSS vars can't be read by SVG-generating Plotly).
- **Alternatives considered**: single-source JS theme object + CSS vars
  derived at runtime (rejected: more machinery for one consumer);
  tailwind `dark:` classes everywhere (rejected: weaker token discipline).
- **Trade-offs**: two files must stay in sync (noted in both with comments);
  verified both themes render correctly including chart re-theming.
- **Evidence**: screenshots of both themes; `Plot.tsx` re-layout on theme
  change.

## D7 — Notebook in localStorage, not the backend

- **Status**: Accepted
- **Context**: The prompt requires a simple, transparent local persistence
  mechanism with export/import and no accounts.
- **Decision**: `localStorage["avian.notes.v1"]` with a versioned JSON
  schema, JSON export/import files, and basic schema sanity on import.
- **Rationale**: Notes are personal annotations; browser storage keeps the
  backend stateless and makes the mechanism inspectable (documented in UI).
- **Alternatives considered**: backend file storage (rejected: adds state to
  a stateless API for no user-visible benefit).
- **Trade-offs**: notes are per-browser-profile; export/import covers
  archival and migration. Verified persistence across reload.
- **Evidence**: `lib/notebook.ts`, notebook E2E test in browser session.

## D8 — Silhouette metric sampled above 3,000 points, disclosed

- **Status**: Accepted
- **Context**: Silhouette is O(n²); with 10,423 points it takes minutes and
  dominates the clustering interaction.
- **Decision**: Sample to `MAX_CLUSTER_SILHOUETTE_SAMPLE = 3000` (fixed seed)
  for silhouette only; Davies–Bouldin and Calinski–Harabasz run on all
  points; the UI shows "(sampled 3k)".
- **Rationale**: Keeps clustering interactive with a stable, disclosed
  approximation; other metrics stay exact.
- **Alternatives considered**: full silhouette (rejected: minutes-long UI
  freeze); skipping silhouette (rejected: prompt requires it).
- **Evidence**: `backend/app/analytics/multivariate.py`, E2E clustering
  check showing "silhouette 0.503 (sampled 3k)".

## D9 — English-only, common-name-first identity

- **Status**: Accepted (product requirement)
- **Context**: Scientific names dominated the first interface; the product
  directive makes English common names the primary species identity and
  bans multilingual UI.
- **Decision**: `names.en` (AviList English) is the display name everywhere;
  fallback to the scientific name flagged as `enIsFallback`. The search
  corpus is English-only: common names, Clements/BirdLife synonyms,
  scientific names, IDs, taxonomy labels, subspecies trinomials. The
  language selector, `/api/names`, and translated-name search were removed.
- **Rationale**: 11,011/11,011 species have English names (verified), and
  3,640 alternate English names improve synonym recall; removing the
  per-language request path also removes a request round-trip from lists.
- **Alternatives considered**: keeping translations behind a flag (rejected:
  directive explicitly bans multilingual UI while data stays for provenance).
- **Evidence**: `loader.py build_species_rows` (en/enIsFallback), search
  corpus rebuild, `backend/tests` English-only tests, frontend `lib/naming.ts`.
- **Revisit conditions**: only if the product owner reverts the directive.

## D10 — Supervised ML restricted to defensible tasks with grouped CV

- **Status**: Accepted
- **Context**: The directive forbids teaching-to-the-algorithm tasks and
  claims of generalization across related species; the dataset has no
  temporal signal.
- **Decision**: Exactly two tasks are offered (migratory strategy from
  morphology; marine habitat from morphology). Predictors are observed traits
  only. Primary validation is StratifiedGroupKFold grouped by family; a
  random stratified CV is reported alongside purely to expose leakage
  inflation (observed: logistic 0.826 grouped vs 0.937 random on the marine
  task). Conservation/extinction prediction is refused in-product with an
  explanation.
- **Evidence**: `app/analytics/supervised.py` (TASKS, NOT_DEFENSIBLE),
  `test_supervised_experiment_grouped_cv`.
- **Trade-offs**: fewer flashy demos; scientifically defensible ones.

## D11 — Background job manager with config-hash dedup

- **Status**: Accepted
- **Context**: t-SNE/UMAP/supervised experiments take seconds-to-minutes;
  the event loop must not block; duplicate identical runs must not recompute.
- **Decision**: `app/jobs.py` ThreadPoolExecutor(2) + registry; POST returns
  a job id immediately; identical configuration hashes return the same job
  (dedup); cooperative cancellation between folds/stages; bounded result
  cache (24) with running-job protection; progress via JobContext.
- **Evidence**: `experiments.py` endpoints; E2E job polling in browser;
  `test_job_dedup_and_status`.

## D12 — UMAP via umap-learn; HDBSCAN/Spectral/GMM via sklearn; statsmodels for quantile regression

- **Status**: Accepted
- **Context**: The directive requests UMAP/t-SNE/kernel PCA and
  HDBSCAN/GMM/spectral clustering.
- **Decision**: Add three dependencies: umap-learn (UMAP), statsmodels
  (median quantile regression in the allometry workspace), networkx (greedy
  modularity communities). HDBSCAN and Spectral clustering come from
  scikit-learn ≥1.3 (no new dependency). t-SNE and kernel PCA are sklearn.
- **Trade-offs**: umap-learn pulls numba (heavy first import, ~1 min JIT);
  embeddings run as background jobs to hide this.
- **Evidence**: `requirements.txt`; clustering/embedding tests.

## D13 — Discovery Lab is deterministic computation, not generated prose

- **Status**: Accepted
- **Context**: The directive demands discovery without fabricated findings.
- **Decision**: ~10 detector functions each run a real computation
  (rankings, robust z-scores, Isolation Forest, coverage shares) and return
  structured findings with evidence rows, method text, limitations, and a
  deep link. `discoveries()` is cached and deterministic (verified by a
  test that two calls return identical structures).
- **Evidence**: `app/analytics/discovery.py`, `test_discoveries_deterministic_and_complete`.
