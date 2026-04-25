const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    actionType: { type: String, required: true }, // e.g., 'override_fines', 'verify_payment', 'reject_payment'
    performedBy: { type: String, required: true }, // Officer/Adviser name or mmId
    performedByName: { type: String, required: true },
    performedByRole: { type: String, required: true }, // officer or adviser
    studentId: { type: String, default: null }, // MM-ID of the student affected
    studentName: { type: String, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: {} }, // Additional details about the action
    description: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now, index: true },
    status: { type: String, default: 'completed' } // completed, pending, failed
}, { collection: 'audit_logs' });

module.exports = mongoose.model('AuditLog', auditLogSchema);
