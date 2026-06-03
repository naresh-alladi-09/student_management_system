import React from 'react'
import "../styles/sidebar.css";
const Sidebar = () => {
  return (
 

    <div class="sidebar">
        <div class="logo">
            <i class="fa-solid fa-shield-heart"></i>
            <span>SMS</span>
        </div>

        <ul class="menu">
            <li class="active">
                <a href="#">
                    <i class="fa-solid fa-house"></i>
                    <span>Dashboard</span>
                </a>
            </li>

            <li>
                <a href="#">
                    <i class="fa-solid fa-user"></i>
                    <span>Students</span>
                </a>
            </li>

            <li>
                <a href="#">
                    <i class="fa-regular fa-calendar"></i>
                    <span>Attendance</span>
                </a>
            </li>

            <li>
                <a href="#">
                    <i class="fa-solid fa-chart-simple"></i>
                    <span>Performance</span>
                </a>
            </li>

            <li>
                <a href="#">
                    <i class="fa-solid fa-right-from-bracket"></i>
                    <span>Logout</span>
                </a>
            </li>
        </ul>
    </div>


  )
}

export default Sidebar


  

