const mongoose = require("mongoose");

const materialSchema = new mongoose.Schema({
  title: String,
  subject: String,
  fileUrl: String,
  folder: String // 🔥 REQUIRED
});

module.exports = mongoose.model("Material", materialSchema);