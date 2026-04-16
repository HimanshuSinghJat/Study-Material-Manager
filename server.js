require("dotenv").config();

const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
const multer   = require("multer");
const path     = require("path");
const bcrypt   = require("bcrypt");
const jwt      = require("jsonwebtoken");

const Material = require("./models/Material");
const User     = require("./models/User");

const app = express();

app.use(cors({
  origin: "https://study-material-manager.vercel.app",
  credentials: true
}));
app.use(express.json());

// ================= FILE UPLOAD =================
const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Serve uploaded files as static assets
app.use("/uploads", express.static("uploads"));

// ================= DATABASE =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(err => console.log("MongoDB Error:", err));

// ================= AUTH MIDDLEWARE =================
/*
 * Reads the token from the Authorization header.
 * Frontend sends: Authorization: <token>  (raw JWT, no "Bearer " prefix)
 * Sets req.user = { userId: <string> } for use in protected routes.
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ message: "Access denied. No token provided ❌" });
  }

  // Support both "Bearer <token>" and plain "<token>"
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);

    // Normalise: JWT payload uses { userId } — convert ObjectId to string
    req.user = { userId: verified.userId.toString() };

    next();
  } catch (err) {
    console.error("Token error:", err.message);
    return res.status(401).json({ message: "Invalid or expired token ❌" });
  }
};

// ================= ROUTES =================

// Health check
app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

// ================= GET MATERIALS (user-isolated) =================
app.get("/materials", verifyToken, async (req, res) => {
  try {
    const materials = await Material.find({ userId: req.user.userId });
    res.json(materials);
  } catch (err) {
    console.error("GET /materials error:", err);
    res.status(500).json({ message: "Error fetching materials ❌" });
  }
});

// ================= CREATE FOLDER =================
app.post("/create-folder", verifyToken, async (req, res) => {
  try {
    const { folder } = req.body;

    if (!folder || !folder.trim()) {
      return res.status(400).json({ message: "Folder name required ❌" });
    }

    const folderName = folder.trim();

    // Per-user folder uniqueness check
    const exists = await Material.findOne({
      folder: folderName,
      userId: req.user.userId,
      fileUrl: ""        // only check folder-placeholder entries
    });

    if (exists) {
      return res.status(409).json({ message: "Folder already exists ⚠️" });
    }

    const newFolder = new Material({
      title:   "folder",
      subject: "folder",
      folder:  folderName,
      fileUrl: "",
      userId:  req.user.userId
    });

    await newFolder.save();

    res.json({ message: "Folder created ✅" });

  } catch (err) {
    console.error("POST /create-folder error:", err);
    res.status(500).json({ message: "Error creating folder ❌" });
  }
});

// ================= UPLOAD FILE =================
app.post("/upload", verifyToken, upload.single("file"), async (req, res) => {
  try {

    // 🔥 ADD THIS LINE HERE
    console.log("TOKEN USER:", req.user);

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded ❌" });
    }

    const { title, subject, folder } = req.body;

    if (!title || !subject) {
      return res.status(400).json({ message: "Title and subject are required ❌" });
    }

    const newMaterial = new Material({
      title:   title.trim(),
      subject: subject.trim(),
      folder:  (folder || "General").trim(),
      fileUrl: `/uploads/${req.file.filename}`,
      userId:  req.user.userId
    });

    await newMaterial.save();

    res.json({ message: "File uploaded successfully ✅" });

  } catch (err) {
    console.error("POST /upload error:", err);
    res.status(500).json({ message: "Error uploading file ❌" });
  }
});
// ================= DELETE MATERIAL =================
app.delete("/materials/:id", verifyToken, async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);

    if (!material) {
      return res.status(404).json({ message: "Material not found ❌" });
    }

    // Ownership check — compare strings to avoid ObjectId type mismatch
    if (material.userId.toString() !== req.user.userId) {
      return res.status(403).json({ message: "Not authorized to delete this item ❌" });
    }

    await Material.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted successfully ✅" });

  } catch (err) {
    console.error("DELETE /materials/:id error:", err);
    res.status(500).json({ message: "Error deleting material ❌" });
  }
});

// ================= SIGNUP =================
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required ❌" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered ⚠️" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await new User({ name, email, password: hashedPassword }).save();

    res.json({ message: "User registered successfully ✅" });

  } catch (err) {
    console.error("POST /signup error:", err);
    res.status(500).json({ message: "Error registering user ❌" });
  }
});

// ================= LOGIN =================
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required ❌" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found ❌" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Wrong password ❌" });

    // 🔑 JWT payload uses { userId } — must match what verifyToken reads
    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful ✅",
      token,
      name:  user.name,
      email: user.email
    });

  } catch (err) {
    console.error("POST /login error:", err);
    res.status(500).json({ message: "Error logging in ❌" });
  }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});