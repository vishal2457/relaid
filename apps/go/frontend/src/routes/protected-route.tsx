import { Navigate, Outlet } from "react-router-dom";
import BaseLayout from "../layout/base-layout";

export const ProtectedRoute = () => {
  if (false) {
    return <Navigate to="/" replace />;
  }

  return (
    <BaseLayout>
      <Outlet />
    </BaseLayout>
  );
};
