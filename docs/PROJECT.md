# PROJECT.md — AVIAN

## Identity

**AVIAN** is a local-first ornithological research workstation built on the
*World Bird Species* dataset (AviList v2026, 11,011 species). It combines a
biodiversity archive, an exploratory-statistics laboratory, a machine-
learning environment, and a deterministic discovery engine. English common
names are the primary species identity; scientific names are secondary
metadata. The application is English-only by design.

**Status: upgraded and verified.** All modules below are implemented against
the real dataset. Backend (51) and frontend (19) automated tests pass.
See `docs/STABILITY_AUDIT.md` (2026-11-12) for the full-codebase audit and
fixes, and `docs/VERCEL_DEPLOYMENT.md` for the single-domain Vercel deployment
(frontend static + FastAPI as a Python Function under `/api`).

## Scope

### Modules

| Module | Capabilities |
|---|---|
| **Overview** | Headline scale, distributions (order/family/habitat/migration/IUCN/regions), coverage, data-driven questions |
| **Discovery** | ~10 deterministic findings (variation, associations, ecology×morphology, unusual profiles, conservation contrasts, data-quality suspects) with evidence tables, method, limitations, deep links |
| **Species Explorer** | Common-name-first rows, English-only search (incl. Clements/BirdLife synonyms + subspecies trinomials), 9 categorical filters + mass range + trait-availability flags, sorting, pagination |
| **Species detail** | 11 sections incl. related-analyses actions (find similar, genus explorer, family conservation, save to notebook), raw-record inspector, record export |
| **Taxonomy** | Treemap, sunburst, 4-level drill-down, size distributions |
| **Morphology** | 8 tabs: univariate · distributions (KDE/ECDF/Q-Q/ridgeline) · bivariate · group comparison · outliers · allometry (OLS + Theil-Sen + median regression, residuals) · ratios (4 curated indices + extremes) · morphological diversity |
| **Ecology** | Cross-tabs with χ²/Cramér's V + expected-frequency warnings, Sankey |
| **Conservation** | IUCN composition by group, CITES separately, extinction flags, missing-status visibility |
| **Geography** | IOC region components, region-by-taxon heatmap, range-text search, short-description audit — no fabricated geometry |
| **Relationships** | Free-form pair analysis, correlation matrix (Pearson/Spearman), **similarity networks** (kNN graph, greedy-modularity communities, degree centrality, community composition) |
| **Multivariate** | PCA (+ biplot vectors), **embeddings** (t-SNE/UMAP/kernel PCA as background jobs with seeds + parameters), **clustering** (k-means, hierarchical, DBSCAN, HDBSCAN, GMM, spectral) with silhouette/DB/CH, session configuration-comparison log, family **dendrogram** |
| **Similarity** | Species similarity engine: standardized Euclidean/Manhattan/cosine/Mahalanobis (Ledoit-Wolf), per-trait z-differences, side-by-side bars, save-to-notebook |
| **Anomalies** | Isolation Forest / LOF / robust covariance with per-trait robust-z contributions and data-quality vs biological triage |
| **ML Experiments** | Two defensible tasks (migration; marine habitat): 6 model families vs majority baseline, StratifiedGroupKFold **grouped by family** + leakage-exposing random-CV comparison, confusion matrices, per-class metrics, permutation importance, partial dependence, reproducibility metadata |
| **Inference** | Welch's t / Mann-Whitney U with rank-biserial + Cohen's d, bootstrap CI, permutation test; Kruskal-Wallis with Holm-corrected post-hoc, ε²; assumption diagnostics; phylogenetic non-independence disclosed |
| **Data Quality** | Full validation report, missingness-by-group, suspicious-value flags |
| **Notebook** | Kinds: observation / species reference / experiment / discovery; filters + reproducibility metadata; JSON export/import |
| **About** | Provenance, field documentation, mixed-license attribution, transformations |

### Non-functional requirements

- Local-only: no cloud, no auth, no AI APIs, no telemetry; offline-capable
  after dependency install.
- **English-only UI**: no language selector, no multilingual display;
  source multilingual data preserved for provenance only.
- Every number computed from the dataset; effective sample sizes disclosed;
  no silent cleaning; anomalies never removed.
- Expensive computations run as background jobs (dedup by config hash,
  progress, cooperative cancellation); the FastAPI event loop never blocks.
- Charts lazy-load Plotly; tables paginate server-side.

## Technology stack

| Layer | Choice |
|---|---|
| Backend | Python 3.11, FastAPI, uvicorn, pandas, NumPy, SciPy, scikit-learn (incl. HDBSCAN), statsmodels, umap-learn, networkx |
| Frontend | React 18, TypeScript, Vite 6, Tailwind v4, zustand, react-router v7, plotly.js-dist-min (lazy) |
| Storage | none (in-memory + `derived/validation-report.json` cache) |
| Tests | pytest (backend, 50), vitest + @testing-library (frontend, 18) |

## Development and operation

```bash
run.bat / ./run.sh            # launchers (install deps if missing)

# manual
pip install -r backend/requirements.txt
cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8123
cd frontend && npm install && npm run dev    # http://localhost:5173

# tests
cd backend && python -m pytest tests -q       # 50 tests (~5 min; ML + embeddings)
cd frontend && npm test                       # 18 tests
cd frontend && npm run build
```

Key locations: `backend/app/analytics/` (all computational modules),
`backend/app/api/` (routers incl. `experiments.py` job endpoints,
`backend/app/jobs.py` background-job manager), `frontend/src/modules/`.

## Naming rules (short form)

- Display name = `names.en` (AviList English); fallback = scientific name,
  flagged in API responses (`enIsFallback`).
- Search corpus: English names + Clements/BirdLife synonyms + scientific
  names + IDs + taxonomy labels + subspecies trinomials. Non-English names
  are excluded from search and display.

## Known limitations

- No coordinates/polygons in the source; geography stays textual/coded.
- AVONET traits cover 10,423 species (588 changed-concept species empty).
- Missing IUCN (871) ≠ Least Concern; missing CITES ≠ unlisted.
- Species are not phylogenetically independent; inference and ML results
  disclose this. Predicting conservation status/extinction is not offered.
- t-SNE/UMAP distort distances; cluster/community structure is statistical,
  not biological taxonomy.
