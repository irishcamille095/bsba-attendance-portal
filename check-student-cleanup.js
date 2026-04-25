const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

// Define schemas
const AttendanceSchema = new mongoose.Schema({
    studentId: String,
    eventName: String,
    sessionType: String,
    status: String,
    fine: Number
});

const AttendanceSessionSchema = new mongoose.Schema({
    eventName: String,
    type: String,
    eventType: String
});

const Attendance = mongoose.model('Attendance', AttendanceSchema);
const AttendanceSession = mongoose.model('AttendanceSession', AttendanceSessionSchema);

mongoose.connect(mongoURI).then(async () => {
    try {
        console.log('🔍 Checking Clean Up Drive for test student MM-055...\n');

        // Get test student's records for Clean Up Drive
        const studentRecords = await Attendance.find({ 
            studentId: 'MM-055',
            eventName: 'Clean Up Drive (03/02/26)'
        });

        console.log(`Found ${studentRecords.length} records for MM-055 in Clean Up Drive:`);
        studentRecords.forEach(r => {
            console.log(`  - ${r.sessionType}: Status=${r.status}, Fine=${r.fine}`);
        });

        // Check what sessions exist for Clean Up Drive
        const sessions = await AttendanceSession.find({ eventName: 'Clean Up Drive (03/02/26)' });
        console.log(`\nAttendanceSession entries for Clean Up Drive: ${sessions.length}`);
        sessions.forEach(s => {
            console.log(`  - type: ${s.type}, eventType: ${s.eventType}`);
        });

        // Check all students count per session
        console.log('\nTotal records per session:');
        const sessionTypes = ['AM_IN', 'AM_OUT', 'PM_IN', 'PM_OUT'];
        for (const sessionType of sessionTypes) {
            const count = await Attendance.countDocuments({ 
                eventName: 'Clean Up Drive (03/02/26)',
                sessionType: sessionType
            });
            console.log(`  - ${sessionType}: ${count} records`);
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}).catch(err => {
    console.error('❌ Connection error:', err);
    process.exit(1);
});
