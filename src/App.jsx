
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import './App.css';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Addstudent from './pages/Addstudent';
import Attendence from './pages/Attendence';
import Performance from './pages/Performance';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/Login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/students" element={<Students />} />
        <Route path="/addstudents" element={<Addstudent />} />
        <Route path="/AddStudents" element={<Addstudent />} />
        <Route path="/attendence" element={<Attendence />} />
        <Route path="/performance" element={<Performance />} />
        {/* Catch-all route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
