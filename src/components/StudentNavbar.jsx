import React from "react";
import { FaUserGraduate, FaSignOutAlt, FaCalendarCheck, FaChartLine, FaIdBadge, FaThLarge } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../styles/navbar.css";

const StudentNavbar = ({ activeTab, setActiveTab }) => {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/login/student");
  };

  const studentName = currentUser?.name || "Student";
  const studentBranch = currentUser?.branch || "CSE";
  const studentRoll = currentUser?.rollNo || `STU-${currentUser?.id || "101"}`;

  return (
    <div className="navbar student-navbar-wrap">
      <div className="title student-nav-left">
        <div className="student-portal-brand">
          <div className="student-brand-icon">
            <FaUserGraduate />
          </div>
          <div>
            <h2>Student Academic Portal</h2>
            <span className="student-sub-brand">
              {studentRoll} • {studentBranch}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation tabs within student portal */}
      <div className="student-nav-tabs">
        <button
          type="button"
          className={`student-tab-pill ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <FaThLarge />
          <span>Overview</span>
        </button>
        <button
          type="button"
          className={`student-tab-pill ${activeTab === "attendance" ? "active" : ""}`}
          onClick={() => setActiveTab("attendance")}
        >
          <FaCalendarCheck />
          <span>My Attendance</span>
        </button>
        <button
          type="button"
          className={`student-tab-pill ${activeTab === "performance" ? "active" : ""}`}
          onClick={() => setActiveTab("performance")}
        >
          <FaChartLine />
          <span>My Grades</span>
        </button>
        <button
          type="button"
          className={`student-tab-pill ${activeTab === "profile" ? "active" : ""}`}
          onClick={() => setActiveTab("profile")}
        >
          <FaIdBadge />
          <span>My Profile</span>
        </button>
      </div>

      <div className="nav-links">
        <div className="nav-profile-badge student-badge-theme">
          <div className="student-avatar-circle">
            {studentName.charAt(0).toUpperCase()}
          </div>
          <div className="student-name-meta">
            <span className="student-nav-name">{studentName}</span>
            <span className="student-nav-role">Student</span>
          </div>
        </div>

        <button
          className="nav-logout-btn"
          onClick={handleLogout}
          title="Sign out of student portal"
        >
          <FaSignOutAlt />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
};

export default StudentNavbar;
