const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    studentId: { type: String, required: true, index: true }, // Student's mmId (e.g., "MM-001")
    studentName: { type: String, required: true },
    amount: { type: Number, required: true }, // Amount paid in PHP
    paymentMethod: { 
        type: String, 
        enum: ['cash', 'service'], 
        required: true 
    },
    description: { type: String, default: '' }, // Additional details about the payment
    status: {
        type: String,
        enum: ['pending', 'verified', 'rejected'],
        default: 'pending',
        index: true
    },
    submittedAt: { type: Date, default: Date.now },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: String, default: null }, // Officer/Adviser name who verified
    rejectionReason: { type: String, default: null }, // Reason if rejected
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', paymentSchema);
