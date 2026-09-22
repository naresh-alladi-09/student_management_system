import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import {
  getStudents,
  getSystemUsers,
  createSystemUser,
  getAuditLogs,
  getAllSubjects,
} from "../services/studentservice";
import {
  FaUserShield,
  FaUserGraduate,
  FaChalkboardTeacher,
  FaBook,
  FaHistory,
  FaPlusCircle,
  FaBuilding,
  FaCheckCircle,
  FaTimes,
} from "react-icons/fa";

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    totalSubjects: 0,
    activeDepartments: 0,
  });
  const [recentLogs, setRecentLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [activeTab, setActiveTab] = useState("overview"); // 'overview' | 'users' | 'audit' | 'subjects'
  const [loading, setLoading] = useState(true);

  // New User Modal
  const [showUserModal, setShowUserModal] = useState(false);
  const [userFormData, setUserFormData] = useState({
    username: "",
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    role: "teacher",
    department: "Computer Science & Engineering",
  });
  const [userModalMessage, setUserModalMessage] = useState(null);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  const fetchAdminData = () => {
    setLoading(true);
    Promise.all([
      getStudents({ all: "true" }).catch(() => ({ data: [] })),
      getSystemUsers().catch(() => ({ data: [] })),
      getAllSubjects().catch(() => ({ data: [] })),
      getAuditLogs().catch(() => ({ data: { logs: [] } })),
    ])
      .then(([stuRes, usersRes, subRes, auditRes]) => {
        const studentList = stuRes.data?.results || stuRes.data || [];
        const userList = usersRes.data || [];
        const subjectList = subRes.data || [];
        const logsList = auditRes.data?.logs || [];

        const depts = new Set([
          ...studentList.map((s) => s.branch),
          ...subjectList.map((s) => s.department),
        ]);

        const teachers = userList.filter((u) => u.profile?.role === "teacher");

        setStats({
          totalStudents: studentList.length,
          totalTeachers: teachers.length || 1,
          totalSubjects: subjectList.length,
          activeDepartments: depts.size || 5,
        });

        setUsers(userList);
        setSubjects(subjectList);
        setRecentLogs(logsList);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleCreateUser = async (e) => {
    if (e) e.preventDefault();
    setIsSubmittingUser(true);
    setUserModalMessage(null);

    try {
      await createSystemUser(userFormData);
      setUserModalMessage({
        success: true,
        text: `User "${userFormData.username}" provisioned successfully!`,
      });
      fetchAdminData();
      setTimeout(() => {
        setShowUserModal(false);
        setUserModalMessage(null);
        setUserFormData({
          username: "",
          email: "",
          password: "",
          first_name: "",
          last_name: "",
          role: "teacher",
          department: "Computer Science & Engineering",
        });
      }, 1500);
    } catch (err) {
      setUserModalMessage({
        success: false,
        text: err.response?.data?.detail || "Failed to create user.",
      });
    } finally {
      setIsSubmittingUser(false);
    }
  };

  return (
    <div className="sideandmain">
      <div className="Sidebarindashboard">
        <Sidebar />
      </div>

      <div className="main-content">
        <Navbar />

        <div style={{ padding: "28px" }}>
          {/* Header Banner */}
          <div
            style={{
              background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
              color: "#fff",
              padding: "28px",
              borderRadius: "16px",
              marginBottom: "28px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 12px",
                  background: "rgba(255,255,255,0.1)",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                <FaUserShield /> System Administration Console
              </div>
              <h1 style={{ margin: "0 0 6px 0", fontSize: "26px" }}>
                Institutional Governance & Audit Control
              </h1>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "14px" }}>
                Manage faculty credentials, academic departments, courses catalog, and inspect audit logs.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowUserModal(true)}
              style={{
                background: "#2563eb",
                color: "#fff",
                border: "none",
                padding: "12px 20px",
                borderRadius: "10px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <FaPlusCircle /> Provision Faculty Account
            </button>
          </div>

          {/* Metric Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "20px",
              marginBottom: "28px",
            }}
          >
            <div
              style={{
                background: "#fff",
                padding: "20px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  background: "#eff6ff",
                  color: "#2563eb",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                }}
              >
                <FaUserGraduate />
              </div>
              <div>
                <small style={{ color: "#64748b" }}>Enrolled Students</small>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a" }}>
                  {loading ? "..." : stats.totalStudents}
                </div>
              </div>
            </div>

            <div
              style={{
                background: "#fff",
                padding: "20px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  background: "#ecfdf5",
                  color: "#059669",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                }}
              >
                <FaChalkboardTeacher />
              </div>
              <div>
                <small style={{ color: "#64748b" }}>Faculty Members</small>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a" }}>
                  {loading ? "..." : stats.totalTeachers}
                </div>
              </div>
            </div>

            <div
              style={{
                background: "#fff",
                padding: "20px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  background: "#fef3c7",
                  color: "#d97706",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                }}
              >
                <FaBook />
              </div>
              <div>
                <small style={{ color: "#64748b" }}>Curriculum Subjects</small>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a" }}>
                  {loading ? "..." : stats.totalSubjects}
                </div>
              </div>
            </div>

            <div
              style={{
                background: "#fff",
                padding: "20px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  background: "#f3e8ff",
                  color: "#7c3aed",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                }}
              >
                <FaBuilding />
              </div>
              <div>
                <small style={{ color: "#64748b" }}>Academic Departments</small>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a" }}>
                  {loading ? "..." : stats.activeDepartments}
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px" }}>
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "overview" ? "#0f172a" : "#f1f5f9",
                color: activeTab === "overview" ? "#fff" : "#475569",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Recent Audit Activity
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("users")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "users" ? "#0f172a" : "#f1f5f9",
                color: activeTab === "users" ? "#fff" : "#475569",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              System Users & Faculty ({users.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("subjects")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "subjects" ? "#0f172a" : "#f1f5f9",
                color: activeTab === "subjects" ? "#fff" : "#475569",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Curriculum Courses ({subjects.length})
            </button>
          </div>

          {/* Tab 1: Audit Activity */}
          {activeTab === "overview" && (
            <div
              style={{
                background: "#fff",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                padding: "20px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>
                  <FaHistory style={{ marginRight: "8px", color: "#2563eb" }} />
                  Security & Operations Audit Trail
                </h3>
              </div>

              <div className="table-responsive">
                <table className="grades-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>Entity</th>
                      <th>Details</th>
                      <th>IP Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLogs.length > 0 ? (
                      recentLogs.map((log) => (
                        <tr key={log.id}>
                          <td style={{ fontSize: "12px", color: "#64748b" }}>
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td>
                            <strong>{log.username || "System"}</strong>
                          </td>
                          <td>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontSize: "11px",
                                fontWeight: 700,
                                background: "#eff6ff",
                                color: "#1e40af",
                              }}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td>{log.entity}</td>
                          <td style={{ fontSize: "13px" }}>{log.description}</td>
                          <td style={{ fontSize: "12px", color: "#94a3b8" }}>
                            {log.ip_address || "127.0.0.1"}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                          No audit entries recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 2: Users & Faculty */}
          {activeTab === "users" && (
            <div
              style={{
                background: "#fff",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                padding: "20px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>
                  Authorized System Users
                </h3>
              </div>

              <table className="grades-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Username</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>#{u.id}</td>
                      <td>
                        <strong>{u.username}</strong>
                      </td>
                      <td>{u.first_name ? `${u.first_name} ${u.last_name}` : u.username}</td>
                      <td>
                        <span
                          className={`stat-badge-tag ${
                            u.profile?.role === "admin"
                              ? "tag-danger"
                              : u.profile?.role === "teacher"
                              ? "tag-info"
                              : "tag-success"
                          }`}
                        >
                          {u.profile?.role?.toUpperCase() || "USER"}
                        </span>
                      </td>
                      <td>{u.profile?.department || "Academic"}</td>
                      <td>{u.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 3: Subjects */}
          {activeTab === "subjects" && (
            <div
              style={{
                background: "#fff",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                padding: "20px",
              }}
            >
              <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#0f172a" }}>
                Curriculum Subjects Catalog
              </h3>
              <table className="grades-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Course Title</th>
                    <th>Credits</th>
                    <th>Branch</th>
                    <th>Semester</th>
                    <th>Department</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((sub) => (
                    <tr key={sub.id}>
                      <td>
                        <strong>{sub.code}</strong>
                      </td>
                      <td>{sub.name}</td>
                      <td>{sub.credits}</td>
                      <td>{sub.branch}</td>
                      <td>Sem {sub.semester}</td>
                      <td>{sub.department}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create User Modal */}
        {showUserModal && (
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
                background: "#fff",
                borderRadius: "16px",
                padding: "28px",
                maxWidth: "480px",
                width: "100%",
                position: "relative",
              }}
            >
              <button
                type="button"
                onClick={() => setShowUserModal(false)}
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

              <h3 style={{ margin: "0 0 6px 0", fontSize: "20px", color: "#0f172a" }}>
                Provision Faculty / Admin Account
              </h3>
              <p style={{ margin: "0 0 16px 0", color: "#64748b", fontSize: "14px" }}>
                Create login credentials for institutional staff or faculty members.
              </p>

              {userModalMessage && (
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    marginBottom: "16px",
                    background: userModalMessage.success ? "#ecfdf5" : "#fef2f2",
                    color: userModalMessage.success ? "#047857" : "#b91c1c",
                    fontSize: "14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <FaCheckCircle /> {userModalMessage.text}
                </div>
              )}

              <form onSubmit={handleCreateUser}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label
                      htmlFor="user-username-input"
                      style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}
                    >
                      Username *
                    </label>
                    <input
                      id="user-username-input"
                      type="text"
                      placeholder="e.g. prof_sharma"
                      value={userFormData.username}
                      required
                      onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="user-role-select"
                      style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}
                    >
                      Role *
                    </label>
                    <select
                      id="user-role-select"
                      value={userFormData.role}
                      onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                    >
                      <option value="teacher">Teacher / Faculty</option>
                      <option value="admin">System Administrator</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label
                    htmlFor="user-email-input"
                    style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}
                  >
                    Staff Email *
                  </label>
                  <input
                    id="user-email-input"
                    type="email"
                    placeholder="e.g. sharma@eduportal.com"
                    value={userFormData.email}
                    required
                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label
                    htmlFor="user-password-input"
                    style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}
                  >
                    Password *
                  </label>
                  <input
                    id="user-password-input"
                    type="password"
                    placeholder="Create secure password"
                    value={userFormData.password}
                    required
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label
                    htmlFor="user-dept-input"
                    style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}
                  >
                    Department
                  </label>
                  <input
                    id="user-dept-input"
                    type="text"
                    value={userFormData.department}
                    onChange={(e) => setUserFormData({ ...userFormData, department: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setShowUserModal(false)}
                    style={{
                      flex: 1,
                      padding: "10px",
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
                    disabled={isSubmittingUser}
                    style={{
                      flex: 2,
                      padding: "10px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#2563eb",
                      color: "#fff",
                      fontWeight: 600,
                      cursor: isSubmittingUser ? "not-allowed" : "pointer",
                    }}
                  >
                    {isSubmittingUser ? "Creating..." : "Create Account"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
