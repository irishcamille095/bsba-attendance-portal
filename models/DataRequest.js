const mongoose = require('mongoose');

const dataRequestSchema = new mongoose.Schema({
    requesterId: { type: String, required: true }, // Student MM-ID
    requesterName: { type: String, required: true },
    requesterEmail: { type: String, required: true },
    requestType: {
        type: String,
        enum: ['data_access', 'data_correction', 'data_deletion'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'rejected'],
        default: 'pending'
    },
    description: { type: String }, // For correction requests - what needs to be corrected
    submissionDate: { type: Date, default: Date.now, index: true },
    completionDate: { type: Date },
    processedBy: { type: String }, // Officer/Adviser who processed it
    processedByName: { type: String },
    notes: { type: String }, // Internal notes from officer
    dataFile: { type: String }, // Path/URL to downloaded data file (for data_access)
    expirationDate: { type: Date } // Expiration date for data file access (30 days)
}, { collection: 'data_requests' });

// Index for finding requests by requester
dataRequestSchema.index({ requesterId: 1 });
dataRequestSchema.index({ status: 1 });
dataRequestSchema.index({ submissionDate: -1 });

module.exports = mongoose.model('DataRequest', dataRequestSchema);
