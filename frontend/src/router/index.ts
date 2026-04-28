import { createRouter, createWebHistory } from "vue-router";
import { canSeeModule, getFirstAccessiblePath, useAuthStore, type AppModule } from "@/stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: () => import("@/views/LoginView.vue") },
    {
      path: "/",
      component: () => import("@/layouts/MainLayout.vue"),
      meta: { requiresAuth: true },
      children: [
        { path: "", redirect: "/materials" },
        {
          path: "users",
          name: "users",
          meta: { module: "users" satisfies AppModule },
          component: () => import("@/views/UsersView.vue"),
        },
        {
          path: "roles",
          name: "roles",
          meta: { module: "roles" satisfies AppModule },
          component: () => import("@/views/RolesView.vue"),
        },
        {
          path: "api-docs",
          name: "api-docs",
          meta: { module: "api_docs" satisfies AppModule },
          component: () => import("@/views/ApiDocsView.vue"),
        },
        {
          path: "materials",
          name: "materials",
          meta: { module: "materials" satisfies AppModule },
          component: () => import("@/views/MaterialsView.vue"),
        },
        {
          path: "eval-templates",
          name: "eval-templates",
          meta: { module: "eval" satisfies AppModule },
          component: () => import("@/views/EvalTemplatesView.vue"),
        },
        {
          path: "materials/:parentId/versions",
          name: "material-versions",
          meta: { module: "materials" satisfies AppModule },
          component: () => import("@/views/MaterialVersionsView.vue"),
        },
        {
          path: "evaluations",
          name: "evaluations",
          meta: { module: "eval" satisfies AppModule },
          component: () => import("@/views/EvaluationsView.vue"),
        },
        {
          path: "evaluations/:taskId/detail",
          name: "eval-detail",
          meta: { module: "eval" satisfies AppModule },
          component: () => import("@/views/EvalDetailView.vue"),
        },
        {
          path: "evaluations/by-material",
          name: "eval-by-material",
          meta: { module: "materials" satisfies AppModule },
          component: () => import("@/views/EvalByMaterialView.vue"),
        },
        {
          path: "robots",
          name: "robots",
          meta: { module: "robots" satisfies AppModule },
          component: () => import("@/views/RobotsView.vue"),
        },
        {
          path: "device-models",
          name: "device-models",
          meta: { module: "device_models" satisfies AppModule },
          component: () => import("@/views/DeviceModelsView.vue"),
        },
        {
          path: "parts",
          name: "parts",
          meta: { module: "parts" satisfies AppModule },
          component: () => import("@/views/PartsView.vue"),
        },
        {
          path: "fault-records",
          name: "fault-records",
          meta: { module: "fault_records" satisfies AppModule },
          component: () => import("@/views/FaultRecordsView.vue"),
        },
      ],
    },
  ],
});

router.beforeEach((to, _from, next) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    next({ name: "login", query: { redirect: to.fullPath } });
    return;
  }
  if (to.name === "login" && auth.isLoggedIn) {
    next(getFirstAccessiblePath() || "/materials");
    return;
  }
  if (to.meta.requiresAuth && auth.isLoggedIn) {
    const mod = to.meta.module as AppModule | undefined;
    if (mod && !canSeeModule(mod)) {
      const dest = getFirstAccessiblePath();
      if (!dest) {
        auth.logout();
        next({ name: "login" });
        return;
      }
      next(dest);
      return;
    }
  }
  next();
});

export default router;
