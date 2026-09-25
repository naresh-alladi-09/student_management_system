import apiClient from "./apiClient";

// ==========================================
// STUDENT SERVICES
// ==========================================

export const getStudents = (params = {}) => {
  // If no params passed or explicitly unpaginated
  const config = { params };
  return apiClient.get("/api/students/", config);
};

export const getAllStudentsList = () => {
  return apiClient.get("/api/students/?all=true");
};

export const getStudentById = (id) => {
  return apiClient.get(`/api/students/${id}/`);
};

export const addStudent = (studentData) => {
  return apiClient.post("/api/students/", studentData);
};

export const updateStudent = (id, studentData) => {
  return apiClient.put(`/api/students/${id}/`, studentData);
};

export const deleteStudent = (id) => {
  return apiClient.delete(`/api/students/${id}/`);
};

export const deactivateStudent = (id) => {
  return apiClient.post(`/api/students/${id}/deactivate/`);
};

export const activateStudent = (id) => {
  return apiClient.post(`/api/students/${id}/activate/`);
};

export const getStudentStats = () => {
  return apiClient.get("/api/students/stats/");
};

// ==========================================
// ATTENDANCE SERVICES
// ==========================================

export const getDailyAttendance = (dateStr, branch, section = null) => {
  let url = "/api/attendance/";
  const params = [];
  if (dateStr) params.push(`date=${encodeURIComponent(dateStr)}`);
  if (branch && branch !== "ALL") params.push(`branch=${encodeURIComponent(branch)}`);
  if (section && section !== "ALL") params.push(`section=${encodeURIComponent(section)}`);
  if (params.length > 0) url += `?${params.join("&")}`;
  return apiClient.get(url);
};

export const saveBulkAttendance = (dateStr, attendanceMap, subjectId = null) => {
  return apiClient.post("/api/attendance/bulk/", {
    date: dateStr,
    attendance: attendanceMap,
    subject_id: subjectId,
  });
};

export const getStudentAttendance = (studentId) => {
  return apiClient.get(`/api/attendance/student/${studentId}/`);
};

export const getMyAttendance = () => {
  return apiClient.get("/api/attendance/my/");
};

export const getAttendanceSummary = (params = {}) => {
  return apiClient.get("/api/attendance/summary/", { params });
};

// QR Session Services
export const createAttendanceSession = (subjectId, durationSeconds = 60, classId = null, section = 'A') => {
  return apiClient.post("/api/attendance/sessions/create/", {
    subject_id: subjectId,
    duration_seconds: durationSeconds,
    class_id: classId,
    section: section,
  });
};

// Academic Hierarchy Services
export const getDepartments = () => {
  return apiClient.get("/api/departments/");
};

export const getBranches = (departmentId = null) => {
  const query = departmentId ? `?department=${departmentId}` : "";
  return apiClient.get(`/api/branches/${query}`);
};

export const getAcademicClasses = (params = {}) => {
  return apiClient.get("/api/classes/", { params });
};

export const getFacultyAssignments = (params = {}) => {
  return apiClient.get("/api/faculty-assignments/", { params });
};

export const createFacultyAssignment = (data) => {
  return apiClient.post("/api/faculty-assignments/", data);
};

export const getActiveSession = () => {
  return apiClient.get("/api/attendance/sessions/active/");
};

export const refreshSessionToken = (sessionId, durationSeconds = 60) => {
  return apiClient.post(`/api/attendance/sessions/${sessionId}/refresh/`, {
    duration_seconds: durationSeconds,
  });
};

export const closeAttendanceSession = (sessionId) => {
  return apiClient.post(`/api/attendance/sessions/${sessionId}/close/`);
};

export const getSessionAttendees = (sessionId) => {
  return apiClient.get(`/api/attendance/sessions/${sessionId}/attendees/`);
};

export const markQrAttendance = (qrToken) => {
  return apiClient.post("/api/attendance/mark-qr/", {
    qr_token: qrToken,
  });
};

// ==========================================
// PERFORMANCE SERVICES
// ==========================================

export const getAllPerformance = (branch = "ALL") => {
  const query = branch && branch !== "ALL" ? `?branch=${encodeURIComponent(branch)}` : "";
  return apiClient.get(`/api/performance/${query}`);
};

export const getPerformanceSummary = () => {
  return apiClient.get("/api/performance/summary/");
};

export const getStudentReportCard = (studentId) => {
  return apiClient.get(`/api/performance/student/${studentId}/`);
};

export const getMyReportCard = () => {
  return apiClient.get("/api/performance/my/");
};

export const saveStudentScore = (scoreData) => {
  return apiClient.post("/api/performance/marks/save/", scoreData);
};

export const getAllSubjects = (branch = null) => {
  const query = branch ? `?branch=${encodeURIComponent(branch)}` : "";
  return apiClient.get(`/api/performance/subjects/${query}`);
};

export const createSubject = (subjectData) => {
  return apiClient.post("/api/performance/subjects/", subjectData);
};

// ==========================================
// TIMETABLE SERVICES
// ==========================================

export const getTimetable = (params = {}) => {
  return apiClient.get("/api/timetable/", { params });
};

export const getTodayTimetable = (params = {}) => {
  return apiClient.get("/api/timetable/today/", { params });
};

export const startAttendanceFromSlot = (slotId, durationSeconds = 120) => {
  return apiClient.post(`/api/timetable/${slotId}/start-attendance/`, {
    duration_seconds: durationSeconds,
  });
};

export const createTimetableSlot = (slotData) => {
  return apiClient.post("/api/timetable/create/", slotData);
};

export const updateTimetableSlot = (slotId, data) => {
  return apiClient.patch(`/api/timetable/${slotId}/`, data);
};

export const deleteTimetableSlot = (slotId) => {
  return apiClient.delete(`/api/timetable/${slotId}/`);
};


// ==========================================
// ANNOUNCEMENTS SERVICES
// ==========================================

export const getAnnouncements = (params = null) => {
  if (typeof params === "string") {
    const query = params ? `?department=${encodeURIComponent(params)}` : "";
    return apiClient.get(`/api/announcements/${query}`);
  }
  return apiClient.get("/api/announcements/", { params: params || {} });
};

export const createAnnouncement = (annData) => {
  return apiClient.post("/api/announcements/create/", annData);
};

export const deleteAnnouncement = (id) => {
  return apiClient.delete(`/api/announcements/${id}/`);
};

// ==========================================
// NOTIFICATIONS SERVICES
// ==========================================

export const getMyNotifications = () => {
  return apiClient.get("/api/notifications/");
};

export const markNotificationAsRead = (notificationId = null) => {
  const url = notificationId ? `/api/notifications/${notificationId}/read/` : "/api/notifications/read/";
  return apiClient.post(url);
};

// ==========================================
// AUDIT & ADMIN SERVICES
// ==========================================

export const getAuditLogs = (params = {}) => {
  return apiClient.get("/api/audit/logs/", { params });
};

export const getAuditStats = () => {
  return apiClient.get("/api/audit/stats/");
};

export const getSystemUsers = (role = null) => {
  const query = role ? `?role=${encodeURIComponent(role)}` : "";
  return apiClient.get(`/api/auth/users/${query}`);
};

export const createSystemUser = (userData) => {
  return apiClient.post("/api/auth/users/", userData);
};

// ==========================================
// AUTHENTICATION SERVICES
// ==========================================

export const loginApi = (credentials) => {
  return apiClient.post("/api/auth/login/", credentials);
};

export const logoutApi = () => {
  return apiClient.post("/api/auth/logout/");
};

export const getMeApi = () => {
  return apiClient.get("/api/auth/me/");
};

// ==========================================
// INSTITUTIONAL REPORTING & CSV EXPORT
// ==========================================

export const downloadReportCSV = async (reportType, params = {}, defaultFilename = "report.csv") => {
  const res = await apiClient.get(`/api/reports/${reportType}/`, {
    params: { ...params, export: "csv" },
    responseType: "blob",
  });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", defaultFilename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const getAttendanceReport = (params = {}) => {
  return apiClient.get("/api/reports/attendance/", { params });
};

export const getLowAttendanceReport = (params = {}) => {
  return apiClient.get("/api/reports/low-attendance/", { params });
};

export const getStudentsRosterReport = (params = {}) => {
  return apiClient.get("/api/reports/students/", { params });
};

export const getPerformanceReport = (params = {}) => {
  return apiClient.get("/api/reports/performance/", { params });
};