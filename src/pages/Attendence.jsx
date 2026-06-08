import React from 'react'
import "../styles/attendence.css";
import React, { useEffect, useState } from "react";

function Attendance() {
  const [students, setStudents] = useState([]);

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("students")) || [];
    setStudents(data);
  }, []);

  return (
    <div>
      <h2>Attendance Page</h2>

      <table border="1">
        <thead>
          <tr>
            <th>Name</th>
            <th>Attendance</th>
          </tr>
        </thead>

        <tbody>
          {students.map((student, index) => (
            <tr key={index}>
              <td>{student.name}</td>

              <td>
                <select>
                  <option>Present</option>
                  <option>Absent</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Attendance;