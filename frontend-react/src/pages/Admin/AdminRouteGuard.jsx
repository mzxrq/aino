import { useContext } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { AuthContext } from "../../context/contextBase";

export default function AdminRoute() {
  const { user, isLoggedIn } = useContext(AuthContext);

  // 1. Not logged in → redirect to login
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  // 2. Logged in but not admin → forbidden
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return <Navigate to="/" replace />;
  }

  // 3. Admin → allow route
  return <Outlet />;
}
