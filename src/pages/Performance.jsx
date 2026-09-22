import { useEffect, useState, useMemo } from "react";
import "../styles/performance.css";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { getAllPerformance } from "../services/studentservice";

function Performance() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let isMounted = true;
    getAllPerformance(selectedBranch)
      .then((res) => {
        if (!isMounted) return;
        setStudents(res.data || []);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Failed to load performance records:", err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedBranch]);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const matchQuery =
        !searchQuery.trim() ||
        (s.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(s.student_id || s.id).includes(searchQuery) ||
        (s.roll_no && s.roll_no.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchQuery;
    });
  }, [students, searchQuery]);

  return (
    <div className="sideandmain">
      <div className="Sidebarindashboard">
        <Sidebar />
      </div>

      <div className="main-content">
        <Navbar />

        <div className="performance-page-container">
          <div className="performance-header-row">
            <div>
              <h2>Student Academic Performance</h2>
              <p>Subject evaluation, average GPA calculations, and grade distribution</p>
            </div>
          </div>

          <div className="performance-box">
            <div className="filter-section">
              <div className="filter-item">
                <label>Filter by Branch:</label>
                <select
                  value={selectedBranch}
                  onChange={(e) => {
                    setSelectedBranch(e.target.value);
                    setLoading(true);
                  }}
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

              <div className="search-item">
                <label>Search Student:</label>
                <div className="perf-search-input">
                  <i className="fa-solid fa-magnifying-glass"></i>
                  <input
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
                Loading academic scores from database...
              </div>
            ) : (
              <div className="table-responsive">
                <table className="performance-table">
                  <thead>
                    <tr>
                      <th>Roll No / ID</th>
                      <th>Student Name</th>
                      <th>Branch</th>
                      <th>Mathematics</th>
                      <th>Data Struct / Sci</th>
                      <th>Tech Elective</th>
                      <th>Average (%)</th>
                      <th>Overall Grade</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.length > 0 ? (
                      filtered.map((item) => (
                        <tr key={item.student_id || item.id}>
                          <td>
                            <strong>{item.roll_no || `#${item.student_id || item.id}`}</strong>
                          </td>
                          <td className="perf-student-name">
                            <span className="perf-dot"></span>
                            {item.name}
                          </td>
                          <td>
                            <span className="perf-branch">{item.branch}</span>
                          </td>
                          <td>{item.maths} / 100</td>
                          <td>{item.science} / 100</td>
                          <td>{item.coding} / 100</td>
                          <td>
                            <strong>{item.avg}%</strong>
                          </td>
                          <td>
                            <span className={`grade-badge ${item.gradeClass}`}>
                              {item.grade}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan="8"
                          style={{
                            textAlign: "center",
                            padding: "35px",
                            color: "#94a3b8",
                          }}
                        >
                          No student records match the selected criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Performance;