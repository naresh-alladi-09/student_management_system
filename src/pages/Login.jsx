import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "../styles/Login.css";
import {
  FaUser,
  FaLock,
  FaGraduationCap,
  FaChalkboardTeacher,
  FaUserShield,
  FaIdCard,
  FaCheckCircle,
  FaExclamationCircle,
  FaExclamationTriangle,
  FaSyncAlt,
} from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL, pingBackend } from "../services/apiClient";

const Login = ({ initialRole }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginUser, apiBaseUrl = API_BASE_URL } = useAuth();
  const [wakeUpNotice, setWakeUpNotice] = useState(false);
  const [pingStatus, setPingStatus] = useState(null);

  const isLocalhost =
    apiBaseUrl.includes("127.0.0.1") || apiBaseUrl.includes("localhost");

  // Determine active role directly from URL / props
  const getRoleFromLocation = () => {
    if (initialRole) return initialRole;
    const path = location.pathname.toLowerCase();
    if (path.includes("student")) return "student";
    if (path.includes("admin")) return "admin";
    if (path.includes("teacher")) return "teacher";
    const searchParams = new URLSearchParams(location.search);
    const qRole = searchParams.get("role");
    if (qRole && ["admin", "teacher", "student"].includes(qRole.toLowerCase())) {
      return qRole.toLowerCase();
    }
    return "teacher";
  };

  const activeRole = getRoleFromLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const switchRole = (newRole) => {
    setError("");
    setUsername("");
    setPassword("");
    navigate(`/login/${newRole}`, { replace: true });
  };

  const handleTestBackend = async () => {
    setPingStatus({
      state: "testing",
      message: "Testing connection (waking up Render if asleep)...",
    });
    const res = await pingBackend();
    if (res.ok) {
      setPingStatus({
        state: "success",
        message: "Backend is online and responding! You can now sign in.",
      });
    } else {
      setPingStatus({
        state: "error",
        message:
          res.error ||
          "Cannot reach backend. Render may be cold-booting; try again in 30 seconds.",
      });
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError("");
    setIsSubmitting(true);
    setWakeUpNotice(false);

    // If Render backend is sleeping on free tier, notify user after 4s
    const timer = setTimeout(() => {
      setWakeUpNotice(true);
    }, 4000);

    const res = await loginUser(username, password, activeRole);
    clearTimeout(timer);
    setIsSubmitting(false);
    setWakeUpNotice(false);

    if (res.success) {
      if (res.user.role === "admin") {
        navigate("/admin");
      } else if (res.user.role === "student") {
        navigate("/student/dashboard");
      } else {
        navigate("/dashboard");
      }
    } else {
      setError(
        res.message || "Invalid credentials. Please check your username and password."
      );
    }
  };

  const isStudentMode = activeRole === "student";
  const isAdminMode = activeRole === "admin";

  const getPortalTitle = () => {
    if (isAdminMode) return "SYSTEM ADMINISTRATION PORTAL";
    if (isStudentMode) return "STUDENT ACADEMIC PORTAL";
    return "FACULTY MANAGEMENT SYSTEM";
  };

  const getPortalDescription = () => {
    if (isAdminMode) {
      return "Manage institution departments, curriculum courses, faculty assignments, user privileges, and system audit logs.";
    }
    if (isStudentMode) {
      return "View your individual course attendance, academic performance, semester grades, timetable, and department announcements.";
    }
    return "Manage student enrollments, record daily attendance, conduct live QR attendance sessions, evaluate grades, and monitor analytics.";
  };

  return (
    <div className="login-page-bg">
      <div className="login-container">
        {/* Left Branding Panel */}
        <div className={`login-left ${isStudentMode ? "student-mode" : isAdminMode ? "admin-mode" : ""}`}>
          <div className="login-branding">
            <div className="login-hero-icon">
              {isAdminMode ? (
                <FaUserShield size={44} />
              ) : isStudentMode ? (
                <FaGraduationCap size={44} />
              ) : (
                <FaChalkboardTeacher size={44} />
              )}
            </div>
            <h2>{getPortalTitle()}</h2>
            <p>{getPortalDescription()}</p>

            <ul className="login-feature-list">
              {isAdminMode ? (
                <>
                  <li>
                    <FaCheckCircle /> Full user role & faculty management
                  </li>
                  <li>
                    <FaCheckCircle /> Comprehensive system audit logging
                  </li>
                  <li>
                    <FaCheckCircle /> Academic catalog & departments
                  </li>
                </>
              ) : isStudentMode ? (
                <>
                  <li>
                    <FaCheckCircle /> Real-time attendance & shortage alerts
                  </li>
                  <li>
                    <FaCheckCircle /> Live QR code attendance scanner
                  </li>
                  <li>
                    <FaCheckCircle /> Authentic SGPA / CGPA grade report
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <FaCheckCircle /> Student directory & soft deletion
                  </li>
                  <li>
                    <FaCheckCircle /> Live temporary QR attendance sessions
                  </li>
                  <li>
                    <FaCheckCircle /> Gradebook mark entry & analytics
                  </li>
                </>
              )}
            </ul>
          </div>

          <div style={{ marginTop: "auto", paddingTop: "24px", opacity: 0.8, fontSize: "12px", color: "#cbd5e1" }}>
            {isAdminMode && "Authorized institutional administrators only."}
            {isStudentMode && "Students must use their Student ID (studentid) from the backend to sign in."}
            {!isAdminMode && !isStudentMode && "Faculty must sign in with profiles provisioned by the Administrator."}
          </div>
        </div>

        {/* Right Form Panel */}
        <div className={`login-form ${isStudentMode ? "student-form-mode" : ""}`}>
          {/* 3 Role Tabs */}
          <div className="role-tabs-container" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
            <button
              type="button"
              className={`role-tab-btn ${activeRole === "teacher" ? "active teacher" : ""}`}
              onClick={() => switchRole("teacher")}
            >
              <FaChalkboardTeacher /> Faculty
            </button>
            <button
              type="button"
              className={`role-tab-btn ${activeRole === "student" ? "active student" : ""}`}
              onClick={() => switchRole("student")}
            >
              <FaGraduationCap /> Student
            </button>
            <button
              type="button"
              className={`role-tab-btn ${activeRole === "admin" ? "active admin" : ""}`}
              onClick={() => switchRole("admin")}
            >
              <FaUserShield /> Admin
            </button>
          </div>

          <span
            className={`form-header-badge ${isAdminMode ? "admin" : isStudentMode ? "student" : "teacher"}`}
          >
            {isAdminMode ? "Admin Console" : isStudentMode ? "Student Portal" : "Faculty Portal"}
          </span>

          <h2>
            {isAdminMode
              ? "System Administrator Login"
              : isStudentMode
              ? "Student Portal Sign In"
              : "Faculty Administrator Sign In"}
          </h2>
          <p className="login-subtitle">
            {isAdminMode
              ? "Sign in with institutional administrative privileges"
              : isStudentMode
              ? "Sign in using your Student ID (studentid) and password"
              : "Sign in with your admin-provisioned faculty credentials"}
          </p>

          {error && (
            <div className="login-error-alert">
              <FaExclamationCircle />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-inner-form" autoComplete="off">
            <div className="field-group">
              <label className="input-label-text">
                {isAdminMode
                  ? "Administrator Username"
                  : isStudentMode
                  ? "Student ID (or Roll Number / Email)"
                  : "Faculty Username or Email"}
              </label>
              <div
                className={`username-cont ${
                  isAdminMode
                    ? "admin-focus"
                    : isStudentMode
                    ? "student-focus"
                    : "teacher-focus"
                }`}
              >
                {isAdminMode ? (
                  <FaUserShield className="login-field-icon" />
                ) : isStudentMode ? (
                  <FaIdCard className="login-field-icon" />
                ) : (
                  <FaUser className="login-field-icon" />
                )}
                <input
                  type="text"
                  placeholder={
                    isAdminMode
                      ? "Enter admin username"
                      : isStudentMode
                      ? "Enter Student ID (e.g. STU20240001)"
                      : "Enter faculty username or email"
                  }
                  value={username}
                  required
                  autoComplete="off"
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError("");
                  }}
                />
              </div>
            </div>

            <div className="field-group">
              <label className="input-label-text">Password</label>
              <div
                className={`password-cont ${
                  isAdminMode
                    ? "admin-focus"
                    : isStudentMode
                    ? "student-focus"
                    : "teacher-focus"
                }`}
              >
                <FaLock className="login-field-icon" />
                <input
                  type="password"
                  placeholder={
                    isAdminMode
                      ? "Enter admin password"
                      : isStudentMode
                      ? "Enter your Student ID as password"
                      : "Enter faculty password"
                  }
                  value={password}
                  required
                  autoComplete="new-password"
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                />
              </div>
            </div>

            <div className="form-secondary-row">
              <label className="remember-me-label">
                <input type="checkbox" defaultChecked /> Remember session
              </label>
            </div>

            {wakeUpNotice && (
              <div className="render-wakeup-notice">
                <FaSyncAlt className="spin-icon" />
                <span>Render backend is waking up from free-tier sleep (~50s). Please wait...</span>
              </div>
            )}

            <button
              type="submit"
              className={`login-submit-btn ${
                isAdminMode
                  ? "admin-btn"
                  : isStudentMode
                  ? "student-btn"
                  : "teacher-btn"
              }`}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span>
                  <FaSyncAlt className="spin-icon" /> Authenticating...
                </span>
              ) : (
                <span>Sign In to Portal →</span>
              )}
            </button>
          </form>

          {/* Diagnostic Footer */}
          <div className="login-backend-diag">
            <div className="backend-diag-row">
              <div className="backend-url-info">
                <span
                  className={`status-dot ${isLocalhost ? "status-warn" : "status-live"}`}
                ></span>
                <span className="backend-label">Backend:</span>
                <span className="backend-url-code" title={apiBaseUrl}>
                  {apiBaseUrl}
                </span>
              </div>
              <button
                type="button"
                className="btn-ping-backend"
                onClick={handleTestBackend}
                disabled={pingStatus?.state === "testing"}
                title="Test live connection to backend"
              >
                {pingStatus?.state === "testing" ? (
                  <span>
                    <FaSyncAlt className="spin-icon" /> Pinging...
                  </span>
                ) : (
                  <span>Test Connection</span>
                )}
              </button>
            </div>
            {isLocalhost && (
              <div className="backend-diag-notice warn">
                <FaExclamationTriangle />
                <span>
                  Currently pointing to <strong>localhost</strong>. In Vercel Project Settings, add <code>VITE_API_URL</code> with your Render URL, then click <strong>Redeploy</strong>.
                </span>
              </div>
            )}
            {pingStatus && (
              <div className={`backend-diag-notice ${pingStatus.state}`}>
                {pingStatus.state === "success" && <FaCheckCircle />}
                {pingStatus.state === "error" && <FaExclamationCircle />}
                {pingStatus.state === "testing" && <FaSyncAlt className="spin-icon" />}
                <span>{pingStatus.message}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;