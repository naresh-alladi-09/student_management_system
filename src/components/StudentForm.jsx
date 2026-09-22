import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { addStudent } from "../services/studentservice";
import "../styles/studentform.css";

const StudentForm = () => {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [year, setYear] = useState("1");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [branch, setBranch] = useState("CSE");
  const [semester, setSemester] = useState("1");

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    // Form field checks
    if (!name.trim()) {
      setErrorMessage("Please enter the student's full name.");
      return;
    }
    if (!email.trim()) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (!phone.trim()) {
      setErrorMessage("Please enter a phone number.");
      return;
    }

    const newStudent = {
      name: name.trim(),
      year: parseInt(year, 10) || 1,
      email: email.trim(),
      phone: phone.trim(),
      branch,
      semester: String(semester),
    };

    try {
      setSubmitting(true);
      await addStudent(newStudent);
      setSuccessMessage("✓ Student added to database successfully!");

      // Clear form
      setName("");
      setEmail("");
      setPhone("");

      // Redirect to students list after brief delay
      setTimeout(() => {
        navigate("/students");
      }, 1200);
    } catch (error) {
      console.error("Failed to add student:", error);
      if (error.response && error.response.data) {
        const errors = error.response.data;
        const msg = Object.entries(errors)
          .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(", ") : val}`)
          .join(" | ");
        setErrorMessage(msg || "Failed to add student to database.");
      } else {
        setErrorMessage("Network error or server unreachable. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setName("");
    setYear("1");
    setEmail("");
    setPhone("");
    setBranch("CSE");
    setSemester("1");
    setErrorMessage("");
    setSuccessMessage("");
  };

  return (
    <div className="form-wrapper">
      <div className="form-page-header">
        <div>
          <h2>Enroll New Student</h2>
          <p>Register a student record into the central cloud database</p>
        </div>
        <Link to="/students" className="back-link">
          ← View All Students
        </Link>
      </div>

      <div className="stu-form-cont">
        {successMessage && (
          <div className="form-success-alert">{successMessage}</div>
        )}

        {errorMessage && (
          <div className="form-error-alert">{errorMessage}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="stu-name">Full Name *</label>
              <input
                id="stu-name"
                type="text"
                placeholder="e.g. John Doe"
                value={name}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="stu-year">Academic Year *</label>
              <select
                id="stu-year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="stu-email">Email Address *</label>
              <input
                id="stu-email"
                type="email"
                placeholder="e.g. student@college.edu"
                value={email}
                required
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="stu-phone">Phone Number *</label>
              <input
                id="stu-phone"
                type="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                required
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="stu-branch">Branch / Department *</label>
              <select
                id="stu-branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              >
                <option value="CSE">Computer Science & Eng (CSE)</option>
                <option value="ECE">Electronics & Comm (ECE)</option>
                <option value="AIML">AI & Machine Learning (AIML)</option>
                <option value="IT">Information Technology (IT)</option>
                <option value="MECH">Mechanical Eng (MECH)</option>
                <option value="CIVIL">Civil Eng (CIVIL)</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="stu-sem">Semester *</label>
              <select
                id="stu-sem"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
              >
                <option value="1">Semester 1</option>
                <option value="2">Semester 2</option>
                <option value="3">Semester 3</option>
                <option value="4">Semester 4</option>
                <option value="5">Semester 5</option>
                <option value="6">Semester 6</option>
                <option value="7">Semester 7</option>
                <option value="8">Semester 8</option>
              </select>
            </div>
          </div>

          <div className="form-actions-bar">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleReset}
              disabled={submitting}
            >
              Reset Form
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
            >
              {submitting ? (
                <span><i className="fa-solid fa-spinner fa-spin"></i> Saving...</span>
              ) : (
                <span><i className="fa-solid fa-user-plus"></i> Add Student</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StudentForm;