const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

// Define schemas
const AttendanceSchema = new mongoose.Schema({
    eventName: String,
    sessionType: String
});

const Attendance = mongoose.model('Attendance', AttendanceSchema);

mongoose.connect(mongoURI).then(async () => {
    try {
        console.log('🗑️  Cleaning up undefined/unknown events and General sessions...\n');

        // 1. Delete all records with undefined eventName
        const undefinedResult = await Attendance.deleteMany({ 
            eventName: { $in: [undefined, null, 'undefined'] }
        });
        console.log(`✅ Deleted ${undefinedResult.deletedCount} records with undefined eventName`);

        // 2. Delete all "General" session type records for Clean Up Drive
        const generalResult = await Attendance.deleteMany({
            eventName: 'Clean Up Drive (03/02/26)',
            sessionType: 'General'
        });
        console.log(`✅ Deleted ${generalResult.deletedCount} "General" session records for Clean Up Drive`);

        console.log(`\n✅ Cleanup complete!`);
        console.log('Now wallet should only show Clean Up Drive with 4 sessions: AM_IN, AM_OUT, PM_IN, PM_OUT');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}).catch(err => {
    console.error('❌ Connection error:', err);
    process.exit(1);
});
