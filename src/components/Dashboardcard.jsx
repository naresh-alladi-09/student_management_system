import { useEffect, useState } from "react";
import "../styles/dashboardcard.css";
import { FaUserGraduate, FaClipboardCheck, FaBook, FaChartLine } from "react-icons/fa";
import {
  getStudents,
  getAttendanceSummary,
  getAllPerformance,
  getPerformanceSummary,
  getBranches,
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
      getBranches().catch(() => ({ data: [] })),
      getAttendanceSummary().catch(() => ({ data: null })),
      getPerformanceSummary().catch(() => ({ data: null })),
      getAllPerformance("ALL").catch(() => ({ data: [] })),
    ])
      .then(([studentsRes, branchesRes, attRes, perfSummaryRes, perfRes]) => {
        if (!isMounted) return;

        // 1. Total Students & Active Branches
        const studentList = Array.isArray(studentsRes.data)
          ? studentsRes.data
          : (studentsRes.data?.results || []);
        const totalCountFromApi = studentsRes.data?.count ?? studentList.length;
        setInternalCount(totalCountFromApi);

        const branchListFromApi = Array.isArray(branchesRes.data)
          ? branchesRes.data
          : (branchesRes.data?.results || []);
        const apiBranches = branchListFromApi.map((b) => (b.code || b.name)?.toUpperCase()).filter(Boolean);
        const studentBranches = studentList.map((s) => s.branch?.toUpperCase()).filter(Boolean);
        const uniqueBranches = Array.from(new Set([...apiBranches, ...studentBranches])).sort();
        setBranchList(uniqueBranches);

        // 2. Attendance Summary
        if (attRes?.data) {
          const pToday = attRes.data.present_today ?? attRes.data.overall?.present_today ?? 0;
          const aRate = attRes.data.attendance_rate ?? attRes.data.overall?.today_attendance_rate ?? 0;
          setPresentToday(pToday);
          setAttendanceRate(aRate);
        }

        // 3. Performance & Average Score Calculated Among Branches
        let calculated = false;

        // Try using backend performance summary endpoint first
        if (perfSummaryRes?.data && perfSummaryRes.data.average_score != null) {
          const sAvg = parseFloat(perfSummaryRes.data.average_score) || 0;
          setAvgScore(sAvg.toFixed(1));
          setTopBranch(perfSummaryRes.data.top_branch_display || perfSummaryRes.data.top_branch || "—");
          calculated = true;
        }

        // Or compute/verify directly from detailed scores list
        const perfData = Array.isArray(perfRes?.data)
          ? perfRes.data
          : (perfRes?.data?.results || []);

        const scoredStudents = perfData.filter((p) => p.has_records && (parseFloat(p.avg) || 0) > 0);

        if (!calculated && scoredStudents.length > 0) {
          // Group student scores by branch
          const branchMap = {};
          scoredStudents.forEach((p) => {
            const b = (p.branch || "General").trim().toUpperCase();
            if (!branchMap[b]) {
              branchMap[b] = { sum: 0, count: 0 };
            }
            branchMap[b].sum += parseFloat(p.avg) || 0;
            branchMap[b].count += 1;
          });

          // Compute each branch average
          const branchEntries = Object.entries(branchMap).map(([bName, stats]) => ({
            branch: bName,
            avg: stats.sum / stats.count,
            count: stats.count,
          }));

          if (branchEntries.length > 0) {
            // Average score calculated among branches
            const sumOfBranchAverages = branchEntries.reduce((acc, curr) => acc + curr.avg, 0);
            const avgAmongBranches = sumOfBranchAverages / branchEntries.length;
            setAvgScore(avgAmongBranches.toFixed(1));

            // Find top branch
            let best = branchEntries[0];
            branchEntries.forEach((entry) => {
              if (entry.avg > best.avg) {
                best = entry;
              }
            });
            setTopBranch(`${best.branch} (${best.avg.toFixed(1)}%)`);
          } else {
            setAvgScore("0.0");
            setTopBranch("—");
          }
        } else if (!calculated) {
          setAvgScore("0.0");
          setTopBranch("—");
        }
      })
      .catch((err) => {
        console.error("DashboardCard data fetch error:", err);
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
            {presentToday > 0
              ? `${attendanceRate}% active rate`
              : attendanceRate > 0
              ? `${attendanceRate}% cumulative rate`
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