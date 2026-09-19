import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "../styles/Login.css";
import {
  FaUser,
  FaLock,
  FaGraduationCap,
  FaChalkboardTeacher,
  FaIdCard,
  FaBolt,
  FaCheckCircle,
  FaExclamationCircle,
} from "react-icons/fa";
import { useAuth, DEFAULT_DEMO_STUDENT } from "../context/AuthContext";

const Login = ({ initialRole }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginTeacher, loginStudent } = useAuth();

  // Determine initial role: prop > URL path > default to 'teacher'
  const getRoleFromLocation = () => {
    if (initialRole) return initialRole;
    const path = location.pathname.toLowerCase();
    if (path.includes("student")) return "student";
    if (path.includes("teacher")) return "teacher";
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get("role") === "student") return "student";
    return "teacher";
  };

  const [activeRole, setActiveRole] = useState(getRoleFromLocation);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync role when URL changes
  useEffect(() => {
    const derivedRole = getRoleFromLocation();
    setActiveRole(derivedRole);
    setError("");
  }, [location.pathname, location.search]);

  const switchRole = (newRole) => {
    setActiveRole(newRole);
    setError("");
    setUsername("");
    setPassword("");
    navigate(`/login/${newRole}`, { replace: true });
  };

  const handleAutofillDemo = () => {
    setError("");
    if (activeRole === "teacher") {
      setUsername("madam");
      setPassword("123456");
    } else {
      setUsername(DEFAULT_DEMO_STUDENT.email);
      setPassword("student123");
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError("");
    setIsSubmitting(true);

    if (activeRole === "teacher") {
      const res = loginTeacher(username, password);
      setIsSubmitting(false);
      if (res.success) {
        navigate("/dashboard");
      } else {
        setError(res.message || "Invalid teacher username or password.");
      }
    } else {
      // Student login
      const res = await loginStudent(username, password);
      setIsSubmitting(false);
      if (res.success) {
        navigate("/student/dashboard");
      } else {
        setError(res.message || "Invalid student credentials. Please try again.");
      }
    }
  };

  const isStudentMode = activeRole === "student";

  return (
    <div className="login-page-bg">
      <div className="login-container">
        {/* Left Branding Panel */}
        <div className={`login-left ${isStudentMode ? "student-mode" : ""}`}>
          <div className="login-branding">
            <div className="login-hero-icon">
              {isStudentMode ? (
                <FaGraduationCap size={44} />
              ) : (
                <FaChalkboardTeacher size={44} />
              )}
            </div>
            <h2>
              {isStudentMode
                ? "STUDENT ACADEMIC PORTAL"
                : "FACULTY MANAGEMENT SYSTEM"}
            </h2>
            <p>
              {isStudentMode
                ? "View your individual course attendance, academic performance, semester grades, and announcements."
                : "Manage student enrollments, record attendance, evaluate grades, and monitor institutional metrics in real time."}
            </p>

            <ul className="login-feature-list">
              {isStudentMode ? (
                <>
                  <li>
                    <FaCheckCircle /> Personal attendance tracking & alerts
                  </li>
                  <li>
                    <FaCheckCircle /> Subject-wise internal & semester marks
                  </li>
                  <li>
                    <FaCheckCircle /> Official student profile & status
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <FaCheckCircle /> Full student directory management
                  </li>
                  <li>
                    <FaCheckCircle /> Daily attendance logging & bulk marking
                  </li>
                  <li>
                    <FaCheckCircle /> Performance gradebook & reports
                  </li>
                </>
              )}
            </ul>
          </div>

          <div className="login-demo-pill">
            <small>
              {isStudentMode ? "Student Demo Credentials" : "Faculty Demo Credentials"}
            </small>
            <span>
              {isStudentMode ? (
                <>
                  Email: <code>alex.johnson@edu.com</code> | Pass: <code>student123</code>
                </>
              ) : (
                <>
                  User: <code>madam</code> (or <code>admin</code>) | Pass: <code>123456</code>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className={`login-form ${isStudentMode ? "student-form-mode" : ""}`}>
          {/* Role Tabs */}
          <div className="role-tabs-container">
            <button
              type="button"
              className={`role-tab-btn ${!isStudentMode ? "active teacher" : ""}`}
              onClick={() => switchRole("teacher")}
            >
              <FaChalkboardTeacher /> Faculty / Teacher
            </button>
            <button
              type="button"
              className={`role-tab-btn ${isStudentMode ? "active student" : ""}`}
              onClick={() => switchRole("student")}
            >
              <FaGraduationCap /> Student Portal
            </button>
          </div>

          <span
            className={`form-header-badge ${isStudentMode ? "student" : "teacher"}`}
          >
            {isStudentMode ? "Student Login" : "Faculty Login"}
          </span>

          <h2>
            {isStudentMode ? "Welcome, Student!" : "Welcome Back, Faculty!"}
          </h2>
          <p className="login-subtitle">
            {isStudentMode
              ? "Sign in using your student email or roll number"
              : "Sign in with your faculty administrator credentials"}
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
                {isStudentMode ? "Student Email or Roll ID" : "Faculty Username"}
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
                    isStudentMode
                      ? "Enter student email or ID (e.g. alex.johnson@edu.com)"
                      : "Enter username (e.g. madam or admin)"
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
                  placeholder={
                    isStudentMode
                      ? "Enter student password (default: student123)"
                      : "Enter password (default: 123456)"
                  }
                  value={password}
                  required
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                />
              </div>
            </div>

            <div className="rem-cont">
              <div className="remember-me">
                <input
                  type="checkbox"
                  id={`rem-${activeRole}`}
                  defaultChecked
                />
                <label htmlFor={`rem-${activeRole}`}>Remember me</label>
              </div>
              <div className="forget-pass">
                <a
                  href="#forgot"
                  onClick={(e) => {
                    e.preventDefault();
                    if (isStudentMode) {
                      alert(
                        "Student password assistance:\nDefault password is 'student123' or your registered phone number.\nContact college registrar if you need help."
                      );
                    } else {
                      alert(
                        "Faculty password assistance:\nDefault login is 'madam' / '123456' or 'admin' / 'admin'."
                      );
                    }
                  }}
                >
                  Forgot password?
                </a>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`login-submit-btn ${
                isStudentMode ? "student-btn" : "teacher-btn"
              }`}
            >
              {isSubmitting ? (
                "Signing In..."
              ) : isStudentMode ? (
                <>
                  <FaGraduationCap /> Enter Student Portal
                </>
              ) : (
                <>
                  <FaChalkboardTeacher /> Login to Faculty Dashboard
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Autofill */}
          <div className="quick-fill-box">
            <span className="quick-fill-text">
              Testing? Autofill demo credentials:
            </span>
            <button
              type="button"
              className="quick-fill-btn"
              onClick={handleAutofillDemo}
            >
              <FaBolt style={{ color: "#eab308" }} />
              Autofill {isStudentMode ? "Student" : "Faculty"}
            </button>
          </div>

          <div className="switch-portal-link">
            {isStudentMode ? (
              <span>
                Are you a faculty member?{" "}
                <button type="button" onClick={() => switchRole("teacher")}>
                  Switch to Teacher Login →
                </button>
              </span>
            ) : (
              <span>
                Are you an enrolled student?{" "}
                <button type="button" onClick={() => switchRole("student")}>
                  Switch to Student Login →
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;