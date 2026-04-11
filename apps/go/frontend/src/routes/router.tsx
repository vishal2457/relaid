import { Home } from "lucide-react";
import { HashRouter, Link, Route, Routes } from "react-router-dom";
import { Button } from "../shared/components/ui/button";
import { ProtectedRoute } from "./protected-route";
import { ROUTER_DATA } from "./routes";

export const AppRouter = () => {
  return (
    <HashRouter>
      <Routes>
        <Route element={<ProtectedRoute />}>
          {ROUTER_DATA.map((route) => {
            const Comp = route.component;
            return (
              <Route key={route.path} path={route.path} element={<Comp />} />
            );
          })}
        </Route>
        <Route
          path="*"
          element={
            <div className="flex h-screen flex-col items-center justify-center gap-4">
              <h1 className="">404</h1>
              <Link to={{ pathname: "/" }}>
                <Button>
                  <Home />
                  Home
                </Button>
              </Link>
            </div>
          }
        />
      </Routes>
    </HashRouter>
  );
};
