import React, { useState } from "react";
import { addStudent } from "../services/studentservice";
import "../styles/studentform.css";
const StudentForm = () => {

  const [name, setname] = useState("");
  const [year, setyear] = useState("");
  const [email, setemail] = useState("");
  const [phone, setphone] = useState("");
  const [branch, setbranch] = useState("");
  const [semester,setSemester] = useState("");
  

  

    const handleSubmit = async (e) => {
  e.preventDefault();

  const newStudent = {
    name,
    year,
    email,
    phone,
    branch,
    semester ,
  };

  try {
    await addStudent(newStudent);

    alert("Student Added Successfully");

    setname("");
    setyear("");
    setemail("");
    setphone("");
    setbranch("");
    setSemester("");
  } catch (error) {
    console.error(error);
    alert("Failed to add student");
  }
};
  

  return (
    <form onSubmit={handleSubmit}>
<div className="stu-form-cont">
  <h2>ADD STUDENTS</h2>
   <div className="input-cont">
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
      </div>
<div className="input-cont">
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
</div>
<div className="input-cont">
      <select
        value={branch}
        onChange={(e) => setbranch(e.target.value)}
      >
        <option value="">Select Branch</option>
        <option value="CSE">CSE</option>
        <option value="ECE">ECE</option>
        <option value="AIML">AIML</option>
      </select>
      
      <input
      type="text"
      placeholder="Semester"
      value={semester}
      onChange={(e) => setSemester(e.target.value)}
      />

</div>
<div className="buttoonns">
     <button type="reset" onClick={() => {
      setname("");
      setyear("");
      setemail("");
      setphone("");
      setbranch("");
      setSemester("");
     }}>
        clear form
      </button>
      <button type="submit">
        Add Student
      </button>
      </div>
</div>
    </form>
  );
};

export default StudentForm;