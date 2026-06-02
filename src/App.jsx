
import { BrowserRouter,Routes,Route } from 'react-router-dom';

import './App.css'
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Addstudent from './pages/Addstudent';
import Attendence from './pages/Attendence';
import Performance from './pages/Performance';
import StudentForm from './components/StudentForm';
import Navbar from "./components/Navbar";
function App() {

  return (
    <BrowserRouter>
    <Routes>
      

      <Route path="/Login" element={<Login/>}/>
      <Route path="/dashboard" element={<Dashboard/>}/>
      <Route path="/students" element={<Students/>}/>
      <Route path="/add-students" element={<Addstudent/>}/>
      <Route path="/attendence" element={<Attendence/>}/>
      <Route path="/Performance" element={<Performance/>}/>
      <Route path="/StudentForm" element={<StudentForm/>}/>
      <Route path="/Navbar" element={<Navbar/>}/>
    </Routes>
    </BrowserRouter>
  )
}

export default App
