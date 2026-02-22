import React, { useState } from "react";
export default function FeedbackForm({ complaintId, citizenUsername, onSuccess }) {
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(5);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch("http://localhost:5000/feedbacks/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complaintId, citizenUsername, message, rating })
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      onSuccess && onSuccess();
      setMessage("");
      setRating(5);
    } else {
      alert(data.message || "Error submitting feedback");
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ margin: "20px 0" }}>
      <h3>Submit Feedback</h3>
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="Describe your issue or feedback"
        required
        style={{ width: "100%", height: "80px" }}
      />
      <br />
      <label>
        Rating:
        <input
          type="number"
          min={1}
          max={5}
          value={rating}
          onChange={e => setRating(e.target.value)}
          required
        />
      </label>
      <br />
      <button type="submit" style={{ marginTop: "10px" }}>Submit Feedback</button>
    </form>
  );
}
