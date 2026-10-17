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
  FaEye,
  FaEyeSlash,
  FaArrowRight,
  FaShieldAlt,
  FaUniversity,
  FaMagic,
  FaPaperPlane,
} from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL, pingBackend } from "../services/apiClient";
import {
  activateStudentAccount,
  requestActivationToken,
  setStudentPassword,
  forgotPassword,
  resetPassword,
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
    return "student";
  };

  const activeRole = getRoleFromLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Active Screen Mode: 'login' | 'set_password' | 'forgot_password' | 'token_activate' | 'request_token'
  const [mode, setMode] = useState("login");

  // 1. Set Initial Password State (Student ID based)
  const [setId, setSetId] = useState("");
  const [setNewPw, setSetNewPw] = useState("");
  const [setConfirmPw, setSetConfirmPw] = useState("");
  const [setPasswordMsg, setSetPasswordMsg] = useState({ type: "", text: "" });
  const [isSettingPassword, setIsSettingPassword] = useState(false);

  // 2. Forgot Password State (Email OTP based)
  const [forgotStep, setForgotStep] = useState(1); // 1 = enter identifier & request OTP, 2 = enter OTP & new password
  const [forgotIdent, setForgotIdent] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [devOtp, setDevOtp] = useState(null);
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotNewPw, setForgotNewPw] = useState("");
  const [forgotConfirmPw, setForgotConfirmPw] = useState("");
  const [forgotMsg, setForgotMsg] = useState({ type: "", text: "" });
  const [isForgotLoading, setIsForgotLoading] = useState(false);

  // 3. Token Activation (Legacy Fallback)
  const [activationToken, setActivationToken] = useState("");
  const [legacyIdent, setLegacyIdent] = useState("");
  const [legacyPw, setLegacyPw] = useState("");
  const [legacyConfirmPw, setLegacyConfirmPw] = useState("");
  const [legacyMsg, setLegacyMsg] = useState({ type: "", text: "" });
  const [isLegacyActivating, setIsLegacyActivating] = useState(false);

  // 4. Request Token Sub-mode
  const [reqIdentifier, setReqIdentifier] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [isRequestingToken, setIsRequestingToken] = useState(false);

  const resetAllFeedback = () => {
    setError("");
    setSetPasswordMsg({ type: "", text: "" });
    setForgotMsg({ type: "", text: "" });
    setLegacyMsg({ type: "", text: "" });
  };

  const switchRole = (newRole) => {
    resetAllFeedback();
    setUsername("");
    setPassword("");
    setMode("login");
    navigate(`/login/${newRole}`, { replace: true });
  };

  // Quick Demo Auto-fill Helper
  const handleQuickFill = () => {
    resetAllFeedback();
    if (activeRole === "student") {
      setUsername("STU20240001");
      setPassword("student123");
    } else if (activeRole === "admin") {
      setUsername("admin");
      setPassword("admin123");
    } else {
      setUsername("madam");
      setPassword("123456");
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

  // ==============================================================
  // 1. STANDARD LOGIN HANDLER
  // ==============================================================
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    resetAllFeedback();
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
      // If student account needs activation / password has not been created yet
      if (res.needsPasswordSetup || res.needsActivation) {
        setMode("set_password");
        setSetId(res.studentId || res.identifier || username);
        setSetPasswordMsg({
          type: "info",
          text: "Student account requires initial setup: Please enter your Student ID and create your secure password.",
        });
      } else {
        setError(res.message || "Invalid credentials. Please verify your details.");
      }
    }
  };

  // ==============================================================
  // 2. SET PASSWORD (STUDENT ID FLOW)
  // ==============================================================
  const handleSetPasswordSubmit = async (e) => {
    e.preventDefault();
    setSetPasswordMsg({ type: "", text: "" });

    const trimmedId = setId.trim();
    if (!trimmedId) {
      setSetPasswordMsg({ type: "error", text: "Please enter your Student ID or Roll Number." });
      return;
    }

    if (!setNewPw || !setConfirmPw) {
      setSetPasswordMsg({ type: "error", text: "Please enter and confirm your new password." });
      return;
    }

    if (setNewPw !== setConfirmPw) {
      setSetPasswordMsg({ type: "error", text: "Passwords do not match." });
      return;
    }

    if (setNewPw.length < 8) {
      setSetPasswordMsg({ type: "error", text: "Password must be at least 8 characters long." });
      return;
    }

    setIsSettingPassword(true);
    try {
      const res = await setStudentPassword({
        student_id: trimmedId,
        new_password: setNewPw,
        confirm_password: setConfirmPw,
      });

      setIsSettingPassword(false);
      if (res.data?.token) {
        setSetPasswordMsg({
          type: "success",
          text: "Password set and saved to database successfully! Signing you in...",
        });
        setAuthenticatedUser(res.data);
        setTimeout(() => {
          navigate("/student/dashboard");
        }, 1200);
      } else {
        setSetPasswordMsg({
          type: "success",
          text: res.data?.detail || "Password set successfully! You can now log in.",
        });
        setTimeout(() => {
          setMode("login");
          setUsername(trimmedId);
        }, 1500);
      }
    } catch (err) {
      setIsSettingPassword(false);
      const detail = err.response?.data?.detail || "Could not set password. Please check your Student ID.";
      setSetPasswordMsg({ type: "error", text: detail });
    }
  };

  // ==============================================================
  // 3. FORGOT PASSWORD FLOW (EMAIL OTP)
  // ==============================================================
  const handleForgotRequestOtp = async (e) => {
    e.preventDefault();
    setForgotMsg({ type: "", text: "" });

    const trimmedIdent = forgotIdent.trim();
    if (!trimmedIdent) {
      setForgotMsg({ type: "error", text: "Please enter your Student ID, Roll Number, or registered email." });
      return;
    }

    setIsForgotLoading(true);
    try {
      const res = await forgotPassword({ identifier: trimmedIdent });
      setIsForgotLoading(false);

      setMaskedEmail(res.data.email_masked || "your email");
      setDevOtp(res.data.dev_otp || null);
      setForgotStep(2);
      setForgotMsg({
        type: "success",
        text: res.data.detail || `Verification code sent to ${res.data.email_masked}!`,
      });
    } catch (err) {
      setIsForgotLoading(false);
      const detail = err.response?.data?.detail || "No account found matching this Student ID or email.";
      setForgotMsg({ type: "error", text: detail });
    }
  };

  const handleForgotResetSubmit = async (e) => {
    e.preventDefault();
    setForgotMsg({ type: "", text: "" });

    const trimmedIdent = forgotIdent.trim();
    const trimmedOtp = forgotOtp.trim();

    if (!trimmedOtp || trimmedOtp.length < 4) {
      setForgotMsg({ type: "error", text: "Please enter the 6-digit verification code sent to your email." });
      return;
    }

    if (!forgotNewPw || !forgotConfirmPw) {
      setForgotMsg({ type: "error", text: "Please enter and confirm your new password." });
      return;
    }

    if (forgotNewPw !== forgotConfirmPw) {
      setForgotMsg({ type: "error", text: "Passwords do not match." });
      return;
    }

    if (forgotNewPw.length < 8) {
      setForgotMsg({ type: "error", text: "New password must be at least 8 characters long." });
      return;
    }

    setIsForgotLoading(true);
    try {
      const res = await resetPassword({
        identifier: trimmedIdent,
        otp: trimmedOtp,
        new_password: forgotNewPw,
        confirm_password: forgotConfirmPw,
      });

      setIsForgotLoading(false);
      setForgotMsg({
        type: "success",
        text: "Password updated successfully in database! Redirecting to sign in...",
      });

      if (res.data?.token) {
        setAuthenticatedUser(res.data);
        setTimeout(() => {
          navigate(res.data.role === "student" ? "/student/dashboard" : "/dashboard");
        }, 1200);
      } else {
        setTimeout(() => {
          setMode("login");
          setUsername(trimmedIdent);
          setError("");
        }, 1500);
      }
    } catch (err) {
      setIsForgotLoading(false);
      const detail = err.response?.data?.detail || "Password reset failed. Please verify your OTP code.";
      setForgotMsg({ type: "error", text: detail });
    }
  };

  // ==============================================================
  // 4. LEGACY TOKEN ACTIVATION (OPTIONAL FALLBACK)
  // ==============================================================
  const handleLegacyActivateSubmit = async (e) => {
    e.preventDefault();
    setLegacyMsg({ type: "", text: "" });

    if (!legacyIdent || !activationToken || !legacyPw || !legacyConfirmPw) {
      setLegacyMsg({ type: "error", text: "All fields are required to activate your account." });
      return;
    }

    if (legacyPw !== legacyConfirmPw) {
      setLegacyMsg({ type: "error", text: "New passwords do not match." });
      return;
    }

    if (legacyPw.length < 8) {
      setLegacyMsg({ type: "error", text: "Password must be at least 8 characters long." });
      return;
    }

    setIsLegacyActivating(true);
    try {
      const res = await activateStudentAccount({
        identifier: legacyIdent.trim(),
        activation_token: activationToken.trim(),
        new_password: legacyPw,
        confirm_password: legacyConfirmPw,
      });

      setIsLegacyActivating(false);
      if (res.data?.token) {
        setLegacyMsg({
          type: "success",
          text: "Account successfully activated! Signing you in...",
        });
        setAuthenticatedUser(res.data);
        setTimeout(() => {
          navigate("/student/dashboard");
        }, 1200);
      }
    } catch (err) {
      setIsLegacyActivating(false);
      const detail = err.response?.data?.detail || "Account activation failed. Please check your token.";
      setLegacyMsg({ type: "error", text: detail });
    }
  };

  const handleRequestToken = async (e) => {
    e.preventDefault();
    setLegacyMsg({ type: "", text: "" });

    if (!reqIdentifier) {
      setLegacyMsg({ type: "error", text: "Student ID or Roll Number is required." });
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
        setLegacyIdent(reqIdentifier.trim());
        setMode("token_activate");
        setLegacyMsg({
          type: "success",
          text: `Activation token generated: ${res.data.activation_token}. Copied to form!`,
        });
      } else {
        setLegacyMsg({
          type: "success",
          text: res.data?.detail || "Token request submitted.",
        });
        setMode("token_activate");
      }
    } catch (err) {
      setIsRequestingToken(false);
      setLegacyMsg({
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
                  {isAdminMode ? "admin" : isStudentMode ? "STU20240001" : "madam"}
                </code>
              </span>
              <span>
                Pass:{" "}
                <code>
                  {isAdminMode
                    ? "admin123"
                    : isStudentMode
                    ? "student123"
                    : "123456"}
                </code>
              </span>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* RIGHT LOGIN / PASSWORD MANAGEMENT FORM CARD                    */}
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
              {mode === "set_password"
                ? "Set Student Account Password"
                : mode === "forgot_password"
                ? forgotStep === 1
                  ? "Forgot Your Password?"
                  : "Verify OTP & Reset Password"
                : mode === "token_activate"
                ? "Activate with Token"
                : mode === "request_token"
                ? "Request Activation Token"
                : isAdminMode
                ? "Administrator Sign In"
                : isStudentMode
                ? "Student Portal Sign In"
                : "Faculty Portal Sign In"}
            </h3>
            <p className="login-form-subtitle">
              {mode === "set_password"
                ? "Enter your Student ID sent by the administrator to set your password and activate your account."
                : mode === "forgot_password"
                ? forgotStep === 1
                  ? "Enter your Student ID or registered email. We will send a 6-digit password reset code to your email."
                  : `Enter the 6-digit verification code sent to ${maskedEmail} and choose your new password.`
                : mode === "token_activate"
                ? "Activate account with administrative security token."
                : mode === "request_token"
                ? "Generate or request a token from the department."
                : isStudentMode
                ? "Sign in with your Student ID and password to access your academic dashboard."
                : "Sign in with your verified institutional account to continue."}
            </p>
          </div>

          {/* Error & Feedback Alerts */}
          {error && mode === "login" && (
            <div className="login-alert-box alert-error">
              <FaExclamationCircle className="alert-icon" />
              <span>{error}</span>
            </div>
          )}

          {setPasswordMsg.text && mode === "set_password" && (
            <div
              className={`login-alert-box ${
                setPasswordMsg.type === "success"
                  ? "alert-success"
                  : setPasswordMsg.type === "info"
                  ? "alert-info"
                  : "alert-error"
              }`}
            >
              {setPasswordMsg.type === "success" ? (
                <FaCheckCircle className="alert-icon" />
              ) : (
                <FaExclamationCircle className="alert-icon" />
              )}
              <span>{setPasswordMsg.text}</span>
            </div>
          )}

          {forgotMsg.text && mode === "forgot_password" && (
            <div
              className={`login-alert-box ${
                forgotMsg.type === "success" ? "alert-success" : "alert-error"
              }`}
            >
              {forgotMsg.type === "success" ? (
                <FaCheckCircle className="alert-icon" />
              ) : (
                <FaExclamationCircle className="alert-icon" />
              )}
              <span>{forgotMsg.text}</span>
            </div>
          )}

          {legacyMsg.text && (mode === "token_activate" || mode === "request_token") && (
            <div
              className={`login-alert-box ${
                legacyMsg.type === "success" ? "alert-success" : "alert-error"
              }`}
            >
              {legacyMsg.type === "success" ? (
                <FaCheckCircle className="alert-icon" />
              ) : (
                <FaExclamationCircle className="alert-icon" />
              )}
              <span>{legacyMsg.text}</span>
            </div>
          )}

          {/* ============================================================== */}
          {/* MODE 1: SET INITIAL PASSWORD WITH STUDENT ID                   */}
          {/* ============================================================== */}
          {mode === "set_password" ? (
            <form onSubmit={handleSetPasswordSubmit} className="login-form-body" autoComplete="off">
              <div className="form-group">
                <label className="input-field-label">Student ID or Roll Number</label>
                <div className="input-control-wrap student-theme">
                  <FaIdCard className="field-adornment-icon" />
                  <input
                    type="text"
                    placeholder="e.g. STU20240001 or STU-2024-001"
                    value={setId}
                    required
                    onChange={(e) => setSetId(e.target.value)}
                  />
                </div>
                <span className="field-hint-text">
                  Student ID provided to you by your Administrator or institution.
                </span>
              </div>

              <div className="form-group">
                <label className="input-field-label">Create Your Password</label>
                <div className="input-control-wrap student-theme">
                  <FaLock className="field-adornment-icon" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimum 8 characters (at least 1 digit)"
                    value={setNewPw}
                    required
                    autoComplete="new-password"
                    onChange={(e) => setSetNewPw(e.target.value)}
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

              <div className="form-group">
                <label className="input-field-label">Confirm Password</label>
                <div className="input-control-wrap student-theme">
                  <FaLock className="field-adornment-icon" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Re-enter your password to confirm"
                    value={setConfirmPw}
                    required
                    autoComplete="new-password"
                    onChange={(e) => setSetConfirmPw(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-submit-login student-theme-btn"
                disabled={isSettingPassword}
              >
                {isSettingPassword ? (
                  <>
                    <FaSyncAlt className="spin-icon" /> Saving Password to Database...
                  </>
                ) : (
                  <>
                    <span>Set Password & Sign In</span>
                    <FaArrowRight />
                  </>
                )}
              </button>

              <div className="auth-helper-links">
                <button
                  type="button"
                  className="link-btn-text"
                  onClick={() => {
                    resetAllFeedback();
                    setMode("login");
                    if (setId) setUsername(setId);
                  }}
                >
                  ← Return to Sign In
                </button>
                <button
                  type="button"
                  className="link-btn-muted"
                  onClick={() => {
                    resetAllFeedback();
                    setMode("forgot_password");
                    setForgotStep(1);
                    if (setId) setForgotIdent(setId);
                  }}
                >
                  Forgot Password?
                </button>
              </div>
            </form>
          ) : mode === "forgot_password" ? (
            /* ============================================================== */
            /* MODE 2: FORGOT PASSWORD (EMAIL OTP WORKFLOW)                   */
            /* ============================================================== */
            forgotStep === 1 ? (
              // Step 1: Enter Student ID or Registered Email to send OTP
              <form onSubmit={handleForgotRequestOtp} className="login-form-body" autoComplete="off">
                <div className="form-group">
                  <label className="input-field-label">
                    {isStudentMode ? "Student ID or Registered Email" : "Username or Registered Email"}
                  </label>
                  <div
                    className={`input-control-wrap ${
                      isStudentMode ? "student-theme" : isAdminMode ? "admin-theme" : "teacher-theme"
                    }`}
                  >
                    <FaEnvelope className="field-adornment-icon" />
                    <input
                      type="text"
                      placeholder="e.g. STU20240001 or student@gmail.com"
                      value={forgotIdent}
                      required
                      onChange={(e) => setForgotIdent(e.target.value)}
                    />
                  </div>
                  <span className="field-hint-text">
                    We will look up your account and send a 6-digit verification code to your registered email address.
                  </span>
                </div>

                <button
                  type="submit"
                  className={`btn-submit-login ${
                    isStudentMode ? "student-theme-btn" : isAdminMode ? "admin-theme-btn" : "teacher-theme-btn"
                  }`}
                  disabled={isForgotLoading}
                >
                  {isForgotLoading ? (
                    <>
                      <FaSyncAlt className="spin-icon" /> Sending Code to Email...
                    </>
                  ) : (
                    <>
                      <FaPaperPlane />
                      <span>Send 6-Digit Code to Email</span>
                    </>
                  )}
                </button>

                <div className="auth-helper-links centered">
                  <button
                    type="button"
                    className="link-btn-muted"
                    onClick={() => {
                      resetAllFeedback();
                      setMode("login");
                    }}
                  >
                    ← Return to Sign In
                  </button>
                </div>
              </form>
            ) : (
              // Step 2: Enter 6-digit OTP code & new password
              <form onSubmit={handleForgotResetSubmit} className="login-form-body" autoComplete="off">
                <div className="otp-email-banner">
                  <FaEnvelope className="banner-icon" />
                  <div>
                    <strong>Verification code sent!</strong>
                    <div>Check your inbox at <span>{maskedEmail}</span>. Code expires in 15 minutes.</div>
                    {devOtp && (
                      <div className="dev-otp-tag">
                        Demo Mode Hint: OTP is <code>{devOtp}</code>
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label className="input-field-label">6-Digit Verification Code</label>
                  <div
                    className={`input-control-wrap ${
                      isStudentMode ? "student-theme" : isAdminMode ? "admin-theme" : "teacher-theme"
                    }`}
                  >
                    <FaKey className="field-adornment-icon" />
                    <input
                      type="text"
                      placeholder="e.g. 482915"
                      value={forgotOtp}
                      maxLength={6}
                      required
                      className="otp-code-input"
                      onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="input-field-label">New Password</label>
                  <div
                    className={`input-control-wrap ${
                      isStudentMode ? "student-theme" : isAdminMode ? "admin-theme" : "teacher-theme"
                    }`}
                  >
                    <FaLock className="field-adornment-icon" />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Minimum 8 characters (at least 1 digit)"
                      value={forgotNewPw}
                      required
                      autoComplete="new-password"
                      onChange={(e) => setForgotNewPw(e.target.value)}
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
                  <div
                    className={`input-control-wrap ${
                      isStudentMode ? "student-theme" : isAdminMode ? "admin-theme" : "teacher-theme"
                    }`}
                  >
                    <FaLock className="field-adornment-icon" />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Re-enter your new password"
                      value={forgotConfirmPw}
                      required
                      autoComplete="new-password"
                      onChange={(e) => setForgotConfirmPw(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className={`btn-submit-login ${
                    isStudentMode ? "student-theme-btn" : isAdminMode ? "admin-theme-btn" : "teacher-theme-btn"
                  }`}
                  disabled={isForgotLoading}
                >
                  {isForgotLoading ? (
                    <>
                      <FaSyncAlt className="spin-icon" /> Updating Password in Database...
                    </>
                  ) : (
                    <>
                      <span>Reset Password & Sign In</span>
                      <FaArrowRight />
                    </>
                  )}
                </button>

                <div className="auth-helper-links">
                  <button
                    type="button"
                    className="link-btn-text"
                    disabled={isForgotLoading}
                    onClick={handleForgotRequestOtp}
                  >
                    Resend Code
                  </button>
                  <button
                    type="button"
                    className="link-btn-muted"
                    onClick={() => {
                      resetAllFeedback();
                      setMode("login");
                    }}
                  >
                    ← Return to Sign In
                  </button>
                </div>
              </form>
            )
          ) : mode === "token_activate" ? (
            /* ============================================================== */
            /* MODE 3: LEGACY TOKEN ACTIVATION                                */
            /* ============================================================== */
            <form onSubmit={handleLegacyActivateSubmit} className="login-form-body" autoComplete="off">
              <div className="form-group">
                <label className="input-field-label">Student ID or Roll Number</label>
                <div className="input-control-wrap student-theme">
                  <FaIdCard className="field-adornment-icon" />
                  <input
                    type="text"
                    placeholder="e.g. STU20240001 or STU-2024-001"
                    value={legacyIdent}
                    required
                    onChange={(e) => setLegacyIdent(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="input-field-label">Activation Token</label>
                <div className="input-control-wrap student-theme">
                  <FaKey className="field-adornment-icon" />
                  <input
                    type="text"
                    placeholder="Enter security token"
                    value={activationToken}
                    required
                    onChange={(e) => setActivationToken(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="input-field-label">New Password</label>
                <div className="input-control-wrap student-theme">
                  <FaLock className="field-adornment-icon" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimum 8 characters"
                    value={legacyPw}
                    required
                    onChange={(e) => setLegacyPw(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="input-field-label">Confirm Password</label>
                <div className="input-control-wrap student-theme">
                  <FaLock className="field-adornment-icon" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm password"
                    value={legacyConfirmPw}
                    required
                    onChange={(e) => setLegacyConfirmPw(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-submit-login student-theme-btn"
                disabled={isLegacyActivating}
              >
                {isLegacyActivating ? (
                  <>
                    <FaSyncAlt className="spin-icon" /> Activating...
                  </>
                ) : (
                  <>
                    <span>Activate Account</span>
                    <FaArrowRight />
                  </>
                )}
              </button>

              <div className="auth-helper-links">
                <button
                  type="button"
                  className="link-btn-text"
                  onClick={() => setMode("set_password")}
                >
                  Set password with Student ID directly
                </button>
                <button
                  type="button"
                  className="link-btn-muted"
                  onClick={() => setMode("login")}
                >
                  ← Return to Sign In
                </button>
              </div>
            </form>
          ) : (
            /* ============================================================== */
            /* MODE 0: STANDARD ROLE SIGN IN FORM (DEFAULT)                   */
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
                        ? "e.g. STU20240001 or roll number"
                        : "e.g. FAC001 or faculty email"
                    }
                    value={username}
                    required
                    autoComplete="username"
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
                  <button
                    type="button"
                    className="inline-action-link"
                    onClick={() => {
                      resetAllFeedback();
                      setMode("forgot_password");
                      setForgotStep(1);
                      if (username) setForgotIdent(username);
                    }}
                  >
                    Forgot Password?
                  </button>
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

              {/* Student Onboarding Quick Action Banner */}
              {isStudentMode && (
                <div className="student-first-time-box">
                  <div className="first-time-icon">
                    <FaKey />
                  </div>
                  <div className="first-time-text">
                    <span>First time logging in with your Student ID?</span>
                    <button
                      type="button"
                      className="btn-first-time-action"
                      onClick={() => {
                        resetAllFeedback();
                        setMode("set_password");
                        setSetId(username);
                      }}
                    >
                      Set Your Password with Student ID →
                    </button>
                  </div>
                </div>
              )}

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