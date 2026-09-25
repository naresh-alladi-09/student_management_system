import { useState } from "react";
import { FaUserCircle, FaSignOutAlt, FaSearch, FaUserShield } from "react-icons/fa";
import "../styles/navbar.css";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout, isAdmin } = useAuth();
  const [navSearch, setNavSearch] = useState("");

  const getPageTitle = () => {
    const path = location.pathname.toLowerCase();
    if (path.includes("admin")) return "Administrative Console";
    if (path.includes("addstudents")) return "Enroll New Student";
    if (path.includes("students")) return "Student Directory";
    if (path.includes("attendance") || path.includes("attendence")) return "Attendance Management";
    if (path.includes("performance")) return "Academic Performance";
    return "Dashboard Overview";
  };

  const handleSearchSubmit = (e) => {
    if (e.key === "Enter" && navSearch.trim()) {
      navigate(`/students`);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const userDisplayName = currentUser?.name || currentUser?.username || "Faculty Admin";
  const userRole = currentUser?.role?.toUpperCase() || (isAdmin ? "ADMIN" : "TEACHER");

  return (
    <div className="navbar">
      <div className="title">
        <h2>{getPageTitle()}</h2>
      </div>

      <div className="nav-links">
        <div className="nav-search-wrapper">
          <FaSearch className="nav-search-icon" />
          <input
            type="text"
            placeholder="Search students..."
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
            onKeyDown={handleSearchSubmit}
          />
        </div>

        <div className={`nav-profile-badge ${isAdmin ? "admin-badge" : "teacher-badge"}`}>
          {isAdmin ? (
            <FaUserShield size={22} color="#7c3aed" />
          ) : (
            <FaUserCircle size={22} color="#2563eb" />
          )}
          <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
            <span className={`teacher-name ${isAdmin ? "admin-name" : ""}`}>{userDisplayName}</span>
            <span style={{ fontSize: "10px", color: isAdmin ? "#7c3aed" : "#64748b", fontWeight: 700 }}>
              {userRole}
            </span>
          </div>
        </div>

        <button className="nav-logout-btn" onClick={handleLogout} title="Sign Out">
          <FaSignOutAlt />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Navbar;