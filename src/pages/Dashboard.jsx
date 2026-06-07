import React from 'react'
import Sidebar from "../components/Sidebar";
import Performance from "../pages/Performance";
import Navbar from "../components/Navbar";
import "../styles/dashboard.css";
const Dashboard = () => {
  return (
    <div className="sideandmain">
      <div className="Sidebarindashboard">
        <Sidebar/>
      </div>
      <div className="main-content">
        <Navbar/>
        <Performance/>
      </div>
    </div>
  )
}

export default Dashboard