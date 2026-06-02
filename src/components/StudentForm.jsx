import React, { useState } from 'react'
import "../styles/studentform.css";
const StudentForm = ({addstudent}) => {
  const[name,setname]=useState("");
  const[year,setyear]=useState("");
  const[email,setemail]=useState("");
  const[phone,setphone]=useState("");
  const[branch,setbranch]=useState("");

  const handlesubmit =(e) =>{
        e.preventDefault()
        const newstudent={
          name:name,
          year:year,
          email:email,
          phone:phone,
          branch:branch
        }
        addstudent(newstudent)
        setname("")
        setyear("")
        setemail("")
        setphone("")
        setbranch("")
  }
  return (
    <div className='student_form_cont'>
      <h2>Add New Student</h2>
     
      <form className='form_cont'>
       
       <div className='cont'>
        <label for="name">Full Name :</label> 
        <input type='text' id="name" placeholder='  Enter FullName' value={name} onChange={(e) =>setname(e.target.value) }/>
       <label  for="year">year :</label>
        <select id="year" value={year} onChange={(e) => setyear(e.target.value)}>
          <option value="">Select year</option>
          <option value="First year">First year </option>
          <option value="Second year">Second year</option>
          <option value="Third year">Third year</option>
          <option value="Fourth year">Fourth year</option>
        </select>
    

        
        <label>Branch :</label>
        <select name="branch" id="branch" value={branch} onChange={(e)=>set}>
          <option value="">Select branch</option>
          <option value="CSE">CSE</option>
          <option value="AIML">AIML</option>
          <option value="AIDS">AIDS</option>
          <option value="ECE">ECE</option>
          <option value="MECH">MECHANICAL</option>
          <option value="CIVIL">CIVIL</option>
          <option value="EEE">EEE</option>
        </select>
</div>

<div className='cont'>
        <label for ="email">Email :</label>
      <input type="email"  placeholder='  Enter your email'id="email" value={email} onChange={(e) => setemail(e.target.value)} />
     

     
     
     <label for="phone">Phone :</label>
     <input type="tel" id="phone" value={phone} onChange={(e)=>setphone(e.target.value)} placeholder='  Enter phone number'/>
     
     
    
     
</div>

      <button onClick={handlesubmit} >ADD STUDENT</button>
     
      </form>
    </div>
  )
}

export default StudentForm