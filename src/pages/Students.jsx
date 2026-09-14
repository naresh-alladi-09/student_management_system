import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getStudents,
  updateStudent,
  deleteStudent,
} from "../services/studentservice";

import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import StudentTable from "../components/StudentTable";
import "../styles/studenttable.css";

const Students = () => {
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("ALL");
  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Edit Modal State
  const [editingStudent, setEditingStudent] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    year: "1",
    email: "",
    phone: "",
    branch: "CSE",
    semester: "1",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const loadStudents = async () => {
    try {
      setLoading(true);
      const response = await getStudents();
      const list = response.data || [];
      setStudents(list);
      setFilteredStudents(list);
    } catch (error) {
      console.error("Failed to fetch students:", error);
      setErrorMessage("Could not connect to database to fetch students.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  // Filter students whenever searchTerm or selectedBranch changes
  useEffect(() => {
    let result = [...students];

    if (selectedBranch !== "ALL") {
      result = result.filter(
        (s) => (s.branch || "").toUpperCase() === selectedBranch.toUpperCase()
      );
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          (s.name || "").toLowerCase().includes(q) ||
          (s.email || "").toLowerCase().includes(q) ||
          (s.phone || "").includes(q) ||
          String(s.id).includes(q)
      );
    }

    setFilteredStudents(result);
  }, [students, searchTerm, selectedBranch]);

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
    });
  };

  const handleCloseEdit = () => {
    setEditingStudent(null);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingStudent) return;

    try {
      setSavingEdit(true);
      const payload = {
        name: editFormData.name.trim(),
        year: parseInt(editFormData.year, 10) || 1,
        email: editFormData.email.trim(),
        phone: editFormData.phone.trim(),
        branch: editFormData.branch,
        semester: String(editFormData.semester),
      };

      await updateStudent(editingStudent.id, payload);
      setStatusMessage(`✓ Student "${payload.name}" updated successfully!`);
      setTimeout(() => setStatusMessage(null), 3000);
      handleCloseEdit();
      loadStudents();
    } catch (error) {
      console.error("Update error:", error.response?.data || error);
      alert("Failed to update student. Please check input values.");
    } finally {
      setSavingEdit(false);
    }
  };

  // DELETE STUDENT
  const handleDelete = async (id, studentName) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete student "${studentName || `#${id}`}"?`
    );

    if (!confirmDelete) return;

    try {
      await deleteStudent(id);
      setStatusMessage(`✓ Student record removed from database.`);
      setTimeout(() => setStatusMessage(null), 3000);
      loadStudents();
    } catch (error) {
      console.error("Delete error:", error.response?.data || error);
      alert("Failed to delete student from database.");
    }
  };

  return (
    <div className="sideandmain">
      <div className="Sidebarindashboard">
        <Sidebar />
      </div>

      <div className="main-content">
        <Navbar />

        <div className="students-page-container">
          <div className="students-header-bar">
            <div>
              <h2>All Students ({students.length})</h2>
              <p>Manage, search, edit, and delete student records stored in Aiven MySQL</p>
            </div>

            <div className="header-actions">
              <Link to="/AddStudents" className="btn-add-student">
                <i className="fa-solid fa-plus"></i> Add New Student
              </Link>
            </div>
          </div>

          {statusMessage && (
            <div className="status-toast-success">{statusMessage}</div>
          )}

          {errorMessage && (
            <div className="status-toast-error">{errorMessage}</div>
          )}

          {/* Filter Bar */}
          <div className="table-filter-bar">
            <div className="search-input-box">
              <i className="fa-solid fa-magnifying-glass"></i>
              <input
                type="text"
                placeholder="Search by name, ID, email, phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  style={{ background: "transparent", border: "none", cursor: "pointer" }}
                  onClick={() => setSearchTerm("")}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="filter-group">
              <label style={{ fontSize: "13px", fontWeight: "600", color: "#475569" }}>
                Branch:
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="filter-select"
              >
                <option value="ALL">All Branches</option>
                <option value="CSE">CSE</option>
                <option value="ECE">ECE</option>
                <option value="AIML">AIML</option>
                <option value="IT">IT</option>
                <option value="MECH">MECH</option>
                <option value="CIVIL">CIVIL</option>
              </select>

              <span className="record-count-badge">
                Showing {filteredStudents.length} of {students.length}
              </span>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: "8px" }}></i>
              Loading students from database...
            </div>
          ) : (
            <StudentTable
              students={filteredStudents}
              onEdit={handleOpenEdit}
              onDelete={handleDelete}
            />
          )}
        </div>
      </div>

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
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div className="modal-body">
                <div className="modal-row">
                  <div className="modal-field">
                    <label>Full Name *</label>
                    <input
                      type="text"
                      required
                      value={editFormData.name}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, name: e.target.value })
                      }
                    />
                  </div>

                  <div className="modal-field">
                    <label>Academic Year *</label>
                    <select
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
                </div>

                <div className="modal-row">
                  <div className="modal-field">
                    <label>Email Address *</label>
                    <input
                      type="email"
                      required
                      value={editFormData.email}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, email: e.target.value })
                      }
                    />
                  </div>

                  <div className="modal-field">
                    <label>Phone Number *</label>
                    <input
                      type="tel"
                      required
                      value={editFormData.phone}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, phone: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="modal-row">
                  <div className="modal-field">
                    <label>Branch *</label>
                    <select
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

                  <div className="modal-field">
                    <label>Semester *</label>
                    <select
                      value={editFormData.semester}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, semester: e.target.value })
                      }
                    >
                      <option value="1">Semester 1</option>
                      <option value="2">Semester 2</option>
                      <option value="3">Semester 3</option>
                      <option value="4">Semester 4</option>
                      <option value="5">Semester 5</option>
                      <option value="6">Semester 6</option>
                      <option value="7">Semester 7</option>
                      <option value="8">Semester 8</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCloseEdit}
                  disabled={savingEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={savingEdit}
                >
                  {savingEdit ? (
                    <span><i className="fa-solid fa-spinner fa-spin"></i> Saving...</span>
                  ) : (
                    <span><i className="fa-solid fa-check"></i> Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Students;