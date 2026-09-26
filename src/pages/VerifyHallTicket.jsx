import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { verifyHallTicketQR } from "../services/studentservice";
import {
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationTriangle,
  FaUniversity,
  FaIdCard,
  FaShieldAlt,
  FaCalendarAlt,
  FaUserGraduate,
  FaBook,
  FaArrowLeft,
  FaSync,
} from "react-icons/fa";

const VerifyHallTicket = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) {
      setError("No verification token provided in URL.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    verifyHallTicketQR(token)
      .then((res) => {
        setData(res.data);
      })
      .catch((err) => {
        setError(
          err.response?.data?.error ||
            "Invalid, forged, or expired examination hall ticket."
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "600px",
          background: "#ffffff",
          borderRadius: "20px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
          overflow: "hidden",
        }}
      >
        {/* Institutional Top Bar */}
        <div
          style={{
            background: "#1e3a8a",
            color: "#ffffff",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "rgba(255, 255, 255, 0.15)",
              color: "#ffffff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "22px",
              marginBottom: "8px",
            }}
          >
            <FaUniversity />
          </div>
          <h2
            style={{
              margin: "0 0 4px 0",
              fontSize: "18px",
              fontWeight: 800,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
            }}
          >
            {data?.exam?.college_name || "ST. PETER'S ENGINEERING COLLEGE"}
          </h2>
          <div style={{ fontSize: "12px", color: "#bfdbfe", letterSpacing: "0.5px" }}>
            Office of the Controller of Examinations • Candidate Verification
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: "28px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
              <FaSync className="fa-spin" style={{ fontSize: "32px", marginBottom: "12px", color: "#2563eb" }} />
              <div style={{ fontWeight: 600 }}>Verifying credentials with central exam database...</div>
            </div>
          ) : error ? (
            /* Error / Invalid QR Code */
            <div style={{ textAlign: "center", padding: "16px 8px" }}>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  background: "#fee2e2",
                  color: "#dc2626",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "32px",
                  marginBottom: "16px",
                }}
              >
                <FaTimesCircle />
              </div>
              <h3 style={{ margin: "0 0 8px 0", color: "#991b1b", fontSize: "20px" }}>
                Verification Failed
              </h3>
              <p style={{ margin: "0 0 20px 0", color: "#475569", fontSize: "14px", lineHeight: "1.5" }}>
                {error}
              </p>
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fee2e2",
                  borderRadius: "10px",
                  padding: "14px",
                  fontSize: "12.5px",
                  color: "#b91c1c",
                  textAlign: "left",
                  marginBottom: "20px",
                }}
              >
                <strong>Security Warning:</strong> This QR code is not recognized by the institutional examination cell. Please verify the candidate's physical ID card and cross-reference with the master exam roll list.
              </div>
              <Link
                to="/login"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  color: "#2563eb",
                  fontWeight: 600,
                  fontSize: "13px",
                  textDecoration: "none",
                }}
              >
                <FaArrowLeft /> Return to Portal Login
              </Link>
            </div>
          ) : data ? (
            /* Valid Ticket Record */
            <div>
              {/* Verification Status Badge */}
              <div
                style={{
                  background: data.status === "VERIFIED_AUTHENTIC" ? "#ecfdf5" : "#fef2f2",
                  border: `2px solid ${
                    data.status === "VERIFIED_AUTHENTIC" ? "#10b981" : "#ef4444"
                  }`,
                  borderRadius: "14px",
                  padding: "16px 20px",
                  marginBottom: "24px",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    background:
                      data.status === "VERIFIED_AUTHENTIC" ? "#d1fae5" : "#fee2e2",
                    color:
                      data.status === "VERIFIED_AUTHENTIC" ? "#059669" : "#dc2626",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "22px",
                    flexShrink: 0,
                  }}
                >
                  {data.status === "VERIFIED_AUTHENTIC" ? (
                    <FaCheckCircle />
                  ) : (
                    <FaExclamationTriangle />
                  )}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 800,
                      color:
                        data.status === "VERIFIED_AUTHENTIC" ? "#065f46" : "#991b1b",
                    }}
                  >
                    {data.status_display}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color:
                        data.status === "VERIFIED_AUTHENTIC" ? "#047857" : "#b91c1c",
                      marginTop: "2px",
                    }}
                  >
                    Hall Ticket No: <strong>{data.hall_ticket_number}</strong> • Verified at{" "}
                    {new Date(data.verified_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </div>
                </div>
              </div>

              {/* Candidate Info Grid */}
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "14px",
                  padding: "18px",
                  marginBottom: "20px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <FaUserGraduate /> Candidate Credentials
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "16px",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: "84px",
                      height: "105px",
                      borderRadius: "6px",
                      border: "2px solid #1e3a8a",
                      overflow: "hidden",
                      background: "#e2e8f0",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                    }}
                  >
                    {data.student?.profile_pic ? (
                      <img
                        src={data.student.profile_pic}
                        alt={data.student?.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <FaUserGraduate style={{ fontSize: "36px", color: "#94a3b8" }} />
                    )}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                      fontSize: "13px",
                      flex: 1,
                    }}
                  >
                    <div>
                      <span style={{ color: "#64748b", display: "block", fontSize: "11.5px" }}>Full Name</span>
                      <strong style={{ color: "#0f172a", fontSize: "14px" }}>{data.student?.name}</strong>
                    </div>

                    <div>
                      <span style={{ color: "#64748b", display: "block", fontSize: "11.5px" }}>University Roll No</span>
                      <strong style={{ color: "#2563eb", fontSize: "14px" }}>{data.student?.roll_no}</strong>
                    </div>

                    <div>
                      <span style={{ color: "#64748b", display: "block", fontSize: "11.5px" }}>Branch & Sem</span>
                      <span style={{ color: "#334155" }}>
                        {data.student?.branch} • Sem {data.student?.semester} (Sec {data.student?.section})
                      </span>
                    </div>

                    <div>
                      <span style={{ color: "#64748b", display: "block", fontSize: "11.5px" }}>Attendance</span>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 700,
                          background: data.attendance?.is_eligible ? "#dcfce7" : "#fee2e2",
                          color: data.attendance?.is_eligible ? "#15803d" : "#b91c1c",
                        }}
                      >
                        {data.attendance?.percentage}% {data.attendance?.is_condoned && "(Condoned)"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Exam Info */}
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "14px",
                  padding: "18px",
                  marginBottom: "20px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "10px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <FaBook /> Examination Schedule
                </div>

                <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", marginBottom: "4px" }}>
                  {data.exam?.name}
                </div>
                <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "12px" }}>
                  Academic Term: {data.exam?.academic_year} • {data.exam?.exam_type}
                </div>

                {/* Timetable overview */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {data.timetable && data.timetable.length > 0 ? (
                    data.timetable.map((paper, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          borderRadius: "8px",
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                          fontSize: "12px",
                        }}
                      >
                        <div>
                          <strong>{paper.subject_code}</strong>: {paper.subject_name}
                        </div>
                        <div style={{ color: "#64748b" }}>
                          {paper.exam_date} ({paper.start_time?.slice(0, 5)})
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                      Timetable registered in master examination plan.
                    </div>
                  )}
                </div>
              </div>

              {/* Invigilator Action Guidance */}
              <div
                style={{
                  textAlign: "center",
                  borderTop: "1px solid #e2e8f0",
                  paddingTop: "16px",
                  fontSize: "12px",
                  color: "#64748b",
                }}
              >
                Verified against Official Institutional Records • NIST Controller of Examinations
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default VerifyHallTicket;
