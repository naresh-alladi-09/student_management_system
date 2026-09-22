import "../styles/studenttable.css";

const StudentTable = ({ students, onEdit, onDelete }) => {
  const getBranchClass = (branch) => {
    const b = (branch || "").toLowerCase();
    if (b.includes("cse")) return "cse";
    if (b.includes("ece")) return "ece";
    if (b.includes("aiml")) return "aiml";
    if (b.includes("it")) return "it";
    if (b.includes("mech")) return "mech";
    return "civil";
  };

  return (
    <div className="student-table-card">
      <div className="table-responsive">
        <table className="modern-student-table">
          <thead>
            <tr>
              <th className="student-id-col">ID</th>
              <th>Student Name</th>
              <th>Academic Year</th>
              <th>Branch</th>
              <th>Semester</th>
              <th>Contact Email</th>
              <th>Phone</th>
              <th style={{ textAlign: "center" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {students && students.length > 0 ? (
              students.map((student) => (
                <tr key={student.id}>
                  <td className="student-id-col">#{student.id}</td>
                  <td>
                    <div className="student-name-container">
                      <div className="avatar-circle">
                        {student.name ? student.name[0].toUpperCase() : "S"}
                      </div>
                      <span className="student-display-name">{student.name}</span>
                    </div>
                  </td>
                  <td>Year {student.year}</td>
                  <td>
                    <span className={`badge-branch ${getBranchClass(student.branch)}`}>
                      {student.branch || "General"}
                    </span>
                  </td>
                  <td>Sem {student.semester}</td>
                  <td className="email-col">
                    <i className="fa-regular fa-envelope"></i>
                    {student.email}
                  </td>
                  <td className="phone-col">
                    <i className="fa-solid fa-phone"></i>
                    {student.phone}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <div className="action-buttons-cell" style={{ justifyContent: "center" }}>
                      <button
                        type="button"
                        className="action-btn edit"
                        onClick={() => onEdit(student)}
                        title="Edit Student"
                      >
                        <i className="fa-solid fa-pen-to-square"></i> Edit
                      </button>

                      <button
                        type="button"
                        className="action-btn delete"
                        onClick={() => onDelete(student.id, student.name)}
                        title="Delete Student"
                      >
                        <i className="fa-solid fa-trash-can"></i> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8">
                  <div className="table-empty-state">
                    <i className="fa-solid fa-user-slash"></i>
                    <h3>No Students Found</h3>
                    <p>No matching student records in the database.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StudentTable;