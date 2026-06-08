import React from 'react'
import "../styles/sidebar.css";
import {Link} from "react-router-dom";
const Sidebar = () => {
  return (
 

    <div class="sidebar">
        <div class="logo">
            <i class="fa-solid fa-shield-heart"></i>
            <span>S M S</span>
        </div>

        <ul class="menu">
            <li class="active">
                <Link to="/dashboard">
                    <i class="fa-solid fa-house"></i>
                    <span>Dashboard</span>
                </Link>
            </li>
            <li>
                <Link to="/AddStudents">
                    <i class="fa-solid fa-user-plus"></i>
                    <span>Add Student</span>
                </Link>
            </li>

            <li>
                <Link to="/students">
                    <i class="fa-solid fa-user"></i>
                    <span>Students</span>
                </Link>
            </li>

            <li>
                <Link to="/attendence">
                    <i class="fa-regular fa-calendar"></i>
                    <span>Attendance</span>
                </Link>
            </li>

            <li>
                <Link to="/performance">
                    <i class="fa-solid fa-chart-simple"></i>
                    <span>Performance</span>
                </Link>
            </li>

            <li>
                <Link to="/Login">
                    <i class="fa-solid fa-right-from-bracket"></i>
                    <span>Logout</span>
                </Link>
            </li>
        </ul>
    </div>


  )
}

export default Sidebar


  

