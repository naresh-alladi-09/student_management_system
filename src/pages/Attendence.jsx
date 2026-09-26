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
  dispatchLowAttendanceAlerts,
  getLeaveRequests,
  reviewLeaveRequest,
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
  FaTimesCircle,
  FaChartLine,
  FaExclamationTriangle,
  FaCheck,
  FaTimes,
  FaSearch,
  FaQuestionCircle,
  FaFileAlt,
  FaExternalLinkAlt,
  FaEnvelope,
  FaPhoneAlt,
  FaPaperPlane,
} from "react-icons/fa";

function Attendance() {
  const [activeTab, setActiveTab] = useState("manual"); // 'manual' | 'qr'
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [attendance, setAttendance] = useState({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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

  // Alert dispatch states
  const [alertSending, setAlertSending] = useState(false);
  const [alertingStudentId, setAlertingStudentId] = useState(null);
  const [alertSuccessModal, setAlertSuccessModal] = useState(null);
  const [alertError, setAlertError] = useState(null);

  const handleDispatchAlerts = async (targetStudentId = null) => {
    setAlertSending(true);
    setAlertingStudentId(targetStudentId);
    setAlertError(null);
    try {
      const payload = {
        threshold: threshold,
      };
      if (targetStudentId) {
        payload.student_id = targetStudentId;
      }
      const res = await dispatchLowAttendanceAlerts(payload);
      setAlertSuccessModal(res.data);
      fetchSummary(threshold);
    } catch (err) {
      console.error("Failed to dispatch attendance alerts:", err);
      setAlertError(err.response?.data?.detail || "Failed to dispatch alerts. Please check connectivity.");
    } finally {
      setAlertSending(false);
      setAlertingStudentId(null);
    }
  };

  useEffect(() => {
    if (activeTab === "analytics") {
      fetchSummary(threshold);
    }
  }, [activeTab, threshold]);

  // Faculty Leave & On-Duty (OD) States
  const [facultyLeaves, setFacultyLeaves] = useState([]);
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState("PENDING");
  const [leaveSearchQuery, setLeaveSearchQuery] = useState("");
  const [reviewModalData, setReviewModalData] = useState(null);
  const [reviewerRemarks, setReviewerRemarks] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const fetchFacultyLeaves = () => {
    setLeavesLoading(true);
    getLeaveRequests({ status: leaveStatusFilter })
      .then((res) => {
        setFacultyLeaves(res.data || []);
      })
      .catch((err) => {
        console.error("Failed to load leave requests:", err);
      })
      .finally(() => {
        setLeavesLoading(false);
      });
  };

  useEffect(() => {
    fetchFacultyLeaves();
  }, [leaveStatusFilter]);

  const handleReviewAction = async (leaveId, actionStatus) => {
    setIsSubmittingReview(true);
    try {
      await reviewLeaveRequest(leaveId, {
        status: actionStatus,
        reviewer_remarks:
          reviewerRemarks.trim() ||
          (actionStatus === "APPROVED"
            ? "Approved by faculty. Attendance credited."
            : "Rejected by faculty."),
      });
      setReviewModalData(null);
      setReviewerRemarks("");
      fetchFacultyLeaves();
      loadDailyAttendance(selectedDate, selectedBranch, selectedSection);
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to process leave review.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

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
        if (res.data?.session && (res.data.active || res.data.show_present_for_10_mins)) {
          setActiveSessionData(res.data);
          if (res.data.active) {
            const expiresAt = new Date(res.data.session.expires_at).getTime();
            const now = new Date().getTime();
            const rem = Math.max(0, Math.floor((expiresAt - now) / 1000));
            setTimeRemaining(rem);
          } else {
            // Concluded session appearing for 10 minutes
            const rem = res.data.review_remaining_seconds != null
              ? res.data.review_remaining_seconds
              : (res.data.review_expires_at ? Math.max(0, Math.floor((new Date(res.data.review_expires_at).getTime() - Date.now()) / 1000)) : 0);
            setTimeRemaining(rem);
          }
        } else {
          setActiveSessionData(null);
          setTimeRemaining(0);
        }
      })
      .catch((err) => {
        console.error("Error checking active QR session:", err);
      });
  };

  useEffect(() => {
    if (activeTab === "qr") {
      checkActiveQrSession();
      pollIntervalRef.current = setInterval(() => {
        checkActiveQrSession();
      }, 3000);
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
    setError(null);
    try {
      const targetClass = academicClasses.find((c) => String(c.id) === String(selectedClassId));
      const secVal = targetClass ? targetClass.section : "A";
      const res = await createAttendanceSession(
        parseInt(selectedSubjectId, 10),
        sessionDuration,
        selectedClassId ? parseInt(selectedClassId, 10) : null,
        secVal
      );
      if (res.data?.session) {
        const sess = res.data.session;
        const expiresAt = new Date(sess.expires_at).getTime();
        const now = new Date().getTime();
        const rem = Math.max(0, Math.floor((expiresAt - now) / 1000));
        setActiveSessionData({
          active: true,
          session: sess,
          total_enrolled: 0,
          present_count: 0,
          absent_count: 0,
          attendance_rate: 0,
          attendees: [],
        });
        setTimeRemaining(rem > 0 ? rem : sessionDuration);
      }
      checkActiveQrSession();
    } catch (err) {
      console.error("Failed to start QR session:", err);
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
      checkActiveQrSession();
    } catch (err) {
      setError("Failed to close session.");
    }
  };

  const handleDismissSession = () => {
    setActiveSessionData(null);
    setTimeRemaining(0);
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

  const filteredStudents = students.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.roll_no && s.roll_no.toLowerCase().includes(q)) ||
      (s.student_id_str && s.student_id_str.toLowerCase().includes(q)) ||
      (s.branch && s.branch.toLowerCase().includes(q)) ||
      (s.section && s.section.toLowerCase().includes(q))
    );
  });

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

              <button
                type="button"
                className={`action-btn ${activeTab === "leaves" ? "btn-primary" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: activeTab === "leaves" ? "#7c3aed" : "#f1f5f9",
                  color: activeTab === "leaves" ? "#fff" : "#475569",
                  border: "none",
                  position: "relative",
                }}
                onClick={() => {
                  setActiveTab("leaves");
                  fetchFacultyLeaves();
                }}
              >
                <FaFileAlt /> Leave & OD Queue
                {facultyLeaves.filter((l) => l.status === "PENDING").length > 0 && (
                  <span
                    style={{
                      background: "#ef4444",
                      color: "#fff",
                      borderRadius: "999px",
                      padding: "2px 7px",
                      fontSize: "11px",
                      fontWeight: 700,
                      marginLeft: "4px",
                    }}
                  >
                    {facultyLeaves.filter((l) => l.status === "PENDING").length}
                  </span>
                )}
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
                ) : activeSessionData.is_completed || !activeSessionData.active ? (
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 14px",
                        background: "#ecfdf5",
                        color: "#059669",
                        borderRadius: "20px",
                        fontWeight: 700,
                        fontSize: "13px",
                        marginBottom: "14px",
                      }}
                    >
                      <FaCheckCircle /> ATTENDANCE COMPLETED & STORED IN DATABASE
                    </div>

                    <h3 style={{ margin: "0 0 6px 0", color: "#0f172a" }}>
                      {activeSessionData.session?.subject_details?.name || "Attendance Session"}
                    </h3>
                    <p style={{ color: "#64748b", fontSize: "13px", margin: "0 0 16px 0" }}>
                      {activeSessionData.session?.subject_details?.code} • {activeSessionData.session?.class_display || `Section ${activeSessionData.session?.section || 'A'}`}
                    </p>

                    {/* 10-Minute Present Review Banner */}
                    <div
                      style={{
                        background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)",
                        border: "1px solid #a7f3d0",
                        borderRadius: "14px",
                        padding: "18px",
                        marginBottom: "18px",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#065f46", marginBottom: "4px" }}>
                        ⏱ Present Students Appearing for 10 Minutes
                      </div>
                      <div style={{ fontSize: "24px", fontWeight: 800, color: "#059669", fontFamily: "monospace", margin: "6px 0" }}>
                        {Math.floor(timeRemaining / 60)}m {String(timeRemaining % 60).padStart(2, "0")}s
                      </div>
                      <div style={{ fontSize: "12px", color: "#047857" }}>
                        Attendance is permanently saved in the database. Review vanishes automatically after countdown.
                      </div>
                    </div>

                    <div
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "12px",
                        fontSize: "13px",
                        color: "#334155",
                        marginBottom: "20px",
                        display: "flex",
                        justifyContent: "space-around",
                      }}
                    >
                      <span><strong>Enrolled:</strong> {activeSessionData.total_enrolled}</span>
                      <span style={{ color: "#059669" }}><strong>Present:</strong> {activeSessionData.present_count}</span>
                      <span style={{ color: "#dc2626" }}><strong>Absent:</strong> {activeSessionData.absent_count}</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleDismissSession}
                      style={{
                        width: "100%",
                        padding: "12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        background: "#0f172a",
                        color: "#fff",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Dismiss & Start New Session
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
                      ● SESSION ACTIVE • {activeSessionData.session?.subject_details?.code} • {activeSessionData.session?.class_display || `Section ${activeSessionData.session?.section || 'A'}`}
                    </div>

                    <h3 style={{ margin: "0 0 6px 0", color: "#0f172a" }}>
                      {activeSessionData.session?.subject_details?.name}
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
                        value={`${window.location.origin}/mark-attendance?token=${activeSessionData.session?.qr_token || activeSessionData.session?.token || ""}`}
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
                          const sessToken = activeSessionData.session?.qr_token || activeSessionData.session?.token || "";
                          const directUrl = `${window.location.origin}/mark-attendance?token=${sessToken}`;
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
                        href={`/mark-attendance?token=${activeSessionData.session?.qr_token || activeSessionData.session?.token || ""}`}
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
                        <code>{activeSessionData.session?.qr_token}</code>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(activeSessionData.session?.qr_token);
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
                  {activeSessionData?.is_completed || !activeSessionData?.active
                    ? "Present Students (Stored in Database • 10-Min Review)"
                    : "Live Attendance Check-Ins"}
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
                  {activeSessionData?.is_completed || !activeSessionData?.active
                    ? `Students Marked Present (${activeSessionData?.present_count ?? 0}):`
                    : `Verified Checked-In Students (${activeSessionData?.attendees?.length ?? 0}):`}
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
                {/* Search Bar & Header Controls */}
                <div className="att-table-header-controls">
                  <div className="att-search-box">
                    <FaSearch className="search-icon" />
                    <input
                      type="text"
                      placeholder="Search student by name, roll number, or ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        className="clear-search-btn"
                        onClick={() => setSearchQuery("")}
                        title="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="att-search-count">
                    Showing <strong>{filteredStudents.length}</strong> of {students.length} students
                  </div>
                </div>

                {loading ? (
                  <div className="att-loading" style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                    <i className="fa-solid fa-spinner fa-spin"></i> Loading attendance records from database...
                  </div>
                ) : (
                  <div className="table-responsive-wrapper">
                    <table className="modern-att-table">
                      <thead>
                        <tr>
                          <th style={{ width: "16%" }}>Roll No / ID</th>
                          <th style={{ width: "26%" }}>Student Name</th>
                          <th style={{ width: "18%" }}>Branch & Year</th>
                          <th style={{ width: "10%" }}>Section</th>
                          <th style={{ width: "15%" }}>Status</th>
                          <th style={{ width: "15%", textAlign: "center" }}>Mark Attendance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudents.length > 0 ? (
                          filteredStudents.map((student) => {
                            const currentStatus = attendance[student.id] || "Not Marked";
                            return (
                              <tr
                                key={student.id}
                                className={
                                  currentStatus === "Present"
                                    ? "att-row-present"
                                    : currentStatus === "Absent"
                                    ? "att-row-absent"
                                    : currentStatus === "Late"
                                    ? "att-row-late"
                                    : "att-row-unmarked"
                                }
                              >
                                <td>
                                  <span className="att-roll-badge">
                                    {student.roll_no || student.student_id_str || `#${student.id}`}
                                  </span>
                                </td>
                                <td>
                                  <div className="att-student-profile">
                                    <div
                                      className="att-avatar-circle"
                                      style={{
                                        backgroundColor:
                                          currentStatus === "Present"
                                            ? "#dcfce7"
                                            : currentStatus === "Absent"
                                            ? "#fee2e2"
                                            : "#eff6ff",
                                        color:
                                          currentStatus === "Present"
                                            ? "#15803d"
                                            : currentStatus === "Absent"
                                            ? "#b91c1c"
                                            : "#2563eb",
                                      }}
                                    >
                                      {student.name ? student.name[0].toUpperCase() : "S"}
                                    </div>
                                    <div>
                                      <div className="att-student-name">{student.name}</div>
                                      <div className="att-student-sub">
                                        {student.student_id_str ? `ID: ${student.student_id_str}` : `ID: #${student.id}`}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                                    <span className={`att-branch-pill ${student.branch?.toLowerCase() || "cse"}`}>
                                      {student.branch || "CSE"}
                                    </span>
                                    <span className="att-year-badge">
                                      Year {student.year || 1} {student.semester ? `• Sem ${student.semester}` : ""}
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <span className="att-sec-badge">
                                    Sec {student.section || "A"}
                                  </span>
                                </td>
                                <td>
                                  {currentStatus === "Present" && (
                                    <span className="att-status-pill pill-present">
                                      <FaCheckCircle className="pill-icon green-icon" /> Present
                                    </span>
                                  )}
                                  {currentStatus === "Absent" && (
                                    <span className="att-status-pill pill-absent">
                                      <FaTimesCircle className="pill-icon red-icon" /> Absent
                                    </span>
                                  )}
                                  {currentStatus === "Late" && (
                                    <span className="att-status-pill pill-late">
                                      <FaClock className="pill-icon amber-icon" /> Late
                                    </span>
                                  )}
                                  {currentStatus !== "Present" && currentStatus !== "Absent" && currentStatus !== "Late" && (
                                    <span className="att-status-pill pill-unmarked">
                                      <FaQuestionCircle className="pill-icon gray-icon" /> Not Marked
                                    </span>
                                  )}
                                </td>
                                <td style={{ textAlign: "center" }}>
                                  <div className="att-action-group">
                                    <button
                                      type="button"
                                      className={`att-action-btn present-btn ${
                                        currentStatus === "Present" ? "is-selected" : ""
                                      }`}
                                      onClick={() => handleStatusChange(student.id, "Present")}
                                      title="Mark Student Present"
                                    >
                                      <FaCheck /> Present
                                    </button>
                                    <button
                                      type="button"
                                      className={`att-action-btn absent-btn ${
                                        currentStatus === "Absent" ? "is-selected" : ""
                                      }`}
                                      onClick={() => handleStatusChange(student.id, "Absent")}
                                      title="Mark Student Absent"
                                    >
                                      <FaTimes /> Absent
                                    </button>
                                    <button
                                      type="button"
                                      className={`att-action-btn late-btn ${
                                        currentStatus === "Late" ? "is-selected" : ""
                                      }`}
                                      onClick={() => handleStatusChange(student.id, "Late")}
                                      title="Mark Student Late"
                                    >
                                      <FaClock /> Late
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="6" style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                              {searchQuery ? `No students found matching "${searchQuery}".` : "No students found matching selected filters."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
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
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: "16px", color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                          <FaExclamationTriangle style={{ color: "#dc2626" }} />
                          Students Below {threshold}% Required Threshold
                        </h4>
                        <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#64748b" }}>
                          Instant official shortage notifications delivered to students &amp; parents via Email and SMS text message.
                        </p>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: "12px",
                            background: "#fef2f2",
                            color: "#dc2626",
                            padding: "6px 12px",
                            borderRadius: "20px",
                            fontWeight: 700,
                            border: "1px solid #fecaca",
                          }}
                        >
                          {summaryData.low_attendance_students?.length || 0} At-Risk Students
                        </span>

                        {summaryData.low_attendance_students && summaryData.low_attendance_students.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleDispatchAlerts(null)}
                            disabled={alertSending}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "8px 16px",
                              borderRadius: "10px",
                              background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                              color: "#ffffff",
                              border: "none",
                              cursor: alertSending ? "not-allowed" : "pointer",
                              fontSize: "12.5px",
                              fontWeight: 700,
                              boxShadow: "0 4px 12px rgba(220, 38, 38, 0.25)",
                              opacity: alertSending ? 0.7 : 1,
                            }}
                          >
                            <FaPaperPlane />
                            {alertSending && !alertingStudentId ? "Dispatching..." : `Alert All (${summaryData.low_attendance_students.length}) Defaulters`}
                          </button>
                        )}
                      </div>
                    </div>

                    {alertError && (
                      <div style={{ background: "#fee2e2", border: "1px solid #fecaca", color: "#b91c1c", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "13px" }}>
                        {alertError}
                      </div>
                    )}

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
                            <th>Parent &amp; Student Contacts</th>
                            <th>Alert Dispatch</th>
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
                                <td>
                                  <div style={{ fontSize: "12px", color: "#334155" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "3px" }} title="Parent / Student Email">
                                      <FaEnvelope style={{ color: "#2563eb", fontSize: "11px" }} />
                                      <span style={{ fontWeight: 600 }}>{stu.parent_email || stu.student_email || "No email"}</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "5px", color: "#64748b" }} title="Parent / Student Phone">
                                      <FaPhoneAlt style={{ color: "#059669", fontSize: "11px" }} />
                                      <span>{stu.parent_phone || stu.student_phone || "No phone"}</span>
                                    </div>
                                    {stu.last_alert_at && (
                                      <div style={{ fontSize: "10.5px", color: "#7c3aed", marginTop: "2px", fontWeight: 600 }}>
                                        Last alerted: {new Date(stu.last_alert_at).toLocaleDateString()}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    onClick={() => handleDispatchAlerts(stu.student_id)}
                                    disabled={alertSending}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      padding: "5px 10px",
                                      borderRadius: "6px",
                                      background: "#fef2f2",
                                      color: "#dc2626",
                                      border: "1px solid #fecaca",
                                      cursor: alertSending ? "not-allowed" : "pointer",
                                      fontSize: "11.5px",
                                      fontWeight: 700,
                                      transition: "all 0.15s ease",
                                    }}
                                    title="Send immediate Email &amp; SMS alert to student and parents"
                                  >
                                    <FaPaperPlane />
                                    {alertSending && alertingStudentId === stu.student_id ? "Sending..." : "Send Alert"}
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="8" style={{ textAlign: "center", padding: "24px", color: "#059669" }}>
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

          {/* ============================================================== */}
          {/* TAB 4: LEAVE & ON-DUTY (OD) APPROVAL QUEUE                     */}
          {/* ============================================================== */}
          {activeTab === "leaves" && (
            <div style={{ background: "#ffffff", borderRadius: "16px", padding: "24px", boxShadow: "0 4px 15px rgba(0,0,0,0.05)" }}>
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "24px",
                  flexWrap: "wrap",
                  gap: "16px",
                }}
              >
                <div>
                  <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a", margin: "0 0 6px 0" }}>
                    Student Leave & On-Duty (OD) Requests
                  </h2>
                  <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
                    Review, approve, or reject student leave and on-duty requests. Approved requests automatically credit attendance and protect eligibility thresholds.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchFacultyLeaves}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 16px",
                    background: "#f1f5f9",
                    color: "#334155",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  <FaSync className={leavesLoading ? "fa-spin" : ""} /> Refresh Requests
                </button>
              </div>

              {/* Status Stat Cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "16px",
                  marginBottom: "24px",
                }}
              >
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    padding: "16px",
                    cursor: "pointer",
                    boxShadow: leaveStatusFilter === "ALL" ? "0 0 0 2px #3b82f6" : "none",
                  }}
                  onClick={() => setLeaveStatusFilter("ALL")}
                >
                  <div style={{ fontSize: "12px", fontWeight: "600", color: "#64748b", textTransform: "uppercase" }}>
                    Total Applications
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: "800", color: "#0f172a", marginTop: "4px" }}>
                    {facultyLeaves.length}
                  </div>
                </div>

                <div
                  style={{
                    background: "#fffbeb",
                    border: "1px solid #fef3c7",
                    borderRadius: "12px",
                    padding: "16px",
                    cursor: "pointer",
                    boxShadow: leaveStatusFilter === "PENDING" ? "0 0 0 2px #f59e0b" : "none",
                  }}
                  onClick={() => setLeaveStatusFilter("PENDING")}
                >
                  <div style={{ fontSize: "12px", fontWeight: "600", color: "#b45309", textTransform: "uppercase" }}>
                    Pending Review
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: "800", color: "#d97706", marginTop: "4px" }}>
                    {facultyLeaves.filter((l) => l.status === "PENDING").length}
                  </div>
                </div>

                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #dcfce7",
                    borderRadius: "12px",
                    padding: "16px",
                    cursor: "pointer",
                    boxShadow: leaveStatusFilter === "APPROVED" ? "0 0 0 2px #10b981" : "none",
                  }}
                  onClick={() => setLeaveStatusFilter("APPROVED")}
                >
                  <div style={{ fontSize: "12px", fontWeight: "600", color: "#15803d", textTransform: "uppercase" }}>
                    Approved
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: "800", color: "#16a34a", marginTop: "4px" }}>
                    {facultyLeaves.filter((l) => l.status === "APPROVED").length}
                  </div>
                </div>

                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fee2e2",
                    borderRadius: "12px",
                    padding: "16px",
                    cursor: "pointer",
                    boxShadow: leaveStatusFilter === "REJECTED" ? "0 0 0 2px #ef4444" : "none",
                  }}
                  onClick={() => setLeaveStatusFilter("REJECTED")}
                >
                  <div style={{ fontSize: "12px", fontWeight: "600", color: "#b91c1c", textTransform: "uppercase" }}>
                    Rejected
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: "800", color: "#dc2626", marginTop: "4px" }}>
                    {facultyLeaves.filter((l) => l.status === "REJECTED").length}
                  </div>
                </div>
              </div>

              {/* Filter Tabs & Search Bar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "16px",
                  marginBottom: "20px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {["ALL", "PENDING", "APPROVED", "REJECTED"].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setLeaveStatusFilter(st)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "20px",
                        fontSize: "12px",
                        fontWeight: "600",
                        cursor: "pointer",
                        border: "none",
                        background: leaveStatusFilter === st ? "#2563eb" : "#f1f5f9",
                        color: leaveStatusFilter === st ? "#ffffff" : "#475569",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {st === "ALL" ? "All Requests" : st.charAt(0) + st.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>

                <div style={{ position: "relative", minWidth: "260px" }}>
                  <FaSearch
                    style={{
                      position: "absolute",
                      left: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#94a3b8",
                      fontSize: "13px",
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Search by student, roll no, reason..."
                    value={leaveSearchQuery}
                    onChange={(e) => setLeaveSearchQuery(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px 8px 34px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* Leaves Table */}
              {leavesLoading ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                  <FaSync className="fa-spin" style={{ fontSize: "24px", marginBottom: "8px" }} />
                  <div>Loading leave requests...</div>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "13px",
                      textAlign: "left",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                        <th style={{ padding: "12px", color: "#475569", fontWeight: "700" }}>Student</th>
                        <th style={{ padding: "12px", color: "#475569", fontWeight: "700" }}>Type</th>
                        <th style={{ padding: "12px", color: "#475569", fontWeight: "700" }}>Duration</th>
                        <th style={{ padding: "12px", color: "#475569", fontWeight: "700" }}>Reason & Document</th>
                        <th style={{ padding: "12px", color: "#475569", fontWeight: "700" }}>Status</th>
                        <th style={{ padding: "12px", color: "#475569", fontWeight: "700" }}>Action / Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {facultyLeaves
                        .filter((item) => {
                          if (leaveStatusFilter !== "ALL" && item.status !== leaveStatusFilter) {
                            return false;
                          }
                          if (!leaveSearchQuery.trim()) return true;
                          const q = leaveSearchQuery.toLowerCase();
                          return (
                            (item.student_name && item.student_name.toLowerCase().includes(q)) ||
                            (item.roll_no && item.roll_no.toLowerCase().includes(q)) ||
                            (item.leave_type_display && item.leave_type_display.toLowerCase().includes(q)) ||
                            (item.reason && item.reason.toLowerCase().includes(q))
                          );
                        })
                        .map((l) => {
                          const typeBadgeBg =
                            l.leave_type === "OD"
                              ? "#eef2ff"
                              : l.leave_type === "MEDICAL"
                              ? "#fef2f2"
                              : l.leave_type === "ACADEMIC"
                              ? "#ecfdf5"
                              : "#f0f9ff";
                          const typeBadgeColor =
                            l.leave_type === "OD"
                              ? "#4f46e5"
                              : l.leave_type === "MEDICAL"
                              ? "#dc2626"
                              : l.leave_type === "ACADEMIC"
                              ? "#059669"
                              : "#0284c7";

                          const statusBadgeBg =
                            l.status === "APPROVED"
                              ? "#dcfce7"
                              : l.status === "REJECTED"
                              ? "#fee2e2"
                              : "#fef3c7";
                          const statusBadgeColor =
                            l.status === "APPROVED"
                              ? "#15803d"
                              : l.status === "REJECTED"
                              ? "#b91c1c"
                              : "#b45309";

                          return (
                            <tr key={l.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "14px 12px" }}>
                                <div style={{ fontWeight: "700", color: "#0f172a" }}>{l.student_name}</div>
                                <div style={{ fontSize: "12px", color: "#64748b" }}>
                                  {l.roll_no} • {l.branch} (Sem {l.semester})
                                </div>
                              </td>

                              <td style={{ padding: "14px 12px" }}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "4px 10px",
                                    borderRadius: "12px",
                                    fontSize: "11px",
                                    fontWeight: "700",
                                    background: typeBadgeBg,
                                    color: typeBadgeColor,
                                  }}
                                >
                                  {l.leave_type_display}
                                </span>
                              </td>

                              <td style={{ padding: "14px 12px" }}>
                                <div style={{ fontWeight: "600", color: "#1e293b" }}>
                                  {l.start_date} → {l.end_date}
                                </div>
                                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                                  {l.total_days} {l.total_days === 1 ? "day" : "days"}
                                </div>
                              </td>

                              <td style={{ padding: "14px 12px", maxWidth: "260px" }}>
                                <div
                                  style={{
                                    color: "#334155",
                                    whiteSpace: "pre-wrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    maxHeight: "60px",
                                  }}
                                >
                                  {l.reason}
                                </div>
                                {l.document_url && (
                                  <div style={{ marginTop: "4px" }}>
                                    <a
                                      href={l.document_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        color: "#2563eb",
                                        fontSize: "11px",
                                        textDecoration: "underline",
                                      }}
                                    >
                                      <FaExternalLinkAlt style={{ fontSize: "10px" }} /> Supporting Document
                                    </a>
                                  </div>
                                )}
                              </td>

                              <td style={{ padding: "14px 12px" }}>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    padding: "4px 10px",
                                    borderRadius: "12px",
                                    fontSize: "11px",
                                    fontWeight: "700",
                                    background: statusBadgeBg,
                                    color: statusBadgeColor,
                                  }}
                                >
                                  {l.status === "APPROVED" && <FaCheckCircle style={{ fontSize: "10px" }} />}
                                  {l.status === "REJECTED" && <FaTimesCircle style={{ fontSize: "10px" }} />}
                                  {l.status === "PENDING" && <FaClock style={{ fontSize: "10px" }} />}
                                  {l.status_display}
                                </span>
                              </td>

                              <td style={{ padding: "14px 12px" }}>
                                {l.status === "PENDING" ? (
                                  <div style={{ display: "flex", gap: "6px" }}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setReviewModalData(l);
                                        setReviewerRemarks("");
                                      }}
                                      style={{
                                        padding: "6px 12px",
                                        background: "#2563eb",
                                        color: "#ffffff",
                                        border: "none",
                                        borderRadius: "6px",
                                        fontWeight: "600",
                                        fontSize: "12px",
                                        cursor: "pointer",
                                      }}
                                    >
                                      Review
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                                    <div>
                                      <strong>By:</strong> {l.reviewed_by_name || "Faculty/Admin"}
                                    </div>
                                    {l.reviewer_remarks && (
                                      <div style={{ fontStyle: "italic", marginTop: "2px", color: "#475569" }}>
                                        "{l.reviewer_remarks}"
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      {facultyLeaves.filter((item) => {
                        if (leaveStatusFilter !== "ALL" && item.status !== leaveStatusFilter) {
                          return false;
                        }
                        if (!leaveSearchQuery.trim()) return true;
                        const q = leaveSearchQuery.toLowerCase();
                        return (
                          (item.student_name && item.student_name.toLowerCase().includes(q)) ||
                          (item.roll_no && item.roll_no.toLowerCase().includes(q)) ||
                          (item.leave_type_display && item.leave_type_display.toLowerCase().includes(q)) ||
                          (item.reason && item.reason.toLowerCase().includes(q))
                        );
                      }).length === 0 && (
                        <tr>
                          <td colSpan="6" style={{ textAlign: "center", padding: "36px", color: "#94a3b8" }}>
                            No leave applications found for this filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Review Modal Dialog */}
          {reviewModalData && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(15, 23, 42, 0.65)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
                padding: "16px",
              }}
            >
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: "16px",
                  padding: "24px",
                  maxWidth: "520px",
                  width: "100%",
                  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "700", color: "#0f172a" }}>
                    Review Leave Request
                  </h3>
                  <button
                    type="button"
                    onClick={() => setReviewModalData(null)}
                    style={{ background: "transparent", border: "none", fontSize: "18px", color: "#94a3b8", cursor: "pointer" }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", marginBottom: "16px", fontSize: "13px" }}>
                  <div style={{ marginBottom: "6px" }}>
                    <strong style={{ color: "#334155" }}>Student:</strong> {reviewModalData.student_name} ({reviewModalData.roll_no})
                  </div>
                  <div style={{ marginBottom: "6px" }}>
                    <strong style={{ color: "#334155" }}>Branch & Sem:</strong> {reviewModalData.branch} • Semester {reviewModalData.semester}
                  </div>
                  <div style={{ marginBottom: "6px" }}>
                    <strong style={{ color: "#334155" }}>Type:</strong> {reviewModalData.leave_type_display}
                  </div>
                  <div style={{ marginBottom: "6px" }}>
                    <strong style={{ color: "#334155" }}>Duration:</strong> {reviewModalData.start_date} to {reviewModalData.end_date} ({reviewModalData.total_days} days)
                  </div>
                  <div style={{ marginBottom: "6px" }}>
                    <strong style={{ color: "#334155" }}>Reason:</strong> {reviewModalData.reason}
                  </div>
                  {reviewModalData.document_url && (
                    <div>
                      <strong style={{ color: "#334155" }}>Proof Document:</strong>{" "}
                      <a href={reviewModalData.document_url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", textDecoration: "underline" }}>
                        View Document ↗
                      </a>
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#334155", marginBottom: "6px" }}>
                    Reviewer Remarks (Optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Provide feedback or justification (visible to the student)..."
                    value={reviewerRemarks}
                    onChange={(e) => setReviewerRemarks(e.target.value)}
                    style={{
                      width: "100%",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      padding: "10px",
                      fontSize: "13px",
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    disabled={isSubmittingReview}
                    onClick={() => setReviewModalData(null)}
                    style={{
                      padding: "8px 16px",
                      background: "#f1f5f9",
                      color: "#475569",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      fontWeight: "600",
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={isSubmittingReview}
                    onClick={() => handleReviewAction(reviewModalData.id, "REJECTED")}
                    style={{
                      padding: "8px 16px",
                      background: "#ef4444",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: "600",
                      fontSize: "13px",
                      cursor: isSubmittingReview ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <FaTimes /> Reject
                  </button>

                  <button
                    type="button"
                    disabled={isSubmittingReview}
                    onClick={() => handleReviewAction(reviewModalData.id, "APPROVED")}
                    style={{
                      padding: "8px 16px",
                      background: "#10b981",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: "600",
                      fontSize: "13px",
                      cursor: isSubmittingReview ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <FaCheck /> Approve & Credit
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Alert Success Confirmation Modal */}
          {alertSuccessModal && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(15, 23, 42, 0.6)",
                backdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
                padding: "16px",
              }}
              onClick={() => setAlertSuccessModal(null)}
            >
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: "16px",
                  padding: "28px",
                  maxWidth: "520px",
                  width: "100%",
                  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
                  textAlign: "center",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    background: "#ecfdf5",
                    color: "#059669",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "26px",
                    margin: "0 auto 16px auto",
                  }}
                >
                  <FaCheckCircle />
                </div>

                <h3 style={{ margin: "0 0 8px 0", fontSize: "19px", color: "#0f172a" }}>
                  Attendance Warning Notices Dispatched!
                </h3>
                <p style={{ margin: "0 0 20px 0", fontSize: "14px", color: "#475569", lineHeight: 1.5 }}>
                  Official shortage notices with attendance rates and recovery requirements have been dispatched via <strong>Email</strong> and <strong>SMS text message</strong> to students and their parents/guardians.
                </p>

                <div
                  style={{
                    background: "#f8fafc",
                    borderRadius: "12px",
                    padding: "16px",
                    textAlign: "left",
                    marginBottom: "20px",
                    border: "1px solid #e2e8f0",
                    fontSize: "13px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ color: "#64748b" }}>Recipients Notified:</span>
                    <strong style={{ color: "#0f172a" }}>{alertSuccessModal.total_dispatched} Student(s) &amp; Families</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ color: "#64748b" }}>Threshold Applied:</span>
                    <strong style={{ color: "#dc2626" }}>&lt; {alertSuccessModal.threshold}% Mandatory</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Delivery Channels:</span>
                    <strong style={{ color: "#059669" }}>Email (Official HTML Notice) + SMS</strong>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAlertSuccessModal(null)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "10px",
                    background: "#0f172a",
                    color: "#ffffff",
                    border: "none",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Attendance;