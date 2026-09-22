import { useEffect, useState } from "react";
import "../styles/attendence.css";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { getDailyAttendance, saveBulkAttendance } from "../services/studentservice";

function Attendance() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [attendance, setAttendance] = useState({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  useEffect(() => {
    let isMounted = true;
    getDailyAttendance(selectedDate)
      .then((res) => {
        if (!isMounted) return;
        const data = res.data || {};
        const records = data.records || [];
        setStudents(
          records.map((r) => ({
            id: r.student_id,
            name: r.name,
            roll_no: r.roll_no,
            branch: r.branch,
            year: r.year,
            semester: r.semester,
          }))
        );
        const map = {};
        records.forEach((r) => {
          map[r.student_id] = r.status || "Present";
        });
        setAttendance(map);
        setError(null);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Failed to load attendance from database:", err);
        setError("Could not load attendance from database. Please check connection.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedDate]);

  const handleStatusChange = (studentId, status) => {
    setAttendance((prev) => ({
      ...prev,
      [studentId]: status,
    }));
    setSaveSuccess(false);
  };

  const handleMarkAll = (status) => {
    const updated = {};
    students.forEach((s) => {
      updated[s.id] = status;
    });
    setAttendance(updated);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await saveBulkAttendance(selectedDate, attendance);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err) {
      console.error("Save attendance error:", err);
      setError("Failed to save attendance to database.");
      setTimeout(() => setError(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const presentCount = students.filter(
    (s) => (attendance[s.id] || "Present") === "Present"
  ).length;
  const absentCount = students.length - presentCount;
  const percentage = students.length > 0 ? Math.round((presentCount / students.length) * 100) : 0;

  return (
    <div className="sideandmain">
      <div className="Sidebarindashboard">
        <Sidebar />
      </div>

      <div className="main-content">
        <Navbar />

        <div className="attendance-page-content">
          <div className="attendance-header-row">
            <div>
              <h2 className="attendance-title">Daily Attendance Tracker</h2>
              <p className="attendance-subtitle">
                Mark and save student attendance for academic records
              </p>
            </div>

            <div className="date-picker-cont">
              <label htmlFor="att-date">Date:</label>
              <input
                id="att-date"
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setLoading(true);
                }}
                className="date-input"
              />
            </div>
          </div>

          {/* Stats Bar */}
          <div className="attendance-stats-bar">
            <div className="att-stat-pill total">
              <span>Total:</span> <strong>{students.length}</strong>
            </div>
            <div className="att-stat-pill present">
              <span>Present:</span> <strong>{presentCount}</strong>
            </div>
            <div className="att-stat-pill absent">
              <span>Absent:</span> <strong>{absentCount}</strong>
            </div>
            <div className="att-stat-pill rate">
              <span>Rate:</span> <strong>{percentage}%</strong>
            </div>

            <div className="att-bulk-actions">
              <button
                type="button"
                className="bulk-btn mark-all-present"
                onClick={() => handleMarkAll("Present")}
              >
                Mark All Present
              </button>
              <button
                type="button"
                className="bulk-btn mark-all-absent"
                onClick={() => handleMarkAll("Absent")}
              >
                Mark All Absent
              </button>
            </div>
          </div>

          {saveSuccess && (
            <div className="attendance-alert-success">
              ✓ Attendance for {selectedDate} saved successfully!
            </div>
          )}

          {error && <div className="attendance-alert-error">{error}</div>}

          {loading ? (
            <div className="attendance-loading">Loading students from database...</div>
          ) : (
            <div className="attendance-table-container">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th style={{ width: "80px" }}>Roll / ID</th>
                    <th>Student Name</th>
                    <th>Branch</th>
                    <th>Year / Sem</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {students.length > 0 ? (
                    students.map((student) => {
                      const currentStatus = attendance[student.id] || "Present";
                      const isPresent = currentStatus === "Present";
                      return (
                        <tr
                          key={student.id}
                          className={isPresent ? "row-present" : "row-absent"}
                        >
                          <td><strong>#{student.id}</strong></td>
                          <td className="student-name-cell">
                            <i className="fa-solid fa-user-graduate student-icon"></i>
                            {student.name}
                          </td>
                          <td>
                            <span className="branch-badge">{student.branch}</span>
                          </td>
                          <td>
                            Year {student.year} (Sem {student.semester})
                          </td>
                          <td>
                            <div className="status-toggle-group">
                              <button
                                type="button"
                                className={`toggle-btn ${isPresent ? "active-present" : ""}`}
                                onClick={() => handleStatusChange(student.id, "Present")}
                              >
                                Present
                              </button>
                              <button
                                type="button"
                                className={`toggle-btn ${!isPresent ? "active-absent" : ""}`}
                                onClick={() => handleStatusChange(student.id, "Absent")}
                              >
                                Absent
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="5" className="no-records">
                        No students found in the database. Please add students first.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {students.length > 0 && (
                <div className="save-btn-container">
                  <button className="save-btn" onClick={handleSave} disabled={isSaving}>
                    <i className={isSaving ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-floppy-disk"}></i>
                    <span>{isSaving ? " Saving..." : " Save Attendance"}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Attendance;