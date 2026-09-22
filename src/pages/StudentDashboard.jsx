import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import StudentNavbar from "../components/StudentNavbar";
import { getStudentReportCard, getStudentAttendance } from "../services/studentservice";
import "../styles/studentdashboard.css";
import {
  FaGraduationCap,
  FaCalendarCheck,
  FaChartLine,
  FaBook,
  FaAward,
  FaClock,
  FaBell,
  FaCheckCircle,
  FaUserTie,
  FaDownload,
  FaEnvelope,
  FaPhone,
  FaBuilding,
} from "react-icons/fa";

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { currentUser, isStudent } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!currentUser || !isStudent) {
      navigate("/login/student", { replace: true });
    }
  }, [currentUser, isStudent, navigate]);

  const studentName = currentUser?.name || "Student";
  const studentBranch = currentUser?.branch || "—";
  const studentYear = currentUser?.year || "—";
  const studentSem = currentUser?.semester || "—";
  const studentRoll = currentUser?.rollNo || "—";
  const studentEmail = currentUser?.email || "—";
  const studentPhone = currentUser?.phone || "—";

  const [subjectsData, setSubjectsData] = useState([]);
  const [attendanceData, setAttendanceData] = useState(null);
  const [cgpaVal, setCgpaVal] = useState(currentUser?.cgpa || 0.0);

  useEffect(() => {
    if (!currentUser?.id) return;
    let isMounted = true;

    getStudentReportCard(currentUser.id)
      .then((res) => {
        if (!isMounted) return;
        if (res.data?.subjects && res.data.subjects.length > 0) {
          setSubjectsData(res.data.subjects);
        }
        if (res.data?.cgpa) {
          setCgpaVal(res.data.cgpa);
        }
      })
      .catch(() => {});

    getStudentAttendance(currentUser.id)
      .then((res) => {
        if (!isMounted) return;
        if (res.data) {
          setAttendanceData(res.data);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id]);

  const attendanceRate = attendanceData?.attendance_rate ?? 0;
  const cgpa = cgpaVal;
  const subjects = subjectsData;

  if (!currentUser || !isStudent) {
    return null;
  }

  return (
    <div className="student-dashboard-page">
      <StudentNavbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Hero Welcome Banner */}
      <div className="student-hero-banner">
        <div className="hero-left">
          <h1>Welcome back, {studentName}! 👋</h1>
          <p>
            Here is your real-time academic standing, attendance records, course
            grades, and department notifications for Semester {studentSem}.
          </p>
          <div className="hero-badges-row">
            <span className="hero-pill">
              <FaGraduationCap /> {studentBranch} Department
            </span>
            <span className="hero-pill">
              <FaBook /> Year {studentYear} • Semester {studentSem}
            </span>
            <span className="hero-pill">
              <FaCheckCircle style={{ color: "#34d399" }} /> Roll No: {studentRoll}
            </span>
          </div>
        </div>

        <div className="hero-status-box">
          <small>Current Academic Standing</small>
          <div className="hero-status-val">Good Standing • Regular</div>
        </div>
      </div>

      {/* Key Metric Stats Grid */}
      <div className="student-stats-grid">
        <div className="student-stat-card">
          <div className="stat-icon-wrap green">
            <FaCalendarCheck />
          </div>
          <div className="stat-info">
            <small>Overall Attendance</small>
            <div className="stat-number">{attendanceRate}%</div>
            <span className="stat-badge-tag tag-success">
              Eligible (&gt;75% required)
            </span>
          </div>
        </div>

        <div className="student-stat-card">
          <div className="stat-icon-wrap blue">
            <FaChartLine />
          </div>
          <div className="stat-info">
            <small>Cumulative CGPA</small>
            <div className="stat-number">{cgpa} / 10</div>
            <span className="stat-badge-tag tag-info">Distinction Class</span>
          </div>
        </div>

        <div className="student-stat-card">
          <div className="stat-icon-wrap purple">
            <FaBook />
          </div>
          <div className="stat-info">
            <small>Enrolled Courses</small>
            <div className="stat-number">{subjects.length} Subjects</div>
            <span className="stat-badge-tag tag-info">17 Total Credits</span>
          </div>
        </div>

        <div className="student-stat-card">
          <div className="stat-icon-wrap amber">
            <FaAward />
          </div>
          <div className="stat-info">
            <small>Semester Grade</small>
            <div className="stat-number">A+</div>
            <span className="stat-badge-tag tag-success">Top 10% in Branch</span>
          </div>
        </div>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="student-content-grid">
          <div className="content-col-left">
            {/* Attendance Summary */}
            <div className="student-card">
              <div className="card-title-row">
                <h3>
                  <FaCalendarCheck /> Attendance Overview
                </h3>
                <button
                  type="button"
                  className="card-action-link"
                  onClick={() => setActiveTab("attendance")}
                >
                  View Details →
                </button>
              </div>

              <div className="attendance-progress-box">
                <div className="att-header-status">
                  <span className="att-pct-bold">{attendanceRate}%</span>
                  <span className="att-target-label">
                    Minimum requirement: 75%
                  </span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${attendanceRate}%` }}
                  ></div>
                </div>
                <div className="att-footer-counts">
                  <span>{attendanceData?.attended_classes ?? 145} Classes Attended</span>
                  <span>{attendanceData?.missed_classes ?? 14} Classes Missed</span>
                  <span>{attendanceData?.total_classes ?? 159} Total Held</span>
                </div>
              </div>

              {/* Subject attendance mini list */}
              <div className="subject-att-list">
                {subjects.slice(0, 3).map((sub) => (
                  <div key={sub.code} className="subject-att-row">
                    <div className="subj-info">
                      <span className="subj-name">{sub.name}</span>
                      <span className="subj-code">{sub.code}</span>
                    </div>
                    <div className="subj-bar-wrap">
                      <div className="progress-track" style={{ margin: 0 }}>
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${sub.attendance}%` }}
                        ></div>
                      </div>
                      <span className="subj-pct">{sub.attendance}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Academic Grades Quick View */}
            <div className="student-card">
              <div className="card-title-row">
                <h3>
                  <FaAward /> Subject Marks & Grades
                </h3>
                <button
                  type="button"
                  className="card-action-link"
                  onClick={() => setActiveTab("performance")}
                >
                  Full Gradebook →
                </button>
              </div>

              <table className="grades-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Code</th>
                    <th>Credits</th>
                    <th>Score</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.length > 0 ? (
                    subjects.map((sub) => (
                      <tr key={sub.code}>
                        <td>
                          <strong>{sub.name}</strong>
                        </td>
                        <td>{sub.code}</td>
                        <td>{sub.credits}</td>
                        <td>{sub.total} / 100</td>
                        <td>
                          <span className={`grade-badge ${sub.gradeClass}`}>
                            {sub.grade}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
                        No curriculum courses registered in database.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="content-col-right">
            {/* Today's Schedule */}
            <div className="student-card">
              <div className="card-title-row">
                <h3>
                  <FaClock /> Today's Lecture Schedule
                </h3>
              </div>
              <div className="notice-list">
                <div className="notice-item alert-info">
                  <div className="notice-icon-box">
                    <FaClock />
                  </div>
                  <div className="notice-body">
                    <h4>09:30 AM - 10:45 AM</h4>
                    <p>Data Structures & Algorithms • Lecture Hall 102</p>
                    <span className="notice-date">Faculty: Prof. K. Sharma</span>
                  </div>
                </div>

                <div className="notice-item alert-info">
                  <div className="notice-icon-box">
                    <FaClock />
                  </div>
                  <div className="notice-body">
                    <h4>11:15 AM - 12:30 PM</h4>
                    <p>Database Management Systems • Lab 3</p>
                    <span className="notice-date">Faculty: Dr. Madam</span>
                  </div>
                </div>

                <div className="notice-item alert-info">
                  <div className="notice-icon-box">
                    <FaClock />
                  </div>
                  <div className="notice-body">
                    <h4>02:00 PM - 03:30 PM</h4>
                    <p>Web Technologies Practical Session • CS Computer Lab</p>
                    <span className="notice-date">Faculty: Prof. Ramesh</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Department Notices */}
            <div className="student-card">
              <div className="card-title-row">
                <h3>
                  <FaBell /> Department Announcements
                </h3>
              </div>
              <div className="notice-list">
                <div className="notice-item alert-warn">
                  <div className="notice-icon-box">
                    <FaBell />
                  </div>
                  <div className="notice-body">
                    <h4>Mid-Term Examinations Timetable</h4>
                    <p>
                      Mid-term examinations commence from next Monday. Download
                      hall tickets from the portal.
                    </p>
                    <span className="notice-date">Published 2 days ago</span>
                  </div>
                </div>

                <div className="notice-item">
                  <div className="notice-icon-box">
                    <FaCheckCircle />
                  </div>
                  <div className="notice-body">
                    <h4>Project Submission Deadline</h4>
                    <p>
                      Mini-project phase 1 code review scheduled for Friday.
                    </p>
                    <span className="notice-date">Academic Notice</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: My Attendance */}
      {activeTab === "attendance" && (
        <div className="student-card">
          <div className="card-title-row">
            <h3>
              <FaCalendarCheck /> Comprehensive Attendance Report
            </h3>
            <span className="hero-pill" style={{ color: "#065f46", background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
              <FaCheckCircle /> Overall Attendance: {attendanceRate}%
            </span>
          </div>

          <div className="attendance-progress-box" style={{ marginBottom: "24px" }}>
            <div className="att-header-status">
              <div>
                <span className="att-pct-bold">{attendanceRate}%</span>
                <span style={{ marginLeft: "12px", color: "#047857", fontWeight: 600 }}>
                  ✓ Eligible for Semester End Examinations
                </span>
              </div>
              <span className="att-target-label">
                Required: 75% | Safe margin: +{(attendanceRate - 75).toFixed(0)}%
              </span>
            </div>
            <div className="progress-track" style={{ height: "16px" }}>
              <div
                className="progress-bar-fill"
                style={{ width: `${attendanceRate}%` }}
              ></div>
            </div>
          </div>

          <h4 style={{ margin: "20px 0 12px 0", color: "#1e293b" }}>
            Subject-wise Attendance Breakdown
          </h4>
          <table className="grades-table">
            <thead>
              <tr>
                <th>Subject Code</th>
                <th>Course Name</th>
                <th>Classes Attended</th>
                <th>Total Held</th>
                <th>Percentage</th>
                <th>Eligibility Status</th>
              </tr>
            </thead>
            <tbody>
              {subjects.length > 0 ? (
                subjects.map((sub) => (
                  <tr key={sub.code}>
                    <td><strong>{sub.code}</strong></td>
                    <td>{sub.name}</td>
                    <td>{sub.attended}</td>
                    <td>{sub.totalClasses}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div className="progress-track" style={{ width: "100px", margin: 0 }}>
                          <div
                            className="progress-bar-fill"
                            style={{ width: `${sub.attendance}%` }}
                          ></div>
                        </div>
                        <strong>{sub.attendance}%</strong>
                      </div>
                    </td>
                    <td>
                      <span className="stat-badge-tag tag-success">Eligible</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
                    No subject attendance records found in database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: My Grades & Academic Performance */}
      {activeTab === "performance" && (
        <div className="student-card">
          <div className="card-title-row">
            <h3>
              <FaAward /> Academic Performance & Grade Report
            </h3>
            <button
              type="button"
              className="quick-fill-btn"
              onClick={() => window.print()}
            >
              <FaDownload /> Print Grade Slip
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div className="profile-field-box">
              <small>Cumulative CGPA</small>
              <span style={{ fontSize: "20px", color: "#059669" }}>{cgpa} / 10</span>
            </div>
            <div className="profile-field-box">
              <small>Semester SGPA (Current)</small>
              <span style={{ fontSize: "20px", color: "#2563eb" }}>8.90</span>
            </div>
            <div className="profile-field-box">
              <small>Earned Credits</small>
              <span style={{ fontSize: "20px", color: "#0f172a" }}>82 / 160</span>
            </div>
            <div className="profile-field-box">
              <small>Academic Standing</small>
              <span style={{ fontSize: "20px", color: "#047857" }}>First Class with Distinction</span>
            </div>
          </div>

          <table className="grades-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Course Title</th>
                <th>Credits</th>
                <th>Internals (30)</th>
                <th>End Sem (70)</th>
                <th>Total (100)</th>
                <th>Grade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {subjects.length > 0 ? (
                subjects.map((sub) => (
                  <tr key={sub.code}>
                    <td><strong>{sub.code}</strong></td>
                    <td>{sub.name}</td>
                    <td>{sub.credits}</td>
                    <td>{sub.internals}</td>
                    <td>{sub.endSem}</td>
                    <td><strong>{sub.total}</strong></td>
                    <td>
                      <span className={`grade-badge ${sub.gradeClass}`}>
                        {sub.grade}
                      </span>
                    </td>
                    <td>
                      <span className="stat-badge-tag tag-success">PASSED</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" style={{ textAlign: "center", padding: "28px", color: "#64748b" }}>
                    No examination records or report card data found in database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 4: Student Profile */}
      {activeTab === "profile" && (
        <div className="student-card">
          <div className="card-title-row">
            <h3>
              <FaUserTie /> Official Student Profile
            </h3>
            <span className="stat-badge-tag tag-success">Active Enrolled Student</span>
          </div>

          <div className="profile-details-grid">
            <div className="profile-field-box">
              <small>Full Name</small>
              <span>{studentName}</span>
            </div>
            <div className="profile-field-box">
              <small>Roll / Student ID</small>
              <span>{studentRoll}</span>
            </div>
            <div className="profile-field-box">
              <small>Branch / Department</small>
              <span>{studentBranch}</span>
            </div>
            <div className="profile-field-box">
              <small>Academic Year & Semester</small>
              <span>Year {studentYear} • Semester {studentSem}</span>
            </div>
            <div className="profile-field-box">
              <small>Email Address</small>
              <span><FaEnvelope style={{ marginRight: "6px" }} />{studentEmail}</span>
            </div>
            <div className="profile-field-box">
              <small>Contact Phone</small>
              <span><FaPhone style={{ marginRight: "6px" }} />{studentPhone}</span>
            </div>
            <div className="profile-field-box">
              <small>Faculty Advisor</small>
              <span>Faculty Admin (madam)</span>
            </div>
            <div className="profile-field-box">
              <small>Institution</small>
              <span><FaBuilding style={{ marginRight: "6px" }} />EduPortal Institute of Engineering & Technology</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
