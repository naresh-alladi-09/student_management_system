import React from "react";
import "./DashboardCard.css";
function DashboardCard() {
  return (
    <div className="dashboard-cards">
      <div className="card">
        <h3>Total Students</h3>
        <h1>120</h1>
      </div>

      <div className="card">
        <h3>Present Today</h3>
        <h1>85</h1>
      </div>

      <div className="card">
        <h3>Total Subjects</h3>
        <h1>6</h1>
      </div>

      <div className="card">
        <h3>Average Score</h3>
        <h1>78%</h1>
      </div>
    </div>
  );
}

export default DashboardCard;