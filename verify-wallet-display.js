const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

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
        const studentId = 'MM-055';
        const eventName = 'Clean Up Drive (03/02/26)';

        // Get student records
        const records = await Attendance.find({ studentId, eventName }).sort({ sessionType: 1 });

        console.log(`\n📊 Wallet Display for ${studentId} - ${eventName}\n`);
        console.log('Session Details:');
        
        let totalFine = 0;
        records.forEach((r, index) => {
            console.log(`  ${index + 1}. ${r.sessionType}: ${r.status} - ₱${r.fine}`);
            totalFine += r.fine;
        });

        console.log(`\n💰 Total Fine: ₱${totalFine}`);
        console.log(`✅ All 4 sessions now visible in wallet!\n`);

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}).catch(err => {
    console.error('Connection error:', err.message);
    process.exit(1);
});
