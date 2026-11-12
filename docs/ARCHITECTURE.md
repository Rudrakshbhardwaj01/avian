# ARCHITECTURE.md — AVIAN

## System overview

Two local processes, no external services:

```
Browser (React SPA, :5173)
   │  fetch /api/* (Vite dev proxy → :8123)
   ▼
FastAPI backend (:8123)
   │  parses once at startup
   ▼
Data/species.json (immutable, 41 MB, 11,011 records)
   │  startup snapshot
   ▼
derived/validation-report.json (cache, best-effort)
```

- **Backend** (`backend/app/`) owns all analytics. `data/loader.py` parses
  the JSON once (`lru_cache`) and builds a normalized pandas DataFrame (one
  row per species) while keeping the raw records aligned by positional index
  `i` for detail views and verbatim exports. `data/filters.py` defines the
  single JSON filter contract shared by every endpoint; `data/validation.py`
  builds the quality report at startup. English common names (`names.en`)
  are the primary identity everywhere; the search corpus is English-only
  (English names + Clements/BirdLife synonyms + scientific names + IDs +
  taxonomy + subspecies trinomials).
- **Frontend** (`frontend/src/`) is a React SPA. `state/store.ts` (zustand)
  holds the global filter set and theme (the app is English-only; there is
  no language setting); module pages are lazy-loaded;
  `components/Plot.tsx` lazy-loads plotly.js-dist-min and re-renders on
  theme change.

## Entry points

- `backend/app/main.py` — FastAPI app; lifespan warms the dataset and logs
  the verified record count; 65 routes across routers under `app/api/`:
  - `meta.py` — `/api/meta` (dataset info, facet options), `/api/facets`,
    `/api/validation-report`
  - `overview.py` — `/api/overview` (stats, distributions, question ideas)
  - `species.py` — `/api/species` (filter+search+sort+page),
    `/api/species/{id}` (full raw record)
  - `taxonomy.py` — `/api/taxonomy/orders|families|genera|species|size-distributions`
  - `morphology.py` — POST `/api/morphology/univariate|bivariate|grouped|outliers`
  - `distributions.py` — POST `/api/distributions/kde|ecdf|qq|ridgeline|hexbin|pair`
  - `allometry.py` — POST `/api/allometry/scaling|ratios|family|diversity`
  - `ecology.py` — POST `/api/ecology/contingency|grouped-numeric`
  - `conservation.py` — POST `/api/conservation/composition|cites|extinction`
  - `geography.py` — `/api/geography/regions|region-by-taxon|short-ranges`, POST `/search`
  - `relationships.py` — POST `/api/relationships/analyze|correlation`, GET `/variables`
  - `networks.py` — POST `/api/networks/build` (kNN similarity graph, communities, centrality)
  - `multivariate.py` — POST `/api/multivariate/pca|cluster|dendrogram`
  - `embeddings` run as jobs via `experiments.py` — POST `/api/experiments/embedding`
  - `inference.py` — POST `/api/inference/two-group|k-group|diagnostics`
  - `similarity.py` — POST `/api/similarity/neighbors`
  - `anomalies.py` — POST `/api/anomalies/detect`
  - `experiments.py` — background jobs: POST `/api/experiments/run|embedding`,
    GET `/api/jobs`, `/api/jobs/{id}`, POST `/api/jobs/{id}/cancel`
  - `discovery.py` — GET `/api/discovery` (deterministic findings)
  - `quality.py` — `/api/quality/report`, `/api/quality/missingness-by`
  - `search.py` — `/api/search` (English-only corpus, synonym/subspecies aware)
  - `export.py` — `/api/export/species.csv|traits.csv|subspecies.csv|species.json`
- `frontend/src/main.tsx` → `App.tsx` (createBrowserRouter) →
  `layouts/AppLayout.tsx` (sidebar/topbar/global search) → 17 module pages.

## End-to-end flows

**Filter → analysis.** Every POST endpoint accepts `{filters, ...params}`
where `filters` is the canonical `Filters` pydantic model
(`backend/app/data/filters.py`). `apply_filters()` builds a boolean mask over
the species frame (substring search against a precomputed lowercase
English-only blob; region codes matched as comma-separated components).
Analytics modules (`app/analytics/*`) receive the filtered frame, compute
with pandas/NumPy/SciPy/sklearn/statsmodels, and cache results with
`lru_cache` keyed on the serialized filter set, so repeated UI interactions
do not recompute. Responses always include effective sample sizes
(`n`, `nMissing`, `nTotal`).

**Background jobs.** Expensive work (embeddings, supervised ML experiments)
runs through `app/jobs.py`: a ThreadPoolExecutor(2) with config-hash dedup
(identical configs return the same job), cooperative cancellation, progress
updates, and a bounded result cache (24). The FastAPI event loop never
blocks; the frontend polls `/api/jobs/{id}`.

**Species detail.** `/api/species/{id}` looks up the positional index in the
frame and returns the verbatim raw record plus a structured summary — no
reconstruction, so nothing can drift from the source.

**Charts.** The frontend computes no statistics. Pages POST filter sets,
receive pre-shaped chart payloads (histogram bins, KDE/ECDF/QQ curves,
box quartiles, scatter points with per-species hover text, PCA scores/
loadings, network layouts), and pass them to `components/Plot.tsx`, which
merges theme-aware layout tokens from `lib/theme.ts`.

**Cross-filtering.** Chart click handlers and filter selections call the
same zustand `setFilter`; the Explorer reads the same store, so clicking a
bar in Overview lands in the Explorer pre-filtered.

**Exports.** CSV/JSON export links serialize the same filter contract into
query params (`lib/api.ts filtersToParams`); the backend re-applies it and
streams CSV with added provenance columns (`traits_source`, `iucn_source`).
`species.json` export streams the untouched raw records with an explanatory
`meta` note.

**Notebook.** Purely client-side: `lib/notebook.ts` reads/writes
`localStorage["avian.notes.v1"]` with a v2 schema (note kinds:
observation / species / experiment / discovery, species references, analysis
config, reproducibility metadata); export/import is a JSON file round-trip.

**Global search.** `/api/search` ranks exact → prefix → substring over the
precomputed English-only blob (synonyms and subspecies trinomials included);
results are grouped (species with IUCN badges, taxa by level). The overlay
(`components/GlobalSearch.tsx`) binds `/` and Ctrl/Cmd+K, arrow-key
navigation, Enter to open.

## Data flow & validation

1. Startup: JSON parsed once; declared count verified against record count;
   mismatches are logged and surfaced in UI ("count mismatch!").
2. `data/validation.py` builds the full report (missingness per field,
   categorical value sets, numeric quantiles, duplicate checks, suspicious
   values, domain coverage) and mirrors it to `derived/validation-report.json`
   (best-effort; served from memory on failure).
3. Missing values stay `None`/`NaN` everywhere; `habitatDensity` uses pandas
   nullable `Int64`. Nothing is dropped or zero-filled.
4. Cleaning policy: **no silent cleaning**. Suspicious patterns (e.g.
   handWingIndex = 0.1 for flightless species) are flagged per row
   (`hwiSuspicious`) and reported in the Quality Lab; analyses keep the
   values.

## Repository map

- `backend/app/data/` — loader (normalization, English naming, search blob),
  filters (contract + mask + hash), validation (report builder)
- `backend/app/analytics/` — descriptive, taxonomy, morphology, ecology,
  conservation, geography, correlation, distributions, allometry, inference,
  similarity, anomaly, embeddings, multivariate, supervised, network,
  discovery (pure functions + caches)
- `backend/app/api/` — thin routers; `experiments.py` hosts the job endpoints
- `backend/app/jobs.py` — background-job manager (dedup, cancel, progress)
- `backend/tests/` — pytest suite (50 tests) against the real dataset
- `frontend/src/components/` — Plot wrapper, FilterBar/MultiSelect, DataTable,
  GlobalSearch, ExportMenu, UI primitives
- `frontend/src/modules/<name>/` — one folder per lab (17 pages)
- `frontend/src/lib/` — api client, theme palettes, notebook v2 persistence,
  filter helpers, naming helpers (`naming.ts`)
- `derived/` — validation report cache
- `docs/` — this documentation set

## Cross-cutting behavior

- **Caching**: `lru_cache` on analytics functions keyed by filter
  serialization; heavy results (embeddings, experiments) cached by the job
  manager; silhouette samples to 3,000 points (disclosed in UI) because it
  is O(n²).
- **Errors**: FastAPI returns structured `detail`; frontend maps to
  `ApiError` with `ErrorState` UI; charts show explicit empty states.
- **Theming**: CSS custom properties in `styles/index.css` are the source of
  truth; `lib/theme.ts` mirrors concrete values for Plotly.
- **Performance**: dataset parsed once; scatter uses WebGL (`scattergl`);
  tables paginate server-side; heavy modules code-split (plotly ~1.4 MB gzip
  loads only when a chart first renders).
- **Statistical integrity**: enforced at the analytics layer — no
  fabrication, no zero-filling, explicit missing-data accounting, assumption
  warnings for χ², complete-cases-only for PCA/clustering, algorithmic
  clusters and similarity networks labeled as statistical, never as
  phylogeny; supervised ML uses grouped CV with a leakage comparison and
  never predicts extinction/IUCN status.
