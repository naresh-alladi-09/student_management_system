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

export const getDailyAttendance = (dateStr, branch) => {
  let url = "/api/attendance/";
  const params = [];
  if (dateStr) params.push(`date=${encodeURIComponent(dateStr)}`);
  if (branch && branch !== "ALL") params.push(`branch=${encodeURIComponent(branch)}`);
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

export const getAttendanceSummary = () => {
  return apiClient.get("/api/attendance/summary/");
};

// QR Session Services
export const createAttendanceSession = (subjectId, durationSeconds = 60) => {
  return apiClient.post("/api/attendance/sessions/create/", {
    subject_id: subjectId,
    duration_seconds: durationSeconds,
  });
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

export const createTimetableSlot = (slotData) => {
  return apiClient.post("/api/timetable/create/", slotData);
};

// ==========================================
// ANNOUNCEMENTS SERVICES
// ==========================================

export const getAnnouncements = (department = null) => {
  const query = department ? `?department=${encodeURIComponent(department)}` : "";
  return apiClient.get(`/api/announcements/${query}`);
};

export const createAnnouncement = (annData) => {
  return apiClient.post("/api/announcements/create/", annData);
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