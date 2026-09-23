import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import {
  getStudents,
  getSystemUsers,
  createSystemUser,
  getAuditLogs,
  getAuditStats,
  getAllSubjects,
  getTimetable,
  createTimetableSlot,
  deleteTimetableSlot,
  getAttendanceSummary,
  getAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  downloadReportCSV,
  getAttendanceReport,
  getLowAttendanceReport,
  getStudentsRosterReport,
  getPerformanceReport,
} from "../services/studentservice";
import {
  FaUserShield,
  FaUserGraduate,
  FaChalkboardTeacher,
  FaBook,
  FaHistory,
  FaPlusCircle,
  FaBuilding,
  FaCheckCircle,
  FaTimes,
  FaCalendarAlt,
  FaClock,
  FaTrash,
  FaChartLine,
  FaExclamationTriangle,
  FaBullhorn,
  FaBell,
  FaDownload,
  FaFileAlt,
  FaSearch,
  FaSync,
  FaFilter,
} from "react-icons/fa";

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    totalSubjects: 0,
    activeDepartments: 0,
  });
  const [recentLogs, setRecentLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [timetableSlots, setTimetableSlots] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [timetableDayFilter, setTimetableDayFilter] = useState("ALL");
  const [activeTab, setActiveTab] = useState("overview"); // 'overview' | 'users' | 'subjects' | 'timetable' | 'analytics' | 'announcements'
  const [loading, setLoading] = useState(true);

  // Audit Console States
  const [auditStats, setAuditStats] = useState(null);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("ALL");
  const [auditEntityFilter, setAuditEntityFilter] = useState("ALL");
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(20);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditLoading, setAuditLoading] = useState(false);

  const fetchAuditLogs = async (page = 1) => {
    setAuditLoading(true);
    try {
      const params = {
        page,
        page_size: auditPageSize,
      };
      if (auditSearch.trim()) params.search = auditSearch.trim();
      if (auditActionFilter !== "ALL") params.action = auditActionFilter;
      if (auditEntityFilter !== "ALL") params.entity = auditEntityFilter;
      if (auditDateFrom) params.date_from = auditDateFrom;
      if (auditDateTo) params.date_to = auditDateTo;

      const res = await getAuditLogs(params);
      const data = res.data;
      const list = data.results || data.logs || [];
      setRecentLogs(list);
      setAuditTotal(data.total || list.length);
      setAuditTotalPages(data.total_pages || 1);
      setAuditPage(data.page || page);
    } catch (err) {
      console.error("Failed to load audit logs", err);
    } finally {
      setAuditLoading(false);
    }
  };

  const fetchAuditStatsData = async () => {
    try {
      const res = await getAuditStats();
      setAuditStats(res.data);
    } catch (err) {
      console.error("Failed to fetch audit stats", err);
    }
  };

  const getAuditBadgeStyle = (action) => {
    switch (action) {
      case "LOGIN":
        return { background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe" };
      case "LOGOUT":
        return { background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" };
      case "STUDENT_CREATE":
      case "USER_CREATE":
      case "TEACHER_CREATE":
      case "STUDENT_ACTIVATE":
        return { background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" };
      case "STUDENT_DEACTIVATE":
      case "ANNOUNCEMENT_DELETE":
      case "TIMETABLE_DELETE":
        return { background: "#fff1f2", color: "#9f1239", border: "1px solid #fecdd3" };
      case "ATTENDANCE_SESSION_START":
      case "ATTENDANCE_SESSION_CLOSE":
      case "ATTENDANCE_QR_MARK":
        return { background: "#ecfeff", color: "#155e75", border: "1px solid #a5f3fc" };
      case "MARKS_UPDATE":
        return { background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" };
      case "ANNOUNCEMENT_CREATE":
      case "REPORT_GENERATE":
        return { background: "#eef2ff", color: "#3730a3", border: "1px solid #c7d2fe" };
      case "ACADEMIC_SETUP":
      case "TIMETABLE_CREATE":
      case "TIMETABLE_UPDATE":
        return { background: "#faf5ff", color: "#6b21a8", border: "1px solid #e9d5ff" };
      default:
        return { background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1" };
    }
  };

  // Attendance Analytics States
  const [attendanceStats, setAttendanceStats] = useState(null);
  const [attendanceThreshold, setAttendanceThreshold] = useState(75);

  // Institutional Reports States
  const [reportType, setReportType] = useState("attendance"); // 'attendance' | 'low-attendance' | 'students' | 'performance'
  const [reportFilter, setReportFilter] = useState({
    branch: "ALL",
    year: "ALL",
    semester: "ALL",
    section: "ALL",
    threshold: 75,
    date_from: "",
    date_to: "",
  });
  const [reportPreviewData, setReportPreviewData] = useState(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState(false);

  const fetchReportPreview = async (type = reportType, filters = reportFilter) => {
    setIsLoadingReport(true);
    try {
      const cleanParams = {};
      if (filters.branch && filters.branch !== "ALL") cleanParams.branch = filters.branch;
      if (filters.year && filters.year !== "ALL") cleanParams.year = filters.year;
      if (filters.semester && filters.semester !== "ALL") cleanParams.semester = filters.semester;
      if (filters.section && filters.section !== "ALL") cleanParams.section = filters.section;
      if (filters.threshold) cleanParams.threshold = filters.threshold;
      if (filters.date_from) cleanParams.date_from = filters.date_from;
      if (filters.date_to) cleanParams.date_to = filters.date_to;

      let res;
      if (type === "attendance") {
        res = await getAttendanceReport(cleanParams);
      } else if (type === "low-attendance") {
        res = await getLowAttendanceReport(cleanParams);
      } else if (type === "students") {
        res = await getStudentsRosterReport(cleanParams);
      } else if (type === "performance") {
        res = await getPerformanceReport(cleanParams);
      }
      setReportPreviewData(res.data);
    } catch (err) {
      console.error("Report preview failed:", err);
    } finally {
      setIsLoadingReport(false);
    }
  };

  const handleDownloadReport = async () => {
    setIsExportingReport(true);
    try {
      const cleanParams = {};
      if (reportFilter.branch && reportFilter.branch !== "ALL") cleanParams.branch = reportFilter.branch;
      if (reportFilter.year && reportFilter.year !== "ALL") cleanParams.year = reportFilter.year;
      if (reportFilter.semester && reportFilter.semester !== "ALL") cleanParams.semester = reportFilter.semester;
      if (reportFilter.section && reportFilter.section !== "ALL") cleanParams.section = reportFilter.section;
      if (reportFilter.threshold) cleanParams.threshold = reportFilter.threshold;
      if (reportFilter.date_from) cleanParams.date_from = reportFilter.date_from;
      if (reportFilter.date_to) cleanParams.date_to = reportFilter.date_to;

      const filename = `${reportType}_report_${new Date().toISOString().slice(0, 10)}.csv`;
      await downloadReportCSV(reportType, cleanParams, filename);
    } catch (err) {
      alert("Failed to export report CSV.");
    } finally {
      setIsExportingReport(false);
    }
  };

  // Announcement Modal State
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [announcementFormData, setAnnouncementFormData] = useState({
    title: "",
    description: "",
    priority: "Normal",
    target_audience: "ALL",
    branch: "CSE",
    year: 3,
    semester: "5",
    section: "A",
  });
  const [announcementModalMessage, setAnnouncementModalMessage] = useState(null);
  const [isSubmittingAnnouncement, setIsSubmittingAnnouncement] = useState(false);

  // Timetable Slot Modal State
  const [showTimetableModal, setShowTimetableModal] = useState(false);
  const [timetableFormData, setTimetableFormData] = useState({
    subject: "",
    teacher: "",
    day: "Monday",
    start_time: "09:00:00",
    end_time: "10:00:00",
    room: "Room 101",
    branch: "CSE",
    year: 3,
    semester: "5",
    section: "A",
  });
  const [timetableModalMessage, setTimetableModalMessage] = useState(null);
  const [isSubmittingSlot, setIsSubmittingSlot] = useState(false);

  // New User Modal
  const [showUserModal, setShowUserModal] = useState(false);
  const [userFormData, setUserFormData] = useState({
    username: "",
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    role: "teacher",
    department: "Computer Science & Engineering",
  });
  const [userModalMessage, setUserModalMessage] = useState(null);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  const fetchAdminData = () => {
    setLoading(true);
    Promise.all([
      getStudents({ all: "true" }).catch(() => ({ data: [] })),
      getSystemUsers().catch(() => ({ data: [] })),
      getAllSubjects().catch(() => ({ data: [] })),
      getAuditLogs().catch(() => ({ data: { logs: [] } })),
      getTimetable().catch(() => ({ data: [] })),
      getAnnouncements().catch(() => ({ data: [] })),
    ])
      .then(([stuRes, usersRes, subRes, auditRes, timeRes, annRes]) => {
        const studentList = stuRes.data?.results || stuRes.data || [];
        const userList = usersRes.data || [];
        const subjectList = subRes.data || [];
        const logsList = auditRes.data?.logs || [];
        const slotList = timeRes.data || [];
        const annList = annRes.data || [];

        const depts = new Set([
          ...studentList.map((s) => s.branch),
          ...subjectList.map((s) => s.department),
        ]);

        const teachers = userList.filter((u) => u.profile?.role === "teacher");

        setStats({
          totalStudents: studentList.length,
          totalTeachers: teachers.length || 1,
          totalSubjects: subjectList.length,
          activeDepartments: depts.size || 5,
        });

        setUsers(userList);
        setSubjects(subjectList);
        setRecentLogs(logsList);
        setTimetableSlots(slotList);
        setAnnouncements(annList);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleCreateAnnouncement = async (e) => {
    if (e) e.preventDefault();
    setIsSubmittingAnnouncement(true);
    setAnnouncementModalMessage(null);

    try {
      const payload = {
        title: announcementFormData.title,
        description: announcementFormData.description,
        priority: announcementFormData.priority,
        target_audience: announcementFormData.target_audience,
      };

      if (announcementFormData.target_audience === "BRANCH") {
        payload.branch = announcementFormData.branch;
      } else if (announcementFormData.target_audience === "YEAR") {
        payload.branch = announcementFormData.branch;
        payload.year = parseInt(announcementFormData.year, 10);
      } else if (announcementFormData.target_audience === "SEMESTER") {
        payload.branch = announcementFormData.branch;
        payload.semester = String(announcementFormData.semester);
      } else if (announcementFormData.target_audience === "SECTION") {
        payload.branch = announcementFormData.branch;
        payload.section = announcementFormData.section;
      }

      await createAnnouncement(payload);
      setAnnouncementModalMessage({
        success: true,
        text: `Announcement published successfully! In-app notifications sent to targeted students.`,
      });

      fetchAdminData();
      setTimeout(() => {
        setShowAnnouncementModal(false);
        setAnnouncementModalMessage(null);
        setAnnouncementFormData({
          title: "",
          description: "",
          priority: "Normal",
          target_audience: "ALL",
          branch: "CSE",
          year: 3,
          semester: "5",
          section: "A",
        });
      }, 1500);
    } catch (err) {
      setAnnouncementModalMessage({
        success: false,
        text: err.response?.data?.detail || "Failed to publish announcement.",
      });
    } finally {
      setIsSubmittingAnnouncement(false);
    }
  };

  const handleDeleteAnnouncement = async (id) => {
    if (!window.confirm("Are you sure you want to deactivate this announcement?")) return;
    try {
      await deleteAnnouncement(id);
      fetchAdminData();
    } catch (err) {
      alert(err.response?.data?.detail || "Could not deactivate announcement.");
    }
  };

  const fetchAttendanceAnalytics = (thresh = attendanceThreshold) => {
    getAttendanceSummary({ threshold: thresh })
      .then((res) => {
        setAttendanceStats(res.data);
      })
      .catch((err) => {
        console.error("Failed to load attendance analytics:", err);
      });
  };

  useEffect(() => {
    fetchAdminData();
    fetchAttendanceAnalytics(attendanceThreshold);
    fetchAuditStatsData();
  }, []);

  useEffect(() => {
    if (activeTab === "overview") {
      fetchAuditLogs(auditPage);
    }
  }, [activeTab, auditActionFilter, auditEntityFilter, auditPageSize, auditDateFrom, auditDateTo, auditPage]);

  const handleCreateTimetableSlot = async (e) => {
    if (e) e.preventDefault();
    setIsSubmittingSlot(true);
    setTimetableModalMessage(null);

    try {
      await createTimetableSlot(timetableFormData);
      setTimetableModalMessage({
        success: true,
        text: "Timetable schedule slot added successfully!",
      });
      fetchAdminData();
      setTimeout(() => {
        setShowTimetableModal(false);
        setTimetableModalMessage(null);
        setTimetableFormData({
          subject: "",
          teacher: "",
          day: "Monday",
          start_time: "09:00:00",
          end_time: "10:00:00",
          room: "Room 101",
          branch: "CSE",
          year: 3,
          semester: "5",
          section: "A",
        });
      }, 1500);
    } catch (err) {
      setTimetableModalMessage({
        success: false,
        text: err.response?.data?.detail || "Failed to create timetable slot.",
      });
    } finally {
      setIsSubmittingSlot(false);
    }
  };

  const handleDeleteTimetableSlot = async (slotId, slotDesc) => {
    if (!window.confirm(`Are you sure you want to remove ${slotDesc} from the timetable?`)) {
      return;
    }
    try {
      await deleteTimetableSlot(slotId);
      fetchAdminData();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to delete timetable slot.");
    }
  };

  const handleCreateUser = async (e) => {
    if (e) e.preventDefault();
    setIsSubmittingUser(true);
    setUserModalMessage(null);

    try {
      await createSystemUser(userFormData);
      setUserModalMessage({
        success: true,
        text: `User "${userFormData.username}" provisioned successfully!`,
      });
      fetchAdminData();
      setTimeout(() => {
        setShowUserModal(false);
        setUserModalMessage(null);
        setUserFormData({
          username: "",
          email: "",
          password: "",
          first_name: "",
          last_name: "",
          role: "teacher",
          department: "Computer Science & Engineering",
        });
      }, 1500);
    } catch (err) {
      setUserModalMessage({
        success: false,
        text: err.response?.data?.detail || "Failed to create user.",
      });
    } finally {
      setIsSubmittingUser(false);
    }
  };

  return (
    <div className="sideandmain">
      <div className="Sidebarindashboard">
        <Sidebar />
      </div>

      <div className="main-content">
        <Navbar />

        <div style={{ padding: "28px" }}>
          {/* Header Banner */}
          <div
            style={{
              background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
              color: "#fff",
              padding: "28px",
              borderRadius: "16px",
              marginBottom: "28px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 12px",
                  background: "rgba(255,255,255,0.1)",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                <FaUserShield /> System Administration Console
              </div>
              <h1 style={{ margin: "0 0 6px 0", fontSize: "26px" }}>
                Institutional Governance & Audit Control
              </h1>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "14px" }}>
                Manage faculty credentials, academic departments, courses catalog, and inspect audit logs.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowUserModal(true)}
              style={{
                background: "#2563eb",
                color: "#fff",
                border: "none",
                padding: "12px 20px",
                borderRadius: "10px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <FaPlusCircle /> Provision Faculty Account
            </button>
          </div>

          {/* Metric Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "20px",
              marginBottom: "28px",
            }}
          >
            <div
              style={{
                background: "#fff",
                padding: "20px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  background: "#eff6ff",
                  color: "#2563eb",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                }}
              >
                <FaUserGraduate />
              </div>
              <div>
                <small style={{ color: "#64748b" }}>Enrolled Students</small>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a" }}>
                  {loading ? "..." : stats.totalStudents}
                </div>
              </div>
            </div>

            <div
              style={{
                background: "#fff",
                padding: "20px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  background: "#ecfdf5",
                  color: "#059669",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                }}
              >
                <FaChalkboardTeacher />
              </div>
              <div>
                <small style={{ color: "#64748b" }}>Faculty Members</small>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a" }}>
                  {loading ? "..." : stats.totalTeachers}
                </div>
              </div>
            </div>

            <div
              style={{
                background: "#fff",
                padding: "20px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  background: "#fef3c7",
                  color: "#d97706",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                }}
              >
                <FaBook />
              </div>
              <div>
                <small style={{ color: "#64748b" }}>Curriculum Subjects</small>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a" }}>
                  {loading ? "..." : stats.totalSubjects}
                </div>
              </div>
            </div>

            <div
              style={{
                background: "#fff",
                padding: "20px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  background: "#f3e8ff",
                  color: "#7c3aed",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                }}
              >
                <FaBuilding />
              </div>
              <div>
                <small style={{ color: "#64748b" }}>Academic Departments</small>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a" }}>
                  {loading ? "..." : stats.activeDepartments}
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px" }}>
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "overview" ? "#0f172a" : "#f1f5f9",
                color: activeTab === "overview" ? "#fff" : "#475569",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Recent Audit Activity
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("users")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "users" ? "#0f172a" : "#f1f5f9",
                color: activeTab === "users" ? "#fff" : "#475569",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              System Users & Faculty ({users.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("subjects")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "subjects" ? "#0f172a" : "#f1f5f9",
                color: activeTab === "subjects" ? "#fff" : "#475569",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Curriculum Courses ({subjects.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("timetable")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "timetable" ? "#0f172a" : "#f1f5f9",
                color: activeTab === "timetable" ? "#fff" : "#475569",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Academic Timetable ({timetableSlots.length})
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("analytics");
                if (!attendanceStats) fetchAttendanceAnalytics(attendanceThreshold);
              }}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "analytics" ? "#0f172a" : "#f1f5f9",
                color: activeTab === "analytics" ? "#fff" : "#475569",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Attendance Analytics
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("announcements")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "announcements" ? "#0f172a" : "#f1f5f9",
                color: activeTab === "announcements" ? "#fff" : "#475569",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <FaBullhorn /> Broadcasts & Notices ({announcements.length})
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("reports");
                if (!reportPreviewData) fetchReportPreview(reportType, reportFilter);
              }}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "reports" ? "#0f172a" : "#f1f5f9",
                color: activeTab === "reports" ? "#fff" : "#475569",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <FaDownload /> Reports & Exports
            </button>
          </div>

          {/* Tab 1: Audit Activity */}
          {activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Audit Summary Metrics */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    background: "#fff",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "10px",
                      background: "#eff6ff",
                      color: "#2563eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "20px",
                    }}
                  >
                    <FaHistory />
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Total Events Logged</div>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "#0f172a" }}>
                      {auditStats?.total_logs ?? auditTotal}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: "#fff",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "10px",
                      background: "#f0fdf4",
                      color: "#16a34a",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "20px",
                    }}
                  >
                    <FaClock />
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Today's Activity</div>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "#16a34a" }}>
                      {auditStats?.today_logs ?? 0}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: "#fff",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "10px",
                      background: "#faf5ff",
                      color: "#9333ea",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "20px",
                    }}
                  >
                    <FaUserShield />
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Authentication Events</div>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "#9333ea" }}>
                      {auditStats?.auth_events_count ?? 0}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: "#fff",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "10px",
                      background: "#fff7ed",
                      color: "#ea580c",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "20px",
                    }}
                  >
                    <FaBook />
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Academic Operations</div>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "#ea580c" }}>
                      {auditStats?.academic_events_count ?? 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Audit Console Container */}
              <div
                style={{
                  background: "#fff",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  padding: "24px",
                }}
              >
                {/* Header & Controls */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                    marginBottom: "20px",
                  }}
                >
                  <div>
                    <h3 style={{ margin: "0 0 4px 0", fontSize: "18px", color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                      <FaHistory style={{ color: "#2563eb" }} />
                      Security & Operations Audit Trail
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          padding: "2px 8px",
                          background: "#eff6ff",
                          color: "#1e40af",
                          borderRadius: "12px",
                        }}
                      >
                        {auditTotal} entries
                      </span>
                    </h3>
                    <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                      Authoritative, immutable institutional ledger recording all authentication, enrollment, attendance, and grading operations.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      fetchAuditLogs(auditPage);
                      fetchAuditStatsData();
                    }}
                    disabled={auditLoading}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 14px",
                      background: "#f8fafc",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      color: "#334155",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <FaSync className={auditLoading ? "fa-spin" : ""} />
                    Refresh Logs
                  </button>
                </div>

                {/* Filter & Search Bar */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: "12px",
                    background: "#f8fafc",
                    padding: "16px",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    marginBottom: "20px",
                    alignItems: "end",
                  }}
                >
                  {/* Keyword Search */}
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                      Keyword Search
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type="text"
                        placeholder="Search user, IP, or details..."
                        value={auditSearch}
                        onChange={(e) => setAuditSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            setAuditPage(1);
                            fetchAuditLogs(1);
                          }
                        }}
                        style={{
                          width: "100%",
                          padding: "8px 12px 8px 32px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "13px",
                          background: "#fff",
                        }}
                      />
                      <FaSearch
                        style={{
                          position: "absolute",
                          left: "10px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          color: "#94a3b8",
                          fontSize: "12px",
                        }}
                      />
                    </div>
                  </div>

                  {/* Action Filter */}
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                      Action Type
                    </label>
                    <select
                      value={auditActionFilter}
                      onChange={(e) => {
                        setAuditActionFilter(e.target.value);
                        setAuditPage(1);
                      }}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        background: "#fff",
                      }}
                    >
                      <option value="ALL">All Actions</option>
                      <option value="LOGIN">User Login</option>
                      <option value="LOGOUT">User Logout</option>
                      <option value="STUDENT_CREATE">Student Enrolled</option>
                      <option value="STUDENT_UPDATE">Student Updated</option>
                      <option value="STUDENT_DEACTIVATE">Student Deactivated</option>
                      <option value="STUDENT_ACTIVATE">Student Restored</option>
                      <option value="USER_CREATE">User Provisioned</option>
                      <option value="TEACHER_CREATE">Teacher Created</option>
                      <option value="ATTENDANCE_SESSION_START">Attendance Started</option>
                      <option value="ATTENDANCE_SESSION_CLOSE">Attendance Closed</option>
                      <option value="ATTENDANCE_QR_MARK">QR Attendance Marked</option>
                      <option value="MARKS_UPDATE">Marks Evaluated</option>
                      <option value="ANNOUNCEMENT_CREATE">Notice Published</option>
                      <option value="REPORT_GENERATE">Report Generated</option>
                      <option value="TIMETABLE_CREATE">Timetable Slot Created</option>
                      <option value="TIMETABLE_DELETE">Timetable Slot Deleted</option>
                      <option value="ACADEMIC_SETUP">Academic Structure Modified</option>
                    </select>
                  </div>

                  {/* Entity Filter */}
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                      Entity
                    </label>
                    <select
                      value={auditEntityFilter}
                      onChange={(e) => {
                        setAuditEntityFilter(e.target.value);
                        setAuditPage(1);
                      }}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        background: "#fff",
                      }}
                    >
                      <option value="ALL">All Entities</option>
                      <option value="Student">Student</option>
                      <option value="User">User / Staff</option>
                      <option value="AttendanceSession">Attendance Session</option>
                      <option value="AttendanceRecord">Attendance Record</option>
                      <option value="StudentScore">Marks & Scores</option>
                      <option value="Announcement">Announcement</option>
                      <option value="TimetableSlot">Timetable Slot</option>
                      <option value="AcademicClass">Academic Cohort</option>
                      <option value="FacultyAssignment">Faculty Assignment</option>
                    </select>
                  </div>

                  {/* Date From */}
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                      Date From
                    </label>
                    <input
                      type="date"
                      value={auditDateFrom}
                      onChange={(e) => {
                        setAuditDateFrom(e.target.value);
                        setAuditPage(1);
                      }}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        background: "#fff",
                      }}
                    />
                  </div>

                  {/* Date To */}
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                      Date To
                    </label>
                    <input
                      type="date"
                      value={auditDateTo}
                      onChange={(e) => {
                        setAuditDateTo(e.target.value);
                        setAuditPage(1);
                      }}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        background: "#fff",
                      }}
                    />
                  </div>

                  {/* Buttons */}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => {
                        setAuditPage(1);
                        fetchAuditLogs(1);
                      }}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        background: "#2563eb",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Filter
                    </button>
                    <button
                      onClick={() => {
                        setAuditSearch("");
                        setAuditActionFilter("ALL");
                        setAuditEntityFilter("ALL");
                        setAuditDateFrom("");
                        setAuditDateTo("");
                        setAuditPage(1);
                      }}
                      style={{
                        padding: "8px 12px",
                        background: "#e2e8f0",
                        color: "#475569",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Audit Logs Table */}
                <div className="table-responsive" style={{ minHeight: "220px", position: "relative" }}>
                  {auditLoading && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(255, 255, 255, 0.7)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 10,
                        fontSize: "14px",
                        color: "#2563eb",
                        fontWeight: 600,
                      }}
                    >
                      <FaSync className="fa-spin" style={{ marginRight: "8px" }} /> Loading audit trail...
                    </div>
                  )}

                  <table className="grades-table">
                    <thead>
                      <tr>
                        <th style={{ width: "160px" }}>Timestamp</th>
                        <th style={{ width: "160px" }}>Actor / User</th>
                        <th style={{ width: "160px" }}>Action</th>
                        <th style={{ width: "130px" }}>Entity</th>
                        <th>Details & System Description</th>
                        <th style={{ width: "120px" }}>IP Address</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentLogs.length > 0 ? (
                        recentLogs.map((log) => {
                          const badgeStyle = getAuditBadgeStyle(log.action);
                          return (
                            <tr key={log.id} style={{ transition: "background 0.15s" }}>
                              <td style={{ fontSize: "12px", color: "#64748b", whiteSpace: "nowrap" }}>
                                {new Date(log.timestamp).toLocaleString()}
                              </td>
                              <td>
                                <div style={{ display: "flex", flexDirection: "column" }}>
                                  <strong style={{ color: "#0f172a", fontSize: "13px" }}>
                                    {log.user_name || log.username || "System Agent"}
                                  </strong>
                                  {log.username && (
                                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>@{log.username}</span>
                                  )}
                                </div>
                              </td>
                              <td>
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "3px 10px",
                                    borderRadius: "12px",
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    ...badgeStyle,
                                  }}
                                >
                                  {log.action}
                                </span>
                              </td>
                              <td>
                                <span
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    color: "#334155",
                                    background: "#f1f5f9",
                                    padding: "2px 8px",
                                    borderRadius: "6px",
                                  }}
                                >
                                  {log.entity}
                                  {log.entity_id ? ` #${log.entity_id}` : ""}
                                </span>
                              </td>
                              <td style={{ fontSize: "13px", color: "#1e293b", lineHeight: "1.4" }}>
                                {log.description}
                              </td>
                              <td style={{ fontSize: "12px", color: "#64748b", fontFamily: "monospace" }}>
                                {log.ip_address || "127.0.0.1"}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="6" style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
                            <FaHistory style={{ fontSize: "28px", color: "#cbd5e1", marginBottom: "8px", display: "block", margin: "0 auto 8px auto" }} />
                            No audit records found matching your query criteria.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Server-Side Pagination Controls */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                    marginTop: "20px",
                    paddingTop: "16px",
                    borderTop: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ fontSize: "13px", color: "#64748b" }}>
                    Showing{" "}
                    <strong>
                      {auditTotal > 0 ? (auditPage - 1) * auditPageSize + 1 : 0} -{" "}
                      {Math.min(auditPage * auditPageSize, auditTotal)}
                    </strong>{" "}
                    of <strong>{auditTotal}</strong> audit events
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>Rows per page:</span>
                      <select
                        value={auditPageSize}
                        onChange={(e) => {
                          setAuditPageSize(Number(e.target.value));
                          setAuditPage(1);
                        }}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "12px",
                          background: "#fff",
                        }}
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>

                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={() => {
                          if (auditPage > 1) {
                            const newPage = auditPage - 1;
                            setAuditPage(newPage);
                            fetchAuditLogs(newPage);
                          }
                        }}
                        disabled={auditPage <= 1 || auditLoading}
                        style={{
                          padding: "6px 12px",
                          background: auditPage <= 1 ? "#f1f5f9" : "#fff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: auditPage <= 1 ? "#94a3b8" : "#1e293b",
                          cursor: auditPage <= 1 ? "not-allowed" : "pointer",
                        }}
                      >
                        Previous
                      </button>

                      <div
                        style={{
                          padding: "6px 12px",
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#334155",
                        }}
                      >
                        Page {auditPage} of {auditTotalPages}
                      </div>

                      <button
                        onClick={() => {
                          if (auditPage < auditTotalPages) {
                            const newPage = auditPage + 1;
                            setAuditPage(newPage);
                            fetchAuditLogs(newPage);
                          }
                        }}
                        disabled={auditPage >= auditTotalPages || auditLoading}
                        style={{
                          padding: "6px 12px",
                          background: auditPage >= auditTotalPages ? "#f1f5f9" : "#fff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: auditPage >= auditTotalPages ? "#94a3b8" : "#1e293b",
                          cursor: auditPage >= auditTotalPages ? "not-allowed" : "pointer",
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Users & Faculty */}
          {activeTab === "users" && (
            <div
              style={{
                background: "#fff",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                padding: "20px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>
                  Authorized System Users
                </h3>
              </div>

              <table className="grades-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Username</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>#{u.id}</td>
                      <td>
                        <strong>{u.username}</strong>
                      </td>
                      <td>{u.first_name ? `${u.first_name} ${u.last_name}` : u.username}</td>
                      <td>
                        <span
                          className={`stat-badge-tag ${
                            u.profile?.role === "admin"
                              ? "tag-danger"
                              : u.profile?.role === "teacher"
                              ? "tag-info"
                              : "tag-success"
                          }`}
                        >
                          {u.profile?.role?.toUpperCase() || "USER"}
                        </span>
                      </td>
                      <td>{u.profile?.department || "Academic"}</td>
                      <td>{u.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 3: Subjects */}
          {activeTab === "subjects" && (
            <div
              style={{
                background: "#fff",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                padding: "20px",
              }}
            >
              <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#0f172a" }}>
                Curriculum Subjects Catalog
              </h3>
              <table className="grades-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Course Title</th>
                    <th>Credits</th>
                    <th>Branch</th>
                    <th>Semester</th>
                    <th>Department</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((sub) => (
                    <tr key={sub.id}>
                      <td>
                        <strong>{sub.code}</strong>
                      </td>
                      <td>{sub.name}</td>
                      <td>{sub.credits}</td>
                      <td>{sub.branch}</td>
                      <td>Sem {sub.semester}</td>
                      <td>{sub.department}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 4: Timetable Schedules */}
          {activeTab === "timetable" && (
            <div
              style={{
                background: "#fff",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                padding: "20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <h3 style={{ margin: "0 0 4px 0", fontSize: "18px", color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                    <FaClock style={{ color: "#2563eb" }} />
                    Academic Timetable & Lecture Periods
                  </h3>
                  <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                    Manage curriculum lecture slots, classroom assignments, and assigned faculty instructors.
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <select
                    value={timetableDayFilter}
                    onChange={(e) => setTimetableDayFilter(e.target.value)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                      background: "#f8fafc",
                    }}
                  >
                    <option value="ALL">All Days (Monday - Saturday)</option>
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      if (subjects.length > 0 && !timetableFormData.subject) {
                        setTimetableFormData((prev) => ({
                          ...prev,
                          subject: subjects[0].id,
                          teacher: users.find((u) => u.profile?.role === "teacher")?.id || users[0]?.id || "",
                        }));
                      }
                      setShowTimetableModal(true);
                    }}
                    style={{
                      background: "#2563eb",
                      color: "#fff",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: "8px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                    }}
                  >
                    <FaPlusCircle /> Add Schedule Slot
                  </button>
                </div>
              </div>

              <div className="table-responsive">
                <table className="grades-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Time Slot</th>
                      <th>Course / Subject</th>
                      <th>Instructor</th>
                      <th>Cohort / Section</th>
                      <th>Room</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timetableSlots.filter((slot) => timetableDayFilter === "ALL" || slot.day === timetableDayFilter).length > 0 ? (
                      timetableSlots
                        .filter((slot) => timetableDayFilter === "ALL" || slot.day === timetableDayFilter)
                        .map((slot) => (
                          <tr key={slot.id}>
                            <td>
                              <span
                                style={{
                                  background: "#f1f5f9",
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  fontWeight: 600,
                                  fontSize: "12px",
                                  color: "#334155",
                                }}
                              >
                                {slot.day}
                              </span>
                            </td>
                            <td>
                              <strong>
                                {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                              </strong>
                            </td>
                            <td>
                              <div>
                                <strong>{slot.subject_details?.code || slot.subject}</strong>
                                <span style={{ color: "#64748b", marginLeft: "6px", fontSize: "13px" }}>
                                  {slot.subject_details?.name || ""}
                                </span>
                              </div>
                            </td>
                            <td>{slot.teacher_name || "Faculty Member"}</td>
                            <td>
                              <span className="dash-branch-badge">{slot.academic_class_name}</span>
                            </td>
                            <td>{slot.room}</td>
                            <td>
                              <button
                                type="button"
                                onClick={() => handleDeleteTimetableSlot(slot.id, `${slot.day} ${slot.subject_details?.code || slot.subject}`)}
                                style={{
                                  background: "#fee2e2",
                                  color: "#b91c1c",
                                  border: "none",
                                  padding: "6px 10px",
                                  borderRadius: "6px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                <FaTrash /> Delete
                              </button>
                            </td>
                          </tr>
                        ))
                    ) : (
                      <tr>
                        <td colSpan="7" style={{ textAlign: "center", padding: "28px", color: "#64748b" }}>
                          No timetable slots found for the selected day filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 5: Attendance Analytics */}
          {activeTab === "analytics" && (
            <div>
              {/* Analytics Header & Configurable Threshold Controls */}
              <div
                style={{
                  background: "#fff",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  padding: "20px 24px",
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
                    Institutional Attendance Analytics & Shortage Warning System
                  </h3>
                  <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                    Multi-dimensional tracking: branch-wise, year-wise, section-wise, subject-wise, and real-time deficit calculations.
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
                      onClick={() => {
                        setAttendanceThreshold(threshVal);
                        fetchAttendanceAnalytics(threshVal);
                      }}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "20px",
                        border: "1px solid",
                        borderColor: attendanceThreshold === threshVal ? "#2563eb" : "#cbd5e1",
                        background: attendanceThreshold === threshVal ? "#eff6ff" : "#ffffff",
                        color: attendanceThreshold === threshVal ? "#2563eb" : "#475569",
                        fontWeight: attendanceThreshold === threshVal ? 700 : 500,
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      {threshVal}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => fetchAttendanceAnalytics(attendanceThreshold)}
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
                    <FaHistory />
                  </button>
                </div>
              </div>

              {!attendanceStats ? (
                <div style={{ padding: "40px", textAlign: "center", color: "#64748b", background: "#fff", borderRadius: "12px" }}>
                  Calculating institutional attendance analytics...
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
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <small style={{ color: "#64748b", fontWeight: 600 }}>Today's Institutional Attendance</small>
                      <div style={{ fontSize: "26px", fontWeight: 800, color: "#2563eb", marginTop: "4px" }}>
                        {attendanceStats.overall?.today_attendance_rate}%
                      </div>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        {attendanceStats.overall?.present_today} Present / {attendanceStats.overall?.total_students} Enrolled
                      </span>
                    </div>

                    <div
                      style={{
                        background: "#fff",
                        padding: "18px 20px",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <small style={{ color: "#64748b", fontWeight: 600 }}>Cumulative Semester Attendance</small>
                      <div style={{ fontSize: "26px", fontWeight: 800, color: "#059669", marginTop: "4px" }}>
                        {attendanceStats.overall?.cumulative_attendance_rate}%
                      </div>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        Across {attendanceStats.overall?.total_records} database entries
                      </span>
                    </div>

                    <div
                      style={{
                        background: "#fff5f5",
                        padding: "18px 20px",
                        borderRadius: "12px",
                        border: "1px solid #fecaca",
                      }}
                    >
                      <small style={{ color: "#b91c1c", fontWeight: 600 }}>Students with Shortage Warning</small>
                      <div style={{ fontSize: "26px", fontWeight: 800, color: "#dc2626", marginTop: "4px" }}>
                        {attendanceStats.overall?.low_attendance_count} Students
                      </div>
                      <span style={{ fontSize: "12px", color: "#b91c1c" }}>
                        Below configured {attendanceThreshold}% threshold
                      </span>
                    </div>
                  </div>

                  {/* Low Attendance Students Table */}
                  <div
                    style={{
                      background: "#fff",
                      borderRadius: "12px",
                      padding: "24px",
                      border: "1px solid #e2e8f0",
                      marginBottom: "24px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <h4 style={{ margin: 0, fontSize: "16px", color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                        <FaExclamationTriangle style={{ color: "#dc2626" }} />
                        Identified Low Attendance Students (&lt; {attendanceThreshold}%)
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
                        {attendanceStats.low_attendance_students?.length || 0} Students Flagged
                      </span>
                    </div>

                    <div className="table-responsive">
                      <table className="grades-table">
                        <thead>
                          <tr>
                            <th>Roll Number</th>
                            <th>Student Name</th>
                            <th>Branch &amp; Cohort</th>
                            <th>Attended / Total</th>
                            <th>Percentage</th>
                            <th>Recovery Needed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attendanceStats.low_attendance_students && attendanceStats.low_attendance_students.length > 0 ? (
                            attendanceStats.low_attendance_students.map((stu) => (
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
                                ✓ No students are currently below the {attendanceThreshold}% threshold.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 4-Column / Grid Multi-Dimensional Breakdowns */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px" }}>
                    {/* Branch-wise */}
                    <div
                      style={{
                        background: "#fff",
                        borderRadius: "12px",
                        padding: "20px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <h4 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#0f172a" }}>
                        Branch-wise Attendance
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
                          {attendanceStats.branch_wise && attendanceStats.branch_wise.length > 0 ? (
                            attendanceStats.branch_wise.map((b) => (
                              <tr key={b.branch}>
                                <td><strong>{b.branch}</strong></td>
                                <td>{b.total_students} students</td>
                                <td>
                                  <strong style={{ color: b.attendance_rate >= 75 ? "#059669" : "#dc2626" }}>
                                    {b.attendance_rate}%
                                  </strong>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr><td colSpan="3" style={{ textAlign: "center", color: "#64748b" }}>No data</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Year-wise */}
                    <div
                      style={{
                        background: "#fff",
                        borderRadius: "12px",
                        padding: "20px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <h4 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#0f172a" }}>
                        Year-wise Attendance
                      </h4>
                      <table className="grades-table">
                        <thead>
                          <tr>
                            <th>Academic Year</th>
                            <th>Enrolled</th>
                            <th>Attendance %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attendanceStats.year_wise && attendanceStats.year_wise.length > 0 ? (
                            attendanceStats.year_wise.map((y) => (
                              <tr key={y.year}>
                                <td><strong>Year {y.year}</strong></td>
                                <td>{y.total_students} students</td>
                                <td>
                                  <strong style={{ color: y.attendance_rate >= 75 ? "#059669" : "#dc2626" }}>
                                    {y.attendance_rate}%
                                  </strong>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr><td colSpan="3" style={{ textAlign: "center", color: "#64748b" }}>No data</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Section-wise */}
                    <div
                      style={{
                        background: "#fff",
                        borderRadius: "12px",
                        padding: "20px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <h4 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#0f172a" }}>
                        Section-wise Attendance
                      </h4>
                      <table className="grades-table">
                        <thead>
                          <tr>
                            <th>Section</th>
                            <th>Enrolled</th>
                            <th>Attendance %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attendanceStats.section_wise && attendanceStats.section_wise.length > 0 ? (
                            attendanceStats.section_wise.map((sec) => (
                              <tr key={sec.section}>
                                <td><strong>Section {sec.section}</strong></td>
                                <td>{sec.total_students} students</td>
                                <td>
                                  <strong style={{ color: sec.attendance_rate >= 75 ? "#059669" : "#dc2626" }}>
                                    {sec.attendance_rate}%
                                  </strong>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr><td colSpan="3" style={{ textAlign: "center", color: "#64748b" }}>No data</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Subject-wise */}
                    <div
                      style={{
                        background: "#fff",
                        borderRadius: "12px",
                        padding: "20px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <h4 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#0f172a" }}>
                        Subject-wise Attendance
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
                          {attendanceStats.subject_wise && attendanceStats.subject_wise.length > 0 ? (
                            attendanceStats.subject_wise.slice(0, 6).map((sub) => (
                              <tr key={sub.code}>
                                <td><strong>{sub.code}</strong> - {sub.name}</td>
                                <td>{sub.total_classes} sessions</td>
                                <td>
                                  <strong style={{ color: sub.attendance_rate >= 75 ? "#059669" : "#dc2626" }}>
                                    {sub.attendance_rate}%
                                  </strong>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr><td colSpan="3" style={{ textAlign: "center", color: "#64748b" }}>No data</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 7-Day Attendance Trends */}
                  <div
                    style={{
                      background: "#fff",
                      borderRadius: "12px",
                      padding: "20px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <h4 style={{ margin: "0 0 14px 0", fontSize: "15px", color: "#0f172a" }}>
                      Recent 7-Day Attendance Activity Trend
                    </h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "10px" }}>
                      {attendanceStats.recent_trends && attendanceStats.recent_trends.map((t) => (
                        <div
                          key={t.date}
                          style={{
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            borderRadius: "10px",
                            padding: "12px 8px",
                            textAlign: "center",
                          }}
                        >
                          <small style={{ color: "#64748b", fontWeight: 600, display: "block" }}>{t.day}</small>
                          <small style={{ fontSize: "10px", color: "#94a3b8" }}>{t.date.slice(5)}</small>
                          <div style={{ fontSize: "16px", fontWeight: 700, color: t.attendance_rate >= 75 ? "#059669" : "#2563eb", marginTop: "6px" }}>
                            {t.attendance_rate}%
                          </div>
                          <small style={{ fontSize: "10px", color: "#64748b", display: "block", marginTop: "2px" }}>
                            {t.present} / {t.total}
                          </small>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tab 6: Broadcasts & Announcements */}
          {activeTab === "announcements" && (
            <div
              style={{
                background: "#fff",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                padding: "24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "20px",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div>
                  <h3 style={{ margin: "0 0 4px 0", fontSize: "18px", color: "#0f172a" }}>
                    <FaBullhorn style={{ marginRight: "8px", color: "#2563eb" }} />
                    Institutional Broadcasts & Announcements
                  </h3>
                  <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>
                    Broadcast critical campus news, academic deadlines, or section-specific directives directly to students' in-app notification centers.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAnnouncementModal(true)}
                  style={{
                    background: "#2563eb",
                    color: "#fff",
                    border: "none",
                    padding: "10px 18px",
                    borderRadius: "8px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <FaPlusCircle /> Publish Announcement
                </button>
              </div>

              {announcements.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
                  {announcements.map((ann) => (
                    <div
                      key={ann.id}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: "12px",
                        padding: "18px 20px",
                        background: ann.priority === "Urgent" ? "#fff1f2" : ann.priority === "Important" ? "#fffbeb" : "#ffffff",
                        borderColor: ann.priority === "Urgent" ? "#fecdd3" : ann.priority === "Important" ? "#fde68a" : "#e2e8f0",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "16px",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              background: ann.priority === "Urgent" ? "#e11d48" : ann.priority === "Important" ? "#d97706" : "#2563eb",
                              color: "#fff",
                            }}
                          >
                            {ann.priority}
                          </span>

                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 600,
                              background: "#f1f5f9",
                              color: "#475569",
                            }}
                          >
                            Audience: {ann.target_audience === "ALL" ? "All Students" : `${ann.target_audience} (${ann.branch || ""} ${ann.year ? `Y${ann.year}` : ""} ${ann.section ? `Sec ${ann.section}` : ""})`}
                          </span>

                          <span style={{ fontSize: "12px", color: "#64748b" }}>
                            • {new Date(ann.created_at).toLocaleDateString()}
                          </span>
                        </div>

                        <h4 style={{ margin: "0 0 6px 0", fontSize: "16px", color: "#0f172a" }}>
                          {ann.title}
                        </h4>
                        <p style={{ margin: 0, color: "#334155", fontSize: "14px", lineHeight: "1.5" }}>
                          {ann.description}
                        </p>
                        <div style={{ marginTop: "8px", fontSize: "12px", color: "#64748b" }}>
                          Posted by: <strong>{ann.author_name || ann.author_username || "Admin"}</strong>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteAnnouncement(ann.id)}
                        title="Deactivate Announcement"
                        style={{
                          background: "#fee2e2",
                          border: "none",
                          color: "#b91c1c",
                          padding: "8px 12px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "12px",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <FaTrash /> Deactivate
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                  <FaBullhorn style={{ fontSize: "32px", color: "#cbd5e1", marginBottom: "8px" }} />
                  <p style={{ margin: 0 }}>No active institutional announcements. Click "Publish Announcement" to create one.</p>
                </div>
              )}
            </div>
          )}

          {/* Tab 7: Institutional Reports & Data Export */}
          {activeTab === "reports" && (
            <div
              style={{
                background: "#fff",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                padding: "24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "20px",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div>
                  <h3 style={{ margin: "0 0 4px 0", fontSize: "18px", color: "#0f172a" }}>
                    <FaFileAlt style={{ marginRight: "8px", color: "#2563eb" }} />
                    Academic Reports & Data Export Engine
                  </h3>
                  <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>
                    Generate verified institutional audits, attendance sheets, shortage registers, and gradebooks with direct CSV export.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isExportingReport}
                  onClick={handleDownloadReport}
                  style={{
                    background: "#059669",
                    color: "#fff",
                    border: "none",
                    padding: "10px 18px",
                    borderRadius: "8px",
                    fontWeight: 600,
                    cursor: isExportingReport ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <FaDownload /> {isExportingReport ? "Generating CSV..." : "Export CSV File"}
                </button>
              </div>

              {/* Report Sub-Tabs */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
                {[
                  { id: "attendance", label: "Attendance Logs" },
                  { id: "low-attendance", label: "Shortage Report (< 75%)" },
                  { id: "students", label: "Student Roster" },
                  { id: "performance", label: "Academic Gradebook" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setReportType(tab.id);
                      fetchReportPreview(tab.id, reportFilter);
                    }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: reportType === tab.id ? "1px solid #2563eb" : "1px solid #cbd5e1",
                      background: reportType === tab.id ? "#eff6ff" : "#ffffff",
                      color: reportType === tab.id ? "#2563eb" : "#475569",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontSize: "13px",
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Filter Bar */}
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: "10px",
                  padding: "16px",
                  border: "1px solid #e2e8f0",
                  marginBottom: "20px",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px",
                  alignItems: "flex-end",
                }}
              >
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                    Branch
                  </label>
                  <select
                    value={reportFilter.branch}
                    onChange={(e) => setReportFilter({ ...reportFilter, branch: e.target.value })}
                    style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  >
                    <option value="ALL">All Branches</option>
                    <option value="CSE">CSE</option>
                    <option value="AIML">AIML</option>
                    <option value="IT">IT</option>
                    <option value="ECE">ECE</option>
                    <option value="MECH">MECH</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                    Year
                  </label>
                  <select
                    value={reportFilter.year}
                    onChange={(e) => setReportFilter({ ...reportFilter, year: e.target.value })}
                    style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  >
                    <option value="ALL">All Years</option>
                    <option value="1">Year 1</option>
                    <option value="2">Year 2</option>
                    <option value="3">Year 3</option>
                    <option value="4">Year 4</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                    Section
                  </label>
                  <select
                    value={reportFilter.section}
                    onChange={(e) => setReportFilter({ ...reportFilter, section: e.target.value })}
                    style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  >
                    <option value="ALL">All Sections</option>
                    <option value="A">Section A</option>
                    <option value="B">Section B</option>
                    <option value="C">Section C</option>
                  </select>
                </div>

                {reportType === "attendance" && (
                  <>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                        From Date
                      </label>
                      <input
                        type="date"
                        value={reportFilter.date_from}
                        onChange={(e) => setReportFilter({ ...reportFilter, date_from: e.target.value })}
                        style={{ padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                        To Date
                      </label>
                      <input
                        type="date"
                        value={reportFilter.date_to}
                        onChange={(e) => setReportFilter({ ...reportFilter, date_to: e.target.value })}
                        style={{ padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                      />
                    </div>
                  </>
                )}

                {reportType === "low-attendance" && (
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                      Threshold (%)
                    </label>
                    <select
                      value={reportFilter.threshold}
                      onChange={(e) => setReportFilter({ ...reportFilter, threshold: parseFloat(e.target.value) })}
                      style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                    >
                      <option value="70">70% Threshold</option>
                      <option value="75">75% Standard</option>
                      <option value="80">80% Stringent</option>
                      <option value="85">85% High</option>
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => fetchReportPreview(reportType, reportFilter)}
                  disabled={isLoadingReport}
                  style={{
                    background: "#0f172a",
                    color: "#fff",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "6px",
                    fontWeight: 600,
                    cursor: isLoadingReport ? "not-allowed" : "pointer",
                    fontSize: "13px",
                  }}
                >
                  {isLoadingReport ? "Querying..." : "Update Preview"}
                </button>
              </div>

              {/* Live Preview Table */}
              {isLoadingReport ? (
                <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: "8px" }}></i>
                  Generating institutional report dataset...
                </div>
              ) : reportPreviewData ? (
                <div className="table-responsive">
                  {reportType === "attendance" && (
                    <table className="grades-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Time</th>
                          <th>Roll Number</th>
                          <th>Student Name</th>
                          <th>Class</th>
                          <th>Subject</th>
                          <th>Status</th>
                          <th>Marked Via</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportPreviewData.records && reportPreviewData.records.length > 0 ? (
                          reportPreviewData.records.map((r) => (
                            <tr key={r.id}>
                              <td>{r.date}</td>
                              <td>{r.time || "—"}</td>
                              <td><strong>{r.student_roll || "—"}</strong></td>
                              <td>{r.student_name}</td>
                              <td>{r.branch} Y{r.year}-{r.section}</td>
                              <td>{r.subject_code ? `${r.subject_code}` : "—"}</td>
                              <td>
                                <span className={`stat-badge-tag ${r.status === "Present" ? "tag-success" : "tag-danger"}`}>
                                  {r.status}
                                </span>
                              </td>
                              <td>{r.marked_via}</td>
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan="8" style={{ textAlign: "center", padding: "28px", color: "#94a3b8" }}>No attendance records match the selected parameters.</td></tr>
                        )}
                      </tbody>
                    </table>
                  )}

                  {reportType === "low-attendance" && (
                    <table className="grades-table">
                      <thead>
                        <tr>
                          <th>Roll No</th>
                          <th>Student Name</th>
                          <th>Branch & Section</th>
                          <th>Attended</th>
                          <th>Total</th>
                          <th>Attendance Rate</th>
                          <th>Shortage</th>
                          <th>Classes Needed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportPreviewData.students && reportPreviewData.students.length > 0 ? (
                          reportPreviewData.students.map((s) => (
                            <tr key={s.student_id}>
                              <td><strong>{s.roll_no}</strong></td>
                              <td>{s.name}</td>
                              <td>{s.branch} Y{s.year}-{s.section}</td>
                              <td><strong style={{ color: "#059669" }}>{s.attended}</strong></td>
                              <td>{s.total}</td>
                              <td><strong style={{ color: "#dc2626" }}>{s.percentage}%</strong></td>
                              <td><span style={{ color: "#b91c1c", fontWeight: 600 }}>-{s.shortage}%</span></td>
                              <td>
                                <span className="stat-badge-tag tag-danger">
                                  {s.classes_needed} classes needed
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan="8" style={{ textAlign: "center", padding: "28px", color: "#059669" }}>✓ Excellent! No students are below the {reportPreviewData.threshold}% threshold for this selection.</td></tr>
                        )}
                      </tbody>
                    </table>
                  )}

                  {reportType === "students" && (
                    <table className="grades-table">
                      <thead>
                        <tr>
                          <th>Student ID</th>
                          <th>Roll No</th>
                          <th>Name</th>
                          <th>Branch</th>
                          <th>Year & Sem</th>
                          <th>Section</th>
                          <th>Email</th>
                          <th>Phone</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportPreviewData.students && reportPreviewData.students.length > 0 ? (
                          reportPreviewData.students.map((s) => (
                            <tr key={s.id}>
                              <td>{s.student_id || `#${s.id}`}</td>
                              <td><strong>{s.roll_no}</strong></td>
                              <td>{s.name}</td>
                              <td>{s.branch}</td>
                              <td>Year {s.year}, Sem {s.semester}</td>
                              <td>Section {s.section}</td>
                              <td>{s.email}</td>
                              <td>{s.phone}</td>
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan="8" style={{ textAlign: "center", padding: "28px", color: "#94a3b8" }}>No students enrolled matching this filter.</td></tr>
                        )}
                      </tbody>
                    </table>
                  )}

                  {reportType === "performance" && (
                    <table className="grades-table">
                      <thead>
                        <tr>
                          <th>Roll No</th>
                          <th>Student Name</th>
                          <th>Class</th>
                          <th>Subject</th>
                          <th>Internals (40)</th>
                          <th>End Sem (60)</th>
                          <th>Total (100)</th>
                          <th>Grade</th>
                          <th>Point</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportPreviewData.scores && reportPreviewData.scores.length > 0 ? (
                          reportPreviewData.scores.map((sc) => (
                            <tr key={sc.id}>
                              <td><strong>{sc.roll_no}</strong></td>
                              <td>{sc.student_name}</td>
                              <td>{sc.branch} Y{sc.year}-{sc.section}</td>
                              <td>{sc.subject_code} - {sc.subject_name}</td>
                              <td>{sc.internals}</td>
                              <td>{sc.end_sem}</td>
                              <td><strong>{sc.total}</strong></td>
                              <td><span className={`grade-badge ${sc.grade === 'F' ? 'grade-f' : 'grade-ap'}`}>{sc.grade}</span></td>
                              <td>{sc.grade_point}</td>
                              <td>
                                <span className={`stat-badge-tag ${sc.is_passed ? "tag-success" : "tag-danger"}`}>
                                  {sc.is_passed ? "PASSED" : "FAILED"}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan="10" style={{ textAlign: "center", padding: "28px", color: "#94a3b8" }}>No performance evaluations recorded for this selection.</td></tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Create Timetable Slot Modal */}
        {showTimetableModal && (
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
                maxWidth: "540px",
                width: "100%",
                position: "relative",
              }}
            >
              <button
                type="button"
                onClick={() => setShowTimetableModal(false)}
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

              <h3 style={{ margin: "0 0 6px 0", fontSize: "20px", color: "#0f172a" }}>
                Add Timetable Schedule Slot
              </h3>
              <p style={{ margin: "0 0 16px 0", color: "#64748b", fontSize: "14px" }}>
                Schedule a teaching lecture period, room assignment, and faculty instructor.
              </p>

              {timetableModalMessage && (
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    marginBottom: "16px",
                    background: timetableModalMessage.success ? "#ecfdf5" : "#fef2f2",
                    color: timetableModalMessage.success ? "#047857" : "#b91c1c",
                    fontSize: "14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <FaCheckCircle /> {timetableModalMessage.text}
                </div>
              )}

              <form onSubmit={handleCreateTimetableSlot}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                      Curriculum Subject *
                    </label>
                    <select
                      value={timetableFormData.subject}
                      required
                      onChange={(e) => setTimetableFormData({ ...timetableFormData, subject: e.target.value })}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    >
                      <option value="">Select Course</option>
                      {subjects.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.code} - {sub.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                      Faculty Instructor *
                    </label>
                    <select
                      value={timetableFormData.teacher}
                      required
                      onChange={(e) => setTimetableFormData({ ...timetableFormData, teacher: e.target.value })}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    >
                      <option value="">Select Faculty</option>
                      {users
                        .filter((u) => u.profile?.role === "teacher" || u.is_staff)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.first_name || u.last_name ? `${u.first_name} ${u.last_name}` : u.username} ({u.profile?.department || "Staff"})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                      Day of Week *
                    </label>
                    <select
                      value={timetableFormData.day}
                      onChange={(e) => setTimetableFormData({ ...timetableFormData, day: e.target.value })}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    >
                      <option value="Monday">Monday</option>
                      <option value="Tuesday">Tuesday</option>
                      <option value="Wednesday">Wednesday</option>
                      <option value="Thursday">Thursday</option>
                      <option value="Friday">Friday</option>
                      <option value="Saturday">Saturday</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                      Start Time *
                    </label>
                    <input
                      type="time"
                      value={timetableFormData.start_time.slice(0, 5)}
                      required
                      onChange={(e) => setTimetableFormData({ ...timetableFormData, start_time: `${e.target.value}:00` })}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                      End Time *
                    </label>
                    <input
                      type="time"
                      value={timetableFormData.end_time.slice(0, 5)}
                      required
                      onChange={(e) => setTimetableFormData({ ...timetableFormData, end_time: `${e.target.value}:00` })}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px", marginBottom: "16px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                      Branch *
                    </label>
                    <input
                      type="text"
                      value={timetableFormData.branch}
                      required
                      onChange={(e) => setTimetableFormData({ ...timetableFormData, branch: e.target.value.toUpperCase() })}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                      Year *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="4"
                      value={timetableFormData.year}
                      required
                      onChange={(e) => setTimetableFormData({ ...timetableFormData, year: parseInt(e.target.value, 10) || 1 })}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                      Semester *
                    </label>
                    <input
                      type="text"
                      value={timetableFormData.semester}
                      required
                      onChange={(e) => setTimetableFormData({ ...timetableFormData, semester: e.target.value })}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                      Section *
                    </label>
                    <input
                      type="text"
                      value={timetableFormData.section}
                      required
                      onChange={(e) => setTimetableFormData({ ...timetableFormData, section: e.target.value.toUpperCase() })}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                    Room / Lab Location *
                  </label>
                  <input
                    type="text"
                    value={timetableFormData.room}
                    required
                    onChange={(e) => setTimetableFormData({ ...timetableFormData, room: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  />
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setShowTimetableModal(false)}
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
                    disabled={isSubmittingSlot}
                    style={{
                      flex: 2,
                      padding: "10px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#2563eb",
                      color: "#fff",
                      fontWeight: 600,
                      cursor: isSubmittingSlot ? "not-allowed" : "pointer",
                    }}
                  >
                    {isSubmittingSlot ? "Saving Slot..." : "Save Schedule Slot"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Create User Modal */}
        {showUserModal && (
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
                maxWidth: "480px",
                width: "100%",
                position: "relative",
              }}
            >
              <button
                type="button"
                onClick={() => setShowUserModal(false)}
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

              <h3 style={{ margin: "0 0 6px 0", fontSize: "20px", color: "#0f172a" }}>
                Provision Faculty / Admin Account
              </h3>
              <p style={{ margin: "0 0 16px 0", color: "#64748b", fontSize: "14px" }}>
                Create login credentials for institutional staff or faculty members.
              </p>

              {userModalMessage && (
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    marginBottom: "16px",
                    background: userModalMessage.success ? "#ecfdf5" : "#fef2f2",
                    color: userModalMessage.success ? "#047857" : "#b91c1c",
                    fontSize: "14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <FaCheckCircle /> {userModalMessage.text}
                </div>
              )}

              <form onSubmit={handleCreateUser}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label
                      htmlFor="user-username-input"
                      style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}
                    >
                      Username *
                    </label>
                    <input
                      id="user-username-input"
                      type="text"
                      placeholder="e.g. prof_sharma"
                      value={userFormData.username}
                      required
                      onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="user-role-select"
                      style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}
                    >
                      Role *
                    </label>
                    <select
                      id="user-role-select"
                      value={userFormData.role}
                      onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                    >
                      <option value="teacher">Teacher / Faculty</option>
                      <option value="admin">System Administrator</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label
                    htmlFor="user-email-input"
                    style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}
                  >
                    Staff Email *
                  </label>
                  <input
                    id="user-email-input"
                    type="email"
                    placeholder="e.g. sharma@eduportal.com"
                    value={userFormData.email}
                    required
                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label
                    htmlFor="user-password-input"
                    style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}
                  >
                    Password *
                  </label>
                  <input
                    id="user-password-input"
                    type="password"
                    placeholder="Create secure password"
                    value={userFormData.password}
                    required
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label
                    htmlFor="user-dept-input"
                    style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}
                  >
                    Department
                  </label>
                  <input
                    id="user-dept-input"
                    type="text"
                    value={userFormData.department}
                    onChange={(e) => setUserFormData({ ...userFormData, department: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setShowUserModal(false)}
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
                    disabled={isSubmittingUser}
                    style={{
                      flex: 2,
                      padding: "10px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#2563eb",
                      color: "#fff",
                      fontWeight: 600,
                      cursor: isSubmittingUser ? "not-allowed" : "pointer",
                    }}
                  >
                    {isSubmittingUser ? "Creating..." : "Create Account"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Publish Announcement Modal */}
        {showAnnouncementModal && (
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
              }}
            >
              <button
                type="button"
                onClick={() => setShowAnnouncementModal(false)}
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

              <h3 style={{ margin: "0 0 6px 0", fontSize: "20px", color: "#0f172a" }}>
                Publish Institutional Announcement
              </h3>
              <p style={{ margin: "0 0 16px 0", color: "#64748b", fontSize: "14px" }}>
                Broadcast notices directly to students with target audience filtering.
              </p>

              {announcementModalMessage && (
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    marginBottom: "16px",
                    background: announcementModalMessage.success ? "#ecfdf5" : "#fef2f2",
                    color: announcementModalMessage.success ? "#047857" : "#b91c1c",
                    fontSize: "14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <FaCheckCircle /> {announcementModalMessage.text}
                </div>
              )}

              <form onSubmit={handleCreateAnnouncement}>
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                    Announcement Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. End Semester Exam Registration Deadline"
                    value={announcementFormData.title}
                    onChange={(e) => setAnnouncementFormData({ ...announcementFormData, title: e.target.value })}
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                    Notice Content / Description *
                  </label>
                  <textarea
                    required
                    rows="4"
                    placeholder="Detailed announcement directives, instructions, or information..."
                    value={announcementFormData.description}
                    onChange={(e) => setAnnouncementFormData({ ...announcementFormData, description: e.target.value })}
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box", resize: "vertical" }}
                  ></textarea>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                      Priority Level *
                    </label>
                    <select
                      value={announcementFormData.priority}
                      onChange={(e) => setAnnouncementFormData({ ...announcementFormData, priority: e.target.value })}
                      style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                    >
                      <option value="Normal">Normal</option>
                      <option value="Important">Important</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                      Target Audience *
                    </label>
                    <select
                      value={announcementFormData.target_audience}
                      onChange={(e) => setAnnouncementFormData({ ...announcementFormData, target_audience: e.target.value })}
                      style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                    >
                      <option value="ALL">All Students (Campus-wide)</option>
                      <option value="BRANCH">Specific Branch</option>
                      <option value="YEAR">Specific Year</option>
                      <option value="SEMESTER">Specific Semester</option>
                      <option value="SECTION">Specific Section</option>
                    </select>
                  </div>
                </div>

                {/* Conditional Fields based on Target Audience */}
                {announcementFormData.target_audience !== "ALL" && (
                  <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                          Branch
                        </label>
                        <select
                          value={announcementFormData.branch}
                          onChange={(e) => setAnnouncementFormData({ ...announcementFormData, branch: e.target.value })}
                          style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                        >
                          <option value="CSE">CSE</option>
                          <option value="AIML">AIML</option>
                          <option value="IT">IT</option>
                          <option value="ECE">ECE</option>
                          <option value="MECH">MECH</option>
                        </select>
                      </div>

                      {announcementFormData.target_audience === "YEAR" && (
                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                            Academic Year
                          </label>
                          <select
                            value={announcementFormData.year}
                            onChange={(e) => setAnnouncementFormData({ ...announcementFormData, year: e.target.value })}
                            style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                          >
                            <option value="1">Year 1</option>
                            <option value="2">Year 2</option>
                            <option value="3">Year 3</option>
                            <option value="4">Year 4</option>
                          </select>
                        </div>
                      )}

                      {announcementFormData.target_audience === "SEMESTER" && (
                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                            Semester
                          </label>
                          <select
                            value={announcementFormData.semester}
                            onChange={(e) => setAnnouncementFormData({ ...announcementFormData, semester: e.target.value })}
                            style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                              <option key={s} value={String(s)}>Semester {s}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {announcementFormData.target_audience === "SECTION" && (
                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                            Section
                          </label>
                          <select
                            value={announcementFormData.section}
                            onChange={(e) => setAnnouncementFormData({ ...announcementFormData, section: e.target.value })}
                            style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                          >
                            <option value="A">Section A</option>
                            <option value="B">Section B</option>
                            <option value="C">Section C</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setShowAnnouncementModal(false)}
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
                    disabled={isSubmittingAnnouncement}
                    style={{
                      flex: 2,
                      padding: "10px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#2563eb",
                      color: "#fff",
                      fontWeight: 600,
                      cursor: isSubmittingAnnouncement ? "not-allowed" : "pointer",
                    }}
                  >
                    {isSubmittingAnnouncement ? "Broadcasting..." : "Publish & Notify"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;

