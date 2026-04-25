const mongoose = require('mongoose');

const StudentDocumentSchema = new mongoose.Schema(
    {
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        documentType: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DocumentType',
            required: true,
        },
        gridFSFileId: {
            type: String,
            required: true,
        },
        fileName: {
            type: String,
            required: true,
        },
        fileSize: {
            type: Number,
        },
        uploadedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { collection: 'studentDocuments' }
);

// Compound unique index to allow multiple uploads per document type per student
StudentDocumentSchema.index({ student: 1, documentType: 1, uploadedAt: 1 });

module.exports = mongoose.model('StudentDocument', StudentDocumentSchema);
