import React from 'react'
import Sidebar from "../components/Sidebar";
import Dashboardcard from "../components/Dashboardcard";
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
        <Dashboardcard/>
         
      </div>
    </div>
  )
}

export default Dashboard