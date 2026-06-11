import React from "react";
import "../styles/dashboardcard.css";

import { FaUserGraduate } from "react-icons/fa";
import { FaClipboardCheck } from "react-icons/fa";
import { FaBook } from "react-icons/fa";
import { FaChartLine } from "react-icons/fa";

function DashboardCard() {
  return (
    <div className="dashboard-cards">

      {/* Card 1 */}
      <div className="card">
        <div className="icon students">
          <FaUserGraduate size={28} color="#fff" />
        </div>
        <div className="text">
          <h3>Total Students</h3>
          <h1>120</h1>
        </div>
      </div>

      {/* Card 2 */}
      <div className="card">
        <div className="icon attendance">
          <FaClipboardCheck size={28} color="#fff" />
        </div>
        <div className="text">
          <h3>Present Today</h3>
          <h1>85</h1>
        </div>
      </div>

      {/* Card 3 */}
      <div className="card">
        <div className="icon subjects">
          <FaBook size={28} color="#fff" />
        </div>
        <div className="text">
          <h3>Total Subjects</h3>
          <h1>6</h1>
        </div>
      </div>

      {/* Card 4 */}
      <div className="card">
        <div className="icon performance">
          <FaChartLine size={28} color="#fff" />
        </div>
        <div className="text">
          <h3>Average Score</h3>
          <h1>78%</h1>
        </div>
      </div>

    </div>
  );
}

export default DashboardCard;