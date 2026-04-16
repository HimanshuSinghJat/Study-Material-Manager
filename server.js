require("dotenv").config();

const express    = require("express");
const mongoose   = require("mongoose");
const cors       = require("cors");
const multer     = require("multer");
const path       = require("path");
const fs         = require("fs");
const bcrypt     = require("bcrypt");
const jwt        = require("jsonwebtoken");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const Material = require("./models/Material");
const User     = require("./models/User");

const app = express();

// ================= CORS =================
// In production set FRONTEND_URL env var on Render to your actual domain.
// Locally it defaults to * so any origin is allowed.
const allowedOrigin = process.env.FRONTEND_URL || "*";

app.use(cors({
  origin: allowedOrigin === "*" ? "*" : allowedOrigin,
  credentials: allowedOrigin !== "*"
}));

app.use(express.json());

// ================= CLOUDINARY CONFIG =================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ================= FILE UPLOAD =================
// Use Cloudinary in production, local disk in dev (if Cloudinary keys missing)
let upload;

if (
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
) {
  // ── CLOUDINARY storage (Render / production) ──────────────────────────────
  const cloudStorage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder:         "study-material-manager",
      resource_type:  "auto",   // accepts PDFs, images, etc.
      allowed_formats: ["pdf", "png", "jpg", "jpeg", "gif", "docx", "pptx", "xlsx", "mp4", "zip"]
    }
  });
  upload = multer({ storage: cloudStorage });
  console.log("🌥  Using Cloudinary storage");
} else {
  // ── Local disk storage (development fallback) ─────────────────────────────
  const uploadDir = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const diskStorage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
    }
  });
  upload = multer({ storage: diskStorage });
  app.use("/uploads", express.static(uploadDir));
  console.log("💾  Using local disk storage");
}

// ================= SERVE FRONTEND =================
// Express serves the HTML/CSS/JS files from ./frontend
// This means index.html, login.html, signup.html, view.html are all reachable
// at the same domain as the API → no CORS needed for API calls from frontend.
app.use(express.static(path.join(__dirname, "frontend")));

// ================= DATABASE =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(err => console.error("MongoDB Error:", err));

// ================= AUTH MIDDLEWARE =================
const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ message: "Access denied. No token provided ❌" });
  }

  // Support both "Bearer <token>" and plain "<token>"
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);

    // Normalise userId to string (avoids ObjectId comparison bugs)
    req.user = { userId: verified.userId.toString() };

    next();
  } catch (err) {
    console.error("Token error:", err.message);
    return res.status(401).json({ message: "Invalid or expired token ❌" });
  }
};

// ================= ROUTES =================

// Health check (Render pings this to check the service is alive)
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── GET MATERIALS (user-isolated) ──────────────────────────────────────────
app.get("/materials", verifyToken, async (req, res) => {
  try {
    const materials = await Material.find({ userId: req.user.userId });
    res.json(materials);
  } catch (err) {
    console.error("GET /materials error:", err);
    res.status(500).json({ message: "Error fetching materials ❌" });
  }
});

// ── CREATE FOLDER ───────────────────────────────────────────────────────────
app.post("/create-folder", verifyToken, async (req, res) => {
  try {
    const { folder } = req.body;

    if (!folder || !folder.trim()) {
      return res.status(400).json({ message: "Folder name required ❌" });
    }

    const folderName = folder.trim();

    const exists = await Material.findOne({
      folder:  folderName,
      userId:  req.user.userId,
      fileUrl: ""
    });

    if (exists) {
      return res.status(409).json({ message: "Folder already exists ⚠️" });
    }

    await new Material({
      title:   "folder",
      subject: "folder",
      folder:  folderName,
      fileUrl: "",
      userId:  req.user.userId
    }).save();

    res.json({ message: "Folder created ✅" });

  } catch (err) {
    console.error("POST /create-folder error:", err);
    res.status(500).json({ message: "Error creating folder ❌" });
  }
});

// ── UPLOAD FILE ─────────────────────────────────────────────────────────────
app.post("/upload", verifyToken, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded ❌" });
    }

    const { title, subject, folder } = req.body;

    if (!title || !subject) {
      return res.status(400).json({ message: "Title and subject are required ❌" });
    }

    // Cloudinary returns req.file.path (full URL); local disk returns filename
    const fileUrl = req.file.path
      ? req.file.path                             // Cloudinary: full https:// URL
      : `/uploads/${req.file.filename}`;          // local disk: relative path

    await new Material({
      title:   title.trim(),
      subject: subject.trim(),
      folder:  (folder || "General").trim(),
      fileUrl,
      userId:  req.user.userId
    }).save();

    res.json({ message: "File uploaded successfully ✅" });

  } catch (err) {
    console.error("POST /upload error:", err);
    res.status(500).json({ message: "Error uploading file ❌" });
  }
});

// ── DELETE MATERIAL ─────────────────────────────────────────────────────────
app.delete("/materials/:id", verifyToken, async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);

    if (!material) {
      return res.status(404).json({ message: "Material not found ❌" });
    }

    if (material.userId.toString() !== req.user.userId) {
      return res.status(403).json({ message: "Not authorized to delete this item ❌" });
    }

    // If file is on Cloudinary, delete it there too
    if (material.fileUrl && material.fileUrl.includes("cloudinary.com")) {
      try {
        // Extract public_id from the Cloudinary URL
        const parts   = material.fileUrl.split("/");
        const file    = parts[parts.length - 1];           // e.g. abc123.pdf
        const folder  = parts[parts.length - 2];           // e.g. study-material-manager
        const pubId   = `${folder}/${file.split(".")[0]}`; // folder/name_without_ext
        await cloudinary.uploader.destroy(pubId, { resource_type: "raw" });
      } catch (cdnErr) {
        // Non-fatal: log but still delete from DB
        console.warn("Cloudinary delete warning:", cdnErr.message);
      }
    }

    await Material.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted successfully ✅" });

  } catch (err) {
    console.error("DELETE /materials/:id error:", err);
    res.status(500).json({ message: "Error deleting material ❌" });
  }
});

// ── SIGNUP ──────────────────────────────────────────────────────────────────
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

// ── LOGIN ───────────────────────────────────────────────────────────────────
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

// ── SPA fallback – serve login.html for any unknown GET route ───────────────
// (So that refreshing /login.html etc. works when deployed)
app.get("(.*)", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "login.html"));
});

// ================= START SERVER =================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});