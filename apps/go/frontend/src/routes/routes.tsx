import { HomePage } from "../pages/home/home.page";
import { SettingsPage } from "../pages/settings/settings.page";

export const ROUTES_PATH = {
  Home: "/",
  Settings: "/settings",
};

export const ROUTER_DATA = [
  {
    path: ROUTES_PATH.Home,
    component: HomePage,
  },
  {
    path: ROUTES_PATH.Settings,
    component: SettingsPage,
  },
  // {
  //     path: "/project-list",
  //     component: ProjectList,
  // },
  // {
  //     path: "/template-list",
  //     component: TemplateList,
  // },
  // {
  //     path: "/create-template",
  //     component: CreateTemplate,
  // },
  // {
  //     path: "/create-project",
  //     component: CreateProject,
  // },
  // {
  //     path: "/update-template/:templateID",
  //     component: UpdateTemplate,
  // },
  // {
  //     path: "/update-project/:projectID/:tab",
  //     component: UpdateProject,
  // },
];
