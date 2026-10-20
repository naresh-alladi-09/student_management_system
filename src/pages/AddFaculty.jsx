import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import FacultyForm from "../components/FacultyForm";

const AddFaculty = () => {
  return (
    <div className="sideandmain">
      <div className="Sidebarindashboard">
        <Sidebar />
      </div>
      <div className="main-content">
        <Navbar />
        <FacultyForm />
      </div>
    </div>
  );
};

export default AddFaculty;
