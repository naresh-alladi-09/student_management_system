import { useEffect, useState } from "react";
import "../styles/dashboardcard.css";
import { FaUserGraduate, FaClipboardCheck, FaBook, FaChartLine } from "react-icons/fa";
import {
  getStudents,
  getAttendanceSummary,
  getAllPerformance,
} from "../services/studentservice";

function DashboardCard({ studentCount: externalCount }) {
  const [internalCount, setInternalCount] = useState(0);
  const [branchList, setBranchList] = useState([]);
  const [presentToday, setPresentToday] = useState(0);
  const [attendanceRate, setAttendanceRate] = useState(0);
  const [avgScore, setAvgScore] = useState("—");
  const [topBranch, setTopBranch] = useState("—");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      getStudents().catch(() => ({ data: [] })),
      getAttendanceSummary().catch(() => ({ data: null })),
      getAllPerformance("ALL").catch(() => ({ data: [] })),
    ])
      .then(([studentsRes, attRes, perfRes]) => {
        if (!isMounted) return;

        const students = studentsRes.data || [];
        setInternalCount(students.length);

        const branches = Array.from(
          new Set(students.map((s) => s.branch?.toUpperCase()).filter(Boolean))
        );
        setBranchList(branches);

        if (attRes.data) {
          setPresentToday(attRes.data.present_today || 0);
          setAttendanceRate(attRes.data.attendance_rate || 0);
        }

        const perfData = perfRes.data || [];
        if (perfData.length > 0) {
          const totalAvg =
            perfData.reduce((acc, curr) => acc + (parseFloat(curr.avg) || 0), 0) /
            perfData.length;
          setAvgScore(totalAvg.toFixed(1));

          // Compute top branch by average
          const branchMap = {};
          perfData.forEach((p) => {
            const b = p.branch?.toUpperCase() || "GENERAL";
            if (!branchMap[b]) branchMap[b] = { sum: 0, count: 0 };
            branchMap[b].sum += parseFloat(p.avg) || 0;
            branchMap[b].count += 1;
          });

          let bestBranch = "—";
          let highestAvg = 0;
          Object.entries(branchMap).forEach(([b, stats]) => {
            const bAvg = stats.sum / stats.count;
            if (bAvg > highestAvg) {
              highestAvg = bAvg;
              bestBranch = b;
            }
          });
          setTopBranch(bestBranch);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const studentCount = externalCount !== undefined ? externalCount : internalCount;

  return (
    <div className="dashboard-cards">
      {/* Card 1: Total Students */}
      <div className="card">
        <div className="icon students">
          <FaUserGraduate size={28} color="#fff" />
        </div>
        <div className="text">
          <h3>Total Students</h3>
          <h1>{loading ? "..." : studentCount}</h1>
          <span className="card-subtext">Active database records</span>
        </div>
      </div>

      {/* Card 2: Attendance */}
      <div className="card">
        <div className="icon attendance">
          <FaClipboardCheck size={28} color="#fff" />
        </div>
        <div className="text">
          <h3>Present Today</h3>
          <h1>{loading ? "..." : presentToday}</h1>
          <span className="card-subtext">
            {studentCount > 0
              ? `${attendanceRate}% active rate`
              : "No records today"}
          </span>
        </div>
      </div>

      {/* Card 3: Branches / Departments */}
      <div className="card">
        <div className="icon subjects">
          <FaBook size={28} color="#fff" />
        </div>
        <div className="text">
          <h3>Active Branches</h3>
          <h1>{loading ? "..." : branchList.length}</h1>
          <span className="card-subtext">
            {branchList.length > 0
              ? branchList.slice(0, 4).join(", ")
              : "No active branches"}
          </span>
        </div>
      </div>

      {/* Card 4: Academic Performance */}
      <div className="card">
        <div className="icon performance">
          <FaChartLine size={28} color="#fff" />
        </div>
        <div className="text">
          <h3>Average Score</h3>
          <h1>{loading ? "..." : `${avgScore}%`}</h1>
          <span className="card-subtext">Top branch: {topBranch}</span>
        </div>
      </div>
    </div>
  );
}

export default DashboardCard;