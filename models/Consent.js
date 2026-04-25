const mongoose = require('mongoose');

const consentSchema = new mongoose.Schema({
    studentId: { type: String, required: true, unique: true, index: true }, // MM-ID
    studentName: { type: String, required: true },
    
    // Main consent
    hasConsent: { type: Boolean, default: false },
    consentDate: { type: Date, default: null }, // When they accepted
    consentText: { type: String, default: '' }, // The text they consented to
    consentIp: { type: String, default: null }, // IP address when accepted
    
    // Withdrawal
    consentRevoked: { type: Boolean, default: false },
    revokedDate: { type: Date, default: null }, // When they withdrew
    revokedReason: { type: String, default: '' },
    
    // Audit trail
    updatedAt: { type: Date, default: Date.now },
    history: [{
        action: { type: String, enum: ['given', 'withdrawn'] },
        date: { type: Date, default: Date.now },
        ipAddress: { type: String },
        reason: { type: String }
    }]
}, { collection: 'consent' });

// Auto-update updatedAt
consentSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Consent', consentSchema);
