import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import "../styles/Login.css";
import { FaUser, FaLock } from "react-icons/fa";

const Login = () => {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = (e) => {
    if (e) e.preventDefault();
    const teacherName = "madam";
    const teacherPassword = "123456";

    // Allow admin or default teacher login
    if ((username === teacherName && password === teacherPassword) || (username === "admin" && password === "admin")) {
      navigate("/dashboard");
    } else {
      setError("Invalid username or password. Please try again.");
    }
  };

  return (
    <div className='login-page-bg'>
      <div className='login-container'>
        <div className='login-left'>
          <div className="login-branding">
            <i className="fa-solid fa-graduation-cap login-hero-icon"></i>
            <h2>STUDENT MANAGEMENT SYSTEM</h2>
            <p>Access Dashboard to manage students and academic records in real time</p>
          </div>
        </div>

        <div className='login-form'>
          <h2>WELCOME BACK TEACHER!</h2>
          <p>Login to your faculty dashboard</p>

          {error && <div className="login-error-alert">{error}</div>}

          <form onSubmit={handleLogin} className="login-inner-form">
            <div className='username-cont'>
              <FaUser className="login-field-icon" />
              <input
                type="text"
                placeholder='Enter Username'
                value={username}
                required
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError("");
                }}
              />
            </div>

            <div className='password-cont'>
              <FaLock className="login-field-icon" />
              <input
                type="password"
                placeholder='Enter Password'
                value={password}
                required
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
              />
            </div>

            <div className='rem-cont'>
              <div className='remember-me'>
                <input type="checkbox" id="rem" defaultChecked />
                <label htmlFor="rem">Remember me</label>
              </div>
              <div className='forget-pass'>
                <a href='#forgot' onClick={(e) => { e.preventDefault(); alert("Please contact faculty administration to reset credentials."); }}>
                  Forgot password?
                </a>
              </div>
            </div>

            <button type="submit" className="login-submit-btn">Login to Dashboard</button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;