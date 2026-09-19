import React from "react";
import "../styles/sidebar.css";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const currentPath = location.pathname.toLowerCase();

  const navItems = [
    { path: "/dashboard", label: "Dashboard", icon: "fa-solid fa-gauge-high" },
    { path: "/addstudents", label: "Add Student", icon: "fa-solid fa-user-plus" },
    { path: "/students", label: "Students", icon: "fa-solid fa-user-graduate" },
    { path: "/attendence", label: "Attendance", icon: "fa-regular fa-calendar-check" },
    { path: "/performance", label: "Performance", icon: "fa-solid fa-chart-simple" },
  ];

  const handleLogout = (e) => {
    e.preventDefault();
    logout();
    navigate("/login/teacher");
  };

  return (
    <div className="sidebar">
      <div className="logo">
        <i className="fa-solid fa-graduation-cap"></i>
        <span>EduPortal</span>
      </div>

      <ul className="menu">
        {navItems.map((item) => {
          const isActive = currentPath === item.path;
          return (
            <li key={item.path} className={isActive ? "active" : ""}>
              <Link to={item.path}>
                <i className={item.icon}></i>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}

        <li className="logout-item">
          <a href="#logout" onClick={handleLogout}>
            <i className="fa-solid fa-right-from-bracket"></i>
            <span>Logout</span>
          </a>
        </li>
      </ul>
    </div>
  );
};

export default Sidebar;
