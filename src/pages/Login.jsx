import { useState, useEffect } from "react";
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
  FaEye,
  FaEyeSlash,
  FaArrowRight,
  FaShieldAlt,
  FaUniversity,
  FaMagic,
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
  const [showPassword, setShowPassword] = useState(false);

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

  // Quick Demo Auto-fill Helper
  const handleQuickFill = () => {
    setError("");
    if (activeRole === "student") {
      setUsername("STU001");
      setPassword("Student@123");
    } else if (activeRole === "admin") {
      setUsername("ADMIN01");
      setPassword("Admin@123");
    } else {
      setUsername("FAC001");
      setPassword("Teacher@123");
    }
  };

  const handleTestBackend = async () => {
    setPingStatus({
      state: "testing",
      message: "Testing server connection...",
    });
    const res = await pingBackend();
    if (res.ok) {
      setPingStatus({
        state: "success",
        message: "Server is online & responding!",
      });
    } else {
      setPingStatus({
        state: "error",
        message:
          res.error ||
          "Server is offline or starting up; retry in 15 seconds.",
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
          text: "Student account requires activation: Enter your activation token and set a password.",
        });
      } else {
        setError(res.message || "Invalid credentials. Please verify your details.");
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
      setActivationMsg({ type: "error", text: "Password must be at least 8 characters long." });
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
      const detail = err.response?.data?.detail || "Account activation failed. Please check your token.";
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
          text: `Activation token generated: ${res.data.activation_token}. Copied to form!`,
        });
      } else {
        setActivationMsg({
          type: "success",
          text: res.data?.detail || "Token request submitted to department administrator.",
        });
        setShowRequestToken(false);
      }
    } catch (err) {
      setIsRequestingToken(false);
      setActivationMsg({
        type: "error",
        text: err.response?.data?.detail || "Could not generate activation token.",
      });
    }
  };

  const isStudentMode = activeRole === "student";
  const isAdminMode = activeRole === "admin";

  const getPortalTitle = () => {
    if (isAdminMode) return "System Administration";
    if (isStudentMode) return "Student Academic Portal";
    return "Faculty Management System";
  };

  const getPortalDescription = () => {
    if (isAdminMode) {
      return "Centralized management of departments, academic curriculum, faculty assignments, system audits, and institution controls.";
    }
    if (isStudentMode) {
      return "Access your verified real-time attendance, biometric check-ins, exam hall tickets, semester grades, and department notifications.";
    }
    return "Streamline student enrollments, launch anti-proxy QR attendance sessions, evaluate grades, and monitor real-time class analytics.";
  };

  return (
    <div className="login-page-bg">
      {/* Ambient background glow elements */}
      <div className="ambient-glow glow-1" />
      <div className="ambient-glow glow-2" />

      <div className="login-container">
        {/* ============================================================== */}
        {/* LEFT BRANDING HERO PANEL                                       */}
        {/* ============================================================== */}
        <div
          className={`login-left ${
            isStudentMode ? "student-mode" : isAdminMode ? "admin-mode" : "teacher-mode"
          }`}
        >
          <div className="login-branding-content">
            <div className="login-badge-header">
              <span className="portal-mini-pill">
                <FaUniversity /> Smart Campus Suite
              </span>
              <span className="security-mini-pill">
                <FaShieldAlt /> AI Biometrics
              </span>
            </div>

            <div className="login-hero-icon-wrap">
              {isAdminMode ? (
                <FaUserShield />
              ) : isStudentMode ? (
                <FaGraduationCap />
              ) : (
                <FaChalkboardTeacher />
              )}
            </div>

            <h2 className="login-brand-title">{getPortalTitle()}</h2>
            <p className="login-brand-desc">{getPortalDescription()}</p>

            <div className="login-features-wrap">
              <div className="feature-item">
                <div className="feature-bullet">
                  <FaCheckCircle />
                </div>
                <span>
                  {isAdminMode
                    ? "Full user privileges & faculty access controls"
                    : isStudentMode
                    ? "Anti-proxy live QR + AI facial recognition check-in"
                    : "Geofenced dynamic QR code attendance sessions"}
                </span>
              </div>
              <div className="feature-item">
                <div className="feature-bullet">
                  <FaCheckCircle />
                </div>
                <span>
                  {isAdminMode
                    ? "Institutional security audits & session tracking"
                    : isStudentMode
                    ? "Real-time 75% attendance threshold monitoring"
                    : "Instant facial enrollment with 128-d biometrics"}
                </span>
              </div>
              <div className="feature-item">
                <div className="feature-bullet">
                  <FaCheckCircle />
                </div>
                <span>
                  {isAdminMode
                    ? "Class cohort scheduling & branch configuration"
                    : isStudentMode
                    ? "Digital examination hall tickets & CGPA cards"
                    : "Automated shortage warning dispatch via SMS & Email"}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Demo Credentials Footer Pill */}
          <div className="login-demo-helper-box">
            <div className="demo-helper-header">
              <span className="demo-tag">
                <FaMagic /> Quick Demo Access
              </span>
              <button
                type="button"
                className="btn-autofill"
                onClick={handleQuickFill}
                title="Fill credentials for this role"
              >
                Auto-fill Creds
              </button>
            </div>
            <div className="demo-helper-body">
              <span>
                User:{" "}
                <code>
                  {isAdminMode ? "ADMIN01" : isStudentMode ? "STU001" : "FAC001"}
                </code>
              </span>
              <span>
                Pass:{" "}
                <code>
                  {isAdminMode
                    ? "Admin@123"
                    : isStudentMode
                    ? "Student@123"
                    : "Teacher@123"}
                </code>
              </span>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* RIGHT LOGIN / ACTIVATION FORM CARD                             */}
        {/* ============================================================== */}
        <div className="login-right">
          {/* Role Navigation Segmented Tabs */}
          <div className="role-tabs-container">
            <button
              type="button"
              className={`role-tab-btn ${activeRole === "teacher" ? "active teacher" : ""}`}
              onClick={() => switchRole("teacher")}
            >
              <FaChalkboardTeacher />
              <span>Faculty</span>
            </button>
            <button
              type="button"
              className={`role-tab-btn ${activeRole === "student" ? "active student" : ""}`}
              onClick={() => switchRole("student")}
            >
              <FaGraduationCap />
              <span>Student</span>
            </button>
            <button
              type="button"
              className={`role-tab-btn ${activeRole === "admin" ? "active admin" : ""}`}
              onClick={() => switchRole("admin")}
            >
              <FaUserShield />
              <span>Admin</span>
            </button>
          </div>

          {/* Form Header Info */}
          <div className="login-header-group">
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
                ? "Enter your identifier and activation token to set your secure password."
                : showRequestToken
                ? "Enter your student ID to generate or receive your activation token."
                : "Sign in with your verified institutional account to continue."}
            </p>
          </div>

          {/* Error & Feedback Alerts */}
          {error && (
            <div className="login-alert-box alert-error">
              <FaExclamationCircle className="alert-icon" />
              <span>{error}</span>
            </div>
          )}

          {activationMsg.text && (
            <div
              className={`login-alert-box ${
                activationMsg.type === "success"
                  ? "alert-success"
                  : activationMsg.type === "info"
                  ? "alert-info"
                  : "alert-error"
              }`}
            >
              {activationMsg.type === "success" ? (
                <FaCheckCircle className="alert-icon" />
              ) : (
                <FaExclamationCircle className="alert-icon" />
              )}
              <span>{activationMsg.text}</span>
            </div>
          )}

          {/* ============================================================== */}
          {/* SUB-FLOW: ACCOUNT ACTIVATION                                  */}
          {/* ============================================================== */}
          {showActivation ? (
            <form onSubmit={handleActivateSubmit} className="login-form-body" autoComplete="off">
              <div className="form-group">
                <label className="input-field-label">Student ID or Roll Number</label>
                <div className="input-control-wrap student-theme">
                  <FaIdCard className="field-adornment-icon" />
                  <input
                    type="text"
                    placeholder="e.g. STU001 or STU-2024-001"
                    value={activationIdentifier}
                    required
                    onChange={(e) => setActivationIdentifier(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="input-field-label">Security Activation Token</label>
                <div className="input-control-wrap student-theme">
                  <FaKey className="field-adornment-icon" />
                  <input
                    type="text"
                    placeholder="Enter 32+ character activation token"
                    value={activationToken}
                    required
                    onChange={(e) => setActivationToken(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="input-field-label">New Secure Password</label>
                <div className="input-control-wrap student-theme">
                  <FaLock className="field-adornment-icon" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimum 8 characters"
                    value={newPassword}
                    required
                    autoComplete="new-password"
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-toggle-eye"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="input-field-label">Confirm New Password</label>
                <div className="input-control-wrap student-theme">
                  <FaLock className="field-adornment-icon" />
                  <input
                    type={showPassword ? "text" : "password"}
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
                className="btn-submit-login student-theme-btn"
                disabled={isActivating}
              >
                {isActivating ? (
                  <>
                    <FaSyncAlt className="spin-icon" /> Activating Account...
                  </>
                ) : (
                  <>
                    <span>Activate Account & Sign In</span>
                    <FaArrowRight />
                  </>
                )}
              </button>

              <div className="auth-helper-links">
                <button
                  type="button"
                  className="link-btn-text"
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
                  className="link-btn-muted"
                  onClick={() => setShowActivation(false)}
                >
                  ← Return to Sign In
                </button>
              </div>
            </form>
          ) : showRequestToken ? (
            /* ============================================================== */
            /* SUB-FLOW: REQUEST TOKEN                                        */
            /* ============================================================== */
            <form onSubmit={handleRequestToken} className="login-form-body" autoComplete="off">
              <div className="form-group">
                <label className="input-field-label">Student ID or Roll Number</label>
                <div className="input-control-wrap student-theme">
                  <FaIdCard className="field-adornment-icon" />
                  <input
                    type="text"
                    placeholder="e.g. STU001 or STU-2024-001"
                    value={reqIdentifier}
                    required
                    onChange={(e) => setReqIdentifier(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="input-field-label">Institutional Email (Optional)</label>
                <div className="input-control-wrap student-theme">
                  <FaEnvelope className="field-adornment-icon" />
                  <input
                    type="email"
                    placeholder="e.g. student@college.edu"
                    value={reqEmail}
                    onChange={(e) => setReqEmail(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-submit-login student-theme-btn"
                disabled={isRequestingToken}
              >
                {isRequestingToken ? (
                  <>
                    <FaSyncAlt className="spin-icon" /> Generating Token...
                  </>
                ) : (
                  <>
                    <span>Request Activation Token</span>
                    <FaArrowRight />
                  </>
                )}
              </button>

              <div className="auth-helper-links centered">
                <button
                  type="button"
                  className="link-btn-text"
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
            /* ============================================================== */
            /* STANDARD ROLE SIGN IN FORM                                    */
            /* ============================================================== */
            <form onSubmit={handleSubmit} className="login-form-body" autoComplete="off">
              <div className="form-group">
                <label className="input-field-label">
                  {isAdminMode
                    ? "Administrator Username"
                    : isStudentMode
                    ? "Student ID or Roll Number"
                    : "Faculty Username or Email"}
                </label>
                <div
                  className={`input-control-wrap ${
                    isAdminMode
                      ? "admin-theme"
                      : isStudentMode
                      ? "student-theme"
                      : "teacher-theme"
                  }`}
                >
                  {isAdminMode ? (
                    <FaUserShield className="field-adornment-icon" />
                  ) : isStudentMode ? (
                    <FaIdCard className="field-adornment-icon" />
                  ) : (
                    <FaUser className="field-adornment-icon" />
                  )}
                  <input
                    type="text"
                    placeholder={
                      isAdminMode
                        ? "Enter admin username"
                        : isStudentMode
                        ? "e.g. STU001 or roll number"
                        : "e.g. FAC001 or faculty email"
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

              <div className="form-group">
                <div className="label-with-action">
                  <label className="input-field-label">Password</label>
                  {isStudentMode && (
                    <button
                      type="button"
                      className="inline-action-link"
                      onClick={() => {
                        setShowActivation(true);
                        setActivationIdentifier(username);
                      }}
                    >
                      First time? Activate Account
                    </button>
                  )}
                </div>
                <div
                  className={`input-control-wrap ${
                    isAdminMode
                      ? "admin-theme"
                      : isStudentMode
                      ? "student-theme"
                      : "teacher-theme"
                  }`}
                >
                  <FaLock className="field-adornment-icon" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your account password"
                    value={password}
                    required
                    autoComplete="current-password"
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError("");
                    }}
                  />
                  <button
                    type="button"
                    className="btn-toggle-eye"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>

              <div className="form-meta-row">
                <label className="checkbox-wrap">
                  <input type="checkbox" defaultChecked />
                  <span>Remember session</span>
                </label>
                <button
                  type="button"
                  className="quick-sample-link"
                  onClick={handleQuickFill}
                >
                  Use sample {activeRole} creds
                </button>
              </div>

              {wakeUpNotice && (
                <div className="wakeup-banner">
                  <FaSyncAlt className="spin-icon" />
                  <span>Connecting to cloud backend. Please hold on...</span>
                </div>
              )}

              <button
                type="submit"
                className={`btn-submit-login ${
                  isAdminMode
                    ? "admin-theme-btn"
                    : isStudentMode
                    ? "student-theme-btn"
                    : "teacher-theme-btn"
                }`}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <FaSyncAlt className="spin-icon" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to {activeRole.charAt(0).toUpperCase() + activeRole.slice(1)} Portal</span>
                    <FaArrowRight />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Diagnostic Footer Bar */}
          <div className="login-footer-bar">
            <div className="server-status-pill">
              <span className={`status-led ${isLocalhost ? "local" : "cloud"}`} />
              <span className="server-label">API Server:</span>
              <span className="server-host" title={apiBaseUrl}>
                {apiBaseUrl}
              </span>
            </div>
            <button
              type="button"
              className="btn-ping"
              onClick={handleTestBackend}
              disabled={pingStatus?.state === "testing"}
            >
              {pingStatus?.state === "testing" ? (
                <>
                  <FaSyncAlt className="spin-icon" /> Testing
                </>
              ) : (
                "Ping Server"
              )}
            </button>
          </div>

          {pingStatus && (
            <div className={`ping-feedback-box ${pingStatus.state}`}>
              {pingStatus.state === "success" && <FaCheckCircle />}
              {pingStatus.state === "error" && <FaExclamationTriangle />}
              {pingStatus.state === "testing" && <FaSyncAlt className="spin-icon" />}
              <span>{pingStatus.message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;