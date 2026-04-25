const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

// Define schemas
const AttendanceSchema = new mongoose.Schema({
    studentId: String,
    eventName: String,
    sessionType: String,
    status: String
});

const Attendance = mongoose.model('Attendance', AttendanceSchema);

mongoose.connect(mongoURI).then(async () => {
    try {
        // Check what sessionTypes exist for Clean Up Drive
        const sessions = await Attendance.distinct('sessionType', { eventName: 'Clean Up Drive (03/02/26)' });
        console.log('SessionTypes for Clean Up Drive:', sessions);
        
        // Check AttendanceSessions
        const AttendanceSessionSchema = new mongoose.Schema({
            eventName: String,
            type: String
        });
        const AttendanceSession = mongoose.model('AttendanceSession', AttendanceSessionSchema);
        
        const eventSessions = await AttendanceSession.find({ eventName: 'Clean Up Drive (03/02/26)' });
        console.log('AttendanceSessions for Clean Up Drive:', eventSessions.length);
        eventSessions.forEach(s => console.log(`  - ${s.eventName} | type: ${s.type}`));
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}).catch(err => {
    console.error('Connection error:', err);
    process.exit(1);
});
