const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

// Define schemas
const AttendanceSchema = new mongoose.Schema({
    studentId: String,
    eventName: String,
    sessionType: String
});

const AttendanceSessionSchema = new mongoose.Schema({
    eventName: String
});

const Attendance = mongoose.model('Attendance', AttendanceSchema);
const AttendanceSession = mongoose.model('AttendanceSession', AttendanceSessionSchema);

mongoose.connect(mongoURI).then(async () => {
    try {
        console.log('🗑️  Deleting orphaned attendance records...\n');

        // Get all unique eventNames from Attendance
        const attendanceEventNames = await Attendance.distinct('eventName');
        
        // Get all eventNames from AttendanceSession
        const sessionEventNames = await AttendanceSession.distinct('eventName');
        const sessionSet = new Set(sessionEventNames);

        // Find orphaned events (in Attendance but not in AttendanceSession)
        const orphanedEvents = attendanceEventNames.filter(name => !sessionSet.has(name));

        let totalDeleted = 0;

        for (const eventName of orphanedEvents) {
            const result = await Attendance.deleteMany({ eventName });
            console.log(`✅ Deleted ${result.deletedCount} records for "${eventName}"`);
            totalDeleted += result.deletedCount;
        }

        console.log(`\n✅ Total deleted: ${totalDeleted} records`);
        console.log('Orphaned events removed from wallet!');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}).catch(err => {
    console.error('❌ Connection error:', err);
    process.exit(1);
});
