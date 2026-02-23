const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true }, // Email for password reset
    password: { type: String, required: true },
    role: { type: String, required: true },
    mmId: { type: String, unique: true, sparse: true }, // e.g., "MM-001"
    qrCode: { type: String, unique: true, sparse: true }, // Base64 encoded QR code
    corPath: { type: String, default: null } // Path to uploaded COR file
});

module.exports = mongoose.model('User', userSchema);