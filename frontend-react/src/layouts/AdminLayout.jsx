import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import "../css/AdminPage.css";

export default function MainLayout() {
  return (
    <>
      <div className="anomalies-page">
        <div className="sidebar-container">
          <Sidebar />
        </div>
        <Outlet />
      </div>
    </>
  );
}
