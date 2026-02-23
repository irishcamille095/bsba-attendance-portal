const mongoose = require('mongoose');

const resetRequestSchema = new mongoose.Schema({
    studentId: { type: String },
    email: { type: String, required: true }, // Email address for password reset
    name: String,
    reason: String,
    status: { type: String, default: 'Pending' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ResetRequest', resetRequestSchema);