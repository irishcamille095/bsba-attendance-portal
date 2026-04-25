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
        console.log('🔍 Finding orphaned attendance records...\n');

        // Get all unique eventNames from Attendance
        const attendanceEventNames = await Attendance.distinct('eventName');
        
        // Get all eventNames from AttendanceSession
        const sessionEventNames = await AttendanceSession.distinct('eventName');
        const sessionSet = new Set(sessionEventNames);

        console.log(`Events in Attendance collection: ${attendanceEventNames.length}`);
        console.log(`Events in AttendanceSession collection: ${sessionEventNames.length}\n`);

        // Find orphaned events (in Attendance but not in AttendanceSession)
        const orphanedEvents = attendanceEventNames.filter(name => !sessionSet.has(name));
        
        console.log(`📋 Orphaned events (${orphanedEvents.length}):`);
        for (const eventName of orphanedEvents) {
            const count = await Attendance.countDocuments({ eventName });
            console.log(`  - "${eventName}": ${count} records`);
        }

        console.log('\n📋 Valid events (in AttendanceSession):');
        for (const eventName of sessionEventNames) {
            const count = await Attendance.countDocuments({ eventName });
            console.log(`  - "${eventName}": ${count} records`);
        }

        if (orphanedEvents.length > 0) {
            console.log(`\n⚠️  Found ${orphanedEvents.length} orphaned events`);
            console.log('Run: node delete-orphaned-events.js');
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
