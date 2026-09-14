import React, { useEffect, useState } from "react";
import "../styles/dashboardcard.css";

import { FaUserGraduate, FaClipboardCheck, FaBook, FaChartLine } from "react-icons/fa";
import { getStudents } from "../services/studentservice";

function DashboardCard({ studentCount: externalCount }) {
  const [studentCount, setStudentCount] = useState(externalCount ?? 0);
  const [branchCount, setBranchCount] = useState(0);
  const [loading, setLoading] = useState(externalCount === undefined);

  useEffect(() => {
    if (externalCount !== undefined) {
      setStudentCount(externalCount);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        const res = await getStudents();
        const list = res.data || [];
        setStudentCount(list.length);
        const branches = new Set(list.map((s) => s.branch?.toUpperCase()).filter(Boolean));
        setBranchCount(branches.size || 3);
      } catch (err) {
        console.error("Failed to load student count:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [externalCount]);

  // Calculate today's attendance from localStorage if saved
  const todayStr = new Date().toISOString().split("T")[0];
  let presentToday = Math.max(0, studentCount);
  try {
    const saved = localStorage.getItem(`attendance_${todayStr}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      presentToday = Object.values(parsed).filter((v) => v === "Present").length;
    }
  } catch {
    // fallback
  }

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
          <span className="card-subtext">Live database count</span>
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
            {studentCount > 0 ? `${Math.round((presentToday / studentCount) * 100)}% active rate` : "No attendance yet"}
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
          <h1>{loading ? "..." : (branchCount || 3)}</h1>
          <span className="card-subtext">CSE, ECE, AIML</span>
        </div>
      </div>

      {/* Card 4: Academic Performance */}
      <div className="card">
        <div className="icon performance">
          <FaChartLine size={28} color="#fff" />
        </div>
        <div className="text">
          <h3>Average Score</h3>
          <h1>84.5%</h1>
          <span className="card-subtext">Top performing: CSE</span>
        </div>
      </div>
    </div>
  );
}

export default DashboardCard;