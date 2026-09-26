import { useState, useEffect } from "react";
import {
  FaUserGraduate,
  FaSignOutAlt,
  FaCalendarCheck,
  FaChartLine,
  FaIdBadge,
  FaThLarge,
  FaClock,
  FaBell,
  FaCheckDouble,
  FaBook,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getMyNotifications, markNotificationAsRead } from "../services/studentservice";
import "../styles/navbar.css";
import "../styles/studentdashboard.css";

const StudentNavbar = ({ activeTab, setActiveTab }) => {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getMyNotifications()
      .then((res) => {
        if (!isMounted) return;
        setUnreadCount(res.data?.unread_count || 0);
        setNotifications(res.data?.notifications || []);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login/student");
  };

  const handleMarkAllRead = async () => {
    try {
      await markNotificationAsRead();
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // ignore
    }
  };

  const studentName = currentUser?.name || "Student";
  const studentBranch = currentUser?.branch || "—";
  const studentRoll = currentUser?.rollNo || "—";

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
          <span>Attendance</span>
        </button>
        <button
          type="button"
          className={`student-tab-pill ${activeTab === "performance" ? "active" : ""}`}
          onClick={() => setActiveTab("performance")}
        >
          <FaChartLine />
          <span>Grades & SGPA</span>
        </button>
        <button
          type="button"
          className={`student-tab-pill ${activeTab === "timetable" ? "active" : ""}`}
          onClick={() => setActiveTab("timetable")}
        >
          <FaClock />
          <span>Timetable</span>
        </button>
        <button
          type="button"
          className={`student-tab-pill ${activeTab === "courses" ? "active" : ""}`}
          onClick={() => setActiveTab("courses")}
        >
          <FaBook />
          <span>Curriculum</span>
        </button>
        <button
          type="button"
          className={`student-tab-pill ${activeTab === "announcements" ? "active" : ""}`}
          onClick={() => setActiveTab("announcements")}
        >
          <FaBell />
          <span>Announcements</span>
        </button>
        <button
          type="button"
          className={`student-tab-pill ${activeTab === "profile" ? "active" : ""}`}
          onClick={() => setActiveTab("profile")}
        >
          <FaIdBadge />
          <span>Profile</span>
        </button>
      </div>

      <div className="nav-links">
        {/* Notification Bell Dropdown */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="nav-notification-btn"
            style={{
              position: "relative",
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              color: "#047857",
              padding: "8px 12px",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "16px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            onClick={() => setShowNotifs(!showNotifs)}
            title="Notifications"
          >
            <FaBell />
            {unreadCount > 0 && (
              <span
                style={{
                  background: "#ef4444",
                  color: "#fff",
                  fontSize: "11px",
                  fontWeight: 700,
                  borderRadius: "10px",
                  padding: "1px 6px",
                  lineHeight: "14px",
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifs && (
            <div
              style={{
                position: "absolute",
                top: "42px",
                right: "0",
                width: "320px",
                background: "#ffffff",
                borderRadius: "12px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
                zIndex: 1000,
                color: "#1e293b",
                overflow: "hidden",
                border: "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #f1f5f9",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "#f8fafc",
                }}
              >
                <strong style={{ fontSize: "14px" }}>Notifications</strong>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#2563eb",
                      fontSize: "12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <FaCheckDouble /> Mark read
                  </button>
                )}
              </div>
              <div style={{ maxHeight: "280px", overflowY: "auto" }}>
                {notifications.length > 0 ? (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #f8fafc",
                        background: n.is_read ? "#ffffff" : "#f0fdf4",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: "13px", color: "#0f172a" }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                        {n.message}
                      </div>
                      <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "4px" }}>
                        {new Date(n.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                    No notifications available.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

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
