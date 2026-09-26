import { useState } from "react";
import { FaUserCircle, FaSignOutAlt, FaSearch, FaUserShield, FaCamera } from "react-icons/fa";
import "../styles/navbar.css";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ProfileModal from "./ProfileModal";

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout, isAdmin } = useAuth();
  const [navSearch, setNavSearch] = useState("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);

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
  const userPic = currentUser?.profilePic;

  return (
    <>
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

          <div
            className={`nav-profile-badge ${isAdmin ? "admin-badge" : "teacher-badge"}`}
            onClick={() => setIsProfileOpen(true)}
            style={{ cursor: "pointer", position: "relative" }}
            title="Click to view and set your profile picture"
          >
            {userPic ? (
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: `2px solid ${isAdmin ? "#7c3aed" : "#2563eb"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <img
                  src={userPic}
                  alt={userDisplayName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            ) : isAdmin ? (
              <FaUserShield size={22} color="#7c3aed" />
            ) : (
              <FaUserCircle size={22} color="#2563eb" />
            )}
            <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
              <span className={`teacher-name ${isAdmin ? "admin-name" : ""}`}>{userDisplayName}</span>
              <span style={{ fontSize: "10px", color: isAdmin ? "#7c3aed" : "#64748b", fontWeight: 700 }}>
                {userRole} • Edit Pic
              </span>
            </div>
          </div>

          <button className="nav-logout-btn" onClick={handleLogout} title="Sign Out">
            <FaSignOutAlt />
            <span>Logout</span>
          </button>
        </div>
      </div>

      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </>
  );
};

export default Navbar;