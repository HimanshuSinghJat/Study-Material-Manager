const mongoose = require("mongoose");

const materialSchema = new mongoose.Schema({
  title:   { type: String, required: true },
  subject: { type: String, required: true },
  fileUrl: { type: String, default: "" },
  folder:  { type: String, required: true },
  // 🔑 Link every material to a user (CRITICAL for data isolation)
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

module.exports = mongoose.model("Material", materialSchema);