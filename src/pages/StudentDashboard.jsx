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
  getMyFees,
  getFeeReceipt,
  submitStudentPhonePePayment,
  getFeeUpiConfig,
} from "../services/studentservice";
import "../styles/studentdashboard.css";
import "../styles/fees.css";
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
  FaCreditCard,
  FaReceipt,
  FaMoneyBillWave,
  FaMobileAlt,
  FaCopy,
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

  // Fees & Dues States
  const [feesData, setFeesData] = useState({
    summary: {
      total_invoiced: 0,
      total_paid: 0,
      total_due: 0,
      has_mandatory_dues: false,
      exam_clearance_status: "CLEARED",
      records_count: 0,
    },
    records: [],
    payments: [],
  });
  const [feesLoading, setFeesLoading] = useState(false);
  const [activeReceiptModal, setActiveReceiptModal] = useState(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  const fetchStudentFees = () => {
    setFeesLoading(true);
    getMyFees()
      .then((res) => {
        if (res.data) {
          setFeesData(res.data);
        }
      })
      .catch((err) => {
        console.error("Failed to load fees data:", err);
      })
      .finally(() => {
        setFeesLoading(false);
      });
  };

  const handleOpenReceipt = (receiptNum) => {
    setLoadingReceipt(true);
    getFeeReceipt(receiptNum)
      .then((res) => {
        setActiveReceiptModal(res.data);
      })
      .catch((err) => {
        alert("Unable to fetch receipt details: " + (err.response?.data?.detail || err.message));
      })
      .finally(() => {
        setLoadingReceipt(false);
      });
  };

  // PhonePe UPI Payment States
  const [showPhonePeModal, setShowPhonePeModal] = useState(false);
  const [phonePeRecord, setPhonePeRecord] = useState(null);
  const [phonePeAmount, setPhonePeAmount] = useState("");
  const [phonePeUtr, setPhonePeUtr] = useState("");
  const [phonePeRemarks, setPhonePeRemarks] = useState("");
  const [phonePeSubmitting, setPhonePeSubmitting] = useState(false);
  const [phonePeSuccess, setPhonePeSuccess] = useState(null);
  const [phonePeError, setPhonePeError] = useState(null);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [phonePeUpiConfig, setPhonePeUpiConfig] = useState(null);
  const [qrViewMode, setQrViewMode] = useState("auto");

  const openPhonePePayment = (rec) => {
    let targetRec = rec;
    if (!targetRec) {
      targetRec = feesData?.records?.find((r) => parseFloat(r.balance_due || 0) > 0);
    }
    if (!targetRec && feesData?.records && feesData.records.length > 0) {
      targetRec = feesData.records[0];
    }
    if (!targetRec) {
      targetRec = {
        id: null,
        category_name: "Academic Fee Dues",
        category_code: "FEES",
        balance_due: feesData?.summary?.total_due || 0,
        semester: currentUser?.semester || 1,
        academic_year: "2025-2026",
      };
    }

    // Always fetch latest PhonePe UPI config directly from backend
    getFeeUpiConfig()
      .then((res) => {
        if (res.data) setPhonePeUpiConfig(res.data);
      })
      .catch(() => {});

    setPhonePeRecord(targetRec);
    const payable = targetRec.balance_due && parseFloat(targetRec.balance_due) > 0
      ? String(targetRec.balance_due)
      : (feesData?.summary?.total_due ? String(feesData.summary.total_due) : "0");
    setPhonePeAmount(payable);
    setPhonePeUtr("");
    setPhonePeRemarks("");
    setPhonePeError(null);
    setPhonePeSuccess(null);
    setCopiedUpi(false);
    setShowPhonePeModal(true);
  };

  const handlePhonePeSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!phonePeRecord) return;
    const cleanUtr = phonePeUtr.trim().toUpperCase();
    if (!cleanUtr || cleanUtr.length < 6) {
      setPhonePeError("Please enter a valid 12-digit UPI Reference / UTR Number from your PhonePe transaction screen.");
      return;
    }

    setPhonePeSubmitting(true);
    setPhonePeError(null);

    try {
      const res = await submitStudentPhonePePayment({
        fee_record_id: phonePeRecord.id,
        amount_paid: parseFloat(phonePeAmount),
        utr_number: cleanUtr,
        remarks: phonePeRemarks || "Paid via PhonePe UPI",
      });

      setPhonePeSuccess(res.data);
      // Immediately refresh fees to clear the dues on screen!
      fetchStudentFees();
      // Also refresh hall ticket
      fetchStudentHallTickets();
    } catch (err) {
      setPhonePeError(err.response?.data?.detail || err.message || "Failed to verify PhonePe payment.");
    } finally {
      setPhonePeSubmitting(false);
    }
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
      getMyFees().catch(() => ({ data: null })),
    ])
      .then(([repRes, attRes, timeRes, annRes, subRes, leaveRes, ticketRes, feeRes]) => {
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
        if (feeRes?.data) {
          setFeesData(feeRes.data);
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
    } else if (activeTab === "fees") {
      fetchStudentFees();
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

              if (currentTicket.is_fee_locked || (currentTicket.fee_clearance && !currentTicket.fee_clearance.is_cleared)) {
                const pendingDues = currentTicket.fee_clearance?.pending_dues || 0;
                const unclearedCats = currentTicket.fee_clearance?.uncleared_categories || [];

                return (
                  /* ================================================== */
                  /* MANDATORY FEE DUES CLEARANCE HOLD                 */
                  /* ================================================== */
                  <div
                    style={{
                      background: "#ffffff",
                      borderRadius: "16px",
                      padding: "36px",
                      boxShadow: "0 10px 30px rgba(245, 158, 11, 0.08)",
                      border: "2px solid #fde68a",
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
                          background: "#fef3c7",
                          color: "#d97706",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "26px",
                          flexShrink: 0,
                        }}
                      >
                        <FaCreditCard />
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
                            background: "#fef3c7",
                            color: "#b45309",
                            textTransform: "uppercase",
                            marginBottom: "4px",
                          }}
                        >
                          Accounts Clearance Hold
                        </div>
                        <h3 style={{ margin: 0, fontSize: "20px", color: "#0f172a", fontWeight: 700 }}>
                          Hall Ticket Withheld — Outstanding Tuition / Exam Fee Dues
                        </h3>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "16px 20px",
                        background: "#fffbeb",
                        border: "1px solid #fef3c7",
                        borderRadius: "12px",
                        marginBottom: "24px",
                        color: "#92400e",
                        fontSize: "14px",
                        lineHeight: "1.6",
                      }}
                    >
                      Your attendance criteria is fulfilled ({currentTicket.calculated_attendance_pct}%), but your examination hall ticket has been
                      temporarily held by the Bursar &amp; Accounts division due to pending mandatory fee dues (₹{pendingDues.toLocaleString()}).
                      Once dues are cleared or an institutional No-Dues clearance is granted, your official admit card will unlock immediately.
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                        gap: "14px",
                        marginBottom: "28px",
                      }}
                    >
                      <div
                        style={{
                          padding: "16px",
                          background: "#f8fafc",
                          borderRadius: "10px",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                          Pending Balance Due
                        </div>
                        <div style={{ fontSize: "22px", fontWeight: 800, color: "#dc2626", marginTop: "4px" }}>
                          ₹{pendingDues.toLocaleString()}
                        </div>
                      </div>

                      <div
                        style={{
                          padding: "16px",
                          background: "#f8fafc",
                          borderRadius: "10px",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                          Uncleared Fee Heads
                        </div>
                        <div style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b", marginTop: "6px" }}>
                          {unclearedCats.map((c) => c.category).join(", ") || "Mandatory Academic Fees"}
                        </div>
                      </div>

                      <div
                        style={{
                          padding: "16px",
                          background: "#f8fafc",
                          borderRadius: "10px",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                          Attendance Status
                        </div>
                        <div style={{ fontSize: "15px", fontWeight: 700, color: "#059669", marginTop: "6px" }}>
                          Eligible ({currentTicket.calculated_attendance_pct}%)
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => openPhonePePayment()}
                        style={{
                          padding: "12px 24px",
                          borderRadius: "10px",
                          background: "linear-gradient(135deg, #5f259f 0%, #3f156d 100%)",
                          color: "#ffffff",
                          border: "none",
                          fontWeight: 700,
                          fontSize: "14px",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          boxShadow: "0 4px 14px rgba(95, 37, 159, 0.35)",
                        }}
                      >
                        <FaMobileAlt /> Pay via PhonePe QR &amp; Unlock
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab("fees")}
                        style={{
                          padding: "12px 20px",
                          borderRadius: "10px",
                          background: "#2563eb",
                          color: "#ffffff",
                          border: "none",
                          fontWeight: 700,
                          fontSize: "14px",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)",
                        }}
                      >
                        <FaCreditCard /> View Fee Ledger
                      </button>

                      <button
                        type="button"
                        onClick={fetchStudentHallTickets}
                        style={{
                          padding: "12px 20px",
                          borderRadius: "10px",
                          background: "#f1f5f9",
                          color: "#334155",
                          border: "1px solid #cbd5e1",
                          fontWeight: 600,
                          fontSize: "14px",
                          cursor: "pointer",
                        }}
                      >
                        Refresh Clearance Status
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

      {/* Tab: Fees & Dues Ledger */}
      {activeTab === "fees" && (
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
                <FaCreditCard style={{ color: "#2563eb" }} />
                Student Fee Ledger &amp; Dues Clearance
              </h2>
              <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
                Review institutional fee balances, transaction records, exam hall ticket clearance status, and download authenticated receipts.
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              {feesData?.summary?.total_due > 0 && (
                <button
                  type="button"
                  onClick={() => openPhonePePayment()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "9px 18px",
                    background: "linear-gradient(135deg, #5f259f 0%, #3f156d 100%)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 4px 14px rgba(95, 37, 159, 0.35)",
                  }}
                >
                  <FaMobileAlt /> Pay via PhonePe / UPI
                </button>
              )}
              <button
                type="button"
                onClick={fetchStudentFees}
                disabled={feesLoading}
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
                {feesLoading ? "Refreshing..." : "Refresh Ledger"}
              </button>
            </div>
          </div>

          {/* Summary Metric Cards */}
          <div
            className="no-print"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: "14px",
                padding: "18px 20px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                Total Invoiced
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", margin: "6px 0 4px 0" }}>
                ₹{(feesData?.summary?.total_invoiced || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b" }}>Academic Year 2025-2026</div>
            </div>

            <div
              style={{
                background: "linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)",
                borderRadius: "14px",
                padding: "18px 20px",
                border: "1px solid #bbf7d0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#166534", textTransform: "uppercase" }}>
                Total Paid to Date
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#15803d", margin: "6px 0 4px 0" }}>
                ₹{(feesData?.summary?.total_paid || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: "12px", color: "#166534" }}>Verified by Bursar Counter</div>
            </div>

            <div
              style={{
                background: feesData?.summary?.total_due > 0
                  ? "linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)"
                  : "linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)",
                borderRadius: "14px",
                padding: "18px 20px",
                border: `1px solid ${feesData?.summary?.total_due > 0 ? "#fecaca" : "#bbf7d0"}`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: feesData?.summary?.total_due > 0 ? "#991b1b" : "#166534",
                  textTransform: "uppercase",
                }}
              >
                Outstanding Balance Due
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 800,
                  color: feesData?.summary?.total_due > 0 ? "#dc2626" : "#15803d",
                  margin: "6px 0 4px 0",
                }}
              >
                ₹{(feesData?.summary?.total_due || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: "12px", color: feesData?.summary?.total_due > 0 ? "#b91c1c" : "#166534" }}>
                {feesData?.summary?.total_due > 0 ? "Pending clearance" : "All accounts cleared"}
              </div>

              {feesData?.summary?.total_due > 0 && (
                <button
                  type="button"
                  onClick={() => openPhonePePayment()}
                  style={{
                    marginTop: "10px",
                    width: "100%",
                    padding: "7px 12px",
                    background: "linear-gradient(135deg, #5f259f 0%, #3f156d 100%)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    boxShadow: "0 2px 6px rgba(95, 37, 159, 0.25)",
                  }}
                >
                  <FaMobileAlt /> Scan PhonePe QR
                </button>
              )}
            </div>

            <div
              style={{
                background: feesData?.summary?.has_mandatory_dues
                  ? "linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)"
                  : "linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)",
                borderRadius: "14px",
                padding: "18px 20px",
                border: `1px solid ${feesData?.summary?.has_mandatory_dues ? "#fde68a" : "#bfdbfe"}`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: feesData?.summary?.has_mandatory_dues ? "#92400e" : "#1e40af",
                  textTransform: "uppercase",
                }}
              >
                Exam Clearance Status
              </div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 800,
                  color: feesData?.summary?.has_mandatory_dues ? "#b45309" : "#1d4ed8",
                  margin: "10px 0 4px 0",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {feesData?.summary?.has_mandatory_dues ? (
                  <>
                    <FaExclamationTriangle style={{ color: "#d97706" }} /> Mandatory Dues Hold
                  </>
                ) : (
                  <>
                    <FaCheckCircle style={{ color: "#16a34a" }} /> No-Dues Clearance Active
                  </>
                )}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                {feesData?.summary?.has_mandatory_dues
                  ? "Exam Hall Ticket is locked until cleared"
                  : "Admit Card Unlocked for Exams"}
              </div>
            </div>
          </div>

          {/* Dedicated On-Page PhonePe UPI Instant Clearance Card */}
          <div
            className="no-print"
            style={{
              background: "linear-gradient(135deg, #2e0854 0%, #4a157d 60%, #5f259f 100%)",
              borderRadius: "18px",
              padding: "24px 28px",
              marginBottom: "24px",
              color: "#ffffff",
              boxShadow: "0 10px 25px rgba(95, 37, 159, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "24px",
            }}
          >
            <div style={{ flex: "1 1 360px", maxWidth: "600px" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "rgba(255, 255, 255, 0.15)",
                  padding: "4px 12px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  marginBottom: "10px",
                }}
              >
                <FaMobileAlt /> Official PhonePe / UPI Clearance Portal
              </div>
              <h3 style={{ margin: "0 0 8px 0", fontSize: "20px", fontWeight: 800 }}>
                Scan &amp; Clear College Fees Instantly
              </h3>
              <p style={{ margin: "0 0 16px 0", color: "#e9d5ff", fontSize: "13.5px", lineHeight: "1.5" }}>
                Scan using PhonePe, Google Pay, or Paytm. Enter your 12-digit UPI UTR reference number below to clear dues immediately and unlock your Semester Examination Hall Ticket.
              </p>

              <div
                style={{
                  background: "rgba(255, 255, 255, 0.1)",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <div style={{ fontSize: "11px", color: "#d8b4fe", textTransform: "uppercase", fontWeight: 700 }}>
                    Official Payee VPA
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: 800, marginTop: "2px" }}>
                    {phonePeUpiConfig?.upi_id || feesData?.upi_config?.upi_id || "6301609560@ybl"}
                  </div>
                  <div style={{ fontSize: "11.5px", color: "#e9d5ff" }}>
                    {phonePeUpiConfig?.payee_name || feesData?.upi_config?.payee_name || "Naresh Alladi"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const vpa = phonePeUpiConfig?.upi_id || feesData?.upi_config?.upi_id || "6301609560@ybl";
                    navigator.clipboard.writeText(vpa);
                    setCopiedUpi(true);
                    setTimeout(() => setCopiedUpi(false), 2000);
                  }}
                  style={{
                    background: "#ffffff",
                    color: "#5f259f",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 14px",
                    fontWeight: 700,
                    fontSize: "12px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <FaCopy /> {copiedUpi ? "Copied!" : "Copy VPA"}
                </button>
              </div>

              <button
                type="button"
                onClick={() => openPhonePePayment()}
                style={{
                  background: "#22c55e",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "10px",
                  padding: "12px 24px",
                  fontSize: "14px",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  boxShadow: "0 4px 14px rgba(34, 197, 94, 0.4)",
                }}
              >
                <FaCheckCircle /> Open QR Code &amp; Submit UTR to Clear Dues
              </button>
            </div>

            <div
              style={{
                background: "#ffffff",
                borderRadius: "16px",
                padding: "14px",
                textAlign: "center",
                boxShadow: "0 10px 25px rgba(0, 0, 0, 0.25)",
                maxWidth: "200px",
                cursor: "pointer",
              }}
              onClick={() => openPhonePePayment()}
              title="Click to expand PhonePe Payment Modal"
            >
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#5f259f", marginBottom: "8px", textTransform: "uppercase" }}>
                Official QR
              </div>
              <div
                style={{
                  display: "inline-block",
                  background: "#ffffff",
                  padding: "6px",
                  borderRadius: "10px",
                  border: "1px solid #e2e8f0",
                }}
              >
                {(phonePeUpiConfig?.custom_qr_image || feesData?.upi_config?.custom_qr_image) ? (
                  <img
                    src={phonePeUpiConfig?.custom_qr_image || feesData?.upi_config?.custom_qr_image}
                    alt="PhonePe QR"
                    style={{ width: "140px", height: "140px", objectFit: "contain", display: "block" }}
                  />
                ) : (
                  <QRCodeSVG
                    value={`upi://pay?pa=${encodeURIComponent(phonePeUpiConfig?.upi_id || feesData?.upi_config?.upi_id || "6301609560@ybl")}&pn=${encodeURIComponent(phonePeUpiConfig?.payee_name || feesData?.upi_config?.payee_name || "Naresh Alladi")}&cu=INR`}
                    size={140}
                    level="M"
                  />
                )}
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "6px", fontWeight: 600 }}>
                Click to Pay &amp; Clear
              </div>
            </div>
          </div>

          {/* Fee Ledger Items Table */}
          <div
            className="no-print"
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "24px",
              marginBottom: "24px",
              boxShadow: "0 4px 15px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                Fee Heads &amp; Installments Breakdown
              </h3>
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                Showing {feesData?.records?.length || 0} enrolled fee categories
              </span>
            </div>

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
                    <th style={{ padding: "12px 14px", color: "#475569", fontWeight: 700 }}>Fee Category</th>
                    <th style={{ padding: "12px 14px", color: "#475569", fontWeight: 700 }}>Academic Term</th>
                    <th style={{ padding: "12px 14px", color: "#475569", fontWeight: 700 }}>Invoiced</th>
                    <th style={{ padding: "12px 14px", color: "#475569", fontWeight: 700 }}>Scholarship</th>
                    <th style={{ padding: "12px 14px", color: "#475569", fontWeight: 700 }}>Net Payable</th>
                    <th style={{ padding: "12px 14px", color: "#475569", fontWeight: 700 }}>Paid</th>
                    <th style={{ padding: "12px 14px", color: "#475569", fontWeight: 700 }}>Balance Due</th>
                    <th style={{ padding: "12px 14px", color: "#475569", fontWeight: 700 }}>Due Date</th>
                    <th style={{ padding: "12px 14px", color: "#475569", fontWeight: 700 }}>Status</th>
                    <th style={{ padding: "12px 14px", color: "#475569", fontWeight: 700 }}>Exam Clearance</th>
                    <th style={{ padding: "12px 14px", color: "#475569", fontWeight: 700, textAlign: "right" }}>Pay &amp; Clear</th>
                  </tr>
                </thead>
                <tbody>
                  {feesData?.records && feesData.records.length > 0 ? (
                    feesData.records.map((rec) => {
                      const isPaid = rec.status === "PAID";
                      const isPartial = rec.status === "PARTIAL";
                      const isOverdue = rec.status === "OVERDUE";

                      return (
                        <tr key={rec.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "14px", fontWeight: 600, color: "#1e293b" }}>
                            <div>{rec.category_name}</div>
                            <span
                              style={{
                                fontSize: "11px",
                                color: "#64748b",
                                background: "#f1f5f9",
                                padding: "2px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              {rec.category_code}
                            </span>
                            {rec.is_mandatory_for_exam && (
                              <span
                                style={{
                                  marginLeft: "6px",
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  color: "#b45309",
                                  background: "#fef3c7",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                }}
                              >
                                Mandatory
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "14px", color: "#475569" }}>
                            {rec.academic_year} • Sem {rec.semester}
                          </td>
                          <td style={{ padding: "14px", color: "#475569" }}>
                            ₹{parseFloat(rec.total_amount).toLocaleString()}
                          </td>
                          <td style={{ padding: "14px", color: "#059669" }}>
                            {parseFloat(rec.discount_amount) > 0 ? `₹${parseFloat(rec.discount_amount).toLocaleString()}` : "—"}
                          </td>
                          <td style={{ padding: "14px", fontWeight: 700, color: "#0f172a" }}>
                            ₹{parseFloat(rec.net_amount).toLocaleString()}
                          </td>
                          <td style={{ padding: "14px", fontWeight: 700, color: "#16a34a" }}>
                            ₹{parseFloat(rec.paid_amount).toLocaleString()}
                          </td>
                          <td
                            style={{
                              padding: "14px",
                              fontWeight: 700,
                              color: parseFloat(rec.balance_due) > 0 ? "#dc2626" : "#059669",
                            }}
                          >
                            ₹{parseFloat(rec.balance_due).toLocaleString()}
                          </td>
                          <td style={{ padding: "14px", color: "#475569" }}>
                            {rec.due_date || "—"}
                          </td>
                          <td style={{ padding: "14px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "4px 10px",
                                borderRadius: "12px",
                                fontSize: "11px",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                background: isPaid
                                  ? "#dcfce7"
                                  : isPartial
                                  ? "#fef3c7"
                                  : isOverdue
                                  ? "#fee2e2"
                                  : "#f1f5f9",
                                color: isPaid
                                  ? "#15803d"
                                  : isPartial
                                  ? "#b45309"
                                  : isOverdue
                                  ? "#b91c1c"
                                  : "#475569",
                              }}
                            >
                              {rec.status}
                            </span>
                          </td>
                          <td style={{ padding: "14px" }}>
                            {rec.is_cleared_for_exam ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontSize: "11.5px",
                                  fontWeight: 600,
                                  color: "#16a34a",
                                }}
                              >
                                <FaCheckCircle /> Cleared
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontSize: "11.5px",
                                  fontWeight: 600,
                                  color: "#d97706",
                                }}
                              >
                                <FaExclamationTriangle /> Dues Hold
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "14px", textAlign: "right" }}>
                            {parseFloat(rec.balance_due) > 0 ? (
                              <button
                                type="button"
                                onClick={() => openPhonePePayment(rec)}
                                style={{
                                  background: "linear-gradient(135deg, #5f259f 0%, #3f156d 100%)",
                                  color: "#ffffff",
                                  border: "none",
                                  padding: "7px 14px",
                                  borderRadius: "8px",
                                  fontWeight: 700,
                                  fontSize: "12px",
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  boxShadow: "0 2px 8px rgba(95, 37, 159, 0.3)",
                                }}
                              >
                                <FaCreditCard /> Pay PhonePe
                              </button>
                            ) : (
                              <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: 700 }}>
                                ✓ Cleared
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="11" style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
                        No fee records assigned to your current semester yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paid Transactions & Digital Receipts */}
          <div
            className="no-print"
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "24px",
              marginBottom: "24px",
              boxShadow: "0 4px 15px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                  Official Payment Receipts
                </h3>
                <p style={{ margin: "4px 0 0 0", fontSize: "12.5px", color: "#64748b" }}>
                  Download and print authenticated receipts with institution stamp for college records or reimbursement.
                </p>
              </div>
            </div>

            {feesData?.payments && feesData.payments.length > 0 ? (
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
                      <th style={{ padding: "10px 14px", color: "#475569", fontWeight: 700 }}>Receipt #</th>
                      <th style={{ padding: "10px 14px", color: "#475569", fontWeight: 700 }}>Date &amp; Time</th>
                      <th style={{ padding: "10px 14px", color: "#475569", fontWeight: 700 }}>Category</th>
                      <th style={{ padding: "10px 14px", color: "#475569", fontWeight: 700 }}>Amount Paid</th>
                      <th style={{ padding: "10px 14px", color: "#475569", fontWeight: 700 }}>Payment Mode</th>
                      <th style={{ padding: "10px 14px", color: "#475569", fontWeight: 700 }}>Transaction Ref / UTR</th>
                      <th style={{ padding: "10px 14px", color: "#475569", fontWeight: 700, textAlign: "right" }}>
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {feesData.payments.map((p) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 14px", fontWeight: 700, color: "#2563eb" }}>
                          {p.receipt_number}
                        </td>
                        <td style={{ padding: "12px 14px", color: "#475569" }}>
                          {new Date(p.payment_date).toLocaleDateString([], {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td style={{ padding: "12px 14px", color: "#1e293b", fontWeight: 600 }}>
                          {p.category_name}
                        </td>
                        <td style={{ padding: "12px 14px", fontWeight: 800, color: "#16a34a" }}>
                          ₹{parseFloat(p.amount_paid).toLocaleString()}
                        </td>
                        <td style={{ padding: "12px 14px", color: "#475569" }}>
                          <span
                            style={{
                              background: "#f1f5f9",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 600,
                            }}
                          >
                            {p.payment_method}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px", color: "#64748b", fontFamily: "monospace" }}>
                          {p.transaction_reference || "—"}
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => handleOpenReceipt(p.receipt_number)}
                            disabled={loadingReceipt}
                            style={{
                              padding: "6px 14px",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              background: "#f8fafc",
                              color: "#1e293b",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <FaPrint /> Print Official Receipt
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "28px", color: "#64748b" }}>
                No completed payments recorded yet. Receipts will appear here once payment transactions are cleared.
              </div>
            )}
          </div>

          {/* Institutional Payment Guidance & Bursar Counter Card */}
          <div
            className="no-print"
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "24px",
              marginBottom: "24px",
              boxShadow: "0 4px 15px rgba(0,0,0,0.05)",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              Campus Bursar Counter &amp; Online Payment Instructions
            </h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "20px",
              }}
            >
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: "12px",
                  padding: "18px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ fontWeight: 700, color: "#1e3a8a", marginBottom: "8px", fontSize: "14px" }}>
                  🏦 Bank Transfer (NEFT / RTGS / IMPS)
                </div>
                <div style={{ fontSize: "12.5px", color: "#334155", lineHeight: "1.7" }}>
                  <div><strong>Account Name:</strong> St. Peter's Engineering College</div>
                  <div><strong>Bank Name:</strong> State Bank of India (SBI)</div>
                  <div><strong>Account No:</strong> 382901928471</div>
                  <div><strong>IFSC Code:</strong> SBIN0004921 (Maisammaguda Branch)</div>
                  <div><strong>Account Type:</strong> Current Account</div>
                </div>
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: "12px",
                  padding: "18px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ fontWeight: 700, color: "#166534", marginBottom: "8px", fontSize: "14px" }}>
                  💳 Campus Bursar Desk (Room 104)
                </div>
                <div style={{ fontSize: "12.5px", color: "#334155", lineHeight: "1.7" }}>
                  <div><strong>Location:</strong> Ground Floor, Administrative Block</div>
                  <div><strong>Timings:</strong> Mon – Sat: 9:30 AM to 4:30 PM</div>
                  <div><strong>Accepted Modes:</strong> Cash, Demand Draft, UPI QR, Debit/Credit Card</div>
                  <div><strong>Helpdesk:</strong> accounts@stpetersec.edu.in | +91 40 2379 2100</div>
                  <div style={{ color: "#b45309", fontSize: "11.5px", marginTop: "4px" }}>
                    *Submit your UTR reference at the counter for same-day No-Dues clearance.
                  </div>
                </div>
              </div>
            </div>
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

      {/* Official Printable Digital Fee Receipt Modal */}
      {activeReceiptModal && (
        <div
          className="fees-modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
        >
          <div style={{ maxHeight: "95vh", overflowY: "auto", width: "100%", display: "flex", justifyContent: "center" }}>
            <div className="printable-receipt-wrap" style={{ position: "relative" }}>
              {/* Action Buttons */}
              <div
                className="no-print"
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  display: "flex",
                  gap: "8px",
                }}
              >
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    background: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    padding: "7px 14px",
                    borderRadius: "6px",
                    fontWeight: 700,
                    fontSize: "12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <FaPrint /> Print Receipt
                </button>
                <button
                  type="button"
                  onClick={() => setActiveReceiptModal(null)}
                  style={{
                    background: "#e2e8f0",
                    color: "#0f172a",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px 10px",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Header */}
              <div className="receipt-header">
                <h1 className="receipt-inst-name">{activeReceiptModal.institution_name}</h1>
                <p className="receipt-inst-sub">{activeReceiptModal.institution_sub}</p>
                <p className="receipt-inst-sub">{activeReceiptModal.institution_address}</p>
                <div className="receipt-badge-title">Official Fee Payment Receipt</div>
              </div>

              {/* Details Grid */}
              <div className="receipt-grid-info">
                <div>
                  <div>
                    <strong>Receipt Number:</strong>{" "}
                    <span style={{ color: "#2563eb", fontWeight: 700 }}>
                      {activeReceiptModal.receipt_number}
                    </span>
                  </div>
                  <div>
                    <strong>Payment Date:</strong> {activeReceiptModal.payment_date}
                  </div>
                  <div>
                    <strong>Payment Mode:</strong> {activeReceiptModal.payment_method}
                  </div>
                  <div>
                    <strong>Reference:</strong> {activeReceiptModal.transaction_reference}
                  </div>
                </div>
                <div>
                  <div>
                    <strong>Student Name:</strong> {activeReceiptModal.student.name}
                  </div>
                  <div>
                    <strong>Roll Number:</strong> {activeReceiptModal.student.roll_no}
                  </div>
                  <div>
                    <strong>Department:</strong> {activeReceiptModal.student.cohort}
                  </div>
                  <div>
                    <strong>Email:</strong> {activeReceiptModal.student.email || "N/A"}
                  </div>
                </div>
              </div>

              {/* Itemized Table */}
              <table className="receipt-items-table">
                <thead>
                  <tr>
                    <th>Particulars / Category</th>
                    <th>Academic Term</th>
                    <th style={{ textAlign: "right" }}>Total Fee</th>
                    <th style={{ textAlign: "right" }}>Amount Paid</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>{activeReceiptModal.fee_details.category}</strong>
                      {activeReceiptModal.fee_details.discount_waiver > 0 && (
                        <div style={{ fontSize: "11px", color: "#059669" }}>
                          Includes ₹{activeReceiptModal.fee_details.discount_waiver.toLocaleString()} Scholarship Waiver
                        </div>
                      )}
                    </td>
                    <td>
                      {activeReceiptModal.fee_details.academic_year} • {activeReceiptModal.fee_details.semester}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      ₹{activeReceiptModal.fee_details.net_payable.toLocaleString()}
                    </td>
                    <td style={{ textAlign: "right", color: "#16a34a", fontWeight: 800 }}>
                      ₹{activeReceiptModal.fee_details.amount_paid_this_transaction.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Settlement Summary */}
              <div
                style={{
                  background: "#f8fafc",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  fontSize: "13px",
                  marginBottom: "20px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span>Cumulative Amount Paid to Date:</span>
                  <strong>₹{activeReceiptModal.fee_details.cumulative_paid_amount.toLocaleString()}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span>Remaining Balance Due:</span>
                  <strong
                    style={{
                      color:
                        activeReceiptModal.fee_details.remaining_balance_due > 0 ? "#dc2626" : "#059669",
                    }}
                  >
                    ₹{activeReceiptModal.fee_details.remaining_balance_due.toLocaleString()}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Examination Clearance Status:</span>
                  <strong
                    style={{
                      color: activeReceiptModal.fee_details.is_cleared_for_exam ? "#059669" : "#dc2626",
                    }}
                  >
                    {activeReceiptModal.fee_details.is_cleared_for_exam
                      ? "Cleared for Semester Examinations ✅"
                      : "Pending Balance ⚠️"}
                  </strong>
                </div>
              </div>

              {/* Footer Stamp & Signatures */}
              <div className="receipt-footer-stamp">
                <div className="receipt-seal-box">
                  College Accounts Seal
                </div>
                <div className="receipt-signature-line">
                  <div style={{ borderBottom: "1px solid #94a3b8", width: "160px", marginBottom: "4px" }}></div>
                  <div>Authorized Accounts Signatory</div>
                  <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                    {activeReceiptModal.collected_by}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PhonePe UPI Instant Fee Clearance Modal */}
      {showPhonePeModal && (
        <div
          className="fees-modal-overlay no-print"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
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
              borderRadius: "18px",
              maxWidth: "520px",
              width: "100%",
              maxHeight: "92vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
              border: "1px solid #cbd5e1",
            }}
          >
            {/* PhonePe Modal Header */}
            <div
              style={{
                background: "linear-gradient(135deg, #5f259f 0%, #3f156d 100%)",
                color: "#ffffff",
                padding: "20px 24px",
                borderTopLeftRadius: "18px",
                borderTopRightRadius: "18px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "rgba(255, 255, 255, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "18px",
                  }}
                >
                  <FaMobileAlt />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>
                    PhonePe / UPI Instant Clearance
                  </h3>
                  <div style={{ fontSize: "11.5px", color: "#e9d5ff", marginTop: "2px" }}>
                    Scan QR • Pay Instantly • Dues Disappear Automatically
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPhonePeModal(false)}
                style={{
                  background: "rgba(255, 255, 255, 0.2)",
                  border: "none",
                  borderRadius: "50%",
                  width: "30px",
                  height: "30px",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "24px" }}>
              {phonePeSuccess ? (
                /* Celebration Success View */
                <div style={{ textAlign: "center", padding: "16px 8px" }}>
                  <div
                    style={{
                      width: "72px",
                      height: "72px",
                      borderRadius: "50%",
                      background: "#dcfce7",
                      color: "#16a34a",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "36px",
                      marginBottom: "16px",
                    }}
                  >
                    <FaCheckCircle />
                  </div>
                  <h2 style={{ margin: "0 0 6px 0", fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>
                    Payment Verified &amp; Dues Cleared!
                  </h2>
                  <p style={{ margin: "0 0 20px 0", color: "#059669", fontSize: "13.5px", fontWeight: 600 }}>
                    {phonePeSuccess.message}
                  </p>

                  <div
                    style={{
                      background: "#f8fafc",
                      borderRadius: "12px",
                      padding: "16px",
                      textAlign: "left",
                      fontSize: "13px",
                      marginBottom: "24px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ color: "#64748b" }}>Receipt Number:</span>
                      <strong style={{ color: "#2563eb" }}>{phonePeSuccess.receipt_number}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ color: "#64748b" }}>Amount Paid:</span>
                      <strong style={{ color: "#16a34a" }}>₹{parseFloat(phonePeAmount).toLocaleString()}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ color: "#64748b" }}>Remaining Dues:</span>
                      <strong style={{ color: phonePeSuccess.balance_due > 0 ? "#dc2626" : "#16a34a" }}>
                        ₹{phonePeSuccess.balance_due.toLocaleString()}
                      </strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#64748b" }}>Hall Ticket Clearance:</span>
                      <strong style={{ color: phonePeSuccess.is_cleared_for_exam ? "#16a34a" : "#b45309" }}>
                        {phonePeSuccess.is_cleared_for_exam ? "No-Dues Cleared • Unlocked 🎓" : "Pending Balance"}
                      </strong>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPhonePeModal(false);
                        handleOpenReceipt(phonePeSuccess.receipt_number);
                      }}
                      style={{
                        flex: 1,
                        padding: "12px",
                        background: "#2563eb",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "8px",
                        fontWeight: 700,
                        fontSize: "13px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                      }}
                    >
                      <FaPrint /> View Official Receipt
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPhonePeModal(false)}
                      style={{
                        padding: "12px 20px",
                        background: "#f1f5f9",
                        color: "#334155",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        fontWeight: 600,
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                /* Payment & QR Submission Flow */
                (() => {
                  const activeConfig = phonePeUpiConfig || feesData?.upi_config;
                  const payeeVpa = activeConfig?.upi_id || "6301609560@ybl";
                  const payeeName = activeConfig?.payee_name || "Naresh Alladi";
                  const customQrImage = activeConfig?.custom_qr_image;
                  const instructions = activeConfig?.instructions;
                  const note = `FEES-${currentUser?.rollNo || "STU"}-${phonePeRecord?.category_code || "ACAD"}`;
                  const upiUri = `upi://pay?pa=${encodeURIComponent(payeVpa)}&pn=${encodeURIComponent(payeeName)}&am=${phonePeAmount}&cu=INR&tn=${encodeURIComponent(note)}`;

                  return (
                    <form onSubmit={handlePhonePeSubmit}>
                      {/* Optional Admin Notice / Instructions */}
                      {instructions && (
                        <div
                          style={{
                            background: "#f0fdf4",
                            border: "1px solid #bbf7d0",
                            color: "#166534",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            fontSize: "11.5px",
                            marginBottom: "14px",
                            textAlign: "center",
                          }}
                        >
                          📢 <strong>Notice:</strong> {instructions}
                        </div>
                      )}

                      {/* Fee Info Card */}
                      <div
                        style={{
                          background: "#faf5ff",
                          border: "1px solid #e9d5ff",
                          borderRadius: "10px",
                          padding: "12px 16px",
                          marginBottom: "18px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b21a8", textTransform: "uppercase" }}>
                            {phonePeRecord?.category_name || "College Fees"}
                          </div>
                          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                            Semester {phonePeRecord?.semester} • {phonePeRecord?.academic_year}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "11px", color: "#64748b" }}>Payable Amount</div>
                          <div style={{ fontSize: "18px", fontWeight: 800, color: "#5f259f" }}>
                            ₹{parseFloat(phonePeAmount || 0).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* Step 1: Scan QR */}
                      <div style={{ textAlign: "center", marginBottom: "18px" }}>
                        {/* Toggle between Admin QR Poster and Dynamic QR if custom image exists */}
                        {customQrImage && (
                          <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "12px" }}>
                            <button
                              type="button"
                              onClick={() => setQrViewMode("custom")}
                              style={{
                                padding: "5px 12px",
                                borderRadius: "20px",
                                border: (qrViewMode === "custom" || qrViewMode === "auto") ? "2px solid #5f259f" : "1px solid #cbd5e1",
                                background: (qrViewMode === "custom" || qrViewMode === "auto") ? "#f3e8ff" : "#ffffff",
                                color: (qrViewMode === "custom" || qrViewMode === "auto") ? "#5f259f" : "#64748b",
                                fontSize: "11.5px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Official PhonePe QR Poster
                            </button>
                            <button
                              type="button"
                              onClick={() => setQrViewMode("dynamic")}
                              style={{
                                padding: "5px 12px",
                                borderRadius: "20px",
                                border: qrViewMode === "dynamic" ? "2px solid #5f259f" : "1px solid #cbd5e1",
                                background: qrViewMode === "dynamic" ? "#f3e8ff" : "#ffffff",
                                color: qrViewMode === "dynamic" ? "#5f259f" : "#64748b",
                                fontSize: "11.5px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Dynamic Fee QR (₹{parseFloat(phonePeAmount || 0).toLocaleString()})
                            </button>
                          </div>
                        )}

                        <div
                          style={{
                            display: "inline-block",
                            background: "#ffffff",
                            padding: "12px",
                            borderRadius: "14px",
                            border: "2px solid #5f259f",
                            boxShadow: "0 8px 24px rgba(95, 37, 159, 0.12)",
                            marginBottom: "12px",
                          }}
                        >
                          {customQrImage && (qrViewMode === "custom" || qrViewMode === "auto") ? (
                            <img
                              src={customQrImage}
                              alt="Official PhonePe QR"
                              style={{
                                maxWidth: "220px",
                                maxHeight: "240px",
                                objectFit: "contain",
                                display: "block",
                                borderRadius: "8px",
                              }}
                            />
                          ) : (
                            <QRCodeSVG value={upiUri} size={180} level="M" />
                          )}
                        </div>

                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                          Scan with PhonePe, Google Pay, or Paytm
                        </div>

                        {/* Payee VPA & Copy */}
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            background: "#f8fafc",
                            border: "1px solid #cbd5e1",
                            padding: "6px 12px",
                            borderRadius: "20px",
                            fontSize: "12px",
                            color: "#334155",
                            marginTop: "8px",
                          }}
                        >
                          <span>Payee UPI ID: <strong>{payeVpa}</strong></span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(payeVpa);
                              setCopiedUpi(true);
                              setTimeout(() => setCopiedUpi(false), 2000);
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#5f259f",
                              cursor: "pointer",
                              fontSize: "12px",
                              display: "flex",
                              alignItems: "center",
                              gap: "3px",
                            }}
                          >
                            <FaCopy /> {copiedUpi ? "Copied!" : "Copy"}
                          </button>
                        </div>

                        <div style={{ marginTop: "12px" }}>
                          <button
                            type="button"
                            onClick={() => {
                              const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                              if (isMobile) {
                                window.location.href = upiUri;
                              } else {
                                alert("You are on a desktop/laptop computer. Desktop browsers cannot open mobile apps directly.\n\n👉 Please open PhonePe, Google Pay, or Paytm on your mobile phone and scan the QR code displayed on screen!");
                              }
                            }}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "8px 18px",
                              background: "#5f259f",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "8px",
                              fontSize: "12.5px",
                              fontWeight: 700,
                              cursor: "pointer",
                              boxShadow: "0 2px 8px rgba(95, 37, 159, 0.25)",
                            }}
                          >
                            <FaMobileAlt /> Open PhonePe App (Mobile Only)
                          </button>
                          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "5px" }}>
                            💻 On Laptop/PC: Simply open PhonePe on your phone and scan the QR code above.
                          </div>
                        </div>
                      </div>

                      {/* Step 2: UTR Reference Submission */}
                      <div
                        style={{
                          borderTop: "1px solid #e2e8f0",
                          paddingTop: "16px",
                          marginBottom: "16px",
                        }}
                      >
                        <label
                          style={{
                            display: "block",
                            fontSize: "12.5px",
                            fontWeight: 700,
                            color: "#0f172a",
                            marginBottom: "6px",
                          }}
                        >
                          Step 2: Enter 12-Digit PhonePe UPI Ref (UTR) Number: *
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={16}
                          placeholder="e.g., 408219384721"
                          value={phonePeUtr}
                          onChange={(e) => setPhonePeUtr(e.target.value.toUpperCase())}
                          style={{
                            width: "100%",
                            padding: "11px 14px",
                            borderRadius: "8px",
                            border: "2px solid #5f259f",
                            fontSize: "15px",
                            fontWeight: 700,
                            letterSpacing: "1px",
                            boxSizing: "border-box",
                            color: "#0f172a",
                          }}
                        />
                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                          Find the 12-digit UTR on your PhonePe payment confirmation screen under 'UPI Ref ID'.
                        </div>
                      </div>

                      {/* Error Display */}
                      {phonePeError && (
                        <div
                          style={{
                            background: "#fee2e2",
                            color: "#991b1b",
                            border: "1px solid #fecaca",
                            borderRadius: "8px",
                            padding: "10px 14px",
                            fontSize: "12.5px",
                            marginBottom: "16px",
                          }}
                        >
                          {phonePeError}
                        </div>
                      )}

                      {/* Submit Button */}
                      <button
                        type="submit"
                        disabled={phonePeSubmitting}
                        style={{
                          width: "100%",
                          padding: "13px",
                          borderRadius: "10px",
                          background: "linear-gradient(135deg, #5f259f 0%, #3f156d 100%)",
                          color: "#ffffff",
                          border: "none",
                          fontSize: "14px",
                          fontWeight: 700,
                          cursor: phonePeSubmitting ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          boxShadow: "0 4px 15px rgba(95, 37, 159, 0.35)",
                        }}
                      >
                        {phonePeSubmitting ? (
                          "Verifying UTR Transaction..."
                        ) : (
                          <>
                            <FaCheckCircle /> Verify UTR &amp; Clear Dues Instantly
                          </>
                        )}
                      </button>
                    </form>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
