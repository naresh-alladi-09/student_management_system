import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getStudents,
  updateStudent,
  deactivateStudent,
  activateStudent,
  registerStudentFace,
} from "../services/studentservice";

import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import StudentTable from "../components/StudentTable";
import "../styles/studenttable.css";

const YEAR_SEMESTERS = {
  "1": [
    { value: "1", label: "Semester 1" },
    { value: "2", label: "Semester 2" },
  ],
  "2": [
    { value: "3", label: "Semester 3" },
    { value: "4", label: "Semester 4" },
  ],
  "3": [
    { value: "5", label: "Semester 5" },
    { value: "6", label: "Semester 6" },
  ],
  "4": [
    { value: "7", label: "Semester 7" },
    { value: "8", label: "Semester 8" },
  ],
};

const Students = () => {
  const [students, setStudents] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("ALL");
  const [selectedYear, setSelectedYear] = useState("ALL");
  const [selectedSection, setSelectedSection] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL"); // 'ALL' | 'active' | 'inactive'

  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [studentToDeactivate, setStudentToDeactivate] = useState(null);

  // Edit Modal State
  const [editingStudent, setEditingStudent] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    year: "1",
    email: "",
    phone: "",
    branch: "CSE",
    semester: "1",
    section: "A",
    roll_no: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Biometric Face Registration Modal State
  const [faceModalStudent, setFaceModalStudent] = useState(null);
  const [faceCameraActive, setFaceCameraActive] = useState(false);
  const [facePhotoSnap, setFacePhotoSnap] = useState(null);
  const [savingFace, setSavingFace] = useState(false);
  const [faceModalError, setFaceModalError] = useState(null);
  const faceVideoRef = useState(null)[0] || { current: null };
  const faceStreamRef = { current: null };

  const handleOpenFaceModal = (student) => {
    setFaceModalStudent(student);
    setFacePhotoSnap(student.profile_photo || null);
    setFaceModalError(null);
    setFaceCameraActive(false);
  };

  const handleCloseFaceModal = () => {
    if (faceStreamRef.current) {
      faceStreamRef.current.getTracks().forEach((t) => t.stop());
      faceStreamRef.current = null;
    }
    setFaceModalStudent(null);
    setFaceCameraActive(false);
    setFacePhotoSnap(null);
    setFaceModalError(null);
  };

  const startFaceCamera = async () => {
    setFaceModalError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      });
      faceStreamRef.current = stream;
      setFaceCameraActive(true);
      setTimeout(() => {
        const vid = document.getElementById("face-modal-video");
        if (vid) {
          vid.srcObject = stream;
          vid.play();
        }
      }, 100);
    } catch (err) {
      console.error("Camera error:", err);
      setFaceModalError("Camera permission denied. You can upload an image file instead.");
      setFaceCameraActive(false);
    }
  };

  const stopFaceCamera = () => {
    if (faceStreamRef.current) {
      faceStreamRef.current.getTracks().forEach((t) => t.stop());
      faceStreamRef.current = null;
    }
    setFaceCameraActive(false);
  };

  const captureFaceSnapshot = () => {
    const vid = document.getElementById("face-modal-video");
    if (!vid) return;
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    const minDim = Math.min(vid.videoWidth || 480, vid.videoHeight || 480);
    const sx = ((vid.videoWidth || 480) - minDim) / 2;
    const sy = ((vid.videoHeight || 480) - minDim) / 2;
    ctx.drawImage(vid, sx, sy, minDim, minDim, 0, 0, 480, 480);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setFacePhotoSnap(dataUrl);
    stopFaceCamera();
  };

  const handleSaveFaceRegistration = async () => {
    if (!faceModalStudent || !facePhotoSnap) {
      setFaceModalError("Please take or upload a photo of the student first.");
      return;
    }
    setSavingFace(true);
    setFaceModalError(null);
    try {
      const res = await registerStudentFace(faceModalStudent.id, facePhotoSnap);
      setStatusMessage(res.data?.message || `✓ Biometric face registered for ${faceModalStudent.name}!`);
      setTimeout(() => setStatusMessage(null), 4000);
      handleCloseFaceModal();
      loadStudents(currentPage);
    } catch (err) {
      console.error("Error registering face:", err);
      setFaceModalError(err.response?.data?.detail || "Failed to register student face. Ensure a clear human face is visible.");
    } finally {
      setSavingFace(false);
    }
  };

  const loadStudents = useCallback(async (page = 1) => {
    setLoading(true);
    setErrorMessage(null);

    const params = { page };
    if (searchTerm.trim()) params.search = searchTerm.trim();
    if (selectedBranch !== "ALL") params.branch = selectedBranch;
    if (selectedYear !== "ALL") params.year = selectedYear;
    if (selectedSection !== "ALL") params.section = selectedSection;
    if (selectedStatus === "active") params.is_active = "true";
    if (selectedStatus === "inactive") params.is_active = "false";

    try {
      const response = await getStudents(params);
      const data = response.data;
      if (data && data.results) {
        // Paginated DRF response
        setStudents(data.results);
        setTotalCount(data.count || 0);
        setHasNextPage(Boolean(data.next));
        setHasPrevPage(Boolean(data.previous));
      } else if (Array.isArray(data)) {
        setStudents(data);
        setTotalCount(data.length);
        setHasNextPage(false);
        setHasPrevPage(false);
      }
      setCurrentPage(page);
    } catch (error) {
      console.error("Failed to fetch students:", error);
      setErrorMessage("Could not connect to database to fetch students.");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedBranch, selectedYear, selectedSection, selectedStatus]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadStudents(1);
    }, 300); // 300ms debounce
    return () => clearTimeout(timer);
  }, [loadStudents]);

  // Open Edit Modal
  const handleOpenEdit = (student) => {
    setEditingStudent(student);
    setEditFormData({
      name: student.name || "",
      year: String(student.year || "1"),
      email: student.email || "",
      phone: student.phone || "",
      branch: student.branch || "CSE",
      semester: String(student.semester || "1"),
      section: student.section || "A",
      roll_no: student.roll_no || "",
    });
  };

  const handleCloseEdit = () => {
    setEditingStudent(null);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingStudent) return;

    const trimmedName = editFormData.name.trim();
    const trimmedEmail = editFormData.email.trim().toLowerCase();
    const trimmedPhone = editFormData.phone.trim();

    if (!trimmedName || /\d/.test(trimmedName) || !/^[a-zA-Z\s.'-]+$/.test(trimmedName)) {
      setErrorMessage("Student name must contain only letters and cannot contain numbers.");
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!trimmedEmail || !gmailRegex.test(trimmedEmail)) {
      setErrorMessage("Email address must end with @gmail.com only (e.g. student@gmail.com).");
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    if (!trimmedPhone || !/^\d{10,15}$/.test(trimmedPhone)) {
      setErrorMessage("Phone number must contain between 10 and 15 numeric digits.");
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    const parsedYear = parseInt(editFormData.year, 10) || 1;
    const parsedSem = parseInt(editFormData.semester, 10) || 1;
    const validSems = YEAR_SEMESTERS[String(parsedYear)]?.map((s) => Number(s.value)) || [];
    if (!validSems.includes(parsedSem)) {
      setErrorMessage(`For Academic Year ${parsedYear}, valid semesters are: ${validSems.map((s) => `Semester ${s}`).join(", ")}.`);
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    try {
      setSavingEdit(true);
      const payload = {
        name: trimmedName,
        year: parsedYear,
        email: trimmedEmail,
        phone: trimmedPhone,
        branch: editFormData.branch,
        semester: String(parsedSem),
        roll_no: editFormData.roll_no.trim() || undefined,
      };

      await updateStudent(editingStudent.id, payload);
      setStatusMessage(`✓ Student "${payload.name}" updated successfully!`);
      setTimeout(() => setStatusMessage(null), 3000);
      handleCloseEdit();
      loadStudents(currentPage);
    } catch (error) {
      console.error("Update error:", error.response?.data || error);
      const detail = error.response?.data?.email?.[0] ||
                     error.response?.data?.roll_no?.[0] ||
                     error.response?.data?.phone?.[0] ||
                     error.response?.data?.name?.[0] ||
                     error.response?.data?.detail ||
                     "Failed to update student. Please check inputs.";
      setErrorMessage(detail);
      setTimeout(() => setErrorMessage(null), 4000);
    } finally {
      setSavingEdit(false);
    }
  };

  // Trigger Soft Delete (Deactivation)
  const handleDeactivateClick = (id, studentName) => {
    setStudentToDeactivate({ id, name: studentName || `#${id}` });
  };

  const handleConfirmDeactivate = async () => {
    if (!studentToDeactivate) return;
    try {
      await deactivateStudent(studentToDeactivate.id);
      setStatusMessage(`✓ Student "${studentToDeactivate.name}" deactivated (soft-deleted).`);
      setTimeout(() => setStatusMessage(null), 3000);
      setStudentToDeactivate(null);
      loadStudents(currentPage);
    } catch (error) {
      console.error("Deactivate error:", error);
      setErrorMessage("Failed to deactivate student.");
      setTimeout(() => setErrorMessage(null), 4000);
    }
  };

  // Restore (Activate)
  const handleActivate = async (id, studentName) => {
    try {
      await activateStudent(id);
      setStatusMessage(`✓ Student "${studentName || `#${id}`}" restored to active status.`);
      setTimeout(() => setStatusMessage(null), 3000);
      loadStudents(currentPage);
    } catch (error) {
      console.error("Activate error:", error);
      setErrorMessage("Failed to restore student.");
      setTimeout(() => setErrorMessage(null), 4000);
    }
  };

  return (
    <div className="sideandmain">
      <div className="Sidebarindashboard">
        <Sidebar />
      </div>
      <div className="main-content">
        <Navbar />

        <div className="students-page-body">
          {/* Header & Stats Banner */}
          <div className="students-header-banner">
            <div>
              <h2>Student Directory Management</h2>
              <p>Search, filter, edit, and manage enrolled university students</p>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <Link
                to="/attendance?openAlerts=true"
                className="add-student-btn"
                style={{
                  background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                  boxShadow: "0 4px 12px rgba(220, 38, 38, 0.3)",
                }}
                title="Send warning emails to students below 75% attendance or test alerts"
              >
                <i className="fa-solid fa-triangle-exclamation"></i> 75% Attendance Alerts
              </Link>
              <Link to="/addstudents" className="add-student-btn">
                <i className="fa-solid fa-user-plus"></i> Enroll Student
              </Link>
            </div>
          </div>

          {/* Flash Feedback Messages */}
          {statusMessage && (
            <div className="status-toast success">
              <i className="fa-solid fa-circle-check"></i>
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="status-toast error">
              <i className="fa-solid fa-triangle-exclamation"></i>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Controls Bar: Search & Multi-Filters */}
          <div className="table-controls-bar" style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
            <div className="search-box-wrap" style={{ flex: 2, minWidth: "240px" }}>
              <i className="fa-solid fa-magnifying-glass search-icon"></i>
              <input
                type="text"
                placeholder="Search by Roll No, Student ID, Name, Email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="table-search-input"
              />
              {searchTerm && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setSearchTerm("")}
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              )}
            </div>

            {/* Branch Filter */}
            <div className="filter-group">
              <label htmlFor="branch-filter">Branch:</label>
              <select
                id="branch-filter"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="branch-select"
              >
                <option value="ALL">All Branches</option>
                <option value="CSE">CSE</option>
                <option value="AIML">AIML</option>
                <option value="IT">IT</option>
                <option value="ECE">ECE</option>
                <option value="MECH">MECH</option>
                <option value="CIVIL">CIVIL</option>
              </select>
            </div>

            {/* Year Filter */}
            <div className="filter-group">
              <label htmlFor="year-filter">Year:</label>
              <select
                id="year-filter"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="branch-select"
              >
                <option value="ALL">All Years</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </select>
            </div>

            {/* Section Filter */}
            <div className="filter-group">
              <label htmlFor="section-filter">Section:</label>
              <select
                id="section-filter"
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="branch-select"
              >
                <option value="ALL">All Sections</option>
                <option value="A">Section A</option>
                <option value="B">Section B</option>
                <option value="C">Section C</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="filter-group">
              <label htmlFor="status-filter">Status:</label>
              <select
                id="status-filter"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="branch-select"
              >
                <option value="ALL">All Students</option>
                <option value="active">Active Only</option>
                <option value="inactive">Deactivated Only</option>
              </select>
            </div>

            <div className="record-count-badge">
              <strong>{totalCount}</strong> Records in Database
            </div>
          </div>

          {/* Student Table */}
          {loading ? (
            <div className="table-loading-container">
              <i className="fa-solid fa-spinner fa-spin"></i>
              <p>Fetching student records from database...</p>
            </div>
          ) : (
            <>
              <StudentTable
                students={students}
                onEdit={handleOpenEdit}
                onDeactivate={handleDeactivateClick}
                onActivate={handleActivate}
                onRegisterFace={handleOpenFaceModal}
              />

              {/* Server-Side Pagination Bar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 20px",
                  background: "#fff",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  marginTop: "16px",
                }}
              >
                <span style={{ fontSize: "14px", color: "#64748b" }}>
                  Showing Page <strong>{currentPage}</strong> of{" "}
                  <strong>{Math.ceil(totalCount / 15) || 1}</strong> ({totalCount} total students)
                </span>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    disabled={!hasPrevPage || currentPage <= 1}
                    onClick={() => loadStudents(currentPage - 1)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      background: hasPrevPage ? "#fff" : "#f1f5f9",
                      color: hasPrevPage ? "#0f172a" : "#94a3b8",
                      cursor: hasPrevPage ? "pointer" : "not-allowed",
                      fontWeight: 600,
                    }}
                  >
                    ← Previous
                  </button>

                  <button
                    type="button"
                    disabled={!hasNextPage}
                    onClick={() => loadStudents(currentPage + 1)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      background: hasNextPage ? "#fff" : "#f1f5f9",
                      color: hasNextPage ? "#0f172a" : "#94a3b8",
                      cursor: hasNextPage ? "pointer" : "not-allowed",
                      fontWeight: 600,
                    }}
                  >
                    Next →
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Edit Student Modal */}
          {editingStudent && (
            <div className="modal-overlay">
              <div className="modal-card">
                <div className="modal-header">
                  <h3>Edit Student #{editingStudent.id}</h3>
                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={handleCloseEdit}
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>

                <form onSubmit={handleSaveEdit} className="modal-form">
                  <div className="modal-form-grid">
                    <div className="form-group">
                      <label htmlFor="edit-name">Full Name * (Letters only)</label>
                      <input
                        id="edit-name"
                        type="text"
                        value={editFormData.name}
                        required
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!/[0-9]/.test(val)) {
                            setEditFormData({ ...editFormData, name: val });
                          }
                        }}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="edit-roll">Roll Number</label>
                      <input
                        id="edit-roll"
                        type="text"
                        value={editFormData.roll_no}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, roll_no: e.target.value })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="edit-year">Academic Year *</label>
                      <select
                        id="edit-year"
                        value={editFormData.year}
                        onChange={(e) => {
                          const newYear = e.target.value;
                          const available = YEAR_SEMESTERS[newYear] || [];
                          const semMatches = available.some(
                            (s) => s.value === editFormData.semester
                          );
                          setEditFormData({
                            ...editFormData,
                            year: newYear,
                            semester: semMatches
                              ? editFormData.semester
                              : available[0]?.value || "1",
                          });
                        }}
                      >
                        <option value="1">1st Year</option>
                        <option value="2">2nd Year</option>
                        <option value="3">3rd Year</option>
                        <option value="4">4th Year</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="edit-branch">Branch / Department *</label>
                      <select
                        id="edit-branch"
                        value={editFormData.branch}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, branch: e.target.value })
                        }
                      >
                        <option value="CSE">CSE</option>
                        <option value="ECE">ECE</option>
                        <option value="AIML">AIML</option>
                        <option value="IT">IT</option>
                        <option value="MECH">MECH</option>
                        <option value="CIVIL">CIVIL</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="edit-sem">Semester * (Year {editFormData.year} • 2 Semesters)</label>
                      <select
                        id="edit-sem"
                        value={editFormData.semester}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, semester: e.target.value })
                        }
                      >
                        {(YEAR_SEMESTERS[editFormData.year] || []).map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="edit-section">Section *</label>
                      <select
                        id="edit-section"
                        value={editFormData.section}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, section: e.target.value })
                        }
                      >
                        <option value="A">Section A</option>
                        <option value="B">Section B</option>
                        <option value="C">Section C</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="edit-email">Email Address * (Must end with @gmail.com)</label>
                      <input
                        id="edit-email"
                        type="email"
                        placeholder="e.g. student@gmail.com"
                        value={editFormData.email}
                        required
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, email: e.target.value })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="edit-phone">Phone Number * (Numbers only, 10-15 digits)</label>
                      <input
                        id="edit-phone"
                        type="tel"
                        inputMode="numeric"
                        value={editFormData.phone}
                        required
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "");
                          if (digits.length <= 15) {
                            setEditFormData({ ...editFormData, phone: digits });
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn-cancel"
                      onClick={handleCloseEdit}
                      disabled={savingEdit}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-save"
                      disabled={savingEdit}
                    >
                      {savingEdit ? (
                        <span>
                          <i className="fa-solid fa-spinner fa-spin"></i> Saving...
                        </span>
                      ) : (
                        "Save Changes"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Soft Delete Confirmation Modal */}
          {studentToDeactivate && (
            <div className="modal-overlay">
              <div className="modal-card delete-confirm-card">
                <div className="delete-icon-wrap">
                  <i className="fa-solid fa-user-slash"></i>
                </div>
                <h3>Deactivate Student Account?</h3>
                <p>
                  Are you sure you want to deactivate{" "}
                  <strong>&quot;{studentToDeactivate.name}&quot;</strong>?
                  <br />
                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    Note: This is a safe soft-deletion. Historical attendance and marks records are preserved, and this account can be restored at any time.
                  </span>
                </p>
                <div className="delete-modal-actions">
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => setStudentToDeactivate(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-confirm-delete"
                    style={{ background: "#dc2626" }}
                    onClick={handleConfirmDeactivate}
                  >
                    Yes, Deactivate
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Biometric Face Registration Modal */}
          {faceModalStudent && (
            <div className="modal-overlay">
              <div className="modal-card" style={{ maxWidth: "520px", padding: "26px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <div>
                    <h3 style={{ margin: "0 0 4px 0", fontSize: "18px", color: "#0f172a" }}>
                      <i className="fa-solid fa-camera" style={{ color: "#2563eb", marginRight: "8px" }}></i>
                      Register Student Face
                    </h3>
                    <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                      {faceModalStudent.name} ({faceModalStudent.roll_no || faceModalStudent.student_id})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseFaceModal}
                    style={{ background: "transparent", border: "none", fontSize: "18px", color: "#94a3b8", cursor: "pointer" }}
                  >
                    ✕
                  </button>
                </div>

                {faceModalError && (
                  <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "14px", borderLeft: "4px solid #ef4444" }}>
                    {faceModalError}
                  </div>
                )}

                {/* Viewport: Live Camera or Photo Preview */}
                {faceCameraActive ? (
                  <div style={{ background: "#0f172a", borderRadius: "12px", padding: "16px", textAlign: "center", position: "relative" }}>
                    <div style={{ position: "relative", width: "100%", maxWidth: "340px", aspectRatio: "1/1", margin: "0 auto", borderRadius: "10px", overflow: "hidden", background: "#000" }}>
                      <video id="face-modal-video" autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
                      <div style={{ position: "absolute", top: "15%", left: "20%", width: "60%", height: "70%", border: "2px dashed #38bdf8", borderRadius: "50%", pointerEvents: "none", boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.4)" }}>
                        <div style={{ position: "absolute", bottom: "-28px", left: "50%", transform: "translateX(-50%)", background: "rgba(15,23,42,0.9)", color: "#38bdf8", padding: "3px 8px", borderRadius: "10px", fontSize: "11px", whiteSpace: "nowrap" }}>
                          Center Face in Frame
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: "14px", display: "flex", justifyContent: "center", gap: "10px" }}>
                      <button
                        type="button"
                        onClick={captureFaceSnapshot}
                        style={{ background: "#10b981", color: "white", border: "none", padding: "8px 18px", borderRadius: "8px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        <i className="fa-solid fa-camera"></i> Capture Face
                      </button>
                      <button
                        type="button"
                        onClick={stopFaceCamera}
                        style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1px solid rgba(255,255,255,0.3)", padding: "8px 14px", borderRadius: "8px", cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : facePhotoSnap ? (
                  <div style={{ display: "flex", gap: "16px", alignItems: "center", background: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                    <div style={{ width: "100px", height: "100px", borderRadius: "10px", overflow: "hidden", border: "2px solid #2563eb", flexShrink: 0 }}>
                      <img src={facePhotoSnap} alt="Student Snapshot" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#166534", fontWeight: 700, fontSize: "13px", marginBottom: "4px" }}>
                        <i className="fa-solid fa-circle-check"></i> Photo Ready for Biometrics
                      </div>
                      <p style={{ margin: "0 0 10px 0", fontSize: "12px", color: "#64748b" }}>
                        Click Save to compute and store the 128-dimensional facial embedding in the database.
                      </p>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={startFaceCamera}
                          style={{ background: "#fff", border: "1px solid #cbd5e1", padding: "5px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
                        >
                          <i className="fa-solid fa-arrows-rotate"></i> Retake
                        </button>
                        <button
                          type="button"
                          onClick={() => setFacePhotoSnap(null)}
                          style={{ background: "#fee2e2", color: "#dc2626", border: "1px solid #fecaca", padding: "5px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
                        >
                          <i className="fa-solid fa-trash"></i> Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "28px 16px", background: "#f8fafc", border: "2px dashed #cbd5e1", borderRadius: "12px" }}>
                    <p style={{ margin: "0 0 14px 0", fontSize: "13.5px", color: "#475569" }}>
                      Take a live photo or upload an image of the student to register their biometric face profile.
                    </p>
                    <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={startFaceCamera}
                        style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "white", border: "none", padding: "9px 18px", borderRadius: "8px", fontWeight: 600, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        <i className="fa-solid fa-camera"></i> Open Camera
                      </button>
                      <label style={{ background: "#fff", border: "1px solid #cbd5e1", padding: "9px 16px", borderRadius: "8px", fontWeight: 600, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                        <i className="fa-solid fa-upload"></i> Upload Image
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const r = new FileReader();
                              r.onload = (evt) => setFacePhotoSnap(evt.target.result);
                              r.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px", paddingTop: "14px", borderTop: "1px solid #f1f5f9" }}>
                  <button
                    type="button"
                    onClick={handleCloseFaceModal}
                    disabled={savingFace}
                    style={{ background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", padding: "8px 16px", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveFaceRegistration}
                    disabled={savingFace || !facePhotoSnap}
                    style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "white", border: "none", padding: "8px 20px", borderRadius: "8px", fontWeight: 700, cursor: facePhotoSnap ? "pointer" : "not-allowed", opacity: facePhotoSnap ? 1 : 0.6, display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    {savingFace ? (
                      <span><i className="fa-solid fa-spinner fa-spin"></i> Saving Biometrics...</span>
                    ) : (
                      <span><i className="fa-solid fa-shield-halved"></i> Save Biometric Face</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Students;