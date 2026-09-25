import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getStudents,
  updateStudent,
  deactivateStudent,
  activateStudent,
} from "../services/studentservice";

import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import StudentTable from "../components/StudentTable";
import "../styles/studenttable.css";

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

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      setErrorMessage("Please enter a valid email address (e.g. student@college.edu).");
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    if (!trimmedPhone || !/^\d{10,15}$/.test(trimmedPhone)) {
      setErrorMessage("Phone number must contain between 10 and 15 numeric digits.");
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    try {
      setSavingEdit(true);
      const payload = {
        name: trimmedName,
        year: parseInt(editFormData.year, 10) || 1,
        email: trimmedEmail,
        phone: trimmedPhone,
        branch: editFormData.branch,
        semester: String(editFormData.semester),
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
            <Link to="/addstudents" className="add-student-btn">
              <i className="fa-solid fa-user-plus"></i> Enroll Student
            </Link>
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
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, year: e.target.value })
                        }
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
                      <label htmlFor="edit-sem">Semester *</label>
                      <select
                        id="edit-sem"
                        value={editFormData.semester}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, semester: e.target.value })
                        }
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                          <option key={s} value={String(s)}>
                            Semester {s}
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
                      <label htmlFor="edit-email">Email Address *</label>
                      <input
                        id="edit-email"
                        type="email"
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
        </div>
      </div>
    </div>
  );
};

export default Students;