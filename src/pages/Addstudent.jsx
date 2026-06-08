import react from "react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import StudentForm from "../components/StudentForm";

import React from 'react'

const Addstudent = () => {
  return (
    <div className="sideandmain">
    <div className="Sidebarindashboard">
      <Sidebar/>
      </div>
      <div className="main-content">
        <Navbar/>
        <StudentForm/> 
    </div>
    </div>
  )
}

export default Addstudent