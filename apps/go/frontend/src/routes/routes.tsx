import { HomePage } from "../pages/home/home.page";
import { WorkspacesPage } from "../pages/workspaces/workspaces.page";

export const ROUTES_PATH = {
  Home: "/",
  Workspaces: "/workspaces",
};

export const ROUTER_DATA = [
  {
    path: ROUTES_PATH.Home,
    component: HomePage,
  },
  {
    path: ROUTES_PATH.Workspaces,
    component: WorkspacesPage,
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
