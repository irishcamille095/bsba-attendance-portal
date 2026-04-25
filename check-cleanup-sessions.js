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

const AttendanceSessionSchema = new mongoose.Schema({
    eventName: String,
    type: String
});

const Attendance = mongoose.model('Attendance', AttendanceSchema);
const AttendanceSession = mongoose.model('AttendanceSession', AttendanceSessionSchema);

mongoose.connect(mongoURI).then(async () => {
    try {
        console.log('=== ATTENDANCE RECORDS for Clean Up Drive ===');
        const attendanceRecords = await Attendance.find({ eventName: 'Clean Up Drive (03/02/26)' });
        
        const sessionTypes = {};
        attendanceRecords.forEach(record => {
            if (!sessionTypes[record.sessionType]) {
                sessionTypes[record.sessionType] = 0;
            }
            sessionTypes[record.sessionType]++;
        });
        
        console.log('SessionTypes found in Attendance collection:');
        Object.entries(sessionTypes).forEach(([type, count]) => {
            console.log(`  - ${type}: ${count} records`);
        });
        
        console.log('\n=== ATTENDANCE SESSIONS for Clean Up Drive ===');
        const sessions = await AttendanceSession.find({ eventName: 'Clean Up Drive (03/02/26)' });
        console.log(`Found ${sessions.length} sessions in AttendanceSession collection:`);
        sessions.forEach(s => {
            console.log(`  - type: "${s.type}"`);
        });
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}).catch(err => {
    console.error('Connection error:', err);
    process.exit(1);
});
