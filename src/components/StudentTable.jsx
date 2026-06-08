import React from 'react'

const StudentTable = ({ students }) => {

  return (

    <div>

      <h2>Students List</h2>

      <table border="1">

        <thead>

          <tr>

            <th>ID</th>
            <th>Name</th>
            <th>Year</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Branch</th>

          </tr>

        </thead>

        <tbody>

          {
            students.length > 0 ?

            students.map((student) => (

              <tr key={student.id}>

                <td>{student.id}</td>

                <td>{student.name}</td>

                <td>{student.year}</td>

                <td>{student.email}</td>

                <td>{student.phone}</td>

                <td>{student.branch}</td>

              </tr>

            ))

            :

            <tr>

              <td colSpan="6">
                No Students Found
              </td>

            </tr>

          }

        </tbody>

      </table>

    </div>

  )
}

export default StudentTable