import "../styles/studenttable.css";

const StudentTable = ({ students, onEdit, onDeactivate, onActivate }) => {
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
              <th className="student-id-col">Roll No / ID</th>
              <th>Student Name</th>
              <th>Academic Year</th>
              <th>Branch / Department</th>
              <th>Semester</th>
              <th>Status</th>
              <th>Contact Email</th>
              <th>Phone</th>
              <th style={{ textAlign: "center" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {students && students.length > 0 ? (
              students.map((student) => {
                const isActive = student.is_active !== false;
                return (
                  <tr key={student.id} style={{ opacity: isActive ? 1 : 0.7 }}>
                    <td className="student-id-col">
                      <strong>{student.roll_no || student.student_id || `#${student.id}`}</strong>
                    </td>
                    <td>
                      <div className="student-name-container">
                        <div className="avatar-circle">
                          {student.name ? student.name[0].toUpperCase() : "S"}
                        </div>
                        <div>
                          <span className="student-display-name">{student.name}</span>
                          <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                            {student.student_id || `ID: ${student.id}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>Year {student.year}</td>
                    <td>
                      <span className={`badge-branch ${getBranchClass(student.branch)}`}>
                        {student.branch || "General"}
                      </span>
                    </td>
                    <td>Sem {student.semester}</td>
                    <td>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 8px",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: 700,
                          background: isActive ? "#ecfdf5" : "#fef2f2",
                          color: isActive ? "#047857" : "#b91c1c",
                          border: `1px solid ${isActive ? "#a7f3d0" : "#fecaca"}`,
                        }}
                      >
                        {isActive ? "● Active" : "○ Deactivated"}
                      </span>
                    </td>
                    <td className="email-col">
                      <i className="fa-regular fa-envelope"></i>
                      {student.email}
                    </td>
                    <td className="phone-col">
                      <i className="fa-solid fa-phone"></i>
                      {student.phone}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div className="action-buttons-cell" style={{ justifyContent: "center", gap: "6px" }}>
                        <button
                          type="button"
                          className="action-btn edit"
                          onClick={() => onEdit(student)}
                          title="Edit Student"
                        >
                          <i className="fa-solid fa-pen-to-square"></i> Edit
                        </button>

                        {isActive ? (
                          <button
                            type="button"
                            className="action-btn delete"
                            onClick={() => onDeactivate(student.id, student.name)}
                            title="Soft Delete / Deactivate Student"
                            style={{ background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" }}
                          >
                            <i className="fa-solid fa-user-slash"></i> Deactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="action-btn"
                            onClick={() => onActivate(student.id, student.name)}
                            title="Restore / Activate Student"
                            style={{ background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}
                          >
                            <i className="fa-solid fa-user-check"></i> Restore
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="9">
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