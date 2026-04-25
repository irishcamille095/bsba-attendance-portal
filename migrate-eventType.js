const mongoose = require('mongoose');

// Connection string - using same as app.js
const mongoConnectionString = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

// Define Schema
const AttendanceSessionSchema = new mongoose.Schema({
    eventName: String,
    folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder' },
    type: String,
    date: Date,
    token: String,
    eventType: { type: String, enum: ['Half Day', 'Whole Day'] }
});

const AttendanceSession = mongoose.model('AttendanceSession', AttendanceSessionSchema);

async function migrateEventType() {
    try {
        await mongoose.connect(mongoConnectionString);
        console.log('Connected to MongoDB');

        // Find all AttendanceSessions without eventType and update them to 'Whole Day'
        const result = await AttendanceSession.updateMany(
            { eventType: { $in: [null, undefined, ''] } },
            { $set: { eventType: 'Whole Day' } }
        );

        console.log(`Migration completed!`);
        console.log(`Updated ${result.modifiedCount} documents to have eventType: 'Whole Day'`);
        console.log(`Matched ${result.matchedCount} documents`);

        await mongoose.connection.close();
        console.log('Connection closed');
    } catch (error) {
        console.error('Migration error:', error);
        await mongoose.connection.close();
        process.exit(1);
    }
}

migrateEventType();
