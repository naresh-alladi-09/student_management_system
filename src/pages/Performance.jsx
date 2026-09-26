import { useEffect, useState, useMemo, useCallback } from "react";
import "../styles/performance.css";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { QRCodeSVG } from "qrcode.react";
import {
  getAllPerformance,
  getAllSubjects,
  saveStudentScore,
  getExamSessions,
  createExamSession,
  deleteExamSession,
  generateExamHallTickets,
  getExamHallTickets,
  condoneHallTicket,
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
  FaIdCard,
  FaCalendarCheck,
  FaQrcode,
  FaPrint,
  FaShieldAlt,
  FaSync,
  FaExclamationTriangle,
  FaTrashAlt,
  FaEye,
  FaSearch,
  FaUniversity,
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

  // Main Tab State
  const [activeMainTab, setActiveMainTab] = useState("gradebook"); // "gradebook" | "exams"

  // Exam Sessions States
  const [examSessions, setExamSessions] = useState([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [showExamModal, setShowExamModal] = useState(false);
  const [newExamData, setNewExamData] = useState({
    name: "",
    academic_year: "2026-2027",
    exam_type: "REGULAR",
    branch: "ALL",
    semester: "ALL",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    min_attendance_percentage: 75.0,
    is_published: true,
  });
  const [isCreatingExam, setIsCreatingExam] = useState(false);

  // Roster States
  const [selectedExamForRoster, setSelectedExamForRoster] = useState(null);
  const [examTickets, setExamTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketStatusFilter, setTicketStatusFilter] = useState("ALL");
  const [ticketSearch, setTicketSearch] = useState("");
  const [isGeneratingTickets, setIsGeneratingTickets] = useState(false);

  // Condonation Modal States
  const [condoneModalTicket, setCondoneModalTicket] = useState(null);
  const [condoneReason, setCondoneReason] = useState("");
  const [isSubmittingCondone, setIsSubmittingCondone] = useState(false);

  // Preview Modal State
  const [previewTicket, setPreviewTicket] = useState(null);

  const fetchExamSessions = useCallback(() => {
    setExamsLoading(true);
    getExamSessions()
      .then((res) => {
        setExamSessions(res.data || []);
      })
      .catch((err) => {
        console.error("Failed to load exam sessions:", err);
      })
      .finally(() => {
        setExamsLoading(false);
      });
  }, []);

  const loadExamTickets = (examId) => {
    setTicketsLoading(true);
    getExamHallTickets(examId)
      .then((res) => {
        setExamTickets(res.data?.tickets || []);
      })
      .catch((err) => {
        console.error("Failed to load hall tickets:", err);
      })
      .finally(() => {
        setTicketsLoading(false);
      });
  };

  const handleGenerateTickets = async (examId) => {
    setIsGeneratingTickets(true);
    try {
      const res = await generateExamHallTickets(examId);
      alert(res.data?.detail || "Hall tickets generated successfully!");
      fetchExamSessions();
      if (selectedExamForRoster && selectedExamForRoster.id === examId) {
        loadExamTickets(examId);
      }
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to generate hall tickets.");
    } finally {
      setIsGeneratingTickets(false);
    }
  };

  const handleCreateExam = async (e) => {
    if (e) e.preventDefault();
    if (!newExamData.name.trim()) {
      alert("Exam name is required.");
      return;
    }
    setIsCreatingExam(true);
    try {
      await createExamSession(newExamData);
      setShowExamModal(false);
      fetchExamSessions();
      setNewExamData({
        name: "",
        academic_year: "2026-2027",
        exam_type: "REGULAR",
        branch: "ALL",
        semester: "ALL",
        start_date: new Date().toISOString().slice(0, 10),
        end_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        min_attendance_percentage: 75.0,
        is_published: true,
      });
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to create exam session.");
    } finally {
      setIsCreatingExam(false);
    }
  };

  const handleDeleteExam = async (examId) => {
    if (!window.confirm("Are you sure you want to delete this examination session? All associated hall tickets will also be deleted.")) {
      return;
    }
    try {
      await deleteExamSession(examId);
      fetchExamSessions();
      if (selectedExamForRoster?.id === examId) {
        setSelectedExamForRoster(null);
        setExamTickets([]);
      }
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to delete exam session.");
    }
  };

  const handleCondoneSubmit = async () => {
    if (!condoneModalTicket) return;
    setIsSubmittingCondone(true);
    try {
      await condoneHallTicket(condoneModalTicket.id, {
        is_condoned: true,
        reason: condoneReason.trim() || "Condonation granted by department authority.",
      });
      setCondoneModalTicket(null);
      setCondoneReason("");
      if (selectedExamForRoster) {
        loadExamTickets(selectedExamForRoster.id);
      }
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to update condonation.");
    } finally {
      setIsSubmittingCondone(false);
    }
  };

  const handleRevokeCondone = async (ticketId) => {
    if (!window.confirm("Are you sure you want to revoke condonation for this student?")) return;
    try {
      await condoneHallTicket(ticketId, { is_condoned: false });
      if (selectedExamForRoster) {
        loadExamTickets(selectedExamForRoster.id);
      }
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to revoke condonation.");
    }
  };

  useEffect(() => {
    if (activeMainTab === "exams") {
      fetchExamSessions();
    }
  }, [activeMainTab, fetchExamSessions]);

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
          {/* Main Module Navigation Bar */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "20px",
              borderBottom: "2px solid #e2e8f0",
              paddingBottom: "8px",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveMainTab("gradebook")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                borderRadius: "10px",
                border: "none",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
                background: activeMainTab === "gradebook" ? "#2563eb" : "#f1f5f9",
                color: activeMainTab === "gradebook" ? "#ffffff" : "#475569",
              }}
            >
              <FaAward /> Subject Gradebook &amp; SGPA
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveMainTab("exams");
                fetchExamSessions();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                borderRadius: "10px",
                border: "none",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
                background: activeMainTab === "exams" ? "#1e3a8a" : "#f1f5f9",
                color: activeMainTab === "exams" ? "#ffffff" : "#475569",
              }}
            >
              <FaIdCard /> Exam Sessions &amp; Hall Tickets
            </button>
          </div>

          {activeMainTab === "gradebook" && (
            <>
              <div className="performance-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h2>Academic Performance &amp; Gradebook</h2>
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
            </>
          )}

          {/* ============================================================== */}
          {/* TAB 2: EXAM SESSIONS & HALL TICKET MANAGEMENT                  */}
          {/* ============================================================== */}
          {activeMainTab === "exams" && (
            <div>
              {selectedExamForRoster ? (
                /* ========================================================== */
                /* VIEW 2A: STUDENT ELIGIBILITY & HALL TICKET ROSTER          */
                /* ========================================================== */
                <div style={{ background: "#ffffff", borderRadius: "16px", padding: "24px", boxShadow: "0 4px 15px rgba(0,0,0,0.05)" }}>
                  {/* Top Bar with Back Button */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "16px" }}>
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedExamForRoster(null);
                          setExamTickets([]);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          background: "#f1f5f9",
                          color: "#334155",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          padding: "6px 14px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          marginBottom: "10px",
                        }}
                      >
                        ← Back to Exam Sessions
                      </button>

                      <h2 style={{ margin: "0 0 6px 0", fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>
                        {selectedExamForRoster.name} — Student Roster
                      </h2>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", fontSize: "12px" }}>
                        <span style={{ background: "#eff6ff", color: "#2563eb", padding: "2px 8px", borderRadius: "6px", fontWeight: 600 }}>
                          Term: {selectedExamForRoster.academic_year}
                        </span>
                        <span style={{ background: "#f8fafc", color: "#475569", padding: "2px 8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                          Cohort: {selectedExamForRoster.branch} • Sem {selectedExamForRoster.semester}
                        </span>
                        <span style={{ background: "#fef3c7", color: "#b45309", padding: "2px 8px", borderRadius: "6px", fontWeight: 600 }}>
                          Min Attendance: {selectedExamForRoster.min_attendance_percentage}%
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isGeneratingTickets}
                      onClick={() => handleGenerateTickets(selectedExamForRoster.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "9px 18px",
                        background: "#2563eb",
                        color: "#fff",
                        border: "none",
                        borderRadius: "8px",
                        fontWeight: 600,
                        fontSize: "13px",
                        cursor: isGeneratingTickets ? "not-allowed" : "pointer",
                      }}
                    >
                      <FaSync className={isGeneratingTickets ? "fa-spin" : ""} /> Recalculate &amp; Generate All
                    </button>
                  </div>

                  {/* Summary Stat Cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "20px" }}>
                    <div
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "12px",
                        padding: "14px",
                        cursor: "pointer",
                        boxShadow: ticketStatusFilter === "ALL" ? "0 0 0 2px #2563eb" : "none",
                      }}
                      onClick={() => setTicketStatusFilter("ALL")}
                    >
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Total Roster</div>
                      <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>{examTickets.length}</div>
                    </div>

                    <div
                      style={{
                        background: "#f0fdf4",
                        border: "1px solid #dcfce7",
                        borderRadius: "12px",
                        padding: "14px",
                        cursor: "pointer",
                        boxShadow: ticketStatusFilter === "ELIGIBLE" ? "0 0 0 2px #10b981" : "none",
                      }}
                      onClick={() => setTicketStatusFilter("ELIGIBLE")}
                    >
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#166534", textTransform: "uppercase" }}>Eligible Candidates</div>
                      <div style={{ fontSize: "22px", fontWeight: 800, color: "#16a34a", marginTop: "4px" }}>
                        {examTickets.filter((t) => t.is_eligible).length}
                      </div>
                    </div>

                    <div
                      style={{
                        background: "#fef2f2",
                        border: "1px solid #fee2e2",
                        borderRadius: "12px",
                        padding: "14px",
                        cursor: "pointer",
                        boxShadow: ticketStatusFilter === "SHORTAGE" ? "0 0 0 2px #ef4444" : "none",
                      }}
                      onClick={() => setTicketStatusFilter("SHORTAGE")}
                    >
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#991b1b", textTransform: "uppercase" }}>Shortage Detained</div>
                      <div style={{ fontSize: "22px", fontWeight: 800, color: "#dc2626", marginTop: "4px" }}>
                        {examTickets.filter((t) => !t.is_eligible).length}
                      </div>
                    </div>

                    <div
                      style={{
                        background: "#faf5ff",
                        border: "1px solid #f3e8ff",
                        borderRadius: "12px",
                        padding: "14px",
                        cursor: "pointer",
                        boxShadow: ticketStatusFilter === "CONDONED" ? "0 0 0 2px #7c3aed" : "none",
                      }}
                      onClick={() => setTicketStatusFilter("CONDONED")}
                    >
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b21a8", textTransform: "uppercase" }}>Condoned by Admin</div>
                      <div style={{ fontSize: "22px", fontWeight: 800, color: "#9333ea", marginTop: "4px" }}>
                        {examTickets.filter((t) => t.is_condoned).length}
                      </div>
                    </div>
                  </div>

                  {/* Filter Pills & Search */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {["ALL", "ELIGIBLE", "SHORTAGE", "CONDONED"].map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setTicketStatusFilter(st)}
                          style={{
                            padding: "6px 14px",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            border: "none",
                            background: ticketStatusFilter === st ? "#0f172a" : "#f1f5f9",
                            color: ticketStatusFilter === st ? "#ffffff" : "#475569",
                          }}
                        >
                          {st === "ALL" ? "All Students" : st.charAt(0) + st.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>

                    <div style={{ position: "relative", minWidth: "260px" }}>
                      <FaSearch style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: "12px" }} />
                      <input
                        type="text"
                        placeholder="Search student, roll no, ticket..."
                        value={ticketSearch}
                        onChange={(e) => setTicketSearch(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 12px 8px 32px",
                          borderRadius: "8px",
                          border: "1px solid #cbd5e1",
                          fontSize: "13px",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  </div>

                  {/* Roster Table */}
                  {ticketsLoading ? (
                    <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                      <FaSync className="fa-spin" style={{ fontSize: "24px", marginBottom: "8px" }} />
                      <div>Loading examination roster...</div>
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                        <thead>
                          <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                            <th style={{ padding: "12px", color: "#475569", fontWeight: 700 }}>Student</th>
                            <th style={{ padding: "12px", color: "#475569", fontWeight: 700 }}>Branch &amp; Sem</th>
                            <th style={{ padding: "12px", color: "#475569", fontWeight: 700 }}>Attendance %</th>
                            <th style={{ padding: "12px", color: "#475569", fontWeight: 700 }}>Hall Ticket No</th>
                            <th style={{ padding: "12px", color: "#475569", fontWeight: 700 }}>Status</th>
                            <th style={{ padding: "12px", color: "#475569", fontWeight: 700, textAlign: "center" }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {examTickets
                            .filter((t) => {
                              if (ticketStatusFilter === "ELIGIBLE" && !t.is_eligible) return false;
                              if (ticketStatusFilter === "SHORTAGE" && t.is_eligible) return false;
                              if (ticketStatusFilter === "CONDONED" && !t.is_condoned) return false;
                              if (!ticketSearch.trim()) return true;
                              const q = ticketSearch.toLowerCase();
                              return (
                                (t.student_name && t.student_name.toLowerCase().includes(q)) ||
                                (t.roll_no && t.roll_no.toLowerCase().includes(q)) ||
                                (t.hall_ticket_number && t.hall_ticket_number.toLowerCase().includes(q))
                              );
                            })
                            .map((t) => {
                              const attPct = t.calculated_attendance_pct;
                              const isElig = t.is_eligible;

                              return (
                                <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                  <td style={{ padding: "12px" }}>
                                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{t.student_name}</div>
                                    <div style={{ fontSize: "11.5px", color: "#64748b" }}>{t.roll_no}</div>
                                  </td>

                                  <td style={{ padding: "12px", color: "#334155" }}>
                                    {t.branch} • Sem {t.semester} (Sec {t.section})
                                  </td>

                                  <td style={{ padding: "12px" }}>
                                    <span
                                      style={{
                                        display: "inline-block",
                                        padding: "3px 8px",
                                        borderRadius: "6px",
                                        fontWeight: 700,
                                        fontSize: "12px",
                                        background: attPct >= 75 ? "#dcfce7" : "#fee2e2",
                                        color: attPct >= 75 ? "#15803d" : "#dc2626",
                                      }}
                                    >
                                      {attPct}%
                                    </span>
                                  </td>

                                  <td style={{ padding: "12px", fontWeight: 600, color: "#2563eb", fontSize: "12px" }}>
                                    {t.hall_ticket_number}
                                  </td>

                                  <td style={{ padding: "12px" }}>
                                    {t.is_condoned ? (
                                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#f3e8ff", color: "#7c3aed", padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700 }}>
                                        <FaShieldAlt /> Condoned
                                      </span>
                                    ) : isElig ? (
                                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#dcfce7", color: "#15803d", padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700 }}>
                                        <FaCheckCircle /> Eligible
                                      </span>
                                    ) : (
                                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#fee2e2", color: "#dc2626", padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700 }}>
                                        <FaExclamationTriangle /> Shortage Detained
                                      </span>
                                    )}
                                  </td>

                                  <td style={{ padding: "12px", textAlign: "center" }}>
                                    <div style={{ display: "inline-flex", gap: "6px" }}>
                                      {!t.is_eligible && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setCondoneModalTicket(t);
                                            setCondoneReason("");
                                          }}
                                          style={{
                                            padding: "5px 10px",
                                            background: "#7c3aed",
                                            color: "#fff",
                                            border: "none",
                                            borderRadius: "6px",
                                            fontSize: "11px",
                                            fontWeight: 600,
                                            cursor: "pointer",
                                          }}
                                          title="Grant special attendance condonation override"
                                        >
                                          Grant Condonation
                                        </button>
                                      )}

                                      {t.is_condoned && (
                                        <button
                                          type="button"
                                          onClick={() => handleRevokeCondone(t.id)}
                                          style={{
                                            padding: "5px 10px",
                                            background: "#fee2e2",
                                            color: "#dc2626",
                                            border: "1px solid #fecaca",
                                            borderRadius: "6px",
                                            fontSize: "11px",
                                            fontWeight: 600,
                                            cursor: "pointer",
                                          }}
                                        >
                                          Revoke
                                        </button>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => setPreviewTicket(t)}
                                        style={{
                                          padding: "5px 10px",
                                          background: "#f1f5f9",
                                          color: "#334155",
                                          border: "1px solid #cbd5e1",
                                          borderRadius: "6px",
                                          fontSize: "11px",
                                          fontWeight: 600,
                                          cursor: "pointer",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "4px",
                                        }}
                                      >
                                        <FaEye /> Admit Card
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}

                          {examTickets.length === 0 && (
                            <tr>
                              <td colSpan="6" style={{ textAlign: "center", padding: "36px", color: "#64748b" }}>
                                No hall tickets generated yet. Click "Recalculate &amp; Generate All" above to process attendance and generate tickets.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                /* ========================================================== */
                /* VIEW 2B: EXAM SESSIONS LIST & SCHEDULER                    */
                /* ========================================================== */
                <div>
                  {/* Header Row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "16px" }}>
                    <div>
                      <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a", margin: "0 0 6px 0" }}>
                        Examination Sessions &amp; Hall Tickets
                      </h2>
                      <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
                        Schedule semester examinations, configure minimum attendance thresholds, and automatically issue verifiable admit cards.
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        type="button"
                        onClick={fetchExamSessions}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "9px 16px",
                          background: "#f1f5f9",
                          color: "#334155",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          fontSize: "13px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        <FaSync className={examsLoading ? "fa-spin" : ""} /> Refresh
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowExamModal(true)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "9px 18px",
                          background: "#2563eb",
                          color: "#fff",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "13px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        <FaPlusCircle /> + Schedule Examination
                      </button>
                    </div>
                  </div>

                  {/* Summary Stat Cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
                    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Scheduled Exams</div>
                      <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>{examSessions.length}</div>
                    </div>

                    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#166534", textTransform: "uppercase" }}>Published &amp; Active</div>
                      <div style={{ fontSize: "26px", fontWeight: 800, color: "#16a34a", marginTop: "4px" }}>
                        {examSessions.filter((e) => e.is_published).length}
                      </div>
                    </div>

                    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#2563eb", textTransform: "uppercase" }}>Mandatory Attendance Rule</div>
                      <div style={{ fontSize: "26px", fontWeight: 800, color: "#2563eb", marginTop: "4px" }}>≥ 75.0%</div>
                    </div>
                  </div>

                  {/* Exam Sessions Table */}
                  <div style={{ background: "#ffffff", borderRadius: "16px", padding: "20px", boxShadow: "0 4px 15px rgba(0,0,0,0.05)" }}>
                    {examsLoading ? (
                      <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                        <FaSync className="fa-spin" style={{ fontSize: "24px", marginBottom: "8px" }} />
                        <div>Loading examination sessions...</div>
                      </div>
                    ) : examSessions.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "50px 20px", color: "#64748b" }}>
                        <div style={{ fontSize: "36px", marginBottom: "12px" }}>📋</div>
                        <h4 style={{ margin: "0 0 8px 0", color: "#0f172a", fontSize: "17px" }}>No Examination Sessions Created</h4>
                        <p style={{ margin: "0 0 16px 0", fontSize: "13.5px" }}>Click "+ Schedule Examination" above to create an exam session and generate hall tickets.</p>
                      </div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                          <thead>
                            <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                              <th style={{ padding: "12px", color: "#475569", fontWeight: 700 }}>Examination Title</th>
                              <th style={{ padding: "12px", color: "#475569", fontWeight: 700 }}>Term &amp; Type</th>
                              <th style={{ padding: "12px", color: "#475569", fontWeight: 700 }}>Target Cohort</th>
                              <th style={{ padding: "12px", color: "#475569", fontWeight: 700 }}>Dates</th>
                              <th style={{ padding: "12px", color: "#475569", fontWeight: 700 }}>Rule</th>
                              <th style={{ padding: "12px", color: "#475569", fontWeight: 700 }}>Status</th>
                              <th style={{ padding: "12px", color: "#475569", fontWeight: 700, textAlign: "center" }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {examSessions.map((exam) => (
                              <tr key={exam.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <td style={{ padding: "14px 12px" }}>
                                  <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>{exam.name}</div>
                                  <div style={{ fontSize: "11.5px", color: "#64748b" }}>
                                    {exam.papers_count} scheduled timetable papers
                                  </div>
                                </td>

                                <td style={{ padding: "14px 12px" }}>
                                  <div style={{ fontWeight: 600, color: "#1e293b" }}>{exam.academic_year}</div>
                                  <div style={{ fontSize: "11px", color: "#64748b" }}>{exam.exam_type_display}</div>
                                </td>

                                <td style={{ padding: "14px 12px" }}>
                                  <span style={{ background: "#f1f5f9", padding: "3px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }}>
                                    {exam.branch} • Sem {exam.semester}
                                  </span>
                                </td>

                                <td style={{ padding: "14px 12px", fontSize: "12px", color: "#334155" }}>
                                  {exam.start_date} → {exam.end_date}
                                </td>

                                <td style={{ padding: "14px 12px" }}>
                                  <span style={{ fontWeight: 700, color: "#0284c7" }}>≥ {exam.min_attendance_percentage}%</span>
                                </td>

                                <td style={{ padding: "14px 12px" }}>
                                  <span
                                    style={{
                                      padding: "3px 8px",
                                      borderRadius: "12px",
                                      fontSize: "11px",
                                      fontWeight: 700,
                                      background: exam.is_published ? "#dcfce7" : "#f1f5f9",
                                      color: exam.is_published ? "#15803d" : "#64748b",
                                    }}
                                  >
                                    {exam.is_published ? "PUBLISHED" : "DRAFT"}
                                  </span>
                                </td>

                                <td style={{ padding: "14px 12px", textAlign: "center" }}>
                                  <div style={{ display: "inline-flex", gap: "6px" }}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedExamForRoster(exam);
                                        loadExamTickets(exam.id);
                                      }}
                                      style={{
                                        padding: "6px 12px",
                                        background: "#2563eb",
                                        color: "#ffffff",
                                        border: "none",
                                        borderRadius: "6px",
                                        fontSize: "12px",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                      }}
                                    >
                                      View Roster &amp; Hall Tickets
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleGenerateTickets(exam.id)}
                                      style={{
                                        padding: "6px 10px",
                                        background: "#f1f5f9",
                                        color: "#334155",
                                        border: "1px solid #cbd5e1",
                                        borderRadius: "6px",
                                        fontSize: "12px",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                      }}
                                      title="Recalculate eligibility & issue tickets"
                                    >
                                      Generate
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteExam(exam.id)}
                                      style={{
                                        padding: "6px 8px",
                                        background: "#fee2e2",
                                        color: "#dc2626",
                                        border: "none",
                                        borderRadius: "6px",
                                        fontSize: "12px",
                                        cursor: "pointer",
                                      }}
                                      title="Delete exam session"
                                    >
                                      <FaTrashAlt />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* MODALS                                                         */}
          {/* ============================================================== */}

          {/* Modal 1: Create Exam Session */}
          {showExamModal && (
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "16px" }}>
              <div style={{ background: "#ffffff", borderRadius: "16px", padding: "24px", maxWidth: "540px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Schedule Examination Session</h3>
                  <button type="button" onClick={() => setShowExamModal(false)} style={{ background: "none", border: "none", fontSize: "18px", color: "#94a3b8", cursor: "pointer" }}>×</button>
                </div>

                <form onSubmit={handleCreateExam}>
                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>Examination Title *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. End Semester Regular Examinations"
                      value={newExamData.name}
                      onChange={(e) => setNewExamData({ ...newExamData, name: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>Academic Year</label>
                      <input
                        type="text"
                        placeholder="2026-2027"
                        value={newExamData.academic_year}
                        onChange={(e) => setNewExamData({ ...newExamData, academic_year: e.target.value })}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>Exam Type</label>
                      <select
                        value={newExamData.exam_type}
                        onChange={(e) => setNewExamData({ ...newExamData, exam_type: e.target.value })}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                      >
                        <option value="REGULAR">Regular Semester Exam</option>
                        <option value="SUPPLEMENTARY">Supplementary / Backlog</option>
                        <option value="MID_TERM">Mid-Term Examination</option>
                        <option value="INTERNAL">Internal Assessment</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>Branch Cohort</label>
                      <select
                        value={newExamData.branch}
                        onChange={(e) => setNewExamData({ ...newExamData, branch: e.target.value })}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
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
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>Semester</label>
                      <select
                        value={newExamData.semester}
                        onChange={(e) => setNewExamData({ ...newExamData, semester: e.target.value })}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                      >
                        <option value="ALL">All Semesters</option>
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

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>Start Date *</label>
                      <input
                        type="date"
                        required
                        value={newExamData.start_date}
                        onChange={(e) => setNewExamData({ ...newExamData, start_date: e.target.value })}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>End Date *</label>
                      <input
                        type="date"
                        required
                        value={newExamData.end_date}
                        onChange={(e) => setNewExamData({ ...newExamData, end_date: e.target.value })}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>Min Attendance %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={newExamData.min_attendance_percentage}
                        onChange={(e) => setNewExamData({ ...newExamData, min_attendance_percentage: parseFloat(e.target.value) || 75.0 })}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                      />
                    </div>

                    <div style={{ display: "flex", alignItems: "center", paddingTop: "20px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600, color: "#334155", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={newExamData.is_published}
                          onChange={(e) => setNewExamData({ ...newExamData, is_published: e.target.checked })}
                        />
                        Publish to Student Portal
                      </label>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setShowExamModal(false)}
                      style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreatingExam}
                      style={{ padding: "8px 18px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, cursor: isCreatingExam ? "not-allowed" : "pointer" }}
                    >
                      {isCreatingExam ? "Creating..." : "Save Examination"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal 2: Condonation Override Dialog */}
          {condoneModalTicket && (
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "16px" }}>
              <div style={{ background: "#ffffff", borderRadius: "16px", padding: "24px", maxWidth: "480px", width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                  <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>
                    Grant Attendance Condonation Override
                  </h3>
                  <button type="button" onClick={() => setCondoneModalTicket(null)} style={{ background: "none", border: "none", fontSize: "18px", color: "#94a3b8", cursor: "pointer" }}>×</button>
                </div>

                <div style={{ background: "#fef2f2", border: "1px solid #fee2e2", borderRadius: "10px", padding: "12px", marginBottom: "16px", fontSize: "13px" }}>
                  <div><strong>Student:</strong> {condoneModalTicket.student_name} ({condoneModalTicket.roll_no})</div>
                  <div><strong>Current Attendance:</strong> {condoneModalTicket.calculated_attendance_pct}% (Mandatory: {condoneModalTicket.min_attendance}%)</div>
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                    Condonation Approval Remarks *
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Approved by Head of Department on verified medical grounds..."
                    value={condoneReason}
                    onChange={(e) => setCondoneReason(e.target.value)}
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: "13px", fontFamily: "inherit" }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button type="button" onClick={() => setCondoneModalTicket(null)} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingCondone}
                    onClick={handleCondoneSubmit}
                    style={{ padding: "8px 18px", borderRadius: "8px", border: "none", background: "#7c3aed", color: "#fff", fontWeight: 600, cursor: isSubmittingCondone ? "not-allowed" : "pointer" }}
                  >
                    {isSubmittingCondone ? "Saving..." : "Approve & Issue Hall Ticket"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal 3: Admit Card Preview */}
          {previewTicket && (
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "16px" }}>
              <div style={{ background: "#ffffff", borderRadius: "16px", padding: "24px", maxWidth: "800px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Admit Card Preview — {previewTicket.student_name}</h3>
                  <button type="button" onClick={() => setPreviewTicket(null)} style={{ background: "none", border: "none", fontSize: "18px", color: "#94a3b8", cursor: "pointer" }}>×</button>
                </div>

                {/* Printable Frame */}
                <div style={{ border: "2px solid #1e3a8a", padding: "20px", borderRadius: "8px", background: "#fff" }}>
                  <div style={{ textAlign: "center", borderBottom: "2px solid #1e3a8a", paddingBottom: "10px", marginBottom: "14px" }}>
                    <div style={{ fontSize: "16px", fontWeight: 800, color: "#1e3a8a", textTransform: "uppercase" }}>National Institute of Science &amp; Technology</div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>OFFICE OF THE CONTROLLER OF EXAMINATIONS • OFFICIAL HALL TICKET</div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>{previewTicket.exam_session_name} ({previewTicket.academic_year})</div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: "16px", marginBottom: "16px", fontSize: "12.5px" }}>
                    <div>
                      <div><strong>Candidate:</strong> {previewTicket.student_name}</div>
                      <div><strong>Roll No:</strong> {previewTicket.roll_no}</div>
                      <div><strong>Branch:</strong> {previewTicket.branch} (Sem {previewTicket.semester})</div>
                      <div><strong>Hall Ticket No:</strong> {previewTicket.hall_ticket_number}</div>
                      <div>
                        <strong>Attendance Status:</strong>{" "}
                        <span style={{ color: previewTicket.is_eligible ? "#15803d" : "#dc2626", fontWeight: 700 }}>
                          {previewTicket.calculated_attendance_pct}% {previewTicket.is_condoned && "(Condoned)"}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <QRCodeSVG value={`${window.location.origin}/verify-hallticket?token=${previewTicket.verification_token}`} size={90} />
                      <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>Official QR Verification</div>
                    </div>
                  </div>

                  {previewTicket.timetable && previewTicket.timetable.length > 0 && (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "14px", border: "1px solid #cbd5e1" }}>
                      <thead>
                        <tr style={{ background: "#f1f5f9" }}>
                          <th style={{ padding: "6px 8px" }}>Date</th>
                          <th style={{ padding: "6px 8px" }}>Time</th>
                          <th style={{ padding: "6px 8px" }}>Code</th>
                          <th style={{ padding: "6px 8px" }}>Course Title</th>
                          <th style={{ padding: "6px 8px" }}>Venue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewTicket.timetable.map((p, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                            <td style={{ padding: "6px 8px", fontWeight: 600 }}>{p.exam_date}</td>
                            <td style={{ padding: "6px 8px" }}>{p.start_time?.slice(0, 5)} - {p.end_time?.slice(0, 5)}</td>
                            <td style={{ padding: "6px 8px", fontWeight: 700, color: "#2563eb" }}>{p.subject_code}</td>
                            <td style={{ padding: "6px 8px" }}>{p.subject_name}</td>
                            <td style={{ padding: "6px 8px" }}>{p.hall_number}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <div style={{ fontSize: "11px", color: "#64748b", whiteSpace: "pre-wrap", borderTop: "1px solid #cbd5e1", paddingTop: "8px" }}>
                    {previewTicket.instructions}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
                  <button type="button" onClick={() => setPreviewTicket(null)} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer" }}>
                    Close Preview
                  </button>
                </div>
              </div>
            </div>
          )}
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