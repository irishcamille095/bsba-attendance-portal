const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

// Define schemas
const AttendanceSchema = new mongoose.Schema({
    eventName: String
});

const AttendanceSessionSchema = new mongoose.Schema({
    eventName: String
});

const Attendance = mongoose.model('Attendance', AttendanceSchema);
const AttendanceSession = mongoose.model('AttendanceSession', AttendanceSessionSchema);

mongoose.connect(mongoURI).then(async () => {
    try {
        console.log('🗑️  Deleting Monthly event...\n');

        // Delete Monthly from both collections
        const attendanceResult = await Attendance.deleteMany({ eventName: 'Monthly' });
        const sessionResult = await AttendanceSession.deleteMany({ eventName: 'Monthly' });

        console.log(`✅ Deleted ${attendanceResult.deletedCount} attendance records for "Monthly"`);
        console.log(`✅ Deleted ${sessionResult.deletedCount} session(s) for "Monthly"`);

        console.log(`\n✅ Monthly event completely removed!`);
        console.log('Now wallet should only show Clean Up Drive');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}).catch(err => {
    console.error('❌ Connection error:', err);
    process.exit(1);
});
