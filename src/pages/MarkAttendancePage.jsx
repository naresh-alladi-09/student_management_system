import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { markQrAttendance } from "../services/studentservice";
import {
  FaQrcode,
  FaCheckCircle,
  FaExclamationTriangle,
  FaClock,
  FaUserGraduate,
  FaArrowRight,
  FaLock,
} from "react-icons/fa";

const MarkAttendancePage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, login } = useAuth();

  const tokenParam = searchParams.get("token") || "";

  const [token, setToken] = useState(tokenParam);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("idle"); // 'idle' | 'submitting' | 'success' | 'already' | 'error'
  const [feedback, setFeedback] = useState(null);

  // Login form state if student is not logged in
  const [loginUsername, setLoginUsername] = useState("STU001");
  const [loginPassword, setLoginPassword] = useState("Student@123");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Function to execute token submission
  const submitAttendanceToken = async (targetToken) => {
    const cleanToken = (targetToken || token).trim();
    if (!cleanToken) {
      setStatus("error");
      setFeedback({ detail: "No QR token detected in this scan." });
      return;
    }

    setLoading(true);
    setStatus("submitting");

    try {
      const res = await markQrAttendance(cleanToken);
      setStatus("success");
      setFeedback({
        message: res.data.message || "Attendance recorded successfully!",
        subject: res.data.subject,
        subjectCode: res.data.subject_code,
        date: res.data.date,
        markedAt: res.data.marked_at,
        status: res.data.status,
      });
    } catch (err) {
      if (err.response?.status === 409) {
        setStatus("already");
        setFeedback({
          detail:
            err.response.data?.detail ||
            "You have already marked attendance for this session.",
          markedAt: err.response.data?.marked_at,
        });
      } else {
        setStatus("error");
        setFeedback({
          detail:
            err.response?.data?.detail ||
            "Unable to record attendance. The token may have expired or is invalid.",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // If user is already logged in as a student and token exists, auto-submit!
  useEffect(() => {
    if (tokenParam && user && user.role === "student" && status === "idle") {
      submitAttendanceToken(tokenParam);
    }
  }, [tokenParam, user]);

  const handleStudentLoginAndSubmit = async (e) => {
    e?.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);
    try {
      await login(loginUsername, loginPassword);
      // Wait for auth context to update, then submit token
      setTimeout(() => {
        submitAttendanceToken(token);
      }, 300);
    } catch (err) {
      setLoginError(
        err.response?.data?.detail || "Invalid credentials. Please enter your student login."
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          background: "#ffffff",
          borderRadius: "20px",
          padding: "36px 30px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
          textAlign: "center",
        }}
      >
        {/* Brand Icon Header */}
        <div
          style={{
            width: "64px",
            height: "64px",
            background: "#eff6ff",
            color: "#2563eb",
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "28px",
            marginBottom: "16px",
          }}
        >
          <FaQrcode />
        </div>

        <h2 style={{ margin: "0 0 8px 0", color: "#0f172a", fontSize: "22px", fontWeight: 800 }}>
          Live QR Attendance Check-In
        </h2>
        <p style={{ margin: "0 0 24px 0", color: "#64748b", fontSize: "14px" }}>
          Campus Digital Attendance System
        </p>

        {/* STATE: SUBMITTING */}
        {status === "submitting" && (
          <div style={{ padding: "30px 20px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                border: "4px solid #e2e8f0",
                borderTopColor: "#2563eb",
                borderRadius: "50%",
                margin: "0 auto 16px auto",
                animation: "spin 1s linear infinite",
              }}
            />
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            <h4 style={{ margin: "0 0 6px 0", color: "#1e293b" }}>
              Verifying QR Session...
            </h4>
            <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>
              Communicating securely with university attendance register.
            </p>
          </div>
        )}

        {/* STATE: SUCCESS */}
        {status === "success" && (
          <div style={{ padding: "10px 0" }}>
            <div
              style={{
                width: "60px",
                height: "60px",
                background: "#ecfdf5",
                color: "#10b981",
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "30px",
                marginBottom: "16px",
              }}
            >
              <FaCheckCircle />
            </div>

            <h3 style={{ margin: "0 0 8px 0", color: "#065f46", fontSize: "20px" }}>
              Attendance Recorded!
            </h3>
            <p style={{ color: "#047857", fontSize: "14px", margin: "0 0 20px 0" }}>
              Your check-in has been validated and saved to the official database.
            </p>

            <div
              style={{
                background: "#f8fafc",
                borderRadius: "12px",
                padding: "16px",
                textAlign: "left",
                fontSize: "14px",
                border: "1px solid #e2e8f0",
                marginBottom: "24px",
              }}
            >
              {feedback?.subject && (
                <div style={{ marginBottom: "8px" }}>
                  <strong style={{ color: "#475569" }}>Course:</strong>{" "}
                  <span style={{ color: "#0f172a", fontWeight: 600 }}>
                    {feedback.subject} ({feedback.subjectCode})
                  </span>
                </div>
              )}
              {feedback?.status && (
                <div style={{ marginBottom: "8px" }}>
                  <strong style={{ color: "#475569" }}>Status:</strong>{" "}
                  <span
                    style={{
                      background: "#dcfce7",
                      color: "#15803d",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      fontWeight: 700,
                      fontSize: "12px",
                    }}
                  >
                    ● {feedback.status}
                  </span>
                </div>
              )}
              <div style={{ marginBottom: "8px" }}>
                <strong style={{ color: "#475569" }}>Student:</strong>{" "}
                <span style={{ color: "#0f172a" }}>
                  {user?.studentName || user?.username}
                </span>
              </div>
              <div>
                <strong style={{ color: "#475569" }}>Timestamp:</strong>{" "}
                <span style={{ color: "#64748b", fontSize: "13px" }}>
                  {feedback?.markedAt ? new Date(feedback.markedAt).toLocaleTimeString() : "Just now"}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/student/dashboard")}
              style={{
                width: "100%",
                padding: "12px",
                background: "#10b981",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                fontWeight: 700,
                fontSize: "15px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              Return to Student Dashboard <FaArrowRight />
            </button>
          </div>
        )}

        {/* STATE: ALREADY MARKED (409) */}
        {status === "already" && (
          <div style={{ padding: "10px 0" }}>
            <div
              style={{
                width: "60px",
                height: "60px",
                background: "#fef3c7",
                color: "#d97706",
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "30px",
                marginBottom: "16px",
              }}
            >
              <FaClock />
            </div>

            <h3 style={{ margin: "0 0 8px 0", color: "#92400e", fontSize: "20px" }}>
              Already Checked In
            </h3>
            <p style={{ color: "#b45309", fontSize: "14px", margin: "0 0 20px 0" }}>
              {feedback?.detail || "You have already marked attendance for this session."}
            </p>

            <button
              type="button"
              onClick={() => navigate("/student/dashboard")}
              style={{
                width: "100%",
                padding: "12px",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                fontWeight: 700,
                fontSize: "15px",
                cursor: "pointer",
              }}
            >
              View My Attendance Dashboard
            </button>
          </div>
        )}

        {/* STATE: ERROR / EXPIRED */}
        {status === "error" && (
          <div style={{ padding: "10px 0" }}>
            <div
              style={{
                width: "60px",
                height: "60px",
                background: "#fee2e2",
                color: "#ef4444",
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "30px",
                marginBottom: "16px",
              }}
            >
              <FaExclamationTriangle />
            </div>

            <h3 style={{ margin: "0 0 8px 0", color: "#991b1b", fontSize: "20px" }}>
              Check-In Unsuccessful
            </h3>
            <p style={{ color: "#b91c1c", fontSize: "14px", margin: "0 0 20px 0" }}>
              {feedback?.detail || "The QR code has expired or is invalid."}
            </p>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={() => submitAttendanceToken(token)}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "#f1f5f9",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => navigate("/student/dashboard")}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        )}

        {/* STATE: IDLE BUT STUDENT IS LOGGED IN */}
        {status === "idle" && user && user.role === "student" && (
          <div>
            <div
              style={{
                background: "#f8fafc",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "20px",
                border: "1px solid #e2e8f0",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                Logged in Student:
              </div>
              <div style={{ fontWeight: 700, color: "#0f172a" }}>
                {user.studentName || user.username}
              </div>
              <div style={{ fontSize: "13px", color: "#475569" }}>
                Roll No: {user.rollNo || "Enrolled"} • {user.branch}
              </div>
            </div>

            <div style={{ marginBottom: "16px", textAlign: "left" }}>
              <label
                htmlFor="session-token-input"
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#334155",
                  marginBottom: "6px",
                }}
              >
                Session QR Token:
              </label>
              <input
                id="session-token-input"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Scan or paste QR token..."
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "14px",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <button
              type="button"
              disabled={loading || !token.trim()}
              onClick={() => submitAttendanceToken(token)}
              style={{
                width: "100%",
                padding: "14px",
                background: "#10b981",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                fontWeight: 700,
                fontSize: "15px",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              Confirm & Record Attendance
            </button>
          </div>
        )}

        {/* STATE: IDLE AND USER IS NOT LOGGED IN */}
        {status === "idle" && (!user || user.role !== "student") && (
          <div>
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "12px",
                padding: "14px",
                marginBottom: "20px",
                fontSize: "13px",
                color: "#166534",
                textAlign: "left",
              }}
            >
              <strong>Session Scanned Successfully!</strong>
              <div style={{ marginTop: "4px" }}>
                Please sign in to verify your identity and finalize your check-in.
              </div>
            </div>

            {loginError && (
              <div
                style={{
                  background: "#fef2f2",
                  color: "#991b1b",
                  border: "1px solid #fecaca",
                  borderRadius: "8px",
                  padding: "10px",
                  fontSize: "13px",
                  marginBottom: "14px",
                }}
              >
                {loginError}
              </div>
            )}

            <form onSubmit={handleStudentLoginAndSubmit} style={{ textAlign: "left" }}>
              <div style={{ marginBottom: "14px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#475569",
                    marginBottom: "4px",
                  }}
                >
                  Student Username / ID:
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#475569",
                    marginBottom: "4px",
                  }}
                >
                  Password:
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  fontWeight: 700,
                  fontSize: "14px",
                  cursor: isLoggingIn ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <FaLock /> {isLoggingIn ? "Verifying..." : "Sign In & Mark Attendance"}
              </button>
            </form>

            <div style={{ marginTop: "16px", fontSize: "12px", color: "#64748b" }}>
              Default Student Demo: <code>STU001</code> / <code>Student@123</code>
            </div>
          </div>
        )}

        <div style={{ marginTop: "24px", borderTop: "1px solid #f1f5f9", paddingTop: "14px" }}>
          <Link
            to="/login"
            style={{ color: "#64748b", fontSize: "13px", textDecoration: "none" }}
          >
            ← Back to Portal Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default MarkAttendancePage;
