import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Dashboardcard from "../components/Dashboardcard";
import Navbar from "../components/Navbar";
import "../styles/dashboard.css";
import { Link } from "react-router-dom";
import { getStudents } from "../services/studentservice";

const Dashboard = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    getStudents()
      .then((res) => {
        if (isMounted) setStudents(res.data || []);
      })
      .catch((err) => {
        console.error("Dashboard failed to fetch students:", err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const recentStudents = students.slice(0, 5);

  return (
    <div className="sideandmain">
      <div className="Sidebarindashboard">
        <Sidebar />
      </div>
      <div className="main-content">
        <Navbar />

        <div className="dashboard-body">
          <Dashboardcard studentCount={students.length} />

          {/* Quick Actions & Recent Students */}
          <div className="dashboard-grid-layout">
            <div className="dashboard-panel recent-students-panel">
              <div className="panel-header">
                <h3>Recently Registered Students</h3>
                <Link to="/students" className="panel-link">
                  View All ({students.length}) →
                </Link>
              </div>

              {loading ? (
                <div className="panel-loading">Loading students...</div>
              ) : recentStudents.length > 0 ? (
                <div className="panel-table-wrap">
                  <table className="recent-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Branch</th>
                        <th>Year</th>
                        <th>Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentStudents.map((s) => (
                        <tr key={s.id}>
                          <td><strong>#{s.id}</strong></td>
                          <td>
                            <div className="student-name-pill">
                              <span className="avatar-dot">{s.name ? s.name[0].toUpperCase() : "S"}</span>
                              {s.name}
                            </div>
                          </td>
                          <td>
                            <span className="dash-branch-badge">{s.branch}</span>
                          </td>
                          <td>Year {s.year}</td>
                          <td>{s.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="panel-empty">
                  <p>No students registered yet.</p>
                  <Link to="/AddStudents" className="action-btn-primary">
                    + Add First Student
                  </Link>
                </div>
              )}
            </div>

            <div className="dashboard-panel quick-actions-panel">
              <div className="panel-header">
                <h3>Quick Actions</h3>
              </div>

              <div className="quick-action-cards">
                <Link to="/AddStudents" className="quick-action-item">
                  <div className="quick-icon add">
                    <i className="fa-solid fa-user-plus"></i>
                  </div>
                  <div className="quick-text">
                    <h4>Add Student</h4>
                    <p>Register a new student</p>
                  </div>
                </Link>

                <Link to="/students" className="quick-action-item">
                  <div className="quick-icon list">
                    <i className="fa-solid fa-users"></i>
                  </div>
                  <div className="quick-text">
                    <h4>All Students</h4>
                    <p>Edit or delete records</p>
                  </div>
                </Link>

                <Link to="/attendence" className="quick-action-item">
                  <div className="quick-icon att">
                    <i className="fa-regular fa-calendar-check"></i>
                  </div>
                  <div className="quick-text">
                    <h4>Take Attendance</h4>
                    <p>Mark daily status</p>
                  </div>
                </Link>

                <Link to="/performance" className="quick-action-item">
                  <div className="quick-icon perf">
                    <i className="fa-solid fa-chart-pie"></i>
                  </div>
                  <div className="quick-text">
                    <h4>Performance</h4>
                    <p>Grades & academic marks</p>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;