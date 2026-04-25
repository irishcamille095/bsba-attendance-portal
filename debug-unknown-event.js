const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

// Define schemas
const AttendanceSchema = new mongoose.Schema({
    studentId: String,
    eventName: String,
    sessionType: String
});

const Attendance = mongoose.model('Attendance', AttendanceSchema);

mongoose.connect(mongoURI).then(async () => {
    try {
        console.log('🔍 Checking for undefined/null eventNames...\n');

        // Find records with undefined or null eventName
        const undefinedRecords = await Attendance.find({ 
            eventName: { $in: [undefined, null, 'undefined'] }
        });

        console.log(`Found ${undefinedRecords.length} records with undefined/null eventName`);
        if (undefinedRecords.length > 0) {
            console.log('Sample records:');
            undefinedRecords.slice(0, 5).forEach(r => {
                console.log(`  - StudentID: ${r.studentId}, SessionType: ${r.sessionType}, EventName: "${r.eventName}"`);
            });
        }

        console.log('\n=== CLEAN UP DRIVE SESSION TYPES ===');
        const cleanupSessions = await Attendance.distinct('sessionType', { eventName: 'Clean Up Drive (03/02/26)' });
        console.log('SessionTypes for Clean Up Drive:', cleanupSessions);

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}).catch(err => {
    console.error('❌ Connection error:', err);
    process.exit(1);
});
