import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import './App.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Addstudent from './pages/Addstudent';
import Attendence from './pages/Attendence';
import Performance from './pages/Performance';
import StudentDashboard from './pages/StudentDashboard';

// Route guard for teacher-only views
const TeacherRoute = ({ children }) => {
  const { currentUser, isStudent } = useAuth();
  if (currentUser && isStudent) {
    return <Navigate to="/student/dashboard" replace />;
  }
  return children;
};

// Route guard for student-only views
const StudentRoute = ({ children }) => {
  const { currentUser, isTeacher } = useAuth();
  if (currentUser && isTeacher) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public & Role-Specific Login Routes */}
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/Login" element={<Login />} />
          <Route path="/login/teacher" element={<Login initialRole="teacher" />} />
          <Route path="/login/student" element={<Login initialRole="student" />} />

          {/* Teacher / Faculty Routes */}
          <Route path="/dashboard" element={<TeacherRoute><Dashboard /></TeacherRoute>} />
          <Route path="/students" element={<TeacherRoute><Students /></TeacherRoute>} />
          <Route path="/addstudents" element={<TeacherRoute><Addstudent /></TeacherRoute>} />
          <Route path="/AddStudents" element={<TeacherRoute><Addstudent /></TeacherRoute>} />
          <Route path="/attendence" element={<TeacherRoute><Attendence /></TeacherRoute>} />
          <Route path="/performance" element={<TeacherRoute><Performance /></TeacherRoute>} />

          {/* Student Portal Routes */}
          <Route path="/student" element={<Navigate to="/student/dashboard" replace />} />
          <Route path="/student/dashboard" element={<StudentRoute><StudentDashboard /></StudentRoute>} />
          <Route path="/student-dashboard" element={<StudentRoute><StudentDashboard /></StudentRoute>} />

          {/* Catch-all route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
