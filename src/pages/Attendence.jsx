import { useEffect, useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import "../styles/attendence.css";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import {
  getDailyAttendance,
  saveBulkAttendance,
  getAllSubjects,
  getAcademicClasses,
  createAttendanceSession,
  getActiveSession,
  refreshSessionToken,
  closeAttendanceSession,
  getAttendanceSummary,
} from "../services/studentservice";
import {
  FaQrcode,
  FaListAlt,
  FaSync,
  FaStopCircle,
  FaPlayCircle,
  FaClock,
  FaUsers,
  FaCheckCircle,
  FaChartLine,
  FaExclamationTriangle,
} from "react-icons/fa";

function Attendance() {
  const [activeTab, setActiveTab] = useState("manual"); // 'manual' | 'qr'
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [attendance, setAttendance] = useState({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [selectedBranch, setSelectedBranch] = useState("ALL");
  const [selectedSection, setSelectedSection] = useState("ALL");

  // QR Session States
  const [subjects, setSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [academicClasses, setAcademicClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [sessionDuration, setSessionDuration] = useState(60);
  const [activeSessionData, setActiveSessionData] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);

  // Analytics Dashboard States
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [threshold, setThreshold] = useState(75);

  const fetchSummary = (thresh = 75) => {
    setSummaryLoading(true);
    getAttendanceSummary({ threshold: thresh })
      .then((res) => {
        setSummaryData(res.data);
      })
      .catch((err) => {
        console.error("Failed to fetch attendance analytics:", err);
      })
      .finally(() => {
        setSummaryLoading(false);
      });
  };

  useEffect(() => {
    if (activeTab === "analytics") {
      fetchSummary(threshold);
    }
  }, [activeTab, threshold]);

  const pollIntervalRef = useRef(null);

  // Load Subjects and Academic Classes for QR session
  useEffect(() => {
    getAllSubjects()
      .then((res) => {
        const subs = res.data || [];
        setSubjects(subs);
        if (subs.length > 0) {
          setSelectedSubjectId(String(subs[0].id));
        }
      })
      .catch(() => {});

    getAcademicClasses()
      .then((res) => {
        const cls = res.data?.results || res.data || [];
        setAcademicClasses(cls);
        if (cls.length > 0) {
          setSelectedClassId(String(cls[0].id));
        }
      })
      .catch(() => {});
  }, []);

  // Fetch Manual Attendance Records
  const loadDailyAttendance = (dateStr, branch, section) => {
    setLoading(true);
    getDailyAttendance(dateStr, branch, section)
      .then((res) => {
        const data = res.data || {};
        const records = data.records || [];
        setStudents(
          records.map((r) => ({
            id: r.student_id,
            name: r.name,
            roll_no: r.roll_no,
            student_id_str: r.student_id_str,
            branch: r.branch,
            year: r.year,
            semester: r.semester,
            section: r.section || "A",
          }))
        );
        const map = {};
        records.forEach((r) => {
          map[r.student_id] = r.status;
        });
        setAttendance(map);
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to load attendance from database:", err);
        setError("Could not load attendance from database. Please check connection.");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (activeTab === "manual") {
      loadDailyAttendance(selectedDate, selectedBranch, selectedSection);
    }
  }, [selectedDate, selectedBranch, selectedSection, activeTab]);

  // Check Active QR Session
  const checkActiveQrSession = () => {
    getActiveSession()
      .then((res) => {
        if (res.data?.active && res.data.session) {
          setActiveSessionData(res.data);
          const expiresAt = new Date(res.data.session.expires_at).getTime();
          const now = new Date().getTime();
          const rem = Math.max(0, Math.floor((expiresAt - now) / 1000));
          setTimeRemaining(rem);
        } else {
          setActiveSessionData(null);
          setTimeRemaining(0);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (activeTab === "qr") {
      checkActiveQrSession();
      pollIntervalRef.current = setInterval(() => {
        checkActiveQrSession();
      }, 4000);
    } else {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [activeTab]);

  // Countdown timer for QR
  useEffect(() => {
    if (timeRemaining <= 0) return;
    const t = setInterval(() => {
      setTimeRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [timeRemaining]);

  const handleStartQrSession = async () => {
    if (!selectedSubjectId) return;
    setQrLoading(true);
    try {
      const targetClass = academicClasses.find((c) => String(c.id) === String(selectedClassId));
      const secVal = targetClass ? targetClass.section : "A";
      await createAttendanceSession(
        parseInt(selectedSubjectId, 10),
        sessionDuration,
        selectedClassId ? parseInt(selectedClassId, 10) : null,
        secVal
      );
      checkActiveQrSession();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to start QR session.");
    } finally {
      setQrLoading(false);
    }
  };

  const handleRefreshToken = async () => {
    if (!activeSessionData?.session?.id) return;
    setQrLoading(true);
    try {
      await refreshSessionToken(activeSessionData.session.id, sessionDuration);
      checkActiveQrSession();
    } catch (err) {
      setError("Failed to refresh QR token.");
    } finally {
      setQrLoading(false);
    }
  };

  const handleCloseSession = async () => {
    if (!activeSessionData?.session?.id) return;
    try {
      await closeAttendanceSession(activeSessionData.session.id);
      setActiveSessionData(null);
      setTimeRemaining(0);
    } catch (err) {
      setError("Failed to close session.");
    }
  };

  const handleStatusChange = (studentId, status) => {
    setAttendance((prev) => ({
      ...prev,
      [studentId]: status,
    }));
    setSaveSuccess(false);
  };

  const handleMarkAll = (status) => {
    const updated = {};
    students.forEach((s) => {
      updated[s.id] = status;
    });
    setAttendance(updated);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await saveBulkAttendance(selectedDate, attendance);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err) {
      console.error("Save attendance error:", err);
      setError("Failed to save attendance to database.");
      setTimeout(() => setError(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const presentCount = students.filter(
    (s) => attendance[s.id] === "Present"
  ).length;
  const absentCount = students.filter(
    (s) => attendance[s.id] === "Absent"
  ).length;
  const notMarkedCount = students.filter(
    (s) => !attendance[s.id] || attendance[s.id] === "Not Marked"
  ).length;
  const percentage =
    students.length > 0 ? Math.round((presentCount / students.length) * 100) : 0;

  return (
    <div className="sideandmain">
      <div className="Sidebarindashboard">
        <Sidebar />
      </div>

      <div className="main-content">
        <Navbar />

        <div className="attendance-page-content">
          {/* Header Row & Mode Tabs */}
          <div className="attendance-header-row">
            <div>
              <h2 className="attendance-title">Attendance Management System</h2>
              <p className="attendance-subtitle">
                Conduct live temporary QR sessions or manage daily manual records
              </p>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className={`action-btn ${activeTab === "manual" ? "btn-primary" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: activeTab === "manual" ? "#2563eb" : "#f1f5f9",
                  color: activeTab === "manual" ? "#fff" : "#475569",
                  border: "none",
                }}
                onClick={() => setActiveTab("manual")}
              >
                <FaListAlt /> Daily Manual Tracker
              </button>

              <button
                type="button"
                className={`action-btn ${activeTab === "qr" ? "btn-primary" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: activeTab === "qr" ? "#10b981" : "#f1f5f9",
                  color: activeTab === "qr" ? "#fff" : "#475569",
                  border: "none",
                }}
                onClick={() => setActiveTab("qr")}
              >
                <FaQrcode /> Live QR Session Generator
              </button>

              <button
                type="button"
                className={`action-btn ${activeTab === "analytics" ? "btn-primary" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: activeTab === "analytics" ? "#0f172a" : "#f1f5f9",
                  color: activeTab === "analytics" ? "#fff" : "#475569",
                  border: "none",
                }}
                onClick={() => setActiveTab("analytics")}
              >
                <FaChartLine /> Analytics & Shortage Alerts
              </button>
            </div>
          </div>

          {error && (
            <div className="error-banner" style={{ marginBottom: "16px" }}>
              {error}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 1: LIVE QR ATTENDANCE GENERATOR                            */}
          {/* ============================================================== */}
          {activeTab === "qr" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
              {/* Left Column: Generator Controls & QR Display */}
              <div
                style={{
                  background: "#fff",
                  borderRadius: "16px",
                  padding: "24px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                  border: "1px solid #e2e8f0",
                }}
              >
                {!activeSessionData?.active ? (
                  <div>
                    <h3 style={{ margin: "0 0 16px 0", color: "#0f172a" }}>
                      Start New Attendance Session
                    </h3>
                    <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px" }}>
                      Select a curriculum subject and launch a temporary QR code for students to scan in class.
                    </p>

                    <div style={{ marginBottom: "16px" }}>
                      <label
                        htmlFor="subject-select"
                        style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}
                      >
                        Select Subject:
                      </label>
                      <select
                        id="subject-select"
                        value={selectedSubjectId}
                        onChange={(e) => setSelectedSubjectId(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "1px solid #cbd5e1",
                          fontSize: "14px",
                        }}
                      >
                        {subjects.map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.code} - {sub.name} ({sub.branch} Sem {sub.semester})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ marginBottom: "16px" }}>
                      <label
                        htmlFor="class-select"
                        style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}
                      >
                        Target Class & Section:
                      </label>
                      <select
                        id="class-select"
                        value={selectedClassId}
                        onChange={(e) => setSelectedClassId(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "1px solid #cbd5e1",
                          fontSize: "14px",
                        }}
                      >
                        <option value="">All Cohorts (Subject-wide)</option>
                        {academicClasses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.display_name || `${c.branch_code} Year ${c.year} Sem ${c.semester} Sec ${c.section}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ marginBottom: "24px" }}>
                      <label
                        htmlFor="duration-select"
                        style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}
                      >
                        QR Code Expiry Duration:
                      </label>
                      <select
                        id="duration-select"
                        value={sessionDuration}
                        onChange={(e) => setSessionDuration(parseInt(e.target.value, 10))}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "1px solid #cbd5e1",
                          fontSize: "14px",
                        }}
                      >
                        <option value={30}>30 Seconds</option>
                        <option value={60}>60 Seconds (Recommended)</option>
                        <option value={120}>2 Minutes</option>
                        <option value={300}>5 Minutes</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      disabled={qrLoading || !selectedSubjectId}
                      onClick={handleStartQrSession}
                      style={{
                        width: "100%",
                        padding: "14px",
                        borderRadius: "10px",
                        border: "none",
                        background: "#10b981",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: "15px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        cursor: qrLoading ? "not-allowed" : "pointer",
                      }}
                    >
                      <FaPlayCircle /> {qrLoading ? "Initializing..." : "Launch QR Attendance Session"}
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        display: "inline-block",
                        padding: "6px 14px",
                        background: "#ecfdf5",
                        color: "#047857",
                        borderRadius: "20px",
                        fontWeight: 700,
                        fontSize: "13px",
                        marginBottom: "14px",
                      }}
                    >
                      ● SESSION ACTIVE • {activeSessionData.session.subject_details?.code} • {activeSessionData.session.class_display || `Section ${activeSessionData.session.section || 'A'}`}
                    </div>

                    <h3 style={{ margin: "0 0 6px 0", color: "#0f172a" }}>
                      {activeSessionData.session.subject_details?.name}
                    </h3>
                    <p style={{ color: "#64748b", fontSize: "13px", margin: "0 0 16px 0" }}>
                      Students can scan this QR code with their phone camera, or use the camera scanner on their dashboard.
                    </p>

                    {/* QR Code Canvas */}
                    <div
                      style={{
                        background: "#ffffff",
                        padding: "18px",
                        borderRadius: "16px",
                        display: "inline-block",
                        border: "2px dashed #3b82f6",
                        boxShadow: "0 10px 25px -5px rgba(59, 130, 246, 0.15)",
                        marginBottom: "16px",
                      }}
                    >
                      <QRCodeSVG
                        value={`${window.location.origin}/mark-attendance?token=${activeSessionData.session.qr_token}`}
                        size={230}
                        level="M"
                        includeMargin={true}
                      />
                    </div>

                    {/* Quick Access Action Buttons for Testing */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: "8px",
                        marginBottom: "14px",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const directUrl = `${window.location.origin}/mark-attendance?token=${activeSessionData.session.qr_token}`;
                          navigator.clipboard?.writeText(directUrl);
                          setCopiedLink(true);
                          setTimeout(() => setCopiedLink(false), 3000);
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          background: copiedLink ? "#ecfdf5" : "#f8fafc",
                          color: copiedLink ? "#047857" : "#334155",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {copiedLink ? "✓ Link Copied!" : "📋 Copy Direct Scan Link"}
                      </button>

                      <a
                        href={`/mark-attendance?token=${activeSessionData.session.qr_token}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          padding: "6px 12px",
                          borderRadius: "6px",
                          background: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          color: "#1d4ed8",
                          fontSize: "12px",
                          fontWeight: 600,
                          textDecoration: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        🚀 Open Check-In in New Tab
                      </a>
                    </div>

                    {/* Temporary Token Display */}
                    <div
                      style={{
                        background: "#f1f5f9",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        fontFamily: "monospace",
                        fontSize: "12px",
                        color: "#334155",
                        wordBreak: "break-all",
                        marginBottom: "16px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>
                        <strong>Raw Token: </strong>
                        <code>{activeSessionData.session.qr_token}</code>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(activeSessionData.session.qr_token);
                          setCopiedLink(true);
                          setTimeout(() => setCopiedLink(false), 2000);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#2563eb",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Copy Token
                      </button>
                    </div>

                    {/* Countdown Timer */}
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: 700,
                        color: timeRemaining > 10 ? "#2563eb" : "#ef4444",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        marginBottom: "20px",
                      }}
                    >
                      <FaClock />
                      <span>
                        {timeRemaining > 0
                          ? `QR Token Expires in: ${timeRemaining}s`
                          : "QR Token Expired! Please Refresh."}
                      </span>
                    </div>

                    {/* Controls */}
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        type="button"
                        onClick={handleRefreshToken}
                        disabled={qrLoading}
                        style={{
                          flex: 1,
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #cbd5e1",
                          background: "#fff",
                          color: "#334155",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                        }}
                      >
                        <FaSync /> Refresh QR
                      </button>

                      <button
                        type="button"
                        onClick={handleCloseSession}
                        style={{
                          flex: 1,
                          padding: "10px",
                          borderRadius: "8px",
                          border: "none",
                          background: "#ef4444",
                          color: "#fff",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                        }}
                      >
                        <FaStopCircle /> End Session
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Live Attendees Counter & List */}
              <div
                style={{
                  background: "#fff",
                  borderRadius: "16px",
                  padding: "24px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                  border: "1px solid #e2e8f0",
                }}
              >
                <h3 style={{ margin: "0 0 16px 0", color: "#0f172a" }}>
                  Live Attendance Check-Ins
                </h3>

                {/* Live Stats Pills */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "20px" }}>
                  <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", textAlign: "center" }}>
                    <small style={{ color: "#64748b" }}>Enrolled</small>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>
                      {activeSessionData?.total_enrolled ?? 0}
                    </div>
                  </div>
                  <div style={{ background: "#ecfdf5", padding: "14px", borderRadius: "10px", textAlign: "center" }}>
                    <small style={{ color: "#047857" }}>Present</small>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: "#047857" }}>
                      {activeSessionData?.present_count ?? 0}
                    </div>
                  </div>
                  <div style={{ background: "#eff6ff", padding: "14px", borderRadius: "10px", textAlign: "center" }}>
                    <small style={{ color: "#2563eb" }}>Live Rate</small>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: "#2563eb" }}>
                      {activeSessionData?.attendance_rate ?? 0}%
                    </div>
                  </div>
                </div>

                <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#475569" }}>
                  Verified Checked-In Students ({activeSessionData?.attendees?.length ?? 0}):
                </h4>

                <div style={{ maxHeight: "350px", overflowY: "auto" }}>
                  {activeSessionData?.attendees && activeSessionData.attendees.length > 0 ? (
                    activeSessionData.attendees.map((att) => (
                      <div
                        key={att.student_id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 14px",
                          borderRadius: "8px",
                          background: "#f8fafc",
                          marginBottom: "8px",
                        }}
                      >
                        <div>
                          <strong>{att.name}</strong>{" "}
                          <span style={{ color: "#64748b", fontSize: "12px" }}>
                            ({att.roll_no})
                          </span>
                        </div>
                        <span
                          style={{
                            background: "#ecfdf5",
                            color: "#047857",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: 600,
                          }}
                        >
                          ✓ Present ({new Date(att.marked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                        </span>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>
                      No students have checked in yet for this session.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: MANUAL DAILY ATTENDANCE TRACKER                         */}
          {/* ============================================================== */}
          {activeTab === "manual" && (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "#fff",
                  padding: "16px 20px",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  marginBottom: "20px",
                }}
              >
                <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
                  <div className="date-picker-cont" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <label htmlFor="att-date" style={{ fontWeight: 600 }}>Date:</label>
                    <input
                      id="att-date"
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="date-input"
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <label htmlFor="att-branch-filter" style={{ fontWeight: 600 }}>Branch:</label>
                    <select
                      id="att-branch-filter"
                      value={selectedBranch}
                      onChange={(e) => setSelectedBranch(e.target.value)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                      }}
                    >
                      <option value="ALL">All Branches</option>
                      <option value="CSE">CSE</option>
                      <option value="AIML">AIML</option>
                      <option value="IT">IT</option>
                      <option value="ECE">ECE</option>
                      <option value="MECH">MECH</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <label htmlFor="att-section-filter" style={{ fontWeight: 600 }}>Section:</label>
                    <select
                      id="att-section-filter"
                      value={selectedSection}
                      onChange={(e) => setSelectedSection(e.target.value)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                      }}
                    >
                      <option value="ALL">All Sections</option>
                      <option value="A">Section A</option>
                      <option value="B">Section B</option>
                      <option value="C">Section C</option>
                    </select>
                  </div>
                </div>

                {saveSuccess && (
                  <div style={{ color: "#047857", fontWeight: 600, fontSize: "14px" }}>
                    ✓ Attendance successfully saved to database!
                  </div>
                )}
              </div>

              {/* Stats Bar */}
              <div className="attendance-stats-bar">
                <div className="att-stat-pill total">
                  <span>Total Enrolled:</span> <strong>{students.length}</strong>
                </div>
                <div className="att-stat-pill present">
                  <span>Marked Present:</span> <strong>{presentCount}</strong>
                </div>
                <div className="att-stat-pill absent">
                  <span>Marked Absent:</span> <strong>{absentCount}</strong>
                </div>
                <div className="att-stat-pill" style={{ background: "#f8fafc", color: "#64748b" }}>
                  <span>Not Marked:</span> <strong>{notMarkedCount}</strong>
                </div>
                <div className="att-stat-pill rate">
                  <span>Attendance Rate:</span> <strong>{percentage}%</strong>
                </div>
              </div>

              {/* Bulk Quick Actions */}
              <div className="quick-actions-row">
                <span className="quick-label">Bulk Mark Today:</span>
                <button
                  type="button"
                  className="quick-fill-btn present"
                  onClick={() => handleMarkAll("Present")}
                >
                  Mark All Present
                </button>
                <button
                  type="button"
                  className="quick-fill-btn absent"
                  onClick={() => handleMarkAll("Absent")}
                >
                  Mark All Absent
                </button>
              </div>

              {/* Table */}
              <div className="attendance-table-card">
                {loading ? (
                  <div className="att-loading">
                    <i className="fa-solid fa-spinner fa-spin"></i> Loading attendance records from database...
                  </div>
                ) : (
                  <table className="modern-att-table">
                    <thead>
                      <tr>
                        <th>Student ID / Roll No</th>
                        <th>Student Name</th>
                        <th>Branch</th>
                        <th>Year</th>
                        <th style={{ textAlign: "center" }}>Attendance Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.length > 0 ? (
                        students.map((student) => {
                          const currentStatus = attendance[student.id] || "Not Marked";
                          return (
                            <tr key={student.id}>
                              <td>
                                <strong>{student.roll_no || student.student_id_str}</strong>
                              </td>
                              <td>{student.name}</td>
                              <td>{student.branch}</td>
                              <td>Year {student.year}</td>
                              <td style={{ textAlign: "center" }}>
                                <div className="status-toggle-group">
                                  <button
                                    type="button"
                                    className={`toggle-pill-btn present ${
                                      currentStatus === "Present" ? "active" : ""
                                    }`}
                                    onClick={() => handleStatusChange(student.id, "Present")}
                                  >
                                    Present
                                  </button>
                                  <button
                                    type="button"
                                    className={`toggle-pill-btn absent ${
                                      currentStatus === "Absent" ? "active" : ""
                                    }`}
                                    onClick={() => handleStatusChange(student.id, "Absent")}
                                  >
                                    Absent
                                  </button>
                                  <button
                                    type="button"
                                    className={`toggle-pill-btn late ${
                                      currentStatus === "Late" ? "active" : ""
                                    }`}
                                    onClick={() => handleStatusChange(student.id, "Late")}
                                  >
                                    Late
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="5" style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                            No students found matching selected branch.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Bottom Sticky Action Bar */}
              <div className="att-save-footer">
                <button
                  type="button"
                  className="save-att-btn"
                  onClick={handleSave}
                  disabled={isSaving || loading || students.length === 0}
                >
                  {isSaving ? "Saving to Database..." : "Save Attendance to Database"}
                </button>
              </div>
            </>
          )}

          {/* ============================================================== */}
          {/* TAB 3: ATTENDANCE ANALYTICS & SHORTAGE ALERTS                  */}
          {/* ============================================================== */}
          {activeTab === "analytics" && (
            <div>
              {/* Analytics Header & Configurable Threshold Controls */}
              <div
                style={{
                  background: "#fff",
                  borderRadius: "16px",
                  padding: "20px 24px",
                  border: "1px solid #e2e8f0",
                  marginBottom: "20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "16px",
                }}
              >
                <div>
                  <h3 style={{ margin: "0 0 4px 0", fontSize: "18px", color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                    <FaChartLine style={{ color: "#2563eb" }} />
                    Attendance Analytics & Shortage Warning System
                  </h3>
                  <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                    Live cohort statistics, multi-dimensional breakdowns, and identification of students below requirement threshold.
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#475569" }}>
                    Shortage Threshold:
                  </span>
                  {[70, 75, 80, 85].map((threshVal) => (
                    <button
                      key={threshVal}
                      type="button"
                      onClick={() => setThreshold(threshVal)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "20px",
                        border: "1px solid",
                        borderColor: threshold === threshVal ? "#2563eb" : "#cbd5e1",
                        background: threshold === threshVal ? "#eff6ff" : "#ffffff",
                        color: threshold === threshVal ? "#2563eb" : "#475569",
                        fontWeight: threshold === threshVal ? 700 : 500,
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      {threshVal}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => fetchSummary(threshold)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      color: "#475569",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                    title="Refresh analytics"
                  >
                    <FaSync />
                  </button>
                </div>
              </div>

              {summaryLoading || !summaryData ? (
                <div style={{ padding: "40px", textAlign: "center", color: "#64748b", background: "#fff", borderRadius: "16px" }}>
                  Analyzing institutional attendance records...
                </div>
              ) : (
                <>
                  {/* Top Metric Cards */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "16px",
                      marginBottom: "24px",
                    }}
                  >
                    <div
                      style={{
                        background: "#fff",
                        padding: "18px 20px",
                        borderRadius: "14px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <small style={{ color: "#64748b", fontWeight: 600 }}>Today's Attendance Rate</small>
                      <div style={{ fontSize: "26px", fontWeight: 800, color: "#2563eb", marginTop: "4px" }}>
                        {summaryData.overall?.today_attendance_rate}%
                      </div>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        {summaryData.overall?.present_today} Present / {summaryData.overall?.total_students} Enrolled
                      </span>
                    </div>

                    <div
                      style={{
                        background: "#fff",
                        padding: "18px 20px",
                        borderRadius: "14px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <small style={{ color: "#64748b", fontWeight: 600 }}>All-Time Cumulative Attendance</small>
                      <div style={{ fontSize: "26px", fontWeight: 800, color: "#059669", marginTop: "4px" }}>
                        {summaryData.overall?.cumulative_attendance_rate}%
                      </div>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        Across {summaryData.overall?.total_records} recorded entries
                      </span>
                    </div>

                    <div
                      style={{
                        background: "#fff",
                        padding: "18px 20px",
                        borderRadius: "14px",
                        border: "1px solid #fecaca",
                        background: "#fff5f5",
                      }}
                    >
                      <small style={{ color: "#b91c1c", fontWeight: 600 }}>Low Attendance Shortage Alerts</small>
                      <div style={{ fontSize: "26px", fontWeight: 800, color: "#dc2626", marginTop: "4px" }}>
                        {summaryData.overall?.low_attendance_count} Students
                      </div>
                      <span style={{ fontSize: "12px", color: "#b91c1c" }}>
                        Below required {threshold}% threshold
                      </span>
                    </div>
                  </div>

                  {/* Low Attendance Students Table */}
                  <div
                    style={{
                      background: "#fff",
                      borderRadius: "16px",
                      padding: "24px",
                      border: "1px solid #e2e8f0",
                      marginBottom: "24px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <h4 style={{ margin: 0, fontSize: "16px", color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                        <FaExclamationTriangle style={{ color: "#dc2626" }} />
                        Students Below {threshold}% Required Threshold
                      </h4>
                      <span
                        style={{
                          fontSize: "12px",
                          background: "#fef2f2",
                          color: "#dc2626",
                          padding: "4px 10px",
                          borderRadius: "12px",
                          fontWeight: 600,
                        }}
                      >
                        {summaryData.low_attendance_students?.length || 0} At-Risk Students
                      </span>
                    </div>

                    <div className="table-responsive">
                      <table className="grades-table">
                        <thead>
                          <tr>
                            <th>Roll Number</th>
                            <th>Student Name</th>
                            <th>Cohort</th>
                            <th>Classes Attended</th>
                            <th>Attendance Rate</th>
                            <th>Recovery Requirement</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summaryData.low_attendance_students && summaryData.low_attendance_students.length > 0 ? (
                            summaryData.low_attendance_students.map((stu) => (
                              <tr key={stu.student_id}>
                                <td>
                                  <strong>{stu.roll_no}</strong>
                                </td>
                                <td>{stu.name}</td>
                                <td>
                                  <span className="dash-branch-badge">
                                    {stu.branch} Y{stu.year}S{stu.semester}-{stu.section}
                                  </span>
                                </td>
                                <td>
                                  <strong>{stu.attended}</strong> / {stu.total}
                                </td>
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <div className="progress-track" style={{ width: "90px", margin: 0 }}>
                                      <div
                                        className="progress-bar-fill"
                                        style={{
                                          width: `${Math.min(100, stu.attendance_rate)}%`,
                                          backgroundColor: "#dc2626",
                                        }}
                                      ></div>
                                    </div>
                                    <span style={{ color: "#dc2626", fontWeight: 700 }}>
                                      {stu.attendance_rate}%
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <span
                                    style={{
                                      padding: "3px 8px",
                                      borderRadius: "6px",
                                      background: "#fee2e2",
                                      color: "#b91c1c",
                                      fontSize: "12px",
                                      fontWeight: 600,
                                    }}
                                  >
                                    Needs next {stu.classes_needed} classes
                                  </span>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="6" style={{ textAlign: "center", padding: "24px", color: "#059669" }}>
                                ✓ Great news! No students are currently below the {threshold}% attendance threshold.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Branch-wise and Subject-wise Breakdowns Grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                    {/* Branch-wise breakdown */}
                    <div
                      style={{
                        background: "#fff",
                        borderRadius: "16px",
                        padding: "20px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <h4 style={{ margin: "0 0 14px 0", fontSize: "15px", color: "#0f172a" }}>
                        Department / Branch Breakdown
                      </h4>
                      <table className="grades-table">
                        <thead>
                          <tr>
                            <th>Branch</th>
                            <th>Enrolled</th>
                            <th>Attendance %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summaryData.branch_wise && summaryData.branch_wise.length > 0 ? (
                            summaryData.branch_wise.map((b) => (
                              <tr key={b.branch}>
                                <td>
                                  <strong>{b.branch}</strong>
                                </td>
                                <td>{b.total_students} students</td>
                                <td>
                                  <strong style={{ color: b.attendance_rate >= 75 ? "#059669" : "#dc2626" }}>
                                    {b.attendance_rate}%
                                  </strong>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="3" style={{ textAlign: "center", padding: "16px", color: "#64748b" }}>
                                No branch records available.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Subject-wise breakdown */}
                    <div
                      style={{
                        background: "#fff",
                        borderRadius: "16px",
                        padding: "20px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <h4 style={{ margin: "0 0 14px 0", fontSize: "15px", color: "#0f172a" }}>
                        Course / Subject Attendance
                      </h4>
                      <table className="grades-table">
                        <thead>
                          <tr>
                            <th>Course</th>
                            <th>Classes</th>
                            <th>Attendance %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summaryData.subject_wise && summaryData.subject_wise.length > 0 ? (
                            summaryData.subject_wise.slice(0, 6).map((sub) => (
                              <tr key={sub.code}>
                                <td>
                                  <strong>{sub.code}</strong> - {sub.name}
                                </td>
                                <td>{sub.total_classes} sessions</td>
                                <td>
                                  <strong style={{ color: sub.attendance_rate >= 75 ? "#059669" : "#dc2626" }}>
                                    {sub.attendance_rate}%
                                  </strong>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="3" style={{ textAlign: "center", padding: "16px", color: "#64748b" }}>
                                No subject records available.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Attendance;