import { useState } from "react";
import "../styles/sidebar.css";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ProfileModal from "./ProfileModal";

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, logout, isAdmin } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const currentPath = location.pathname.toLowerCase();

  const navItems = [
    { path: "/dashboard", label: "Dashboard", icon: "fa-solid fa-gauge-high" },
    { path: "/exam-scanner", label: "Exam Scanner", icon: "fa-solid fa-qrcode" },
    { path: "/students", label: "Students", icon: "fa-solid fa-user-graduate" },
    { path: "/addstudents", label: "Add Student", icon: "fa-solid fa-user-plus" },
    { path: "/attendance", label: "Attendance", icon: "fa-regular fa-calendar-check" },
    { path: "/performance", label: "Performance", icon: "fa-solid fa-chart-simple" },
  ];

  if (isAdmin) {
    navItems.unshift({
      path: "/admin",
      label: "Admin Console",
      icon: "fa-solid fa-user-shield",
    });
  }

  const handleLogout = (e) => {
    e.preventDefault();
    logout();
    navigate("/login");
  };

  return (
    <>
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

        {/* User profile card at bottom of sidebar */}
        <div
          className="sidebar-user-badge"
          onClick={() => setIsProfileOpen(true)}
          style={{
            marginTop: "auto",
            marginBottom: "16px",
            padding: "10px 12px",
            background: "rgba(255, 255, 255, 0.08)",
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            cursor: "pointer",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            transition: "background 0.2s",
          }}
          title="Click to view & change profile picture"
        >
          <div
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "50%",
              overflow: "hidden",
              background: isAdmin ? "#7c3aed" : "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "13px",
              flexShrink: 0,
            }}
          >
            {currentUser?.profilePic ? (
              <img
                src={currentUser.profilePic}
                alt={currentUser.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              (currentUser?.name || currentUser?.username || "U").charAt(0).toUpperCase()
            )}
          </div>
          <div style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#ffffff",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {currentUser?.name || currentUser?.username}
            </span>
            <span style={{ fontSize: "10px", color: "#94a3b8", textTransform: "uppercase" }}>
              {isAdmin ? "Admin" : "Faculty"} • Edit Pic
            </span>
          </div>
        </div>
      </div>

      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </>
  );
};

export default Sidebar;
