import { useContext } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { AuthContext } from "../../context/contextBase";

export default function AdminRoute() {
  const { user, isLoggedIn } = useContext(AuthContext);
  // Debug: surface auth state to browser console when guard runs
  // Helps determine whether the guard is being evaluated and what values are present
  // Remove these logs once debugging is complete
  // eslint-disable-next-line no-console
  console.log('AdminRouteGuard:', { isLoggedIn, user });

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
