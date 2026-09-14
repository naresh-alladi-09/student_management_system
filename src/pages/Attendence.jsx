import React, { useEffect, useState } from "react";
import "../styles/attendence.css";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { getStudents } from "../services/studentservice";

function Attendance() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attendance, setAttendance] = useState({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        setLoading(true);
        const response = await getStudents();
        const studentList = response.data || [];
        setStudents(studentList);

        // Load saved attendance from localStorage for current date if available
        const saved = localStorage.getItem(`attendance_${selectedDate}`);
        if (saved) {
          try {
            setAttendance(JSON.parse(saved));
          } catch {
            // Default all to Present
            const initial = {};
            studentList.forEach((s) => {
              initial[s.id] = "Present";
            });
            setAttendance(initial);
          }
        } else {
          // Default all to Present
          const initial = {};
          studentList.forEach((s) => {
            initial[s.id] = "Present";
          });
          setAttendance(initial);
        }
      } catch (err) {
        console.error("Failed to load students for attendance:", err);
        setError("Failed to load students from database.");
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
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

  const handleSave = () => {
    localStorage.setItem(`attendance_${selectedDate}`, JSON.stringify(attendance));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
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
                onChange={(e) => setSelectedDate(e.target.value)}
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
                    students.map((student, index) => {
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
                  <button className="save-btn" onClick={handleSave}>
                    <i className="fa-solid fa-floppy-disk"></i> Save Attendance
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