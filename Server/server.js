const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

// Configure nodemailer transporter (replace with your email credentials)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "project.complaint.system25@gmail.com",
    pass: "gjmsscdludiqexzj",
  },
});

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// Admin Login (Hardcoded)
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;
  const ADMIN_USERNAME = "admin";
  const ADMIN_PASSWORD = "admin123";
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return res.json({ message: "Admin login successful", isAdmin: true });
  } else {
    return res.status(401).json({ message: "Invalid admin credentials" });
  }
});

// Ensure uploads folder exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// Serve uploaded files
app.use("/uploads", express.static(uploadDir));

// Connect to MongoDB
mongoose
  .connect(
    "mongodb+srv://dhanasrik:vkmtrdvk@smart-complaint-cluster.k1iesbk.mongodb.net/smart_complaints?retryWrites=true&w=majority&appName=smart-complaint-cluster",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

const db = mongoose.connection;
db.on("connected", () => console.log("Mongoose connected"));
db.on("error", (err) => console.error("MongoDB connection error:", err));
db.on("disconnected", () => console.log("Mongoose disconnected"));

// Schemas & Models
const citizenSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,
  username: { type: String, unique: true },
  password: String,
});
const Citizen = mongoose.model("users", citizenSchema);

const employeeSchema = new mongoose.Schema({
  name: String,
  username: { type: String, unique: true },
  password: String,
  department: String,
});
const Employee = mongoose.model("employees", employeeSchema);

const complaintSchema = new mongoose.Schema({
  citizenUsername: String,
  title: String,
  description: String,
  department: String,
  image: String,
  location: String,
  assignedEmployeeUsername: String,
  status: { type: String, default: "Pending" },
  createdAt: { type: Date, default: Date.now },
});
const Complaint = mongoose.model("complaints", complaintSchema);

const feedbackSchema = new mongoose.Schema({
  complaintId: { type: mongoose.Schema.Types.ObjectId, ref: "complaints", required: true },
  citizenUsername: { type: String, required: true },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const Feedback = mongoose.model("feedbacks", feedbackSchema);

// Routes:

app.delete("/complaints/:id", async (req, res) => {
  try {
    const deleted = await Complaint.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Complaint not found" });
    res.json({ message: "Complaint removed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

app.post("/feedbacks/submit", async (req, res) => {
  try {
    const { complaintId, citizenUsername, message } = req.body;
    const feedback = new Feedback({ complaintId, citizenUsername, message });
    await feedback.save();
    res.json({ message: "Feedback submitted successfully!" });
  } catch (error) {
    res.status(500).json({ message: "Error submitting feedback", error });
  }
});

app.get("/feedbacks/all", async (_req, res) => {
  try {
    const feedbacks = await Feedback.find().populate("complaintId");
    res.json(feedbacks);
  } catch (error) {
    res.status(500).json({ message: "Error fetching feedbacks", error });
  }
});

app.get("/admin/complaints-with-feedback", async (_req, res) => {
  try {
    const complaints = await Complaint.find().sort({ createdAt: -1 });
    const complaintWithFeedback = await Promise.all(
      complaints.map(async (complaint) => {
        const feedback = await Feedback.findOne({ complaintId: complaint._id });
        return Object.assign({}, complaint._doc, { feedback });
      })
    );
    res.json(complaintWithFeedback);
  } catch (error) {
    res.status(500).json({ message: "Error fetching complaints with feedback", error });
  }
});

app.post("/citizens/register", async (req, res) => {
  try {
    const citizen = new Citizen(req.body);
    await citizen.save();
    res.json({ message: "Citizen registered successfully!" });
  } catch (error) {
    res.status(400).json({ message: "Error registering citizen", error });
  }
});

app.post("/citizens/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const citizen = await Citizen.findOne({ username, password });
    if (!citizen) return res.status(401).json({ message: "Invalid username or password" });
    res.json({ message: "Login successful", citizen });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

app.get("/citizens/:username", async (req, res) => {
  try {
    const citizen = await Citizen.findOne({ username: req.params.username });
    if (!citizen) return res.status(404).json({ message: "Citizen not found" });
    res.json({
      name: citizen.name,
      phone: citizen.phone,
      email: citizen.email,
      username: citizen.username,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// Complaint registration with email notification
app.post("/complaints/register", upload.single("image"), async (req, res) => {
  try {
    const { citizenUsername, title, description, department, location } = req.body;
    const existingComplaint = await Complaint.findOne({
      location,
      department: new RegExp(`^${department}$`, "i"),
    });
    if (existingComplaint) {
      return res.status(400).json({
        message: "Similar Complaint already registered from this location.",
      });
    }

    const employees = await Employee.find({ department });
    const workloadList = await Promise.all(
      employees.map(async (emp) => {
        const count = await Complaint.countDocuments({
          assignedEmployeeUsername: emp.username,
          status: { $nin: ["Resolved"] },
        });
        return { username: emp.username, name: emp.name, count };
      })
    );

    workloadList.sort((a, b) => a.count - b.count);
    const assignedEmployeeUsername = workloadList[0] ? workloadList[0].username : null;

    const newComplaint = new Complaint({
      citizenUsername,
      title,
      description,
      department,
      image: req.file ? req.file.filename : null,
      location,
      assignedEmployeeUsername,
    });
    await newComplaint.save();

    // Send email notification to citizen on complaint registration
    const citizen = await Citizen.findOne({ username: citizenUsername });
    if (citizen?.email) {
      await transporter.sendMail({
        from: "project.complaint.system25@gmail.com",
        to: citizen.email,
        subject: "Complaint Registered",
        text: `Your complaint "${title}" has been registered. We will keep you updated.`,
      });
    }

    res.json({ message: "Complaint submitted and employee assigned!", complaint: newComplaint, assignedEmployeeUsername });
  } catch (error) {
    res.status(500).json({ message: "Error submitting complaint", error });
  }
});

app.get("/complaints/all", async (_req, res) => {
  try {
    const complaints = await Complaint.find().sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: "Error fetching all complaints", error });
  }
});

app.get("/complaints/:username", async (req, res) => {
  try {
    const complaints = await Complaint.find({ citizenUsername: req.params.username });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: "Error fetching complaints", error });
  }
});

app.get("/employees/complaints/:department", async (req, res) => {
  try {
    const department = req.params.department;
    const complaints = await Complaint.find({
      department: new RegExp(`^${department}$`, "i"),
    }).sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: "Error fetching complaints", error });
  }
});

app.get("/employees/assigned-complaints/:username", async (req, res) => {
  try {
    const complaints = await Complaint.find({ assignedEmployeeUsername: req.params.username });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: "Error fetching assigned complaints", error });
  }
});

app.post("/employees/register", async (req, res) => {
  try {
    const employee = new Employee(req.body);
    await employee.save();
    res.json({ message: "Employee registered successfully!" });
  } catch (error) {
    res.status(400).json({ message: "Error registering employee", error });
  }
});

app.post("/employees/login", async (req, res) => {
  const { username, password, department } = req.body;
  try {
    const employee = await Employee.findOne({ username, password, department });
    if (!employee) return res.status(401).json({ message: "Invalid credentials" });
    res.json({ message: "Login successful", employee });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

app.get("/employees", async (_req, res) => {
  try {
    const employees = await Employee.find();
    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: "Error fetching employees", error });
  }
});

app.delete("/employees/:id", async (req, res) => {
  try {
    const deleted = await Employee.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Employee not found" });
    res.json({ message: "Employee removed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

app.put("/complaints/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!["Pending", "In Progress", "Resolved"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }
    const complaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!complaint) return res.status(404).json({ message: "Complaint not found" });

    // Send email notification to citizen when complaint resolved
    if (status === "Resolved") {
      const citizen = await Citizen.findOne({ username: complaint.citizenUsername });
      if (citizen?.email) {
        await transporter.sendMail({
          from: "project.complaint.system25@gmail.com",
          to: citizen.email,
          subject: "Complaint Resolved",
          text: `Hello ${citizen.name}, your complaint titled "${complaint.title}" has been resolved. Thank you!`,
        });
      }
    }

    res.json({ message: "Complaint status updated", complaint });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

app.listen(5000, () => console.log("Server running on http://localhost:5000"));
