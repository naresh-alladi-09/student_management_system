import React from 'react'
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import  "../styles/Login.css";
import {FaUser,FaLock} from "react-icons/fa";

const Login = () => {

   const navigate = useNavigate();

  const [username, setusername] = useState("");

  const [password, setpassword] = useState("");

  

  const handlelogin = () =>{
    const teacherName="madam";
    const teacherpassword = "123456";

    if (username == teacherName && password==teacherpassword )
    {
      navigate("/dashboard")
    }
    else{
      alert("Invalid details")
    }

  };
  
  return (
    <div className='login-container'>
      <div className='login-left'>
        <h2>STUDENT MANAGEMENT SYSTEM</h2>
        <p>Access Dashboard to manage students and Academic Activities</p>
        <img src='https://plus.unsplash.com/premium_photo-1750698147237-2ca68f95b501?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'/>
      </div>

      <div className='login-form'>
        <h2>WELCOME  BACK TEACHER !</h2>
        <p>Login To Continue</p>
        <div className='username-cont'>
        <FaUser/>
        <input type="text" placeholder='Enter Username' value={username} onChange={(e) => setusername(e.target.value)} />
        </div>
        <div className='password-cont'>
          <FaLock/>
        <input type="text" placeholder='Enter password' value={password} onChange={(e) => setpassword(e.target.value)}  />
        </div>
     
     <div className='rem-cont'>
      <div className='remember-me'>
        <input type="checkbox" id="rem"/>
        <label  for="rem" >Remember me</label>
      </div>
      <div className='forget-pass'>
        <a href='#--'>forgot password ?</a>
      </div>
      </div>
        <button onClick={handlelogin}>Login</button>
      </div>
    </div>
  )
};

export default Login ;