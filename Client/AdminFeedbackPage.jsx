import React, { useEffect, useState } from "react";
export default function AdminFeedbackPage() {
  const [feedbacks, setFeedbacks] = useState([]);
  useEffect(() => {
    fetch("http://localhost:5000/feedbacks/all")
      .then(res => res.json())
      .then(setFeedbacks);
  }, []);
  return (
    <div>
      <h2>All Feedbacks</h2>
      <ul>
        {feedbacks.map(f => (
          <li key={f._id}>
            <strong>Complaint:</strong> {f.complaintId?.title} <br />
            <strong>User:</strong> {f.citizenUsername} <br />
            <strong>Rating:</strong> {f.rating} <br />
            <strong>Message:</strong> {f.message}
            <hr />
          </li>
        ))}
      </ul>
    </div>
  );
}
