import React, { useState } from "react";
import { FaUserCircle, FaSignOutAlt, FaSearch } from "react-icons/fa";
import "../styles/navbar.css";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useAuth();
  const [navSearch, setNavSearch] = useState("");

  const getPageTitle = () => {
    const path = location.pathname.toLowerCase();
    if (path.includes("addstudents")) return "Add New Student";
    if (path.includes("students")) return "Student Directory";
    if (path.includes("attendence")) return "Attendance Management";
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
    navigate("/login/teacher");
  };

  const teacherDisplayName = currentUser?.name || "Faculty Admin";

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

        <div className="nav-profile-badge">
          <FaUserCircle size={22} color="#3b82f6" />
          <span className="teacher-name">{teacherDisplayName}</span>
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