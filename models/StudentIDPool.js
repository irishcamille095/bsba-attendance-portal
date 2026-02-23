const mongoose = require('mongoose');

const studentIDPoolSchema = new mongoose.Schema({
    mmId: { type: String, unique: true, required: true }, // e.g., "MM-001"
    qrCode: { type: String, required: true }, // Base64 encoded QR code
    isAssigned: { type: Boolean, default: false },
    assignedToUsername: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StudentIDPool', studentIDPoolSchema);
