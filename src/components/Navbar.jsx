import React from 'react'
import { FaUser,FaBell,FaSearch, FaUserCircle } from 'react-icons/fa'
import '../styles/navbar.css';
import {useNavigate} from "react-router-dom";

const Navbar = () => {
  const handlelogout=()=>{
    Navigate("/Login");
  }
  const Navigate = useNavigate();

  return (
    <div className="navbar">
      <div className="title">
      <h2>Dashboard</h2>
      </div>
      <div className="nav-links">
        <FaSearch/>
        <input type="text" placeholder="search students..."/>
        <FaBell/>
        <FaUserCircle/>
        <button onClick={handlelogout}>Logout</button>


      </div>
    </div>
  )
}

export default Navbar