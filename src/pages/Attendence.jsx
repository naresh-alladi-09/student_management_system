import { useEffect, useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import "../styles/attendence.css";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import {
  getDailyAttendance,
  saveBulkAttendance,
  getAllSubjects,
  createAttendanceSession,
  getActiveSession,
  refreshSessionToken,
  closeAttendanceSession,
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

  // QR Session States
  const [subjects, setSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [sessionDuration, setSessionDuration] = useState(60);
  const [activeSessionData, setActiveSessionData] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);

  const pollIntervalRef = useRef(null);

  // Load Subjects for QR session
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
  }, []);

  // Fetch Manual Attendance Records
  const loadDailyAttendance = (dateStr, branch) => {
    setLoading(true);
    getDailyAttendance(dateStr, branch)
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
      loadDailyAttendance(selectedDate, selectedBranch);
    }
  }, [selectedDate, selectedBranch, activeTab]);

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
      await createAttendanceSession(
        parseInt(selectedSubjectId, 10),
        sessionDuration
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
                      ● SESSION ACTIVE • {activeSessionData.session.subject_details?.code}
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
        </div>
      </div>
    </div>
  );
}

export default Attendance;