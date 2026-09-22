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
  FaBolt,
  FaCheckCircle,
  FaExclamationCircle,
} from "react-icons/fa";
import { useAuth } from "../context/AuthContext";

const Login = ({ initialRole }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginUser } = useAuth();

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

  const handleAutofillDemo = () => {
    setError("");
    if (activeRole === "admin") {
      setUsername("admin");
      setPassword("admin");
    } else if (activeRole === "teacher") {
      setUsername("madam");
      setPassword("123456");
    } else {
      setUsername("STU-2024-001");
      setPassword("student123");
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError("");
    setIsSubmitting(true);

    const res = await loginUser(username, password, activeRole);
    setIsSubmitting(false);

    if (res.success) {
      if (res.user.role === "admin") {
        navigate("/admin");
      } else if (res.user.role === "student") {
        navigate("/student/dashboard");
      } else {
        navigate("/dashboard");
      }
    } else {
      setError(res.message || "Invalid credentials. Please check your username and password.");
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

          <div className="login-demo-pill">
            <small>
              {isAdminMode
                ? "Admin Demo Credentials"
                : isStudentMode
                ? "Student Demo Credentials"
                : "Faculty Demo Credentials"}
            </small>
            <span>
              {isAdminMode ? (
                <>
                  User: <code>admin</code> | Pass: <code>admin</code>
                </>
              ) : isStudentMode ? (
                <>
                  Roll No: <code>STU-2024-001</code> | Pass: <code>student123</code>
                </>
              ) : (
                <>
                  User: <code>madam</code> | Pass: <code>123456</code>
                </>
              )}
            </span>
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
              className={`role-tab-btn ${activeRole === "admin" ? "active" : ""}`}
              style={activeRole === "admin" ? { background: "#0f172a", color: "#fff", borderColor: "#0f172a" } : {}}
              onClick={() => switchRole("admin")}
            >
              <FaUserShield /> Admin
            </button>
          </div>

          <span
            className={`form-header-badge ${isStudentMode ? "student" : "teacher"}`}
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
              ? "Sign in using your Roll Number or university email"
              : "Sign in with your faculty department credentials"}
          </p>

          {error && (
            <div className="login-error-alert">
              <FaExclamationCircle />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-inner-form">
            <div className="field-group">
              <label className="input-label-text">
                {isStudentMode ? "Roll Number or Student Email" : "Username"}
              </label>
              <div
                className={`username-cont ${
                  isStudentMode ? "student-focus" : "teacher-focus"
                }`}
              >
                {isStudentMode ? (
                  <FaIdCard className="login-field-icon" />
                ) : (
                  <FaUser className="login-field-icon" />
                )}
                <input
                  type="text"
                  placeholder={
                    isAdminMode
                      ? "Enter admin username (admin)"
                      : isStudentMode
                      ? "Enter Roll No (e.g. STU-2024-001)"
                      : "Enter faculty username (e.g. madam)"
                  }
                  value={username}
                  required
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
                  isStudentMode ? "student-focus" : "teacher-focus"
                }`}
              >
                <FaLock className="login-field-icon" />
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  required
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
              <button
                type="button"
                className="autofill-demo-btn"
                onClick={handleAutofillDemo}
              >
                <FaBolt /> Auto-Fill Demo
              </button>
            </div>

            <button
              type="submit"
              className={`login-submit-btn ${isStudentMode ? "student-btn" : ""}`}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span>
                  <i className="fa-solid fa-spinner fa-spin"></i> Authenticating...
                </span>
              ) : (
                <span>Sign In to Portal →</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;