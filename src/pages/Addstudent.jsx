import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import StudentForm from "../components/StudentForm";

const Addstudent = () => {
  return (
    <div className="sideandmain">
    <div className="Sidebarindashboard">
      <Sidebar/>
      </div>
      <div className="main-content">
        <Navbar/>
        <StudentForm/> 
    </div>
    </div>
  )
}

export default Addstudent