import apiClient from "./apiClient";

// ==========================================
// STUDENT SERVICES
// ==========================================

export const getStudents = () => {
  return apiClient.get("/api/students/");
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

// ==========================================
// ATTENDANCE SERVICES
// ==========================================

export const getDailyAttendance = (dateStr) => {
  const query = dateStr ? `?date=${encodeURIComponent(dateStr)}` : "";
  return apiClient.get(`/api/attendance/${query}`);
};

export const saveBulkAttendance = (dateStr, attendanceMap) => {
  return apiClient.post("/api/attendance/bulk/", {
    date: dateStr,
    attendance: attendanceMap,
  });
};

export const getStudentAttendance = (studentId) => {
  return apiClient.get(`/api/attendance/student/${studentId}/`);
};

export const getAttendanceSummary = () => {
  return apiClient.get("/api/attendance/summary/");
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

export const getAllSubjects = () => {
  return apiClient.get("/api/performance/subjects/");
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