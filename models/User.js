const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true }, // Email for password reset
    password: { type: String, required: true },
    role: { type: String, required: true },
    mmId: { type: String, unique: true, sparse: true, index: true }, // e.g., "MM-001" - INDEXED for fast lookups
    qrCode: { type: String, unique: true, sparse: true }, // Base64 encoded QR code
    corPath: { type: String, default: null }, // Path to uploaded COR file
    resetRequest: { type: Boolean, default: false } // Flag for password reset requests
});

// Create index on role for faster filtering by role
userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);