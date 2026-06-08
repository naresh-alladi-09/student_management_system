import React from 'react'
import "../styles/attendence.css";
import { useEffect, useState } from "react";


function Attendance() {
  const [students, setStudents] = useState([]);

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("students")) || [];
    setStudents(data);
  }, []);

  return (
    <div className="attendance-container">
      <h2>Attendance Page</h2>

      <table className="attendance-table">
        <thead>
          <tr>
            <th>S.No</th>
            <th>Name</th>
            <th>Attendance</th>
          </tr>
        </thead>

        <tbody>
          {students.map((student, index) => (
            <tr key={index}>
              <td>{index + 1}</td>
              <td>{student.name}</td>
              <td>
                <select className="status-select">
                  <option>Present</option>
                  <option>Absent</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button className="save-btn">
        Save Attendance
      </button>
    </div>
  );
}

export default Attendance;