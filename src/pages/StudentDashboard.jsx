import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import StudentNavbar from "../components/StudentNavbar";
import {
  getMyReportCard,
  getMyAttendance,
  getTimetable,
  getAnnouncements,
  markQrAttendance,
} from "../services/studentservice";
import "../styles/studentdashboard.css";
import { Html5QrcodeScanner } from "html5-qrcode";
import {
  FaGraduationCap,
  FaCalendarCheck,
  FaChartLine,
  FaBook,
  FaAward,
  FaClock,
  FaBell,
  FaCheckCircle,
  FaExclamationTriangle,
  FaUserTie,
  FaDownload,
  FaEnvelope,
  FaPhone,
  FaBuilding,
  FaQrcode,
  FaTimes,
  FaCamera,
  FaKeyboard,
} from "react-icons/fa";

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { currentUser, isStudent } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!currentUser || !isStudent) {
      navigate("/login/student", { replace: true });
    }
  }, [currentUser, isStudent, navigate]);

  const studentName = currentUser?.name || "Student";
  const studentBranch = currentUser?.branch || "—";
  const studentYear = currentUser?.year || "—";
  const studentSem = currentUser?.semester || "—";
  const studentRoll = currentUser?.rollNo || "—";
  const studentEmail = currentUser?.email || "—";
  const studentPhone = currentUser?.phone || "—";

  // Real Database States
  const [reportData, setReportData] = useState(null);
  const [attendanceData, setAttendanceData] = useState(null);
  const [timetableSlots, setTimetableSlots] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  // QR Modal States
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrMode, setQrMode] = useState("camera"); // "camera" | "manual"
  const [qrInputToken, setQrInputToken] = useState("");
  const [qrSubmitting, setQrSubmitting] = useState(false);
  const [qrResult, setQrResult] = useState(null);
  const [cameraError, setCameraError] = useState(null);

  const extractTokenFromInput = (text) => {
    if (!text) return "";
    const trimmed = text.trim();
    if (trimmed.includes("token=")) {
      try {
        const url = new URL(trimmed);
        return url.searchParams.get("token") || trimmed;
      } catch {
        const match = trimmed.match(/token=([a-zA-Z0-9_-]+)/);
        if (match) return match[1];
      }
    }
    return trimmed;
  };

  const submitTokenDirectly = async (tokenValue) => {
    const cleanToken = extractTokenFromInput(tokenValue);
    if (!cleanToken) return;

    setQrSubmitting(true);
    setQrResult(null);

    try {
      const res = await markQrAttendance(cleanToken);
      setQrResult({
        success: true,
        message: res.data?.message || "Attendance marked successfully!",
      });
      setQrInputToken("");
      getMyAttendance().then((attRes) => {
        if (attRes.data) setAttendanceData(attRes.data);
      });
    } catch (err) {
      const errMsg =
        err.response?.data?.detail ||
        err.response?.data?.error ||
        "Failed to mark attendance. Please verify the code or ask faculty.";
      setQrResult({
        success: false,
        message: errMsg,
      });
    } finally {
      setQrSubmitting(false);
    }
  };

  // Camera Scanner Lifecycle using Html5QrcodeScanner
  useEffect(() => {
    if (!showQrModal || qrMode !== "camera") return;
    setCameraError(null);

    let scanner = null;
    const timer = setTimeout(() => {
      try {
        scanner = new Html5QrcodeScanner(
          "qr-reader-target",
          {
            fps: 10,
            qrbox: { width: 240, height: 240 },
            rememberLastUsedCamera: true,
            supportedScanTypes: [0],
          },
          false
        );

        scanner.render(
          (decodedText) => {
            submitTokenDirectly(decodedText);
            try {
              scanner.clear();
            } catch {}
          },
          (errorMessage) => {
            if (
              errorMessage &&
              (errorMessage.includes("Permission") ||
                errorMessage.includes("NotAllowedError") ||
                errorMessage.includes("device not found") ||
                errorMessage.includes("NotFoundError"))
            ) {
              setCameraError(
                "Camera permission denied or camera device not found. Please allow camera permissions in your browser or switch to manual token entry."
              );
            }
          }
        );
      } catch (err) {
        console.warn("Could not start camera scanner:", err);
        setCameraError(
          "Unable to start camera on this device. Please switch to the Enter Token tab below."
        );
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      if (scanner) {
        try {
          scanner.clear();
        } catch {}
      }
    };
  }, [showQrModal, qrMode]);

  const fetchAllData = () => {
    setLoading(true);
    Promise.all([
      getMyReportCard().catch(() => ({ data: null })),
      getMyAttendance().catch(() => ({ data: null })),
      getTimetable().catch(() => ({ data: [] })),
      getAnnouncements().catch(() => ({ data: [] })),
    ])
      .then(([repRes, attRes, timeRes, annRes]) => {
        if (repRes.data) setReportData(repRes.data);
        if (attRes.data) setAttendanceData(attRes.data);
        if (timeRes.data) setTimetableSlots(timeRes.data);
        if (annRes.data) setAnnouncements(annRes.data);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!currentUser) return;
    fetchAllData();
  }, [currentUser]);

  const handleMarkQr = async (e) => {
    if (e) e.preventDefault();
    submitTokenDirectly(qrInputToken);
  };

  if (!currentUser || !isStudent) {
    return null;
  }

  const attendanceRate = attendanceData?.attendance_rate ?? 0.0;
  const isShortage = attendanceData?.shortage_warning ?? false;
  const classesNeeded = attendanceData?.classes_needed_for_75 ?? 0;
  const subjects = reportData?.subjects || [];
  const cgpa = reportData?.cgpa ?? 0.0;
  const sgpa = reportData?.sgpa ?? 0.0;
  const earnedCredits = reportData?.earned_credits ?? 0;
  const totalCredits = reportData?.total_credits ?? 0;

  // Filter today's timetable
  const todayDayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const todaysClasses = timetableSlots.filter(
    (slot) => (slot.day || "").toLowerCase() === todayDayName.toLowerCase()
  );

  return (
    <div className="student-dashboard-page">
      <StudentNavbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Hero Welcome Banner */}
      <div className="student-hero-banner">
        <div className="hero-left">
          <h1>Welcome back, {studentName}! 👋</h1>
          <p>
            Here is your live verified academic standing, attendance records, course
            grades, and department announcements for Semester {studentSem}.
          </p>
          <div className="hero-badges-row">
            <span className="hero-pill">
              <FaGraduationCap /> {studentBranch} Department
            </span>
            <span className="hero-pill">
              <FaBook /> Year {studentYear} • Semester {studentSem}
            </span>
            <span className="hero-pill">
              <FaCheckCircle style={{ color: "#34d399" }} /> Roll No: {studentRoll}
            </span>
          </div>
        </div>

        <div className="hero-status-box" style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-end" }}>
          <div>
            <small>Active Academic Standing</small>
            <div className="hero-status-val">
              {isShortage ? (
                <span style={{ color: "#f87171" }}>⚠️ Shortage Alert</span>
              ) : attendanceRate >= 75 ? (
                <span style={{ color: "#34d399" }}>Good Standing • Regular</span>
              ) : (
                <span>Enrolled Student</span>
              )}
            </div>
          </div>

          <button
            type="button"
            className="action-btn-primary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              padding: "10px 18px",
              borderRadius: "8px",
              fontWeight: 600,
              cursor: "pointer",
            }}
            onClick={() => setShowQrModal(true)}
          >
            <FaQrcode /> Scan / Enter QR Attendance
          </button>
        </div>
      </div>

      {/* Shortage Warning Alert Banner if attendance < 75% */}
      {isShortage && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "12px",
            padding: "16px 20px",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            color: "#991b1b",
          }}
        >
          <FaExclamationTriangle size={26} color="#ef4444" />
          <div>
            <h4 style={{ margin: "0 0 4px 0", fontSize: "15px", fontWeight: 700 }}>
              Attendance Shortage Warning: {attendanceRate}%
            </h4>
            <p style={{ margin: 0, fontSize: "13px", color: "#b91c1c" }}>
              Your current attendance is below the mandatory 75% examination threshold.
              {classesNeeded > 0 && (
                <strong>
                  {" "}You must attend the next {classesNeeded} consecutive classes to reach 75% eligibility.
                </strong>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Key Metric Stats Grid */}
      <div className="student-stats-grid">
        <div className="student-stat-card">
          <div className={`stat-icon-wrap ${attendanceRate >= 75 ? "green" : "red"}`}>
            <FaCalendarCheck />
          </div>
          <div className="stat-info">
            <small>Overall Attendance</small>
            <div className="stat-number">{attendanceRate}%</div>
            <span
              className={`stat-badge-tag ${
                attendanceRate >= 75 ? "tag-success" : "tag-danger"
              }`}
            >
              {attendanceRate >= 75 ? "Eligible (≥75% required)" : "Shortage Warning"}
            </span>
          </div>
        </div>

        <div className="student-stat-card">
          <div className="stat-icon-wrap blue">
            <FaChartLine />
          </div>
          <div className="stat-info">
            <small>Cumulative CGPA</small>
            <div className="stat-number">
              {cgpa > 0 ? `${cgpa} / 10` : "No GPA Yet"}
            </div>
            <span className="stat-badge-tag tag-info">
              {sgpa > 0 ? `Current SGPA: ${sgpa}` : "Evaluations in progress"}
            </span>
          </div>
        </div>

        <div className="student-stat-card">
          <div className="stat-icon-wrap purple">
            <FaBook />
          </div>
          <div className="stat-info">
            <small>Curriculum Courses</small>
            <div className="stat-number">{subjects.length} Subjects</div>
            <span className="stat-badge-tag tag-info">
              {totalCredits > 0 ? `${totalCredits} Total Credits` : "Registered"}
            </span>
          </div>
        </div>

        <div className="student-stat-card">
          <div className="stat-icon-wrap amber">
            <FaAward />
          </div>
          <div className="stat-info">
            <small>Earned Credits</small>
            <div className="stat-number">
              {earnedCredits} / {totalCredits || "—"}
            </div>
            <span className="stat-badge-tag tag-success">
              {earnedCredits === totalCredits && totalCredits > 0
                ? "All Courses Cleared"
                : "Active Semester"}
            </span>
          </div>
        </div>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="student-content-grid">
          <div className="content-col-left">
            {/* Attendance Summary */}
            <div className="student-card">
              <div className="card-title-row">
                <h3>
                  <FaCalendarCheck /> Attendance Overview
                </h3>
                <button
                  type="button"
                  className="card-action-link"
                  onClick={() => setActiveTab("attendance")}
                >
                  View Details →
                </button>
              </div>

              <div className="attendance-progress-box">
                <div className="att-header-status">
                  <span className="att-pct-bold">{attendanceRate}%</span>
                  <span className="att-target-label">Minimum requirement: 75%</span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${Math.min(100, attendanceRate)}%`,
                      backgroundColor: attendanceRate >= 75 ? "#10b981" : "#ef4444",
                    }}
                  ></div>
                </div>
                <div className="att-footer-counts">
                  <span>
                    <strong>{attendanceData?.attended_classes ?? 0}</strong> Attended
                  </span>
                  <span>
                    <strong>{attendanceData?.missed_classes ?? 0}</strong> Missed
                  </span>
                  <span>
                    <strong>{attendanceData?.total_classes ?? 0}</strong> Total Held
                  </span>
                </div>
              </div>

              {/* Subject attendance breakdown */}
              <div className="subject-att-list">
                {attendanceData?.subject_breakdown &&
                attendanceData.subject_breakdown.length > 0 ? (
                  attendanceData.subject_breakdown.slice(0, 4).map((sub) => (
                    <div key={sub.code} className="subject-att-row">
                      <div className="subj-info">
                        <span className="subj-name">{sub.name}</span>
                        <span className="subj-code">{sub.code}</span>
                      </div>
                      <div className="subj-bar-wrap">
                        <div className="progress-track" style={{ margin: 0, width: "110px" }}>
                          <div
                            className="progress-bar-fill"
                            style={{
                              width: `${Math.min(100, sub.attendance_rate)}%`,
                              backgroundColor:
                                sub.attendance_rate >= 75 ? "#10b981" : "#f59e0b",
                            }}
                          ></div>
                        </div>
                        <span className="subj-pct">{sub.attendance_rate}%</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: "16px", color: "#64748b", textAlign: "center" }}>
                    No subject-wise attendance recorded yet.
                  </div>
                )}
              </div>
            </div>

            {/* Academic Grades Quick View */}
            <div className="student-card">
              <div className="card-title-row">
                <h3>
                  <FaAward /> Subject Marks & Grades
                </h3>
                <button
                  type="button"
                  className="card-action-link"
                  onClick={() => setActiveTab("performance")}
                >
                  Full Gradebook →
                </button>
              </div>

              <table className="grades-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Code</th>
                    <th>Credits</th>
                    <th>Score</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.length > 0 ? (
                    subjects.map((sub) => (
                      <tr key={sub.code}>
                        <td>
                          <strong>{sub.name}</strong>
                        </td>
                        <td>{sub.code}</td>
                        <td>{sub.credits}</td>
                        <td>{sub.total} / 100</td>
                        <td>
                          <span className={`grade-badge ${sub.gradeClass}`}>
                            {sub.grade}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan="5"
                        style={{
                          textAlign: "center",
                          padding: "24px",
                          color: "#64748b",
                        }}
                      >
                        No academic scores recorded in database.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="content-col-right">
            {/* Today's Schedule */}
            <div className="student-card">
              <div className="card-title-row">
                <h3>
                  <FaClock /> Today's Classes ({todayDayName})
                </h3>
                <button
                  type="button"
                  className="card-action-link"
                  onClick={() => setActiveTab("timetable")}
                >
                  Full Timetable →
                </button>
              </div>

              <div className="notice-list">
                {todaysClasses.length > 0 ? (
                  todaysClasses.map((slot) => (
                    <div key={slot.id} className="notice-item alert-info">
                      <div className="notice-icon-box">
                        <FaClock />
                      </div>
                      <div className="notice-body">
                        <h4>
                          {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                        </h4>
                        <p>
                          {slot.subject_details?.name || slot.subject} • {slot.room}
                        </p>
                        <span className="notice-date">
                          Faculty: {slot.teacher_name || "Assigned Faculty"}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>
                    No lecture classes scheduled for today ({todayDayName}).
                  </div>
                )}
              </div>
            </div>

            {/* Department Notices */}
            <div className="student-card">
              <div className="card-title-row">
                <h3>
                  <FaBell /> Department Announcements
                </h3>
                <button
                  type="button"
                  className="card-action-link"
                  onClick={() => setActiveTab("announcements")}
                >
                  All ({announcements.length}) →
                </button>
              </div>

              <div className="notice-list">
                {announcements.length > 0 ? (
                  announcements.slice(0, 3).map((ann) => (
                    <div
                      key={ann.id}
                      className={`notice-item ${
                        ann.priority === "Urgent"
                          ? "alert-danger"
                          : ann.priority === "Important"
                          ? "alert-warn"
                          : "alert-info"
                      }`}
                    >
                      <div className="notice-icon-box">
                        <FaBell />
                      </div>
                      <div className="notice-body">
                        <h4>{ann.title}</h4>
                        <p>{ann.description}</p>
                        <span className="notice-date">
                          {ann.department} • {new Date(ann.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>
                    No announcements published yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: My Attendance */}
      {activeTab === "attendance" && (
        <div className="student-card">
          <div className="card-title-row">
            <h3>
              <FaCalendarCheck /> Comprehensive Attendance Report
            </h3>
            <span
              className="hero-pill"
              style={{
                color: attendanceRate >= 75 ? "#065f46" : "#b91c1c",
                background: attendanceRate >= 75 ? "#ecfdf5" : "#fef2f2",
                border: `1px solid ${attendanceRate >= 75 ? "#a7f3d0" : "#fecaca"}`,
              }}
            >
              <FaCheckCircle /> Overall Attendance: {attendanceRate}%
            </span>
          </div>

          <div className="attendance-progress-box" style={{ marginBottom: "24px" }}>
            <div className="att-header-status">
              <div>
                <span className="att-pct-bold">{attendanceRate}%</span>
                <span
                  style={{
                    marginLeft: "12px",
                    color: attendanceRate >= 75 ? "#047857" : "#dc2626",
                    fontWeight: 600,
                  }}
                >
                  {attendanceRate >= 75
                    ? "✓ Eligible for Semester Examinations"
                    : "⚠️ Attendance Shortage Warning"}
                </span>
              </div>
              <span className="att-target-label">
                Required: 75% |{" "}
                {attendanceRate >= 75
                  ? `Safe margin: +${(attendanceRate - 75).toFixed(1)}%`
                  : `Deficit: ${(75 - attendanceRate).toFixed(1)}%`}
              </span>
            </div>
            <div className="progress-track" style={{ height: "16px" }}>
              <div
                className="progress-bar-fill"
                style={{
                  width: `${Math.min(100, attendanceRate)}%`,
                  backgroundColor: attendanceRate >= 75 ? "#10b981" : "#ef4444",
                }}
              ></div>
            </div>

            {isShortage && classesNeeded > 0 && (
              <div
                style={{
                  marginTop: "12px",
                  fontSize: "13px",
                  color: "#b91c1c",
                  fontWeight: 600,
                }}
              >
                * To reach 75%, you need to attend the next {classesNeeded} consecutive classes without absence.
              </div>
            )}
          </div>

          {isShortage && (
            <div
              style={{
                marginTop: "16px",
                marginBottom: "20px",
                padding: "16px 20px",
                borderRadius: "12px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <FaExclamationTriangle style={{ fontSize: "20px", flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong style={{ display: "block", marginBottom: "4px" }}>
                  Low Attendance Warning
                </strong>
                <span>
                  {attendanceData?.warning_message || `Your overall attendance is ${attendanceRate}%. Your attendance is below the required 75% threshold.`}
                  {classesNeeded > 0 && ` You need to attend the next ${classesNeeded} consecutive classes to regain exam eligibility.`}
                </span>
              </div>
            </div>
          )}

          <h4 style={{ margin: "20px 0 12px 0", color: "#1e293b", fontSize: "16px", fontWeight: 700 }}>
            Subject-wise Attendance Breakdown
          </h4>
          <table className="grades-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Total</th>
                <th>Percentage</th>
                <th>Status & Warnings</th>
              </tr>
            </thead>
            <tbody>
              {attendanceData?.subject_breakdown &&
              attendanceData.subject_breakdown.length > 0 ? (
                attendanceData.subject_breakdown.map((sub) => (
                  <tr key={sub.code}>
                    <td>
                      <div>
                        <strong>{sub.name}</strong>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>{sub.code} • {sub.credits} Credits</div>
                      </div>
                    </td>
                    <td>
                      <span style={{ color: "#059669", fontWeight: 700 }}>{sub.present ?? sub.attended ?? 0}</span>
                    </td>
                    <td>
                      <span style={{ color: "#dc2626", fontWeight: 700 }}>{sub.absent ?? sub.missed ?? 0}</span>
                    </td>
                    <td>
                      <strong>{sub.total ?? sub.total_classes ?? 0}</strong>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div className="progress-track" style={{ width: "90px", margin: 0 }}>
                          <div
                            className="progress-bar-fill"
                            style={{
                              width: `${Math.min(100, sub.percentage ?? sub.attendance_rate)}%`,
                              backgroundColor:
                                (sub.percentage ?? sub.attendance_rate) >= 75 ? "#10b981" : "#ef4444",
                            }}
                          ></div>
                        </div>
                        <strong>{sub.percentage ?? sub.attendance_rate}%</strong>
                      </div>
                    </td>
                    <td>
                      {sub.is_shortage ? (
                        <div style={{ color: "#b91c1c", fontSize: "12px", fontWeight: 600 }}>
                          ⚠️ {sub.warning || `Attendance is below 75% (${sub.classes_needed_for_75} classes needed)`}
                        </div>
                      ) : (
                        <span className="stat-badge-tag tag-success">
                          ✓ Normal Standing
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="6"
                    style={{ textAlign: "center", padding: "20px", color: "#64748b" }}
                  >
                    No subject attendance records found in database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Attendance History Section */}
          <div style={{ marginTop: "32px" }}>
            <h4 style={{ margin: "0 0 12px 0", color: "#1e293b", fontSize: "16px", fontWeight: 700 }}>
              Recent Attendance History
            </h4>
            <div className="table-responsive">
              <table className="grades-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Subject / Class</th>
                    <th>Marked Via</th>
                    <th>Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceData?.history && attendanceData.history.length > 0 ? (
                    attendanceData.history.map((rec) => (
                      <tr key={rec.id}>
                        <td>
                          <strong>{rec.date}</strong>
                        </td>
                        <td>
                          <div>
                            <strong>{rec.subject_code ? `${rec.subject_code} - ` : ""}{rec.subject}</strong>
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 600,
                              background: rec.marked_via === "QR" ? "#eff6ff" : "#f1f5f9",
                              color: rec.marked_via === "QR" ? "#2563eb" : "#475569",
                            }}
                          >
                            {rec.marked_via === "QR" ? "QR Code" : "Teacher Manual"}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: "12px", color: "#64748b" }}>
                            {rec.marked_at ? new Date(rec.marked_at).toLocaleTimeString() : "—"}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`stat-badge-tag ${
                              rec.status === "Present"
                                ? "tag-success"
                                : rec.status === "Late"
                                ? "tag-warn"
                                : "tag-danger"
                            }`}
                          >
                            {rec.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
                        No recent attendance entries recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: My Grades & SGPA */}
      {activeTab === "performance" && (
        <div className="student-card">
          <div className="card-title-row">
            <h3>
              <FaAward /> Authentic Academic Gradebook & SGPA
            </h3>
            <button
              type="button"
              className="quick-fill-btn"
              onClick={() => window.print()}
            >
              <FaDownload /> Print Grade Slip
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div className="profile-field-box">
              <small>Cumulative CGPA</small>
              <span style={{ fontSize: "20px", color: "#059669", fontWeight: 700 }}>
                {cgpa > 0 ? `${cgpa} / 10` : "N/A"}
              </span>
            </div>
            <div className="profile-field-box">
              <small>Current Semester SGPA</small>
              <span style={{ fontSize: "20px", color: "#2563eb", fontWeight: 700 }}>
                {sgpa > 0 ? `${sgpa} / 10` : "N/A"}
              </span>
            </div>
            <div className="profile-field-box">
              <small>Earned Credits</small>
              <span style={{ fontSize: "20px", color: "#0f172a", fontWeight: 700 }}>
                {earnedCredits} / {totalCredits || "—"}
              </span>
            </div>
            <div className="profile-field-box">
              <small>Academic Status</small>
              <span
                style={{
                  fontSize: "18px",
                  color: cgpa >= 7.5 ? "#047857" : cgpa >= 5.0 ? "#2563eb" : "#d97706",
                  fontWeight: 600,
                }}
              >
                {cgpa >= 8.5
                  ? "Distinction Level"
                  : cgpa >= 7.0
                  ? "First Class Standing"
                  : cgpa >= 5.0
                  ? "Good Standing"
                  : "Regular"}
              </span>
            </div>
          </div>

          <table className="grades-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Course Title</th>
                <th>Credits</th>
                <th>Internals (40)</th>
                <th>End Sem (60)</th>
                <th>Total (100)</th>
                <th>Grade</th>
                <th>Grade Point</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {subjects.length > 0 ? (
                subjects.map((sub) => (
                  <tr key={sub.code}>
                    <td>
                      <strong>{sub.code}</strong>
                    </td>
                    <td>{sub.name}</td>
                    <td>{sub.credits}</td>
                    <td>{sub.internals}</td>
                    <td>{sub.endSem}</td>
                    <td>
                      <strong>{sub.total}</strong>
                    </td>
                    <td>
                      <span className={`grade-badge ${sub.gradeClass}`}>
                        {sub.grade}
                      </span>
                    </td>
                    <td>{sub.gradePoint}</td>
                    <td>
                      <span
                        className={`stat-badge-tag ${
                          sub.isPassed ? "tag-success" : "tag-danger"
                        }`}
                      >
                        {sub.isPassed ? "PASSED" : "FAILED"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="9"
                    style={{ textAlign: "center", padding: "30px", color: "#64748b" }}
                  >
                    No examination records found in database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 4: Timetable */}
      {activeTab === "timetable" && (
        <div className="student-card">
          <div className="card-title-row">
            <h3>
              <FaClock /> Weekly Academic Timetable
            </h3>
            <span className="hero-pill">
              Branch: {studentBranch} • Semester {studentSem}
            </span>
          </div>

          <div className="table-responsive" style={{ marginTop: "16px" }}>
            <table className="grades-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Time</th>
                  <th>Course Code</th>
                  <th>Course Name</th>
                  <th>Room / Lab</th>
                  <th>Faculty Instructor</th>
                </tr>
              </thead>
              <tbody>
                {timetableSlots.length > 0 ? (
                  timetableSlots.map((slot) => (
                    <tr key={slot.id}>
                      <td>
                        <strong>{slot.day}</strong>
                      </td>
                      <td>
                        {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                      </td>
                      <td>
                        <strong>{slot.subject_details?.code || slot.subject}</strong>
                      </td>
                      <td>{slot.subject_details?.name || "Course Lecture"}</td>
                      <td>{slot.room}</td>
                      <td>{slot.teacher_name || "Faculty"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="6"
                      style={{ textAlign: "center", padding: "28px", color: "#64748b" }}
                    >
                      No lecture timetable configured for {studentBranch} Semester {studentSem}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Announcements */}
      {activeTab === "announcements" && (
        <div className="student-card">
          <div className="card-title-row">
            <h3>
              <FaBell /> Department & University Announcements
            </h3>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}>
            {announcements.length > 0 ? (
              announcements.map((ann) => (
                <div
                  key={ann.id}
                  style={{
                    padding: "16px 20px",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "6px",
                    }}
                  >
                    <h4 style={{ margin: 0, fontSize: "16px", color: "#0f172a" }}>
                      {ann.title}
                    </h4>
                    <span
                      className={`stat-badge-tag ${
                        ann.priority === "Urgent"
                          ? "tag-danger"
                          : ann.priority === "Important"
                          ? "tag-info"
                          : "tag-success"
                      }`}
                    >
                      {ann.priority}
                    </span>
                  </div>
                  <p style={{ margin: "0 0 10px 0", color: "#475569", fontSize: "14px", lineHeight: "1.5" }}>
                    {ann.description}
                  </p>
                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                    Posted by {ann.author_name || ann.author_username} • Department: {ann.department} • Date: {new Date(ann.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>
                No active announcements published.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 6: Official Student Profile */}
      {activeTab === "profile" && (
        <div className="student-card">
          <div className="card-title-row">
            <h3>
              <FaUserTie /> Official Student Profile
            </h3>
            <span className="stat-badge-tag tag-success">Active Enrolled Student</span>
          </div>

          <div className="profile-details-grid">
            <div className="profile-field-box">
              <small>Full Legal Name</small>
              <span>{studentName}</span>
            </div>
            <div className="profile-field-box">
              <small>University Roll Number</small>
              <span>{studentRoll}</span>
            </div>
            <div className="profile-field-box">
              <small>System Student ID</small>
              <span>{currentUser?.studentId || `STU2024${currentUser?.id || "0001"}`}</span>
            </div>
            <div className="profile-field-box">
              <small>Branch / Department</small>
              <span>{studentBranch}</span>
            </div>
            <div className="profile-field-box">
              <small>Academic Year & Semester</small>
              <span>Year {studentYear} • Semester {studentSem}</span>
            </div>
            <div className="profile-field-box">
              <small>Contact Email</small>
              <span>
                <FaEnvelope style={{ marginRight: "6px" }} />
                {studentEmail}
              </span>
            </div>
            <div className="profile-field-box">
              <small>Contact Phone</small>
              <span>
                <FaPhone style={{ marginRight: "6px" }} />
                {studentPhone}
              </span>
            </div>
            <div className="profile-field-box">
              <small>Institutional Unit</small>
              <span>
                <FaBuilding style={{ marginRight: "6px" }} />
                College of Engineering & Technology
              </span>
            </div>
          </div>
        </div>
      )}

      {/* QR Attendance Scanner Modal */}
      {showQrModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
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
              padding: "28px",
              maxWidth: "460px",
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
              position: "relative",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setShowQrModal(false);
                setQrResult(null);
                setQrInputToken("");
              }}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "none",
                border: "none",
                fontSize: "18px",
                color: "#64748b",
                cursor: "pointer",
              }}
            >
              <FaTimes />
            </button>

            <div style={{ textAlign: "center", marginBottom: "16px" }}>
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  background: "#eff6ff",
                  color: "#2563eb",
                  borderRadius: "50%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                  marginBottom: "10px",
                }}
              >
                <FaQrcode />
              </div>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "19px", color: "#0f172a" }}>
                Mark Live QR Attendance
              </h3>
              <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>
                Scan the faculty QR code with your camera, or enter the session token.
              </p>
            </div>

            {/* Mode Toggle Tabs */}
            <div
              style={{
                display: "flex",
                background: "#f1f5f9",
                padding: "4px",
                borderRadius: "10px",
                marginBottom: "16px",
                gap: "4px",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setQrMode("camera");
                  setQrResult(null);
                }}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "none",
                  background: qrMode === "camera" ? "#ffffff" : "transparent",
                  color: qrMode === "camera" ? "#2563eb" : "#64748b",
                  fontWeight: qrMode === "camera" ? 700 : 500,
                  fontSize: "13px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  boxShadow: qrMode === "camera" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                <FaCamera /> 📷 Camera Scanner
              </button>
              <button
                type="button"
                onClick={() => {
                  setQrMode("manual");
                  setQrResult(null);
                }}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "none",
                  background: qrMode === "manual" ? "#ffffff" : "transparent",
                  color: qrMode === "manual" ? "#2563eb" : "#64748b",
                  fontWeight: qrMode === "manual" ? 700 : 500,
                  fontSize: "13px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  boxShadow: qrMode === "manual" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                <FaKeyboard /> ⌨ Manual Code
              </button>
            </div>

            {qrResult && (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "10px",
                  marginBottom: "14px",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: qrResult.success ? "#ecfdf5" : "#fef2f2",
                  border: `1px solid ${qrResult.success ? "#a7f3d0" : "#fecaca"}`,
                  color: qrResult.success ? "#065f46" : "#991b1b",
                }}
              >
                {qrResult.success ? <FaCheckCircle size={18} /> : <FaExclamationTriangle size={18} />}
                <span>{qrResult.message}</span>
              </div>
            )}

            {qrSubmitting && (
              <div
                style={{
                  padding: "16px",
                  textAlign: "center",
                  color: "#2563eb",
                  fontWeight: 600,
                  fontSize: "14px",
                  background: "#eff6ff",
                  borderRadius: "10px",
                  marginBottom: "14px",
                }}
              >
                Submitting & validating attendance token...
              </div>
            )}

            {/* TAB 1: CAMERA SCANNER */}
            {qrMode === "camera" && !qrResult?.success && (
              <div style={{ marginBottom: "16px" }}>
                {cameraError && (
                  <div
                    style={{
                      background: "#fff1f2",
                      border: "1px solid #fecdd3",
                      borderRadius: "8px",
                      padding: "12px 14px",
                      color: "#9f1239",
                      fontSize: "13px",
                      marginBottom: "12px",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: "4px" }}>Camera Notice</div>
                    <div style={{ lineHeight: "1.4" }}>{cameraError}</div>
                    <button
                      type="button"
                      onClick={() => setQrMode("manual")}
                      style={{
                        marginTop: "8px",
                        padding: "6px 12px",
                        background: "#e11d48",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Switch to Enter Code Manually
                    </button>
                  </div>
                )}
                <div
                  id="qr-reader-target"
                  style={{
                    width: "100%",
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: "1px solid #cbd5e1",
                  }}
                />
                <p
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    textAlign: "center",
                    marginTop: "8px",
                    marginBottom: 0,
                  }}
                >
                  💡 Point camera at faculty's QR code. Check-in records automatically upon detection!
                </p>
              </div>
            )}

            {/* TAB 2: MANUAL TOKEN ENTRY */}
            {qrMode === "manual" && !qrResult?.success && (
              <form onSubmit={handleMarkQr}>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    htmlFor="qr-token-input"
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#334155",
                      marginBottom: "6px",
                      textAlign: "left",
                    }}
                  >
                    Temporary Session QR Token (or link):
                  </label>
                  <input
                    id="qr-token-input"
                    type="text"
                    placeholder="Paste session token or scanned link..."
                    value={qrInputToken}
                    onChange={(e) => setQrInputToken(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                    required
                  />
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setShowQrModal(false)}
                    style={{
                      flex: 1,
                      padding: "12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      color: "#475569",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={qrSubmitting || !qrInputToken.trim()}
                    style={{
                      flex: 2,
                      padding: "12px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#2563eb",
                      color: "#ffffff",
                      fontWeight: 600,
                      cursor: qrSubmitting ? "not-allowed" : "pointer",
                    }}
                  >
                    {qrSubmitting ? "Validating..." : "Submit Attendance ✓"}
                  </button>
                </div>
              </form>
            )}

            {/* CLOSE BUTTON AFTER SUCCESS */}
            {qrResult?.success && (
              <button
                type="button"
                onClick={() => {
                  setShowQrModal(false);
                  setQrResult(null);
                  setQrInputToken("");
                }}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#10b981",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Close & View Updated Dashboard ✓
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
