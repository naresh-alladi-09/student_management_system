import React from 'react'
import "../styles/sidebar.css";
import {Link} from "react-router-dom";
const Sidebar = () => {
  return (
 

    <div className="sidebar">
        <div className="logo">
            <i className="fa-solid fa-shield-heart"></i>
            <span>S M S</span>
        </div>

        <ul className="menu">
            <li className="active">
                <Link to="/dashboard">
                    <i className="fa-solid fa-house"></i>
                    <span>Dashboard</span>
                </Link>
            </li>
            <li>
                <Link to="/AddStudents">
                    <i className="fa-solid fa-user-plus"></i>
                    <span>Add Student</span>
                </Link>
            </li>

            <li>
                <Link to="/students">
                    <i className="fa-solid fa-user"></i>
                    <span>Students</span>
                </Link>
            </li>

            <li>
                <Link to="/attendence">
                    <i className="fa-regular fa-calendar"></i>
                    <span>Attendance</span>
                </Link>
            </li>

            <li>
                <Link to="/performance">
                    <i className="fa-solid fa-chart-simple"></i>
                    <span>Performance</span>
                </Link>
            </li>

            <li>
                <Link to="/Login">
                    <i className="fa-solid fa-right-from-bracket"></i>
                    <span>Logout</span>
                </Link>
            </li>
        </ul>
    </div>


  )
}

export default Sidebar


  

