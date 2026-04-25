const mongoose = require('mongoose');

const consentHistorySchema = new mongoose.Schema({
    consentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consent', index: true },
    studentId: { type: String, required: true, index: true }, // MM-ID
    studentName: { type: String, required: true },
    
    // What happened
    action: {
        type: String,
        enum: ['consent_given', 'consent_withdrawn', 'consent_requested', 'reminder_sent', 'consent_reviewed'],
        required: true
    },
    
    // Which categories affected
    affectedCategories: [{
        category: {
            type: String,
            enum: ['profile', 'attendance', 'payment', 'document', 'marketing', 'analytics', 'third_party']
        },
        previousValue: Boolean,
        newValue: Boolean
    }],
    
    // Who made the change
    initiatedBy: { type: String }, // MM-ID or 'system' or 'student'
    initiatedByName: { type: String },
    initiatedByRole: { type: String }, // student, officer, adviser, system
    
    // Request details
    reason: { type: String }, // Why they gave/withdrew consent
    requestId: { type: String }, // Reference to related data request
    
    // Technical details for audit
    ipAddress: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, default: Date.now, index: true },
    
    // Legal & Compliance
    consentText: { type: String }, // The text they consented to
    legalBasis: { type: String }, // e.g., "RA 10173 Article 3"
    
    // Status
    status: {
        type: String,
        enum: ['completed', 'pending', 'failed', 'cancelled'],
        default: 'completed'
    },
    
    // Notes for internal use
    notes: { type: String }
}, { collection: 'consent_history', timestamps: false });

// Index for efficient querying
consentHistorySchema.index({ studentId: 1, timestamp: -1 });
consentHistorySchema.index({ action: 1, timestamp: -1 });
consentHistorySchema.index({ initiatedBy: 1 });

module.exports = mongoose.model('ConsentHistory', consentHistorySchema);
