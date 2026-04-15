require("dotenv").config(); // 🔥 ADD THIS AT TOP

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const Material = require("./models/Material");
const User = require("./models/User");

const app = express();

app.use(cors());
app.use(express.json());

// ================= FILE UPLOAD =================
const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

app.use("/uploads", express.static("uploads"));

// ================= DATABASE =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(err => console.log(err));

// ================= AUTH MIDDLEWARE =================
const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"];

  if (!token) {
    return res.json({ message: "Access denied ❌" });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET); // 🔥 FIXED
    req.user = verified;
    next();
  } catch (err) {
    res.json({ message: "Invalid token ❌" });
  }
};

// ================= ROUTES =================

// Test
app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

// GET materials
app.get("/materials", async (req, res) => {
  const materials = await Material.find();
  res.json(materials);
});

// ================= CREATE FOLDER =================
app.post("/create-folder", verifyToken, async (req, res) => {
  try {
    const { folder } = req.body;

    if (!folder) {
      return res.json({ message: "Folder name required ❌" });
    }

    const exists = await Material.findOne({ folder });

    if (exists) {
      return res.json({ message: "Folder already exists ⚠️" });
    }

    const newMaterial = new Material({
      title: "folder",
      subject: "folder",
      folder: folder,
      fileUrl: ""
    });

    await newMaterial.save();

    res.json({ message: "Folder created ✅" });

  } catch (err) {
    res.status(500).json({ message: "Error creating folder" });
  }
});

// ================= UPLOAD =================
app.post("/upload", verifyToken, upload.single("file"), async (req, res) => {
  try {
    const newMaterial = new Material({
      title: req.body.title,
      subject: req.body.subject,
      folder: req.body.folder,
      fileUrl: `/uploads/${req.file.filename}`
    });

    await newMaterial.save();

    res.json({ message: "File uploaded successfully ✅" });
  } catch (err) {
    res.status(500).json({ message: "Error uploading file" });
  }
});

// DELETE
app.delete("/materials/:id", async (req, res) => {
  await Material.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted successfully ✅" });
});

// ================= AUTH =================

// Signup
app.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  await new User({ name, email, password: hashedPassword }).save();

  res.json({ message: "User registered successfully ✅" });
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.json({ message: "User not found ❌" });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.json({ message: "Wrong password ❌" });

  const token = jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET // 🔥 FIXED
  );

  res.json({ message: "Login successful ✅", token });
});

// ================= START =================
app.listen(5000, () => {
  console.log("Server running on port 5000");
});