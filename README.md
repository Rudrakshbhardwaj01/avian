# AVIAN — Ornithological Data Exploration & Discovery Laboratory

AVIAN is a local-first, interactive data science laboratory for exploring the
**World Bird Species** dataset (AviList v2026, 11,011 species). It is not a
dashboard: every chart and statistic is computed from the local dataset at
request time, every analysis reports its effective sample size, and the
dataset's limitations are made visible instead of hidden. The UI is
**English-only by design**: English common names are the primary species
identity; scientific names are secondary (italic) metadata.

```
Avian/
├── Data/               # immutable source data (species.json, FIELDS.md, NOTICE.md)
├── backend/            # FastAPI + pandas/NumPy/SciPy/sklearn/statsmodels analytics
│   ├── app/
│   │   ├── data/       # loader, normalization, filters, validation report
│   │   ├── analytics/  # distributions, allometry, inference, similarity, anomaly,
│   │   │               # embeddings, multivariate, supervised, network, discovery
│   │   ├── api/        # thin FastAPI routers + job endpoints + CSV/JSON exports
│   │   └── jobs.py     # background-job manager (dedup, cancel, progress)
│   └── tests/          # pytest suite (50 tests, runs against the real dataset)
├── frontend/           # React 18 + TypeScript + Vite + Tailwind v4 + Plotly
│   └── src/modules/    # 17 labs: overview, explorer, discovery, similarity,
│                       # anomalies, experiments, inference, morphology, ecology,
│                       # conservation, geography, relationships, multivariate,
│                       # taxonomy, quality, notebook, about
├── derived/            # cached validation report (written at startup)
├── docs/               # PROJECT.md / ARCHITECTURE.md / DECISIONS.md
├── run.bat / run.sh    # one-command launchers
└── README.md
```

## What AVIAN can do

| Module | Highlights |
|---|---|
| **Overview** | Headline scale (species/orders/families/genera), distributions by order, family, habitat, migration, IUCN and breeding region; analytical-coverage bars; data-driven *Questions worth exploring* |
| **Discovery Lab** | Deterministic findings (variation, associations, ecology×morphology, unusual profiles, conservation contrasts, data-quality suspects) with evidence tables, method, limitations, deep links |
| **Species Explorer** | English-only search (incl. Clements/BirdLife synonyms + subspecies trinomials); combinable filters (order, family, genus, habitat, migration, trophic niche, lifestyle, IUCN, region) + mass range + trait-availability flags; sorting; pagination |
| **Species detail** | Full record in sections with honest missing-value display, related-analyses actions (find similar, genus explorer, family conservation, save to notebook), raw-JSON inspector, record export |
| **Taxonomy Lab** | Treemap + sunburst of order richness; Order→Family→Genus→Species drill-down; family/genus size distributions |
| **Morphology Lab** | 8 tabs: univariate · distributions (KDE/ECDF/Q-Q/ridgeline/hexbin/pair plots) · bivariate · group comparison · outliers · allometry (log-log OLS + Theil-Sen + quantile regression, ratios, within-family) · morphological diversity |
| **Ecology Lab** | Categorical cross-tabs with χ², Cramér's V and expected-frequency warnings; habitat→migration Sankey |
| **Conservation Lab** | IUCN composition by group, CITES separately, extinction-flagged species, missing-status visibility |
| **Geography Lab** | IOC breeding-region statistics, region-by-taxon heatmap, full-text range search, short-range-description audit — **no invented coordinates** |
| **Relationship Lab** | Any variable pair with automatic visualization; correlation matrix (Pearson/Spearman); **similarity networks** (kNN graph, greedy-modularity communities, degree centrality) — never presented as phylogeny |
| **Multivariate** | PCA (+ biplot vectors); **embeddings** (t-SNE/UMAP/kernel PCA as background jobs with seeds); **clustering** (k-means, hierarchical, DBSCAN, HDBSCAN, GMM, spectral) with silhouette/DB/CH; family dendrogram; run-comparison log |
| **Similarity Engine** | Nearest morphological neighbors under standardized Euclidean / Manhattan / cosine / Mahalanobis (Ledoit-Wolf), per-trait z-differences, side-by-side comparison |
| **Anomaly Lab** | Isolation Forest / LOF / robust covariance with per-trait robust-z contributions and data-quality vs biological triage |
| **ML Experiments** | Two defensible tasks (migration; marine habitat) run as background jobs: 6 model families vs majority baseline, StratifiedGroupKFold **grouped by family** + leakage-exposing random-CV comparison, confusion matrices, permutation importance, partial dependence. Extinction/IUCN prediction is explicitly not offered |
| **Inference Lab** | Welch's t / Mann-Whitney U with rank-biserial + Cohen's d, bootstrap CI, permutation test; Kruskal-Wallis with Holm-corrected post-hoc and ε²; assumption diagnostics; phylogenetic non-independence disclosed |
| **Data Quality** | Full validation report: missingness, duplicates, numeric profiles, suspicious values (flagged, never removed), coverage by domain |
| **Research Notebook** | Note kinds: observation / species reference / experiment / discovery; filters + reproducibility metadata; JSON export/import |
| **About Dataset** | Provenance, field documentation, mixed-license attribution, known limitations, AVIAN's transformations |

Global features: cross-module filter bar with active-filter chips and reset,
global search (`/` shortcut) over English names + synonyms, light/dark
themes, CSV/JSON exports honoring active filters.

## Prerequisites

- Python 3.11+ with `pip`
- Node.js 18+ with `npm`

No other services. No internet access is required after dependencies are
installed — all data stays on this machine.

## Install & run

### One command

```bash
# Windows
run.bat

# macOS / Linux
./run.sh
```

The script installs missing dependencies, starts the backend on
`http://127.0.0.1:8123` and the frontend on `http://localhost:5173`, then
opens the lab in your browser.

### Manual

```bash
# backend
pip install -r backend/requirements.txt
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8123

# frontend (second terminal)
cd frontend
npm install
npm run dev
```

Then open <http://localhost:5173>.

### Tests

```bash
cd backend && python -m pytest tests -q      # 50 tests, real dataset (~5 min; ML + embeddings)
cd frontend && npm test                      # 18 tests (vitest)
cd frontend && npm run build
```

## How the data flows

1. On backend startup, `Data/species.json` (41 MB) is parsed **once** and
   normalized into analytical tables (`backend/app/data/loader.py`); the raw
   records are kept aligned for the detail views. The file is never modified.
2. Every module sends a JSON filter set (`backend/app/data/filters.py`) to a
   thin FastAPI endpoint; analytics run in pandas/NumPy/SciPy/scikit-learn/
   statsmodels and results are cached per filter configuration. Expensive
   computations (embeddings, ML experiments) run as background jobs with
   config-hash dedup and cancellation.
3. The React frontend renders responses with Plotly (lazy-loaded) and
   Tailwind; selections can click through into the Species Explorer with
   filters applied.
4. A validation report is computed at startup and mirrored to
   `derived/validation-report.json`; the Data Quality Lab serves it directly.

## Statistical integrity rules baked into AVIAN

- Missing values are never zero-filled; nothing is silently excluded.
- Missing IUCN ≠ Least Concern; missing CITES ≠ unlisted.
- Suspicious values (e.g. hand-wing index = 0.1) are flagged, not removed.
- χ² tables warn when expected frequencies are too small.
- PCA/clustering/embeddings use complete cases only, always report
  exclusions, and are labeled as statistical groupings — not evolutionary
  relationships or phylogeny.
- Supervised ML compares grouped (family-grouped) CV against random CV to
  expose leakage, and never predicts conservation status or extinction.
- Inference endpoints disclose that species are not phylogenetically
  independent.
- Correlation is never presented as causation; tests report sample sizes and
  effect sizes.
- The source has no coordinates or polygons: geography stays textual/coded.

## How to add a future dataset

The backend assumes a JSON file with `version`, `taxonomy`, `count` and
`species[]` (the AviList-compilation shape, documented in `Data/FIELDS.md`).
To support another dataset: adapt `app/data/loader.py` (normalization) and
`app/config.py` (path), extend the validation report fields, and keep the API
contracts unchanged so the frontend needs no changes.

## Known limitations

- The dev server pair (uvicorn + Vite) is intended for local use; there is no
  production packaging, auth, or multi-user support by design.
- `npm run build` produces a production bundle, but serving it still requires
  the backend for all analytics.
- Range data is textual/region-coded only — no maps with geometry (none
  exists in the source; see Geography Lab).
- AVONET traits cover 10,423 species; the remaining species (mostly changed
  taxon concepts) are intentionally empty in the source.
- t-SNE/UMAP distort distances; cluster and community structure is statistical,
  not biological taxonomy.

## License situation

The AVIAN application code is new. The dataset it reads carries **mixed
licenses** (MIT compilation, CC BY 4.0 AviList/AVONET, CC BY 3.0 IOC names,
CC0 Wikidata, CC BY-SA 4.0 Chinese field-guide notes). See
`Data/NOTICE.md` and `Data/FIELDS.md` — attribution is preserved verbatim in
the About Dataset page and in every CSV export's provenance columns.
