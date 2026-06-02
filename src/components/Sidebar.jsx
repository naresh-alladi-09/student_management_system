import React from 'react'
import "../styles/sidebar.css";
const Sidebar = () => {
  return (
    <nav>
    <div>
        <h2>Dashboard</h2>
    </div>
    <ul>
        <li><a href="#">Home</a></li>
        <li><a href="#">Students</a></li>
        <li><a href="#">Attendance</a></li>
        <li><a href="#">Performance</a></li>
        <li><a href="#">Logout</a></li>
    </ul>
    <div>
        <span>🔔</span>
        <span>Admin</span>
    </div>
</nav>
  )
}

export default Sidebar


  

