import React, { useEffect, useState } from "react";

import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import StudentTable from "../components/StudentTable";

const Students = () => {

  const [students, setStudents] = useState([]);

  useEffect(() => {

    const data =
      JSON.parse(axios.get("students")) || [];

    setStudents(data);

  }, []);

  return (

    <div className="sideandmain">
      <div className="Sidebarindashboard">
      <Sidebar />
      </div>
      <div className="main-content">

        <Navbar />

        <StudentTable students={students} />

      </div>

    </div>

  );
};

export default Students;