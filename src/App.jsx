
import { BrowserRouter,Routes,Route } from 'react-router-dom';

import './App.css'
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
      

      <Route path="/" element={<Login/>}/>
      <Route path="/dashboard" element={<Dashboard/>}/>
      <Route path="/students" element={<Students/>}/>
      <Route path="/add-students" element={<Addstudent/>}/>
      <Route path="/attendence" element={<Attendence/>}/>
      <Route path="/Performance" element={<Performance/>}/>

    </Routes>
    </BrowserRouter>
  )
}

export default App
