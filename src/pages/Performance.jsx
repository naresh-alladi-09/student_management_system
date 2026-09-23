import { useEffect, useState, useMemo, useCallback } from "react";
import "../styles/performance.css";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import {
  getAllPerformance,
  getAllSubjects,
  saveStudentScore,
} from "../services/studentservice";
import {
  FaEdit,
  FaPlusCircle,
  FaTimes,
  FaCheckCircle,
  FaAward,
  FaChevronDown,
  FaChevronUp,
  FaBook,
  FaLayerGroup,
} from "react-icons/fa";

function Performance() {
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState("ALL");
  const [selectedYear, setSelectedYear] = useState("ALL");
  const [selectedSection, setSelectedSection] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedStudentId, setExpandedStudentId] = useState(null);

  // Mark Entry Modal States
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [markStudent, setMarkStudent] = useState(null);
  const [markSubjectId, setMarkSubjectId] = useState("");
  const [internals, setInternals] = useState(25.0);
  const [endSem, setEndSem] = useState(60.0);
  const [isSavingMark, setIsSavingMark] = useState(false);
  const [markFeedback, setMarkFeedback] = useState(null);

  const loadData = useCallback(() => {
    setLoading(true);
    getAllPerformance(selectedBranch)
      .then((res) => {
        setStudents(res.data || []);
      })
      .catch((err) => {
        console.error("Failed to load performance records:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedBranch]);

  useEffect(() => {
    loadData();
    getAllSubjects()
      .then((res) => {
        const subs = res.data || [];
        setSubjects(subs);
        if (subs.length > 0 && !markSubjectId) setMarkSubjectId(String(subs[0].id));
      })
      .catch(() => {});
  }, [loadData]);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const matchBranch = selectedBranch === "ALL" || (s.branch || "").toUpperCase() === selectedBranch.toUpperCase();
      const matchYear = selectedYear === "ALL" || String(s.year) === String(selectedYear);
      const matchSection = selectedSection === "ALL" || (s.section || "").toUpperCase() === selectedSection.toUpperCase();

      const matchQuery =
        !searchQuery.trim() ||
        (s.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(s.student_id || s.id).includes(searchQuery) ||
        (s.roll_no && s.roll_no.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchBranch && matchYear && matchSection && matchQuery;
    });
  }, [students, selectedBranch, selectedYear, selectedSection, searchQuery]);

  const handleOpenMarkModal = (student, subjectId = null) => {
    setMarkStudent(student);
    setMarkFeedback(null);

    const targetSubId = subjectId || (subjects.length > 0 ? String(subjects[0].id) : "");
    setMarkSubjectId(targetSubId);

    // If student already has existing score for this subject, pre-fill it
    const existing = (student.scores || []).find(
      (sc) => String(sc.subject_id) === String(targetSubId)
    );
    if (existing) {
      setInternals(existing.internals);
      setEndSem(existing.end_sem);
    } else {
      setInternals(25.0);
      setEndSem(60.0);
    }

    setShowMarkModal(true);
  };

  const handleSubjectChangeInModal = (newSubId) => {
    setMarkSubjectId(newSubId);
    if (!markStudent) return;
    const existing = (markStudent.scores || []).find(
      (sc) => String(sc.subject_id) === String(newSubId)
    );
    if (existing) {
      setInternals(existing.internals);
      setEndSem(existing.end_sem);
    } else {
      setInternals(25.0);
      setEndSem(60.0);
    }
  };

  const handleSaveMarks = async (e) => {
    if (e) e.preventDefault();
    if (!markStudent || !markSubjectId) return;

    setIsSavingMark(true);
    setMarkFeedback(null);

    try {
      const res = await saveStudentScore({
        student_id: markStudent.student_id || markStudent.id,
        subject_id: parseInt(markSubjectId, 10),
        internals: parseFloat(internals) || 0,
        end_sem: parseFloat(endSem) || 0,
      });

      setMarkFeedback({
        success: true,
        message: res.data?.message || "Score recorded successfully!",
      });
      loadData();
      setTimeout(() => {
        setShowMarkModal(false);
        setMarkFeedback(null);
      }, 1500);
    } catch (err) {
      setMarkFeedback({
        success: false,
        message: err.response?.data?.detail || "Failed to record marks.",
      });
    } finally {
      setIsSavingMark(false);
    }
  };

  return (
    <div className="sideandmain">
      <div className="Sidebarindashboard">
        <Sidebar />
      </div>

      <div className="main-content">
        <Navbar />

        <div className="performance-page-container">
          <div className="performance-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2>Academic Performance & Gradebook</h2>
              <p>Subject evaluations, computed SGPA, and 10-point scale grade distribution</p>
            </div>

            <button
              type="button"
              className="action-btn-primary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 18px",
                borderRadius: "8px",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={() => {
                if (students.length > 0) handleOpenMarkModal(students[0]);
              }}
            >
              <FaPlusCircle /> Record Subject Marks
            </button>
          </div>

          <div className="performance-box">
            <div className="filter-section" style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
              <div className="filter-item">
                <label htmlFor="perf-branch-select">Branch:</label>
                <select
                  id="perf-branch-select"
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="filter-select"
                >
                  <option value="ALL">All Branches</option>
                  <option value="CSE">CSE</option>
                  <option value="AIML">AIML</option>
                  <option value="IT">IT</option>
                  <option value="ECE">ECE</option>
                  <option value="MECH">MECH</option>
                </select>
              </div>

              <div className="filter-item">
                <label htmlFor="perf-year-select">Year:</label>
                <select
                  id="perf-year-select"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="filter-select"
                >
                  <option value="ALL">All Years</option>
                  <option value="1">Year 1</option>
                  <option value="2">Year 2</option>
                  <option value="3">Year 3</option>
                  <option value="4">Year 4</option>
                </select>
              </div>

              <div className="filter-item">
                <label htmlFor="perf-sec-select">Section:</label>
                <select
                  id="perf-sec-select"
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  className="filter-select"
                >
                  <option value="ALL">All Sections</option>
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                </select>
              </div>

              <div className="search-item" style={{ flex: "1 1 240px" }}>
                <label htmlFor="perf-search-input">Search Student:</label>
                <div className="perf-search-input">
                  <i className="fa-solid fa-magnifying-glass"></i>
                  <input
                    id="perf-search-input"
                    type="text"
                    placeholder="Search by name, roll no, or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: "8px" }}></i>
                Loading authentic academic scores from database...
              </div>
            ) : (
              <div className="table-responsive">
                <table className="performance-table">
                  <thead>
                    <tr>
                      <th style={{ width: "36px" }}></th>
                      <th>Roll No / ID</th>
                      <th>Student Name</th>
                      <th>Class & Section</th>
                      <th>Mathematics</th>
                      <th>Tech / Coding</th>
                      <th>Elective / Sci</th>
                      <th>Computed SGPA</th>
                      <th>Average (%)</th>
                      <th>Overall Grade</th>
                      <th style={{ textAlign: "center" }}>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.length > 0 ? (
                      filtered.map((item) => {
                        const isExpanded = expandedStudentId === (item.student_id || item.id);
                        return (
                          <>
                            <tr key={item.student_id || item.id} style={{ background: isExpanded ? "#f8fafc" : "inherit" }}>
                              <td>
                                <button
                                  type="button"
                                  title="View Subject Breakdown"
                                  onClick={() => setExpandedStudentId(isExpanded ? null : (item.student_id || item.id))}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: "#64748b",
                                    cursor: "pointer",
                                    fontSize: "12px",
                                    padding: "4px",
                                  }}
                                >
                                  {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                                </button>
                              </td>
                              <td>
                                <strong>{item.roll_no || `#${item.student_id || item.id}`}</strong>
                              </td>
                              <td className="perf-student-name">
                                <span className="perf-dot"></span>
                                {item.name}
                              </td>
                              <td>
                                <span className="perf-branch">
                                  {item.academic_class_name || `${item.branch} Y${item.year}S${item.semester}-${item.section}`}
                                </span>
                              </td>
                              <td>{item.maths > 0 ? `${item.maths} / 100` : "—"}</td>
                              <td>{item.coding > 0 ? `${item.coding} / 100` : "—"}</td>
                              <td>{item.science > 0 ? `${item.science} / 100` : "—"}</td>
                              <td>
                                <strong style={{ color: "#2563eb", fontSize: "14px" }}>
                                  {item.sgpa > 0 ? `${item.sgpa} / 10` : "N/A"}
                                </strong>
                              </td>
                              <td>
                                <strong>{item.avg > 0 ? `${item.avg}%` : "—"}</strong>
                              </td>
                              <td>
                                <span className={`grade-badge ${item.gradeClass}`}>
                                  {item.grade}
                                </span>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenMarkModal(item)}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    background: "#eff6ff",
                                    color: "#2563eb",
                                    border: "1px solid #bfdbfe",
                                    padding: "6px 12px",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                  }}
                                >
                                  <FaEdit /> Enter Marks
                                </button>
                              </td>
                            </tr>

                            {/* Expandable Enrolled Subject Breakdown */}
                            {isExpanded && (
                              <tr key={`expand-${item.student_id || item.id}`} style={{ background: "#f8fafc" }}>
                                <td colSpan="11" style={{ padding: "16px 24px" }}>
                                  <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "16px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                                      <h4 style={{ margin: 0, fontSize: "14px", color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
                                        <FaBook style={{ color: "#2563eb" }} /> All Evaluated Subjects for {item.name}
                                      </h4>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenMarkModal(item)}
                                        style={{
                                          fontSize: "12px",
                                          padding: "4px 10px",
                                          borderRadius: "6px",
                                          border: "1px solid #cbd5e1",
                                          background: "#f1f5f9",
                                          color: "#334155",
                                          cursor: "pointer",
                                          fontWeight: 600,
                                        }}
                                      >
                                        + Record New Subject
                                      </button>
                                    </div>

                                    {item.scores && item.scores.length > 0 ? (
                                      <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                                        <thead>
                                          <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                                            <th style={{ padding: "8px" }}>Subject Code</th>
                                            <th style={{ padding: "8px" }}>Course Name</th>
                                            <th style={{ padding: "8px" }}>Credits</th>
                                            <th style={{ padding: "8px" }}>Internals (40)</th>
                                            <th style={{ padding: "8px" }}>End Sem (60)</th>
                                            <th style={{ padding: "8px" }}>Total (100)</th>
                                            <th style={{ padding: "8px" }}>Grade</th>
                                            <th style={{ padding: "8px" }}>Point</th>
                                            <th style={{ padding: "8px" }}>Result</th>
                                            <th style={{ padding: "8px", textAlign: "center" }}>Action</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {item.scores.map((sc) => (
                                            <tr key={sc.subject_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                              <td style={{ padding: "8px" }}><strong>{sc.code}</strong></td>
                                              <td style={{ padding: "8px" }}>{sc.name}</td>
                                              <td style={{ padding: "8px" }}>{sc.credits}</td>
                                              <td style={{ padding: "8px" }}>{sc.internals}</td>
                                              <td style={{ padding: "8px" }}>{sc.end_sem}</td>
                                              <td style={{ padding: "8px" }}><strong>{sc.total}</strong></td>
                                              <td style={{ padding: "8px" }}>
                                                <span className={`grade-badge ${sc.grade_class}`}>{sc.grade}</span>
                                              </td>
                                              <td style={{ padding: "8px" }}>{sc.grade_point}</td>
                                              <td style={{ padding: "8px" }}>
                                                <span style={{
                                                  padding: "2px 8px",
                                                  borderRadius: "4px",
                                                  fontSize: "11px",
                                                  fontWeight: 700,
                                                  background: sc.is_passed ? "#dcfce7" : "#fee2e2",
                                                  color: sc.is_passed ? "#166534" : "#991b1b"
                                                }}>
                                                  {sc.is_passed ? "PASSED" : "FAILED"}
                                                </span>
                                              </td>
                                              <td style={{ padding: "8px", textAlign: "center" }}>
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenMarkModal(item, String(sc.subject_id))}
                                                  style={{
                                                    background: "none",
                                                    border: "none",
                                                    color: "#2563eb",
                                                    cursor: "pointer",
                                                    fontWeight: 600,
                                                    fontSize: "12px",
                                                  }}
                                                >
                                                  Edit
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    ) : (
                                      <p style={{ margin: "8px 0", color: "#94a3b8", fontSize: "13px" }}>
                                        No individual subject scores evaluated yet for this student. Click "Enter Marks" to add one.
                                      </p>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan="11"
                          style={{
                            textAlign: "center",
                            padding: "35px",
                            color: "#94a3b8",
                          }}
                        >
                          No student academic records match the selected criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Mark Entry Modal */}
        {showMarkModal && markStudent && (
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
                maxWidth: "480px",
                width: "100%",
                boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
                position: "relative",
              }}
            >
              <button
                type="button"
                onClick={() => setShowMarkModal(false)}
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

              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ margin: "0 0 6px 0", fontSize: "20px", color: "#0f172a" }}>
                  <FaAward style={{ color: "#2563eb", marginRight: "8px" }} />
                  Record Academic Marks
                </h3>
                <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
                  Student: <strong>{markStudent.name}</strong> ({markStudent.roll_no || markStudent.id})
                </p>
              </div>

              {markFeedback && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    marginBottom: "16px",
                    fontSize: "14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: markFeedback.success ? "#ecfdf5" : "#fef2f2",
                    color: markFeedback.success ? "#065f46" : "#991b1b",
                    border: `1px solid ${markFeedback.success ? "#a7f3d0" : "#fecaca"}`,
                  }}
                >
                  <FaCheckCircle /> {markFeedback.message}
                </div>
              )}

              <form onSubmit={handleSaveMarks}>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    htmlFor="select-student-mark"
                    style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}
                  >
                    Select Student:
                  </label>
                  <select
                    id="select-student-mark"
                    value={markStudent.student_id || markStudent.id}
                    onChange={(e) => {
                      const found = students.find(
                        (s) => String(s.student_id || s.id) === e.target.value
                      );
                      if (found) setMarkStudent(found);
                    }}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                    }}
                  >
                    {students.map((s) => (
                      <option key={s.student_id || s.id} value={s.student_id || s.id}>
                        {s.name} ({s.roll_no || `#${s.id}`}) - {s.branch}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <label
                    htmlFor="select-subject-mark"
                    style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}
                  >
                    Curriculum Subject:
                  </label>
                  <select
                    id="select-subject-mark"
                    value={markSubjectId}
                    onChange={(e) => handleSubjectChangeInModal(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                    }}
                  >
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.code} - {sub.name} ({sub.credits} Credits)
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
                  <div>
                    <label
                      htmlFor="internals-input"
                      style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}
                    >
                      Internals (Max 40):
                    </label>
                    <input
                      id="internals-input"
                      type="number"
                      step="0.5"
                      min="0"
                      max="40"
                      value={internals}
                      onChange={(e) => setInternals(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "14px",
                        boxSizing: "border-box",
                      }}
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="endsem-input"
                      style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}
                    >
                      End Sem (Max 60):
                    </label>
                    <input
                      id="endsem-input"
                      type="number"
                      step="0.5"
                      min="0"
                      max="60"
                      value={endSem}
                      onChange={(e) => setEndSem(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "14px",
                        boxSizing: "border-box",
                      }}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setShowMarkModal(false)}
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
                    disabled={isSavingMark}
                    style={{
                      flex: 2,
                      padding: "12px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#2563eb",
                      color: "#fff",
                      fontWeight: 600,
                      cursor: isSavingMark ? "not-allowed" : "pointer",
                    }}
                  >
                    {isSavingMark ? "Saving..." : "Save Marks to Database"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Performance;