import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Spin } from "antd";
import { useAuthStore, canSeeModule, getFirstAccessiblePath, type AppModule } from "@/stores/auth";
import MainLayout from "@/layouts/MainLayout";

const LoginView = lazy(() => import("@/views/LoginView"));
const MaterialsView = lazy(() => import("@/views/MaterialsView"));
const MaterialVersionsView = lazy(() => import("@/views/MaterialVersionsView"));
const EvalTemplatesView = lazy(() => import("@/views/EvalTemplatesView"));
const EvaluationsView = lazy(() => import("@/views/EvaluationsView"));
const EvalDetailView = lazy(() => import("@/views/EvalDetailView"));
const EvalByMaterialView = lazy(() => import("@/views/EvalByMaterialView"));
const RobotsView = lazy(() => import("@/views/RobotsView"));
const DeviceModelsView = lazy(() => import("@/views/DeviceModelsView"));
const PartsView = lazy(() => import("@/views/PartsView"));
const FaultRecordsView = lazy(() => import("@/views/FaultRecordsView"));
const UsersView = lazy(() => import("@/views/UsersView"));
const RolesView = lazy(() => import("@/views/RolesView"));
const ApiDocsView = lazy(() => import("@/views/ApiDocsView"));

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuthStore();
  const location = useLocation();
  if (!isLoggedIn) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
}

function ModuleRoute({ mod, children }: { mod: AppModule; children: React.ReactNode }) {
  if (!canSeeModule(mod)) {
    const dest = getFirstAccessiblePath();
    if (!dest) return <Navigate to="/login" replace />;
    return <Navigate to={dest} replace />;
  }
  return <>{children}</>;
}

function RedirectToFirst() {
  const dest = getFirstAccessiblePath();
  return <Navigate to={dest || "/login"} replace />;
}

const fallback = <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin /></div>;

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={fallback}>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/" element={<PrivateRoute><MainLayout /></PrivateRoute>}>
            <Route index element={<RedirectToFirst />} />
            <Route path="materials" element={<ModuleRoute mod="materials"><MaterialsView /></ModuleRoute>} />
            <Route path="materials/:parentId/versions" element={<ModuleRoute mod="materials"><MaterialVersionsView /></ModuleRoute>} />
            <Route path="eval-templates" element={<ModuleRoute mod="eval_templates"><EvalTemplatesView /></ModuleRoute>} />
            <Route path="evaluations" element={<ModuleRoute mod="eval"><EvaluationsView /></ModuleRoute>} />
            <Route path="evaluations/:taskId/detail" element={<ModuleRoute mod="eval"><EvalDetailView /></ModuleRoute>} />
            <Route path="evaluations/by-material" element={<ModuleRoute mod="materials"><EvalByMaterialView /></ModuleRoute>} />
            <Route path="robots" element={<ModuleRoute mod="robots"><RobotsView /></ModuleRoute>} />
            <Route path="device-models" element={<ModuleRoute mod="device_models"><DeviceModelsView /></ModuleRoute>} />
            <Route path="parts" element={<ModuleRoute mod="parts"><PartsView /></ModuleRoute>} />
            <Route path="fault-records" element={<ModuleRoute mod="fault_records"><FaultRecordsView /></ModuleRoute>} />
            <Route path="users" element={<ModuleRoute mod="users"><UsersView /></ModuleRoute>} />
            <Route path="roles" element={<ModuleRoute mod="roles"><RolesView /></ModuleRoute>} />
            <Route path="api-docs" element={<ModuleRoute mod="api_docs"><ApiDocsView /></ModuleRoute>} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
