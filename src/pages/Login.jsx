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
  FaKey,
  FaCheckCircle,
  FaExclamationCircle,
  FaExclamationTriangle,
  FaSyncAlt,
  FaEnvelope,
} from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL, pingBackend } from "../services/apiClient";
import {
  activateStudentAccount,
  requestActivationToken,
} from "../services/studentservice";

const Login = ({ initialRole }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginUser, setAuthenticatedUser, apiBaseUrl = API_BASE_URL } = useAuth();
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

  // Student Account Activation States
  const [showActivation, setShowActivation] = useState(false);
  const [activationIdentifier, setActivationIdentifier] = useState("");
  const [activationToken, setActivationToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [activationMsg, setActivationMsg] = useState({ type: "", text: "" });
  const [isActivating, setIsActivating] = useState(false);

  // Request Token Sub-mode
  const [showRequestToken, setShowRequestToken] = useState(false);
  const [reqIdentifier, setReqIdentifier] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [isRequestingToken, setIsRequestingToken] = useState(false);

  const switchRole = (newRole) => {
    setError("");
    setUsername("");
    setPassword("");
    setShowActivation(false);
    setShowRequestToken(false);
    navigate(`/login/${newRole}`, { replace: true });
  };

  const handleTestBackend = async () => {
    setPingStatus({
      state: "testing",
      message: "Testing connection (waking up backend if asleep)...",
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
          "Cannot reach backend. The server may be starting up; try again in 20 seconds.",
      });
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError("");
    setIsSubmitting(true);
    setWakeUpNotice(false);

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
      if (res.needsActivation) {
        setShowActivation(true);
        setActivationIdentifier(res.identifier || username);
        setActivationMsg({
          type: "info",
          text: "Student account requires activation: Please enter your activation token and set a secure password.",
        });
      } else {
        setError(res.message || "Invalid credentials. Please check your credentials.");
      }
    }
  };

  const handleActivateSubmit = async (e) => {
    e.preventDefault();
    setActivationMsg({ type: "", text: "" });

    if (!activationIdentifier || !activationToken || !newPassword || !confirmPassword) {
      setActivationMsg({ type: "error", text: "All fields are required to activate your account." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setActivationMsg({ type: "error", text: "New passwords do not match." });
      return;
    }

    if (newPassword.length < 8) {
      setActivationMsg({ type: "error", text: "Password must be at least 8 characters long and contain a digit." });
      return;
    }

    setIsActivating(true);
    try {
      const res = await activateStudentAccount({
        identifier: activationIdentifier.trim(),
        activation_token: activationToken.trim(),
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      setIsActivating(false);
      if (res.data?.token) {
        setActivationMsg({
          type: "success",
          text: "Account successfully activated! Signing you in...",
        });
        setAuthenticatedUser(res.data);
        setTimeout(() => {
          navigate("/student/dashboard");
        }, 1200);
      }
    } catch (err) {
      setIsActivating(false);
      const detail = err.response?.data?.detail || "Account activation failed. Please check your token or contact support.";
      setActivationMsg({ type: "error", text: detail });
    }
  };

  const handleRequestToken = async (e) => {
    e.preventDefault();
    setActivationMsg({ type: "", text: "" });

    if (!reqIdentifier) {
      setActivationMsg({ type: "error", text: "Student ID or Roll Number is required." });
      return;
    }

    setIsRequestingToken(true);
    try {
      const res = await requestActivationToken({
        identifier: reqIdentifier.trim(),
        email: reqEmail.trim(),
      });
      setIsRequestingToken(false);

      if (res.data?.activation_token) {
        setActivationToken(res.data.activation_token);
        setActivationIdentifier(reqIdentifier.trim());
        setShowRequestToken(false);
        setActivationMsg({
          type: "success",
          text: `Activation token generated: ${res.data.activation_token}. Token copied to activation form.`,
        });
      } else {
        setActivationMsg({
          type: "success",
          text: res.data?.detail || "Token request submitted. Please check with your institutional administrator.",
        });
        setShowRequestToken(false);
      }
    } catch (err) {
      setIsRequestingToken(false);
      setActivationMsg({
        type: "error",
        text: err.response?.data?.detail || "Could not generate activation token. Please verify your student ID.",
      });
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
                    <FaCheckCircle /> Institutional audit logging & security
                  </li>
                  <li>
                    <FaCheckCircle /> Department and timetable orchestration
                  </li>
                </>
              ) : isStudentMode ? (
                <>
                  <li>
                    <FaCheckCircle /> Live QR code class attendance marking
                  </li>
                  <li>
                    <FaCheckCircle /> Real-time 75% attendance shortage alerts
                  </li>
                  <li>
                    <FaCheckCircle /> Semester SGPA / CGPA report cards
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <FaCheckCircle /> Dynamic QR attendance sessions
                  </li>
                  <li>
                    <FaCheckCircle /> Course evaluation & marks grading
                  </li>
                  <li>
                    <FaCheckCircle /> Daily attendance rosters & class analytics
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>

        {/* Right Form Card */}
        <div className="login-right">
          {/* Role Navigation Tabs */}
          <div className="login-role-tabs">
            <button
              type="button"
              className={`role-tab ${activeRole === "teacher" ? "active teacher" : ""}`}
              onClick={() => switchRole("teacher")}
            >
              <FaChalkboardTeacher /> Faculty
            </button>
            <button
              type="button"
              className={`role-tab ${activeRole === "student" ? "active student" : ""}`}
              onClick={() => switchRole("student")}
            >
              <FaGraduationCap /> Student
            </button>
            <button
              type="button"
              className={`role-tab ${activeRole === "admin" ? "active admin" : ""}`}
              onClick={() => switchRole("admin")}
            >
              <FaUserShield /> Administrator
            </button>
          </div>

          <h3 className="login-form-title">
            {showActivation
              ? "Activate Student Account"
              : showRequestToken
              ? "Request Activation Token"
              : isAdminMode
              ? "Administrator Sign In"
              : isStudentMode
              ? "Student Portal Sign In"
              : "Faculty Portal Sign In"}
          </h3>
          <p className="login-form-subtitle">
            {showActivation
              ? "Enter your student identifier and activation token to set your secure password."
              : showRequestToken
              ? "Enter your Student ID to receive or generate your activation credentials."
              : "Enter your institutional credentials below to access your account."}
          </p>

          {error && (
            <div className="login-error-alert">
              <FaExclamationCircle />
              <span>{error}</span>
            </div>
          )}

          {activationMsg.text && (
            <div
              className={`login-error-alert ${
                activationMsg.type === "success"
                  ? "alert-success"
                  : activationMsg.type === "info"
                  ? "alert-info"
                  : ""
              }`}
              style={{
                backgroundColor:
                  activationMsg.type === "success"
                    ? "#064e3b"
                    : activationMsg.type === "info"
                    ? "#1e3a8a"
                    : undefined,
                color: "#fff",
              }}
            >
              {activationMsg.type === "success" ? (
                <FaCheckCircle />
              ) : (
                <FaExclamationCircle />
              )}
              <span>{activationMsg.text}</span>
            </div>
          )}

          {/* Account Activation Mode */}
          {showActivation ? (
            <form onSubmit={handleActivateSubmit} className="login-inner-form" autoComplete="off">
              <div className="field-group">
                <label className="input-label-text">Student ID or Roll Number</label>
                <div className="username-cont student-focus">
                  <FaIdCard className="login-field-icon" />
                  <input
                    type="text"
                    placeholder="e.g. STU20240001 or STU-2024-001"
                    value={activationIdentifier}
                    required
                    onChange={(e) => setActivationIdentifier(e.target.value)}
                  />
                </div>
              </div>

              <div className="field-group">
                <label className="input-label-text">Security Activation Token</label>
                <div className="username-cont student-focus">
                  <FaKey className="login-field-icon" />
                  <input
                    type="text"
                    placeholder="Enter 32+ character activation token"
                    value={activationToken}
                    required
                    onChange={(e) => setActivationToken(e.target.value)}
                  />
                </div>
              </div>

              <div className="field-group">
                <label className="input-label-text">New Secure Password</label>
                <div className="password-cont student-focus">
                  <FaLock className="login-field-icon" />
                  <input
                    type="password"
                    placeholder="Min 8 characters with numbers"
                    value={newPassword}
                    required
                    autoComplete="new-password"
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="field-group">
                <label className="input-label-text">Confirm New Password</label>
                <div className="password-cont student-focus">
                  <FaLock className="login-field-icon" />
                  <input
                    type="password"
                    placeholder="Re-enter your new password"
                    value={confirmPassword}
                    required
                    autoComplete="new-password"
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="login-submit-btn student-btn"
                disabled={isActivating}
              >
                {isActivating ? (
                  <span>
                    <FaSyncAlt className="spin-icon" /> Activating Account...
                  </span>
                ) : (
                  <span>Activate Account & Sign In →</span>
                )}
              </button>

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", fontSize: "0.85rem" }}>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "#60a5fa", cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => {
                    setShowRequestToken(true);
                    setShowActivation(false);
                    setReqIdentifier(activationIdentifier);
                  }}
                >
                  Need an activation token?
                </button>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}
                  onClick={() => setShowActivation(false)}
                >
                  ← Return to Sign In
                </button>
              </div>
            </form>
          ) : showRequestToken ? (
            /* Request Token Mode */
            <form onSubmit={handleRequestToken} className="login-inner-form" autoComplete="off">
              <div className="field-group">
                <label className="input-label-text">Student ID or Roll Number</label>
                <div className="username-cont student-focus">
                  <FaIdCard className="login-field-icon" />
                  <input
                    type="text"
                    placeholder="e.g. STU20240001 or STU-2024-001"
                    value={reqIdentifier}
                    required
                    onChange={(e) => setReqIdentifier(e.target.value)}
                  />
                </div>
              </div>

              <div className="field-group">
                <label className="input-label-text">Institutional Email (Optional)</label>
                <div className="username-cont student-focus">
                  <FaEnvelope className="login-field-icon" />
                  <input
                    type="email"
                    placeholder="e.g. yourname@college.edu"
                    value={reqEmail}
                    onChange={(e) => setReqEmail(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="login-submit-btn student-btn"
                disabled={isRequestingToken}
              >
                {isRequestingToken ? (
                  <span>
                    <FaSyncAlt className="spin-icon" /> Generating Token...
                  </span>
                ) : (
                  <span>Request Activation Token →</span>
                )}
              </button>

              <div style={{ textAlign: "center", marginTop: "12px", fontSize: "0.85rem" }}>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "#60a5fa", cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => {
                    setShowRequestToken(false);
                    setShowActivation(true);
                  }}
                >
                  Already have a token? Activate Account
                </button>
              </div>
            </form>
          ) : (
            /* Standard Sign In Form */
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
                    placeholder="Enter your password"
                    value={password}
                    required
                    autoComplete="current-password"
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError("");
                    }}
                  />
                </div>
              </div>

              {isStudentMode && (
                <div style={{ textAlign: "right", marginTop: "-6px", marginBottom: "10px" }}>
                  <button
                    type="button"
                    style={{ background: "none", border: "none", color: "#38bdf8", cursor: "pointer", fontSize: "0.82rem", textDecoration: "underline" }}
                    onClick={() => {
                      setShowActivation(true);
                      setActivationIdentifier(username);
                    }}
                  >
                    First time? Activate Student Account
                  </button>
                </div>
              )}

              <div className="form-secondary-row">
                <label className="remember-me-label">
                  <input type="checkbox" defaultChecked /> Remember session
                </label>
              </div>

              {wakeUpNotice && (
                <div className="render-wakeup-notice">
                  <FaSyncAlt className="spin-icon" />
                  <span>Connecting to backend services. Please wait...</span>
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
          )}

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
                    <FaSyncAlt className="spin-icon" /> Testing...
                  </span>
                ) : (
                  <span>Test Connection</span>
                )}
              </button>
            </div>
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