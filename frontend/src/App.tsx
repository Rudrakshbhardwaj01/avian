import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { AppLayout } from "./layouts/AppLayout";
import { Loading } from "./components/ui";

const OverviewPage = lazy(() => import("./modules/overview/OverviewPage"));
const DiscoveryPage = lazy(() => import("./modules/discovery/DiscoveryPage"));
const SpeciesExplorerPage = lazy(() => import("./modules/explorer/SpeciesExplorerPage"));
const SpeciesDetailPage = lazy(() => import("./modules/explorer/SpeciesDetailPage"));
const TaxonomyPage = lazy(() => import("./modules/taxonomy/TaxonomyPage"));
const MorphologyPage = lazy(() => import("./modules/morphology/MorphologyPage"));
const EcologyPage = lazy(() => import("./modules/ecology/EcologyPage"));
const ConservationPage = lazy(() => import("./modules/conservation/ConservationPage"));
const GeographyPage = lazy(() => import("./modules/geography/GeographyPage"));
const RelationshipsPage = lazy(() => import("./modules/relationships/RelationshipsPage"));
const MultivariatePage = lazy(() => import("./modules/multivariate/MultivariatePage"));
const SimilarityPage = lazy(() => import("./modules/similarity/SimilarityPage"));
const AnomaliesPage = lazy(() => import("./modules/anomalies/AnomaliesPage"));
const ExperimentsPage = lazy(() => import("./modules/experiments/ExperimentsPage"));
const InferencePage = lazy(() => import("./modules/inference/InferencePage"));
const QualityPage = lazy(() => import("./modules/quality/QualityPage"));
const NotebookPage = lazy(() => import("./modules/notebook/NotebookPage"));
const AboutPage = lazy(() => import("./modules/about/AboutPage"));

const load = (element: React.ReactNode) => <Suspense fallback={<Loading label="Loading module…" />}>{element}</Suspense>;

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: load(<OverviewPage />) },
      { path: "/discovery", element: load(<DiscoveryPage />) },
      { path: "/explorer", element: load(<SpeciesExplorerPage />) },
      { path: "/species/:id", element: load(<SpeciesDetailPage />) },
      { path: "/taxonomy", element: load(<TaxonomyPage />) },
      { path: "/morphology", element: load(<MorphologyPage />) },
      { path: "/ecology", element: load(<EcologyPage />) },
      { path: "/conservation", element: load(<ConservationPage />) },
      { path: "/geography", element: load(<GeographyPage />) },
      { path: "/relationships", element: load(<RelationshipsPage />) },
      { path: "/multivariate", element: load(<MultivariatePage />) },
      { path: "/similarity", element: load(<SimilarityPage />) },
      { path: "/anomalies", element: load(<AnomaliesPage />) },
      { path: "/experiments", element: load(<ExperimentsPage />) },
      { path: "/inference", element: load(<InferencePage />) },
      { path: "/quality", element: load(<QualityPage />) },
      { path: "/notebook", element: load(<NotebookPage />) },
      { path: "/about", element: load(<AboutPage />) },
      { path: "*", element: load(<div className="display text-xl text-ink2">Page not found.</div>) },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
