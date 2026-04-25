const mongoose = require('mongoose');

const DocumentTypeSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            default: '',
        },
        fileType: {
            type: String,
            enum: ['image', 'file', 'both'],
            required: true,
        },
        maxUploads: {
            type: Number,
            required: true,
            min: 1,
            default: 1,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
        updatedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { collection: 'documentTypes' }
);

module.exports = mongoose.model('DocumentType', DocumentTypeSchema);
