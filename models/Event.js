const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
    name: { type: String, required: true },
    folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', required: true },
    createdAt: { type: Date, default: Date.now },
    // This allows one student to have multiple timestamps in one row
    attendance: [{
        studentId: String,
        studentName: String,
        amIn: { type: Date },
        amOut: { type: Date },
        pmIn: { type: Date },
        pmOut: { type: Date }
    }]
});

module.exports = mongoose.model('Event', EventSchema);