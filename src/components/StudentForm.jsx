import React, { useState } from "react";
import css from "../styles/studentform.css";
const StudentForm = () => {

  const [name, setname] = useState("");
  const [year, setyear] = useState("");
  const [email, setemail] = useState("");
  const [phone, setphone] = useState("");
  const [branch, setbranch] = useState("");

  const handleSubmit = (e) => {

    e.preventDefault();

    const newStudent = {
      id: Date.now(),
      name,
      year,
      email,
      phone,
      branch
    };

    const existingStudents =
      JSON.parse(localStorage.getItem("students")) || [];

    const updatedStudents = [
      ...existingStudents,
      newStudent
    ];

    localStorage.setItem(
      "students",
      JSON.stringify(updatedStudents)
    );

    alert("Student Added Successfully");

    setname("");
    setyear("");
    setemail("");
    setphone("");
    setbranch("");
  };

  return (
    <form onSubmit={handleSubmit}>

      <input
        type="text"
        placeholder="Name"
        value={name}
        onChange={(e) => setname(e.target.value)}
      />

      <input
        type="text"
        placeholder="Year"
        value={year}
        onChange={(e) => setyear(e.target.value)}
      />

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setemail(e.target.value)}
      />

      <input
        type="tel"
        placeholder="Phone"
        value={phone}
        onChange={(e) => setphone(e.target.value)}
      />

      <select
        value={branch}
        onChange={(e) => setbranch(e.target.value)}
      >
        <option value="">Select Branch</option>
        <option value="CSE">CSE</option>
        <option value="ECE">ECE</option>
        <option value="AIML">AIML</option>
      </select>

      <button type="submit">
        Add Student
      </button>

    </form>
  );
};

export default StudentForm;