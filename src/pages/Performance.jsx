import React from "react";
import "../styles/performance.css";

function Performance() {
  return (
    <div className="container">
      <div className="title">
        <h2> PERFORMANCE PAGE</h2>
      </div>

      <div className="performance-box">
        <h1>Performance</h1>

        <div className="filter-section">
          <label>Select Class</label>

          <select>
            <option>10-A</option>
            <option>10-B</option>
            <option>10-C</option>
          </select>

          <button>View</button>
        </div>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Maths</th>
              <th>Science</th>
              <th>English</th>
              <th>Average</th>
              <th>Grade</th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td>101</td>
              <td>Rahul Sharma</td>
              <td>85</td>
              <td>90</td>
              <td>88</td>
              <td>87.67</td>
              <td>A</td>
            </tr>

            <tr>
              <td>102</td>
              <td>Priya Verma</td>
              <td>78</td>
              <td>82</td>
              <td>80</td>
              <td>80.00</td>
              <td>A</td>
            </tr>

            <tr>
              <td>103</td>
              <td>Aman Singh</td>
              <td>65</td>
              <td>70</td>
              <td>68</td>
              <td>67.67</td>
              <td>B</td>
            </tr>

            <tr>
              <td>104</td>
              <td>Sneha Patel</td>
              <td>92</td>
              <td>95</td>
              <td>90</td>
              <td>92.33</td>
              <td>A+</td>
            </tr>

            <tr>
              <td>105</td>
              <td>Vivek Kumar</td>
              <td>55</td>
              <td>60</td>
              <td>58</td>
              <td>57.67</td>
              <td>C</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Performance;