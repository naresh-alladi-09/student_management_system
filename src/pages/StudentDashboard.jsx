import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import StudentNavbar from "../components/StudentNavbar";
import {
  getMyReportCard,
  getMyAttendance,
  getTimetable,
  getAnnouncements,
  markQrAttendance,
  getAllSubjects,
  getLeaveRequests,
  applyLeaveRequest,
  deleteLeaveRequest,
  getMyHallTickets,
  updateProfilePicture,
} from "../services/studentservice";
import "../styles/studentdashboard.css";
import { Html5QrcodeScanner } from "html5-qrcode";
import { QRCodeSVG } from "qrcode.react";
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
  FaFileAlt,
  FaPlusCircle,
  FaTrashAlt,
  FaInfoCircle,
  FaIdCard,
  FaPrint,
  FaShieldAlt,
  FaUniversity,
  FaExclamationCircle,
  FaCheck,
} from "react-icons/fa";

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { currentUser, isStudent, updateUserProfilePicState } = useAuth();
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

  // Student Profile Picture Upload States
  const studentPhotoInputRef = useRef(null);
  const [studentPreviewPic, setStudentPreviewPic] = useState(null);
  const [studentPicFile, setStudentPicFile] = useState(null);
  const [isSavingPic, setIsSavingPic] = useState(false);
  const [picStatusMsg, setPicStatusMsg] = useState(null);

  const handleStudentPhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPicStatusMsg({ type: "error", text: "Please select an image file (JPG, PNG, WEBP)." });
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setStudentPreviewPic(dataUrl);
        setStudentPicFile(dataUrl);
        setPicStatusMsg(null);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveStudentPic = async () => {
    if (!studentPicFile) return;
    setIsSavingPic(true);
    setPicStatusMsg(null);
    try {
      const res = await updateProfilePicture(studentPicFile);
      if (res.data?.success) {
        updateUserProfilePicState(res.data.profile_pic);
        setPicStatusMsg({
          type: "success",
          text: "Profile picture saved! Your Examination Hall Tickets and ID cards are now updated.",
        });
        setStudentPicFile(null);
        fetchStudentHallTickets();
      } else {
        setPicStatusMsg({ type: "error", text: res.data?.error || "Failed to update profile picture." });
      }
    } catch (err) {
      setPicStatusMsg({
        type: "error",
        text: err.response?.data?.error || "Error uploading picture. Please try again.",
      });
    } finally {
      setIsSavingPic(false);
    }
  };

  const handleRemoveStudentPic = async () => {
    setIsSavingPic(true);
    setPicStatusMsg(null);
    try {
      const res = await updateProfilePicture("");
      if (res.data?.success) {
        updateUserProfilePicState("");
        setStudentPreviewPic("");
        setStudentPicFile(null);
        setPicStatusMsg({ type: "success", text: "Profile picture removed." });
        fetchStudentHallTickets();
      }
    } catch {
      setPicStatusMsg({ type: "error", text: "Failed to remove photo." });
    } finally {
      setIsSavingPic(false);
    }
  };

  // Real Database States
  const [reportData, setReportData] = useState(null);
  const [attendanceData, setAttendanceData] = useState(null);
  const [timetableSlots, setTimetableSlots] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [curriculumCourses, setCurriculumCourses] = useState([]);
  const [studentCourseSemFilter, setStudentCourseSemFilter] = useState("CURRENT");
  const [loading, setLoading] = useState(true);

  // Leave & On-Duty (OD) States
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveFormData, setLeaveFormData] = useState({
    leave_type: "OD",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    reason: "",
    document_url: "",
  });
  const [leaveModalMessage, setLeaveModalMessage] = useState(null);
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);

  // Hall Ticket States
  const [hallTickets, setHallTickets] = useState([]);
  const [pendingExamSessions, setPendingExamSessions] = useState([]);
  const [selectedTicketIndex, setSelectedTicketIndex] = useState(0);
  const [hallTicketsLoading, setHallTicketsLoading] = useState(false);

  const fetchStudentHallTickets = () => {
    setHallTicketsLoading(true);
    getMyHallTickets()
      .then((res) => {
        const data = res.data;
        if (Array.isArray(data)) {
          setHallTickets(data);
          setPendingExamSessions([]);
        } else if (data && typeof data === "object") {
          setHallTickets(data.tickets || []);
          setPendingExamSessions(data.pending_sessions || []);
        }
      })
      .catch((err) => {
        console.error("Failed to load hall tickets:", err);
      })
      .finally(() => {
        setHallTicketsLoading(false);
      });
  };

  // QR Modal States
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrMode, setQrMode] = useState("camera"); // "camera" | "manual"
  const [qrInputToken, setQrInputToken] = useState("");
  const [qrSubmitting, setQrSubmitting] = useState(false);
  const [qrResult, setQrResult] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [currentTimeStr, setCurrentTimeStr] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setCurrentTimeStr(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
      );
    }, 15000);
    return () => clearInterval(timer);
  }, []);

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
      getAllSubjects().catch(() => ({ data: [] })),
      getLeaveRequests().catch(() => ({ data: [] })),
      getMyHallTickets().catch(() => ({ data: [] })),
    ])
      .then(([repRes, attRes, timeRes, annRes, subRes, leaveRes, ticketRes]) => {
        if (repRes.data) setReportData(repRes.data);
        if (attRes.data) setAttendanceData(attRes.data);
        if (timeRes.data) setTimetableSlots(timeRes.data);
        if (annRes.data) setAnnouncements(annRes.data);
        if (subRes.data) setCurriculumCourses(subRes.data);
        if (leaveRes.data) setLeaveRequests(leaveRes.data);
        if (ticketRes.data) {
          const tData = ticketRes.data;
          if (Array.isArray(tData)) {
            setHallTickets(tData);
            setPendingExamSessions([]);
          } else if (tData && typeof tData === "object") {
            setHallTickets(tData.tickets || []);
            setPendingExamSessions(tData.pending_sessions || []);
          } else {
            setHallTickets([]);
            setPendingExamSessions([]);
          }
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!currentUser) return;
    fetchAllData();
  }, [currentUser]);

  useEffect(() => {
    if (activeTab === "hallticket") {
      fetchStudentHallTickets();
    }
  }, [activeTab]);

  const handleApplyLeave = async (e) => {
    if (e) e.preventDefault();
    setIsSubmittingLeave(true);
    setLeaveModalMessage(null);

    if (!leaveFormData.start_date || !leaveFormData.reason.trim()) {
      setLeaveModalMessage({
        success: false,
        text: "Please provide start date and detailed reason for leave.",
      });
      setIsSubmittingLeave(false);
      return;
    }

    if (leaveFormData.end_date < leaveFormData.start_date) {
      setLeaveModalMessage({
        success: false,
        text: "End date cannot be earlier than start date.",
      });
      setIsSubmittingLeave(false);
      return;
    }

    try {
      await applyLeaveRequest(leaveFormData);
      setLeaveModalMessage({
        success: true,
        text: "Leave application submitted successfully! Your department faculty will review it.",
      });
      fetchAllData();
      setTimeout(() => {
        setShowLeaveModal(false);
        setLeaveModalMessage(null);
        setLeaveFormData({
          leave_type: "OD",
          start_date: new Date().toISOString().slice(0, 10),
          end_date: new Date().toISOString().slice(0, 10),
          reason: "",
          document_url: "",
        });
      }, 1500);
    } catch (err) {
      setLeaveModalMessage({
        success: false,
        text: err.response?.data?.detail || "Failed to submit leave request.",
      });
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  const handleCancelLeave = async (leaveId) => {
    if (!window.confirm("Are you sure you want to cancel this pending leave request?")) {
      return;
    }
    try {
      await deleteLeaveRequest(leaveId);
      fetchAllData();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to cancel leave request.");
    }
  };

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

  // Filter today's timetable with automatic vanishing:
  // Morning periods disappear after their end time (in afternoon)
  // Afternoon periods disappear after their end time (in evening)
  const todayDayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const allTodayClasses = timetableSlots.filter(
    (slot) => (slot.day || "").toLowerCase() === todayDayName.toLowerCase()
  );
  const todaysClasses = allTodayClasses.filter((slot) => {
    const endStr = (slot.end_time || "").slice(0, 8);
    return endStr > currentTimeStr.slice(0, 8);
  });
  const completedTodayCount = allTodayClasses.length - todaysClasses.length;

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
            <p style={{ margin: "0 0 6px 0", fontSize: "13px", color: "#b91c1c" }}>
              Your current attendance is below the mandatory 75% examination threshold.
              {classesNeeded > 0 && (
                <strong>
                  {" "}You must attend the next {classesNeeded} consecutive classes to reach 75% eligibility.
                </strong>
              )}
            </p>
            <div style={{ fontSize: "12px", color: "#991b1b", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>⚠️ Official shortage alert has been sent via Email &amp; SMS to your registered email and your parent/guardian.</span>
            </div>
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

        <div
          className="student-stat-card"
          onClick={() => setActiveTab("courses")}
          style={{ cursor: "pointer" }}
          title="Click to view Curriculum Courses & Syllabus"
        >
          <div className="stat-icon-wrap purple">
            <FaBook />
          </div>
          <div className="stat-info">
            <small>Curriculum Courses</small>
            <div className="stat-number">
              {curriculumCourses.length > 0
                ? `${curriculumCourses.filter((c) => String(c.semester) === String(studentSem) && (c.branch || "").toUpperCase() === String(studentBranch).toUpperCase()).length || curriculumCourses.length} Subjects`
                : `${subjects.length} Subjects`}
            </div>
            <span className="stat-badge-tag tag-info">
              {curriculumCourses.length > 0
                ? `${curriculumCourses
                    .filter(
                      (c) =>
                        String(c.semester) === String(studentSem) &&
                        (c.branch || "").toUpperCase() === String(studentBranch).toUpperCase()
                    )
                    .reduce((acc, c) => acc + (Number(c.credits) || 0), 0) || totalCredits} Sem Credits`
                : `${totalCredits > 0 ? `${totalCredits} Total Credits` : "Registered"}`}
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
                  todaysClasses.map((slot) => {
                    const startStr = (slot.start_time || "").slice(0, 8);
                    const endStr = (slot.end_time || "").slice(0, 8);
                    const isLiveNow = startStr <= currentTimeStr.slice(0, 8) && currentTimeStr.slice(0, 8) < endStr;

                    return (
                      <div
                        key={slot.id}
                        className={`notice-item ${isLiveNow ? "alert-success" : "alert-info"}`}
                        style={{
                          border: isLiveNow ? "2px solid #10b981" : undefined,
                          background: isLiveNow ? "#f0fdf4" : undefined,
                        }}
                      >
                        <div className="notice-icon-box" style={{ background: isLiveNow ? "#10b981" : undefined, color: isLiveNow ? "#fff" : undefined }}>
                          {isLiveNow ? <FaQrcode /> : <FaClock />}
                        </div>
                        <div className="notice-body" style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                            <h4>
                              {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                            </h4>
                            {isLiveNow ? (
                              <span style={{ fontSize: "11px", fontWeight: 700, color: "#059669", background: "#dcfce7", padding: "2px 8px", borderRadius: "10px" }}>
                                ● LIVE CLASS NOW
                              </span>
                            ) : (
                              <span style={{ fontSize: "11px", color: "#64748b" }}>
                                Starts at {slot.start_time.slice(0, 5)}
                              </span>
                            )}
                          </div>
                          <p>
                            {slot.subject_details?.name || slot.subject} • {slot.room}
                          </p>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                            <span className="notice-date">
                              Faculty: {slot.teacher_name || "Assigned Faculty"}
                            </span>
                            {isLiveNow && (
                              <button
                                type="button"
                                onClick={() => {
                                  setShowQrModal(true);
                                  setQrMode("camera");
                                }}
                                style={{
                                  padding: "4px 10px",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  background: "#10b981",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: "6px",
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                }}
                              >
                                <FaQrcode /> Scan QR
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                    {completedTodayCount > 0 ? (
                      <>All {completedTodayCount} scheduled lecture periods for today have completed and concluded.</>
                    ) : (
                      <>No lecture classes scheduled for today ({todayDayName}).</>
                    )}
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

      {/* Tab: Curriculum Courses & Academic Syllabus */}
      {activeTab === "courses" && (
        <div className="student-card">
          <div
            className="card-title-row"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <h3 style={{ margin: "0 0 4px 0", display: "flex", alignItems: "center", gap: "8px" }}>
                <FaBook style={{ color: "#059669" }} /> Enrolled Curriculum Courses &amp; Academic Syllabus
              </h3>
              <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
                Official institution syllabus accredited for {studentBranch} Department, Semester {studentSem}.
              </p>
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => setStudentCourseSemFilter("CURRENT")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "20px",
                  border: "none",
                  background: studentCourseSemFilter === "CURRENT" ? "#059669" : "#f1f5f9",
                  color: studentCourseSemFilter === "CURRENT" ? "#fff" : "#475569",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Semester {studentSem} (Current)
              </button>
              <button
                type="button"
                onClick={() => setStudentCourseSemFilter("ALL")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "20px",
                  border: "none",
                  background: studentCourseSemFilter === "ALL" ? "#0f172a" : "#f1f5f9",
                  color: studentCourseSemFilter === "ALL" ? "#fff" : "#475569",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                All {studentBranch} Courses
              </button>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          {(() => {
            const displayedCourses = curriculumCourses.filter((course) => {
              const matchBranch =
                !studentBranch ||
                studentBranch === "—" ||
                (course.branch || "").toUpperCase() === String(studentBranch).toUpperCase();
              if (studentCourseSemFilter === "CURRENT") {
                return matchBranch && String(course.semester) === String(studentSem);
              }
              return matchBranch;
            });

            const totalSemCredits = displayedCourses.reduce(
              (acc, c) => acc + (Number(c.credits) || 0),
              0
            );

            const gradedCount = displayedCourses.filter((course) =>
              subjects.some(
                (s) => (s.code || "").toUpperCase() === (course.code || "").toUpperCase()
              )
            ).length;

            return (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: "12px",
                    marginTop: "16px",
                    marginBottom: "20px",
                    background: "#f8fafc",
                    padding: "14px",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div>
                    <small style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>
                      {studentCourseSemFilter === "CURRENT" ? "Semester Courses" : "Total Program Courses"}
                    </small>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                      {displayedCourses.length} Subjects
                    </div>
                  </div>

                  <div>
                    <small style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>
                      Credit Weightage
                    </small>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: "#d97706" }}>
                      {totalSemCredits} Total Credits
                    </div>
                  </div>

                  <div>
                    <small style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>
                      Evaluated / Graded
                    </small>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: "#059669" }}>
                      {gradedCount} / {displayedCourses.length} Subjects
                    </div>
                  </div>

                  <div>
                    <small style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>
                      Academic Department
                    </small>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#2563eb", marginTop: "2px" }}>
                      {studentBranch} Engineering
                    </div>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="grades-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Course Code</th>
                        <th style={{ textAlign: "left" }}>Course Title</th>
                        <th style={{ textAlign: "center" }}>Semester</th>
                        <th style={{ textAlign: "center" }}>Credits</th>
                        <th style={{ textAlign: "left" }}>Department</th>
                        <th style={{ textAlign: "center" }}>Academic Standing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedCourses.length > 0 ? (
                        displayedCourses.map((course) => {
                          const gradedScore = subjects.find(
                            (s) =>
                              (s.code || "").toUpperCase() === (course.code || "").toUpperCase()
                          );
                          const isCurrentSem = String(course.semester) === String(studentSem);

                          return (
                            <tr
                              key={course.id}
                              style={{
                                backgroundColor: isCurrentSem ? "rgba(240, 253, 244, 0.4)" : "transparent",
                              }}
                            >
                              <td>
                                <span
                                  style={{
                                    background: "#ecfdf5",
                                    color: "#065f46",
                                    padding: "4px 8px",
                                    borderRadius: "6px",
                                    fontFamily: "monospace",
                                    fontWeight: 700,
                                    fontSize: "13px",
                                    border: "1px solid #a7f3d0",
                                  }}
                                >
                                  {course.code}
                                </span>
                              </td>
                              <td>
                                <strong style={{ color: "#0f172a" }}>{course.name}</strong>
                                {isCurrentSem && (
                                  <span
                                    style={{
                                      marginLeft: "8px",
                                      fontSize: "11px",
                                      background: "#eff6ff",
                                      color: "#2563eb",
                                      padding: "2px 8px",
                                      borderRadius: "12px",
                                      fontWeight: 600,
                                      border: "1px solid #bfdbfe",
                                    }}
                                  >
                                    Active Term
                                  </span>
                                )}
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <span className="stat-badge-tag tag-neutral">
                                  Sem {course.semester}
                                </span>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <span
                                  style={{
                                    background: "#fef3c7",
                                    color: "#92400e",
                                    padding: "3px 8px",
                                    borderRadius: "6px",
                                    fontWeight: 700,
                                    fontSize: "12px",
                                    border: "1px solid #fde68a",
                                  }}
                                >
                                  {course.credits} Credits
                                </span>
                              </td>
                              <td>
                                <span style={{ color: "#475569", fontSize: "13px" }}>
                                  {course.department}
                                </span>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                {gradedScore ? (
                                  <span className={`grade-badge ${gradedScore.gradeClass}`}>
                                    Grade {gradedScore.grade} ({gradedScore.total}/100)
                                  </span>
                                ) : (
                                  <span className="stat-badge-tag tag-info">
                                    Enrolled / Ongoing
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td
                            colSpan="6"
                            style={{ textAlign: "center", padding: "32px", color: "#64748b" }}
                          >
                            No curriculum courses configured for {studentBranch} Department.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Tab: Leave & On-Duty (OD) Management */}
      {activeTab === "leaves" && (
        <div className="student-card">
          <div
            className="card-title-row"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <h3 style={{ margin: "0 0 4px 0", display: "flex", alignItems: "center", gap: "8px" }}>
                <FaFileAlt style={{ color: "#2563eb" }} /> Leave &amp; On-Duty (OD) Applications
              </h3>
              <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
                Apply for On-Duty (OD) representations, medical leaves, or academic duties. Approved leaves grant automatic attendance credit.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowLeaveModal(true)}
              style={{
                background: "#2563eb",
                color: "#fff",
                border: "none",
                padding: "10px 18px",
                borderRadius: "10px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)",
              }}
            >
              <FaPlusCircle /> Apply for Leave / OD
            </button>
          </div>

          {/* Quick Metrics Strip */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "12px",
              marginTop: "16px",
              marginBottom: "20px",
              background: "#f8fafc",
              padding: "14px",
              borderRadius: "10px",
              border: "1px solid #e2e8f0",
            }}
          >
            <div>
              <small style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>
                Pending Reviews
              </small>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#d97706" }}>
                {leaveRequests.filter((l) => l.status === "PENDING").length} Requests
              </div>
            </div>

            <div>
              <small style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>
                Approved Applications
              </small>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#059669" }}>
                {leaveRequests.filter((l) => l.status === "APPROVED").length} Approved
              </div>
            </div>

            <div>
              <small style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>
                Attendance Credited
              </small>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#2563eb" }}>
                {leaveRequests
                  .filter((l) => l.status === "APPROVED")
                  .reduce((acc, l) => acc + (l.total_days || 1), 0)}{" "}
                Days
              </div>
            </div>

            <div>
              <small style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>
                75% Threshold Status
              </small>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#059669", marginTop: "2px" }}>
                Automatic Protection Active
              </div>
            </div>
          </div>

          {/* Applications Table */}
          <div className="table-responsive">
            <table className="grades-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>ID</th>
                  <th style={{ textAlign: "left" }}>Leave Type</th>
                  <th style={{ textAlign: "center" }}>Duration</th>
                  <th style={{ textAlign: "left" }}>Reason &amp; Purpose</th>
                  <th style={{ textAlign: "center" }}>Proof Doc</th>
                  <th style={{ textAlign: "center" }}>Status</th>
                  <th style={{ textAlign: "left" }}>Reviewer Notes</th>
                  <th style={{ textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {leaveRequests.length > 0 ? (
                  leaveRequests.map((req) => (
                    <tr key={req.id}>
                      <td>
                        <span
                          style={{
                            background: "#f1f5f9",
                            color: "#475569",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            fontFamily: "monospace",
                            fontWeight: 700,
                            fontSize: "12px",
                          }}
                        >
                          #LV-{String(req.id).padStart(4, "0")}
                        </span>
                      </td>

                      <td>
                        <span
                          style={{
                            background:
                              req.leave_type === "OD"
                                ? "#eff6ff"
                                : req.leave_type === "MEDICAL"
                                ? "#ecfdf5"
                                : req.leave_type === "CASUAL"
                                ? "#faf5ff"
                                : "#fef3c7",
                            color:
                              req.leave_type === "OD"
                                ? "#1d4ed8"
                                : req.leave_type === "MEDICAL"
                                ? "#065f46"
                                : req.leave_type === "CASUAL"
                                ? "#7e22ce"
                                : "#92400e",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            fontWeight: 700,
                            fontSize: "12px",
                            border:
                              req.leave_type === "OD"
                                ? "1px solid #bfdbfe"
                                : req.leave_type === "MEDICAL"
                                ? "1px solid #a7f3d0"
                                : req.leave_type === "CASUAL"
                                ? "1px solid #e9d5ff"
                                : "1px solid #fde68a",
                          }}
                        >
                          {req.leave_type_display}
                        </span>
                      </td>

                      <td style={{ textAlign: "center" }}>
                        <div style={{ fontWeight: 600, fontSize: "13px", color: "#0f172a" }}>
                          {req.start_date === req.end_date
                            ? req.start_date
                            : `${req.start_date} → ${req.end_date}`}
                        </div>
                        <small style={{ color: "#64748b", fontSize: "11px" }}>
                          {req.total_days} Day{req.total_days > 1 ? "s" : ""}
                        </small>
                      </td>

                      <td style={{ maxWidth: "260px" }}>
                        <span style={{ fontSize: "13px", color: "#334155" }}>
                          {req.reason}
                        </span>
                      </td>

                      <td style={{ textAlign: "center" }}>
                        {req.document_url ? (
                          <a
                            href={req.document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "#2563eb",
                              textDecoration: "underline",
                              fontSize: "12px",
                              fontWeight: 600,
                            }}
                          >
                            View Proof ↗
                          </a>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "12px" }}>—</span>
                        )}
                      </td>

                      <td style={{ textAlign: "center" }}>
                        <span
                          className={`stat-badge-tag ${
                            req.status === "APPROVED"
                              ? "tag-success"
                              : req.status === "REJECTED"
                              ? "tag-danger"
                              : "tag-warning"
                          }`}
                        >
                          {req.status_display || req.status}
                        </span>
                      </td>

                      <td>
                        {req.reviewed_by_name ? (
                          <div style={{ fontSize: "12px" }}>
                            <strong>{req.reviewed_by_name}</strong>
                            {req.reviewer_remarks && (
                              <div style={{ color: "#64748b", marginTop: "2px" }}>
                                "{req.reviewer_remarks}"
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "12px" }}>Awaiting review</span>
                        )}
                      </td>

                      <td style={{ textAlign: "center" }}>
                        {req.status === "PENDING" ? (
                          <button
                            type="button"
                            onClick={() => handleCancelLeave(req.id)}
                            title="Cancel pending application"
                            style={{
                              background: "#fef2f2",
                              color: "#dc2626",
                              border: "1px solid #fecaca",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <FaTrashAlt /> Cancel
                          </button>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "12px" }}>Completed</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" style={{ textAlign: "center", padding: "36px", color: "#64748b" }}>
                      <div style={{ maxWidth: "420px", margin: "0 auto" }}>
                        <div
                          style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "50%",
                            background: "#f1f5f9",
                            color: "#94a3b8",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto 12px auto",
                            fontSize: "20px",
                          }}
                        >
                          <FaFileAlt />
                        </div>
                        <h4 style={{ margin: "0 0 6px 0", color: "#1e293b", fontSize: "16px" }}>
                          No Leave or On-Duty Applications
                        </h4>
                        <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#64748b" }}>
                          Going on leave or attending a college event? Submit an On-Duty or Medical application to safeguard your 75% attendance record.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowLeaveModal(true)}
                          style={{
                            background: "#2563eb",
                            color: "#fff",
                            border: "none",
                            padding: "8px 16px",
                            borderRadius: "8px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          <FaPlusCircle /> Apply Now
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Hall Ticket / Admit Card */}
      {activeTab === "hallticket" && (
        <div>
          {/* Header Card */}
          <div
            className="no-print"
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "20px 24px",
              marginBottom: "20px",
              boxShadow: "0 4px 15px rgba(0,0,0,0.05)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div>
              <h2
                style={{
                  margin: "0 0 6px 0",
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "#0f172a",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <FaIdCard style={{ color: "#2563eb" }} />
                Semester Examination Hall Ticket / Admit Card
              </h2>
              <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
                Verify your attendance eligibility, view paper timetables, and download your official examination hall ticket.
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button
                type="button"
                onClick={fetchStudentHallTickets}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  background: "#f1f5f9",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Refresh Status
              </button>

              {Array.isArray(hallTickets) && hallTickets.length > 0 && hallTickets[selectedTicketIndex]?.is_eligible && (
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "9px 18px",
                    background: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)",
                  }}
                >
                  <FaPrint /> Print / Save PDF
                </button>
              )}
            </div>
          </div>

          {/* Exam Selector if multiple published exams */}
          {Array.isArray(hallTickets) && hallTickets.length > 1 && (
            <div
              className="no-print"
              style={{
                display: "flex",
                gap: "8px",
                marginBottom: "20px",
                overflowX: "auto",
                paddingBottom: "4px",
              }}
            >
              {hallTickets.map((t, idx) => (
                <button
                  key={t.id || idx}
                  type="button"
                  onClick={() => setSelectedTicketIndex(idx)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "10px",
                    border: "none",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: selectedTicketIndex === idx ? "#0f172a" : "#e2e8f0",
                    color: selectedTicketIndex === idx ? "#ffffff" : "#475569",
                  }}
                >
                  {t.exam_session_name || `Exam Session ${idx + 1}`}
                </button>
              ))}
            </div>
          )}

          {/* Pending Examination Sessions Scheduled by Admin (Awaiting Approval/Release) */}
          {Array.isArray(pendingExamSessions) && pendingExamSessions.length > 0 && (
            <div className="no-print" style={{ marginBottom: "20px" }}>
              {pendingExamSessions.map((session) => (
                <div
                  key={session.id}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #bfdbfe",
                    borderRadius: "16px",
                    padding: "20px 24px",
                    boxShadow: "0 4px 16px rgba(37, 99, 235, 0.08)",
                    borderLeft: "6px solid #2563eb",
                    marginBottom: "14px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px", marginBottom: "8px" }}>
                    <div>
                      <span
                        style={{
                          background: "#fef3c7",
                          color: "#92400e",
                          padding: "3px 10px",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: 800,
                          letterSpacing: "0.5px",
                          textTransform: "uppercase",
                        }}
                      >
                        ⏳ Examination Scheduled • Awaiting Admin Release
                      </span>
                      <h3 style={{ margin: "6px 0 2px 0", color: "#0f172a", fontSize: "18px", fontWeight: 700 }}>
                        {session.name} ({session.academic_year})
                      </h3>
                      <div style={{ fontSize: "13px", color: "#1e40af", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                        <FaUniversity /> {session.college_name || "ST. PETER'S ENGINEERING COLLEGE"} • Exam Dates: {session.start_date} to {session.end_date}
                      </div>
                    </div>
                    <div style={{ fontSize: "12px", background: "#f1f5f9", padding: "6px 12px", borderRadius: "8px", color: "#334155", fontWeight: 600 }}>
                      Attendance Cutoff: <strong>≥ {session.min_attendance_percentage}%</strong>
                    </div>
                  </div>

                  <p style={{ margin: "0 0 12px 0", fontSize: "13.5px", color: "#475569", lineHeight: "1.5" }}>
                    The college administration has scheduled the examination dates and subjects. As soon as the Admin clicks the button to approve and release hall tickets, your official Admit Card with scannable QR verification will appear right here.
                  </p>

                  {session.timetable && session.timetable.length > 0 && (
                    <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "12px 16px", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b", marginBottom: "8px" }}>
                        Scheduled Subject Papers ({session.timetable.length}):
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "8px" }}>
                        {session.timetable.map((paper, pIdx) => (
                          <div key={pIdx} style={{ background: "#ffffff", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}>
                            <div style={{ fontWeight: 700, color: "#0f172a" }}>{paper.subject_code}: {paper.subject_name}</div>
                            <div style={{ color: "#64748b", fontSize: "11px", marginTop: "2px" }}>
                              📅 {paper.exam_date} • ⏰ {paper.start_time} - {paper.end_time} • 🏛️ {paper.hall_number}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {hallTicketsLoading ? (
            <div style={{ textAlign: "center", padding: "60px", color: "#64748b" }}>
              <div style={{ fontSize: "28px", marginBottom: "12px" }}>⏳</div>
              <div>Retrieving examination records and calculating attendance eligibility...</div>
            </div>
          ) : (!Array.isArray(hallTickets) || hallTickets.length === 0) ? (
            <div
              style={{
                background: "#ffffff",
                borderRadius: "16px",
                padding: "60px 24px",
                textAlign: "center",
                color: "#64748b",
                boxShadow: "0 4px 15px rgba(0,0,0,0.05)",
              }}
            >
              <div
                style={{
                  width: "60px",
                  height: "60px",
                  borderRadius: "50%",
                  background: "#eff6ff",
                  color: "#2563eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "26px",
                  margin: "0 auto 16px auto",
                }}
              >
                <FaIdCard />
              </div>
              <h3 style={{ margin: "0 0 8px 0", color: "#0f172a", fontSize: "18px" }}>
                {Array.isArray(pendingExamSessions) && pendingExamSessions.length > 0 ? "Hall Tickets Awaiting Admin Release" : "No Active Examination Hall Tickets"}
              </h3>
              <p style={{ margin: "0 auto 20px auto", maxWidth: "460px", fontSize: "14px", lineHeight: "1.5" }}>
                {Array.isArray(pendingExamSessions) && pendingExamSessions.length > 0
                  ? "Your examination schedule has been configured above. The administration will release your downloadable hall tickets shortly."
                  : "There are no published examinations currently scheduled for your branch and semester. Once the examination department publishes timetables, your admit card and eligibility status will appear here automatically."}
              </p>
            </div>
          ) : (
            (() => {
              const ticketsList = Array.isArray(hallTickets) ? hallTickets : [];
              const currentTicket = ticketsList[selectedTicketIndex] || ticketsList[0];

              if (!currentTicket) {
                return (
                  <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                    No valid hall ticket selected. Please refresh.
                  </div>
                );
              }

              if (!currentTicket.is_eligible) {
                return (
                  /* ================================================== */
                  /* ATTENDANCE SHORTAGE DETAINED NOTICE                */
                  /* ================================================== */
                  <div
                    style={{
                      background: "#ffffff",
                      borderRadius: "16px",
                      padding: "36px",
                      boxShadow: "0 10px 30px rgba(239, 68, 68, 0.08)",
                      border: "2px solid #fecaca",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "14px",
                        marginBottom: "20px",
                      }}
                    >
                      <div
                        style={{
                          width: "56px",
                          height: "56px",
                          borderRadius: "16px",
                          background: "#fee2e2",
                          color: "#dc2626",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "26px",
                          flexShrink: 0,
                        }}
                      >
                        <FaExclamationTriangle />
                      </div>
                      <div>
                        <div
                          style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: 800,
                            letterSpacing: "0.5px",
                            background: "#fee2e2",
                            color: "#b91c1c",
                            textTransform: "uppercase",
                            marginBottom: "4px",
                          }}
                        >
                          Attendance Shortage Detained
                        </div>
                        <h3 style={{ margin: 0, fontSize: "20px", color: "#0f172a", fontWeight: 700 }}>
                          Hall Ticket Withheld — {currentTicket.exam_session_name || "Semester Examination"}
                        </h3>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                        gap: "16px",
                        marginBottom: "24px",
                      }}
                    >
                      <div
                        style={{
                          background: "#fef2f2",
                          padding: "16px 20px",
                          borderRadius: "12px",
                          border: "1px solid #fee2e2",
                        }}
                      >
                        <div style={{ fontSize: "12px", color: "#991b1b", fontWeight: 600, textTransform: "uppercase" }}>
                          Your Current Attendance
                        </div>
                        <div style={{ fontSize: "28px", fontWeight: 800, color: "#dc2626", marginTop: "4px" }}>
                          {currentTicket.calculated_attendance_pct}%
                        </div>
                        <div style={{ fontSize: "12px", color: "#b91c1c", marginTop: "4px" }}>
                          Shortage of {(currentTicket.min_attendance - currentTicket.calculated_attendance_pct).toFixed(1)}%
                        </div>
                      </div>

                      <div
                        style={{
                          background: "#f8fafc",
                          padding: "16px 20px",
                          borderRadius: "12px",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
                          Mandatory Threshold
                        </div>
                        <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
                          {currentTicket.min_attendance}%
                        </div>
                        <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                          Minimum required by board regulations
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        background: "#fffbeb",
                        padding: "18px 22px",
                        borderRadius: "12px",
                        border: "1px solid #fef3c7",
                        marginBottom: "24px",
                      }}
                    >
                      <h4 style={{ margin: "0 0 8px 0", color: "#92400e", fontSize: "15px" }}>
                        How to Resolve Attendance Shortage:
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: "20px", color: "#b45309", fontSize: "13.5px", lineHeight: "1.6" }}>
                        <li>
                          <strong>On-Duty (OD) / Medical Credit:</strong> If you represented the college in sports, symposiums, hackathons, or had medical leave, apply using the Leave &amp; OD tab. Approved applications immediately credit your attendance.
                        </li>
                        <li>
                          <strong>Head of Department (HOD) Condonation:</strong> Under special circumstances (genuine medical reasons), the department authorities can grant an official condonation override to issue your hall ticket.
                        </li>
                      </ul>
                    </div>

                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("leaves");
                          setShowLeaveModal(true);
                        }}
                        style={{
                          padding: "10px 20px",
                          borderRadius: "8px",
                          background: "#2563eb",
                          color: "#ffffff",
                          border: "none",
                          fontWeight: 700,
                          fontSize: "13px",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <FaFileAlt /> Apply for On-Duty (OD) / Medical Leave
                      </button>

                      <button
                        type="button"
                        onClick={fetchStudentHallTickets}
                        style={{
                          padding: "10px 18px",
                          borderRadius: "8px",
                          background: "#f1f5f9",
                          color: "#334155",
                          border: "1px solid #cbd5e1",
                          fontWeight: 600,
                          fontSize: "13px",
                          cursor: "pointer",
                        }}
                      >
                        Recalculate &amp; Check Eligibility
                      </button>
                    </div>
                  </div>
                );
              }

              /* ================================================== */
              /* OFFICIAL PRINTABLE ADMIT CARD CANVAS               */
              /* ================================================== */
              const verifyUrl = `${window.location.origin}/verify-hallticket?token=${currentTicket.verification_token}`;

              return (
                <div>
                  {/* Status Banner */}
                  <div
                    className="no-print"
                    style={{
                      background: currentTicket.is_condoned ? "#f5f3ff" : "#ecfdf5",
                      border: `1px solid ${currentTicket.is_condoned ? "#ddd6fe" : "#a7f3d0"}`,
                      borderRadius: "12px",
                      padding: "14px 20px",
                      marginBottom: "20px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      {currentTicket.is_condoned ? (
                        <FaShieldAlt style={{ color: "#7c3aed", fontSize: "20px" }} />
                      ) : (
                        <FaCheckCircle style={{ color: "#059669", fontSize: "20px" }} />
                      )}
                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            color: currentTicket.is_condoned ? "#5b21b6" : "#065f46",
                            fontSize: "14px",
                          }}
                        >
                          {currentTicket.is_condoned
                            ? "Special Condonation Granted • Hall Ticket Issued"
                            : "Attendance Verified & Eligible for Examination"}
                        </div>
                        <div style={{ fontSize: "12px", color: currentTicket.is_condoned ? "#6d28d9" : "#047857" }}>
                          Attendance: {currentTicket.calculated_attendance_pct}% • Hall Ticket No:{" "}
                          <strong>{currentTicket.hall_ticket_number}</strong>
                          {currentTicket.is_condoned && ` • Reason: "${currentTicket.condonation_reason}"`}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => window.print()}
                      style={{
                        padding: "8px 16px",
                        background: "#0f172a",
                        color: "#fff",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <FaPrint /> Quick Print
                    </button>
                  </div>

                  {/* The Document Canvas */}
                  <div
                    className="official-admit-card-printable"
                    style={{
                      background: "#ffffff",
                      border: "3px double #1e3a8a",
                      borderRadius: "12px",
                      padding: "32px",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
                      color: "#0f172a",
                      position: "relative",
                      maxWidth: "920px",
                      margin: "0 auto",
                    }}
                  >
                    {/* Institutional Header */}
                    <div
                      style={{
                        borderBottom: "2px solid #1e3a8a",
                        paddingBottom: "16px",
                        marginBottom: "20px",
                        textAlign: "center",
                        position: "relative",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "14px",
                          marginBottom: "6px",
                        }}
                      >
                        <div
                          style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #1e3a8a, #0284c7)",
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "22px",
                          }}
                        >
                          <FaUniversity />
                        </div>
                        <div>
                          <h1
                            style={{
                              margin: 0,
                              fontSize: "21px",
                              fontWeight: "900",
                              letterSpacing: "1px",
                              color: "#1e3a8a",
                              textTransform: "uppercase",
                            }}
                          >
                            {currentTicket.college_name || "ST. PETER'S ENGINEERING COLLEGE"}
                          </h1>
                          <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, letterSpacing: "0.5px" }}>
                            Autonomous Institution • Approved by AICTE &amp; UGC • Accredited by NAAC
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: 700,
                          color: "#0284c7",
                          textTransform: "uppercase",
                          letterSpacing: "1px",
                          marginTop: "4px",
                        }}
                      >
                        Office of the Controller of Examinations
                      </div>
                    </div>

                    {/* Examination Title Banner */}
                    <div
                      style={{
                        background: "#1e3a8a",
                        color: "#ffffff",
                        padding: "10px 16px",
                        borderRadius: "6px",
                        textAlign: "center",
                        marginBottom: "20px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "8px",
                      }}
                    >
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontSize: "14px", fontWeight: 800, letterSpacing: "0.5px" }}>
                          {(currentTicket.exam_session_name || "Semester Examination").toUpperCase()}
                        </div>
                        <div style={{ fontSize: "11px", color: "#bfdbfe" }}>
                          Academic Year: {currentTicket.academic_year} • {currentTicket.exam_type}
                          {currentTicket.start_date && ` • Dates: ${currentTicket.start_date} to ${currentTicket.end_date}`}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "rgba(255, 255, 255, 0.15)",
                          padding: "6px 14px",
                          borderRadius: "6px",
                          fontSize: "13px",
                          fontWeight: 800,
                          letterSpacing: "1px",
                        }}
                      >
                        {currentTicket.hall_ticket_number}
                      </div>
                    </div>

                    {/* Candidate Details & QR Code Grid */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 130px 140px",
                        gap: "16px",
                        marginBottom: "24px",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        padding: "16px",
                        background: "#fafafa",
                      }}
                    >
                      {/* Left: Candidate Information Table */}
                      <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                        <tbody>
                          <tr>
                            <td style={{ padding: "5px 8px", color: "#64748b", fontWeight: 600, width: "35%" }}>
                              Candidate Name:
                            </td>
                            <td style={{ padding: "5px 8px", color: "#0f172a", fontWeight: 800, fontSize: "14px" }}>
                              {currentTicket.student_name}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "5px 8px", color: "#64748b", fontWeight: 600 }}>
                              University Roll No:
                            </td>
                            <td style={{ padding: "5px 8px", color: "#0f172a", fontWeight: 700 }}>
                              {currentTicket.roll_no}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "5px 8px", color: "#64748b", fontWeight: 600 }}>
                              Student Reg ID:
                            </td>
                            <td style={{ padding: "5px 8px", color: "#0f172a", fontWeight: 600 }}>
                              {currentTicket.student_id_code || currentTicket.roll_no}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "5px 8px", color: "#64748b", fontWeight: 600 }}>
                              Branch &amp; Specialization:
                            </td>
                            <td style={{ padding: "5px 8px", color: "#0f172a", fontWeight: 600 }}>
                              {currentTicket.branch}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "5px 8px", color: "#64748b", fontWeight: 600 }}>
                              Semester &amp; Section:
                            </td>
                            <td style={{ padding: "5px 8px", color: "#0f172a", fontWeight: 600 }}>
                              Semester {currentTicket.semester} (Section {currentTicket.section})
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "5px 8px", color: "#64748b", fontWeight: 600 }}>
                              Attendance Record:
                            </td>
                            <td style={{ padding: "5px 8px" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  background: "#dcfce7",
                                  color: "#15803d",
                                }}
                              >
                                {currentTicket.calculated_attendance_pct}% (Eligible)
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      {/* Center: Candidate Official Passport Photograph */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          textAlign: "center",
                          borderLeft: "1px solid #cbd5e1",
                          borderRight: "1px solid #cbd5e1",
                          padding: "0 10px",
                        }}
                      >
                        <div
                          style={{
                            width: "105px",
                            height: "130px",
                            border: "2px solid #1e3a8a",
                            borderRadius: "4px",
                            overflow: "hidden",
                            background: "#f8fafc",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                            position: "relative",
                          }}
                        >
                          {(currentTicket.student_profile_pic || currentUser?.profilePic) ? (
                            <img
                              src={currentTicket.student_profile_pic || currentUser?.profilePic}
                              alt="Candidate"
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            <div style={{ textAlign: "center", padding: "8px", color: "#64748b" }}>
                              <FaUserTie style={{ fontSize: "36px", color: "#94a3b8", marginBottom: "4px" }} />
                              <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase" }}>
                                Photo Attached
                              </div>
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: "10px",
                            color: "#1e3a8a",
                            fontWeight: 700,
                            marginTop: "6px",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          Candidate Photo
                        </div>
                        <div style={{ fontSize: "9px", color: "#64748b" }}>
                          Verified &amp; Attested
                        </div>
                      </div>

                      {/* Right: Verification QR Code & Stamp */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          textAlign: "center",
                          paddingLeft: "6px",
                        }}
                      >
                        <div
                          style={{
                            background: "#ffffff",
                            padding: "6px",
                            borderRadius: "8px",
                            border: "1px solid #cbd5e1",
                            display: "inline-block",
                            marginBottom: "6px",
                          }}
                        >
                          <QRCodeSVG value={verifyUrl} size={100} level="M" />
                        </div>
                        <div style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                          Official QR Verification
                        </div>
                        <div style={{ fontSize: "9px", color: "#94a3b8", marginTop: "2px" }}>
                          Scan to verify credentials
                        </div>
                      </div>
                    </div>

                    {/* Examination Schedule Timetable */}
                    <div style={{ marginBottom: "24px" }}>
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: 700,
                          color: "#1e3a8a",
                          textTransform: "uppercase",
                          marginBottom: "8px",
                          letterSpacing: "0.5px",
                        }}
                      >
                        Schedule of Examination Papers
                      </div>

                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: "12px",
                          textAlign: "left",
                          border: "1px solid #cbd5e1",
                        }}
                      >
                        <thead>
                          <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1" }}>
                            <th style={{ padding: "8px 10px", width: "40px", color: "#334155" }}>Sl</th>
                            <th style={{ padding: "8px 10px", width: "100px", color: "#334155" }}>Date</th>
                            <th style={{ padding: "8px 10px", width: "130px", color: "#334155" }}>Time Slot</th>
                            <th style={{ padding: "8px 10px", width: "85px", color: "#334155" }}>Code</th>
                            <th style={{ padding: "8px 10px", color: "#334155" }}>Course Title</th>
                            <th style={{ padding: "8px 10px", width: "120px", color: "#334155" }}>Exam Hall</th>
                            <th style={{ padding: "8px 10px", width: "100px", textAlign: "center", color: "#334155" }}>
                              Invigilator Sign
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentTicket.timetable && currentTicket.timetable.length > 0 ? (
                            currentTicket.timetable.map((paper, pIdx) => (
                              <tr key={paper.id || pIdx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                                <td style={{ padding: "8px 10px", fontWeight: 600 }}>{pIdx + 1}</td>
                                <td style={{ padding: "8px 10px", fontWeight: 700, color: "#1e293b" }}>
                                  {paper.exam_date}
                                </td>
                                <td style={{ padding: "8px 10px", color: "#475569" }}>
                                  {paper.start_time?.slice(0, 5)} - {paper.end_time?.slice(0, 5)}
                                </td>
                                <td style={{ padding: "8px 10px", fontWeight: 700, color: "#2563eb" }}>
                                  {paper.subject_code}
                                </td>
                                <td style={{ padding: "8px 10px", fontWeight: 600, color: "#0f172a" }}>
                                  {paper.subject_name}
                                </td>
                                <td style={{ padding: "8px 10px", color: "#64748b" }}>
                                  {paper.hall_number}
                                </td>
                                <td
                                  style={{
                                    padding: "8px 10px",
                                    borderLeft: "1px dashed #cbd5e1",
                                    height: "32px",
                                  }}
                                ></td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="7" style={{ textAlign: "center", padding: "16px", color: "#64748b" }}>
                                Timetable schedule to be finalized by the examination cell.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Instructions to Candidates */}
                    <div
                      style={{
                        borderTop: "1px solid #cbd5e1",
                        paddingTop: "14px",
                        marginBottom: "36px",
                        fontSize: "11.5px",
                        color: "#475569",
                        lineHeight: "1.5",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          color: "#0f172a",
                          textTransform: "uppercase",
                          marginBottom: "6px",
                          fontSize: "12px",
                        }}
                      >
                        Important Instructions for Candidates:
                      </div>
                      <div style={{ whiteSpace: "pre-wrap", color: "#475569" }}>
                        {currentTicket.instructions}
                      </div>
                    </div>

                    {/* Signature Blocks */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-end",
                        paddingTop: "24px",
                        borderTop: "1px dashed #cbd5e1",
                      }}
                    >
                      <div style={{ textAlign: "center", width: "200px" }}>
                        <div
                          style={{
                            borderBottom: "1px solid #475569",
                            height: "40px",
                            marginBottom: "6px",
                          }}
                        ></div>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#334155" }}>
                          Candidate's Signature
                        </div>
                        <div style={{ fontSize: "9px", color: "#94a3b8" }}>(To be signed in Exam Hall)</div>
                      </div>

                      {/* Official Seal Emblem */}
                      <div style={{ textAlign: "center" }}>
                        <div
                          style={{
                            width: "70px",
                            height: "70px",
                            borderRadius: "50%",
                            border: "2px dashed #0284c7",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto 4px auto",
                            color: "#0284c7",
                            fontSize: "10px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            textAlign: "center",
                            lineHeight: "1.2",
                          }}
                        >
                          Official<br />Exam<br />Seal
                        </div>
                      </div>

                      <div style={{ textAlign: "center", width: "220px" }}>
                        <div
                          style={{
                            borderBottom: "1px solid #475569",
                            height: "40px",
                            marginBottom: "6px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#1e3a8a",
                            fontStyle: "italic",
                            fontWeight: 700,
                            fontFamily: "cursive",
                            fontSize: "16px",
                          }}
                        >
                          Dr. R. K. Sharma
                        </div>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#334155" }}>
                          Controller of Examinations
                        </div>
                        <div style={{ fontSize: "9px", color: "#94a3b8" }}>NIST Autonomous</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
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
              <FaUserTie /> Official Student Profile &amp; ID Card
            </h3>
            <span className="stat-badge-tag tag-success">Active Enrolled Student</span>
          </div>

          {/* Profile Picture Uploader Banner */}
          <div
            style={{
              background: "linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)",
              border: "1px solid #bae6fd",
              borderRadius: "16px",
              padding: "24px",
              marginBottom: "24px",
              display: "flex",
              alignItems: "center",
              gap: "24px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ position: "relative" }}>
              <div
                style={{
                  width: "120px",
                  height: "145px",
                  borderRadius: "8px",
                  border: "3px solid #0284c7",
                  overflow: "hidden",
                  background: "#ffffff",
                  boxShadow: "0 6px 16px rgba(0,0,0,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {studentPreviewPic || currentUser?.profilePic ? (
                  <img
                    src={studentPreviewPic || currentUser?.profilePic}
                    alt={studentName}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ textAlign: "center", color: "#94a3b8", padding: "10px" }}>
                    <FaCamera style={{ fontSize: "36px", marginBottom: "6px" }} />
                    <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>
                      No Photo
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => studentPhotoInputRef.current?.click()}
                title="Select new profile picture"
                style={{
                  position: "absolute",
                  bottom: "-6px",
                  right: "-6px",
                  width: "34px",
                  height: "34px",
                  borderRadius: "50%",
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "2px solid #ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                }}
              >
                <FaCamera size={14} />
              </button>
            </div>

            <input
              type="file"
              ref={studentPhotoInputRef}
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleStudentPhotoChange}
            />

            <div style={{ flex: 1, minWidth: "240px" }}>
              <h4 style={{ margin: "0 0 6px 0", color: "#0f172a", fontSize: "18px", fontWeight: 800 }}>
                Candidate Photograph
              </h4>
              <p style={{ margin: "0 0 14px 0", color: "#475569", fontSize: "13px", lineHeight: "1.5" }}>
                Upload your formal passport photograph. This photograph will automatically be stamped on your
                <strong> Examination Hall Ticket</strong>, digital ID badge, and invigilator QR scan reports.
              </p>

              {picStatusMsg && (
                <div
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    marginBottom: "12px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    background: picStatusMsg.type === "success" ? "#dcfce7" : "#fee2e2",
                    color: picStatusMsg.type === "success" ? "#166534" : "#991b1b",
                    border: `1px solid ${picStatusMsg.type === "success" ? "#bbf7d0" : "#fecaca"}`,
                  }}
                >
                  {picStatusMsg.text}
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => studentPhotoInputRef.current?.click()}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#0f172a",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Choose Photo File
                </button>

                {studentPicFile && (
                  <button
                    type="button"
                    onClick={handleSaveStudentPic}
                    disabled={isSavingPic}
                    style={{
                      padding: "8px 18px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#0284c7",
                      color: "#ffffff",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: isSavingPic ? "wait" : "pointer",
                    }}
                  >
                    {isSavingPic ? "Saving..." : "Save to Profile & Hall Ticket"}
                  </button>
                )}

                {(currentUser?.profilePic || studentPreviewPic) && !studentPicFile && (
                  <button
                    type="button"
                    onClick={handleRemoveStudentPic}
                    disabled={isSavingPic}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "8px",
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      color: "#dc2626",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: isSavingPic ? "wait" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <FaTrashAlt size={12} /> Remove Photo
                  </button>
                )}
              </div>
            </div>
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
              <small>Academic Year &amp; Semester</small>
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
                College of Engineering &amp; Technology
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

      {/* Leave Application Modal */}
      {showLeaveModal && (
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
              background: "#fff",
              borderRadius: "16px",
              padding: "28px",
              maxWidth: "520px",
              width: "100%",
              position: "relative",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
          >
            <button
              type="button"
              onClick={() => setShowLeaveModal(false)}
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

            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  background: "#eff6ff",
                  color: "#2563eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                }}
              >
                <FaFileAlt />
              </div>
              <h3 style={{ margin: 0, fontSize: "20px", color: "#0f172a" }}>
                Apply for Leave / On-Duty (OD)
              </h3>
            </div>
            <p style={{ margin: "0 0 16px 0", color: "#64748b", fontSize: "14px" }}>
              Request official absence authorization. Approved requests receive attendance credit.
            </p>

            {leaveModalMessage && (
              <div
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  marginBottom: "16px",
                  background: leaveModalMessage.success ? "#ecfdf5" : "#fef2f2",
                  color: leaveModalMessage.success ? "#047857" : "#b91c1c",
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <FaCheckCircle /> {leaveModalMessage.text}
              </div>
            )}

            <form onSubmit={handleApplyLeave}>
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                  Leave Type *
                </label>
                <select
                  value={leaveFormData.leave_type}
                  onChange={(e) => setLeaveFormData({ ...leaveFormData, leave_type: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="OD">On-Duty (OD) — Sports, Hackathon, Symposium, College Representation</option>
                  <option value="MEDICAL">Medical Leave — Illness, Doctor Consultation, Hospitalization</option>
                  <option value="CASUAL">Casual Leave — Personal / Family Emergency</option>
                  <option value="ACADEMIC">Academic Duty — External Exam, Conference, Project Internship</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                    Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={leaveFormData.start_date}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      setLeaveFormData({
                        ...leaveFormData,
                        start_date: newStart,
                        end_date: leaveFormData.end_date < newStart ? newStart : leaveFormData.end_date,
                      });
                    }}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                    End Date *
                  </label>
                  <input
                    type="date"
                    required
                    min={leaveFormData.start_date}
                    value={leaveFormData.end_date}
                    onChange={(e) => setLeaveFormData({ ...leaveFormData, end_date: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                  Reason &amp; Activity Details *
                </label>
                <textarea
                  required
                  rows="3"
                  placeholder="Explain why you require absence (e.g. Attending Smart India Hackathon grand finale at IIT...)"
                  value={leaveFormData.reason}
                  onChange={(e) => setLeaveFormData({ ...leaveFormData, reason: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                  Document / Proof Link (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/... or event registration link"
                  value={leaveFormData.document_url}
                  onChange={(e) => setLeaveFormData({ ...leaveFormData, document_url: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px",
                  color: "#1e40af",
                }}
              >
                <FaInfoCircle />
                <span>
                  Approved On-Duty and Medical Leaves automatically grant attendance credit so your 75% semester requirement is preserved.
                </span>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  style={{
                    flex: 1,
                    padding: "10px",
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
                  disabled={isSubmittingLeave}
                  style={{
                    flex: 2,
                    padding: "10px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#2563eb",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: isSubmittingLeave ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  {isSubmittingLeave ? "Submitting..." : "Submit Application"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
