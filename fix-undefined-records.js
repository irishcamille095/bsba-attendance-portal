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

const Attendance = mongoose.model('Attendance', AttendanceSchema);

async function fixUndefinedRecords() {
    console.log('\n🔧 Finding and fixing undefined records...\n');

    try {
        // Find records with undefined fields
        const undefinedRecords = await Attendance.find({
            $or: [
                { studentId: { $in: [null, undefined, ''] } },
                { eventName: { $in: [null, undefined, '', 'undefined'] } },
                { sessionType: { $in: [null, undefined, ''] } },
                { status: { $in: [null, undefined, ''] } },
                { fine: { $in: [null, undefined] } }
            ]
        });

        console.log(`Found ${undefinedRecords.length} records with undefined fields\n`);

        if (undefinedRecords.length > 0) {
            // Sample first few
            console.log('Sample records:');
            undefinedRecords.slice(0, 5).forEach((r, i) => {
                console.log(`  [${i+1}] studentId=${r.studentId}, eventName=${r.eventName}, sessionType=${r.sessionType}, status=${r.status}, fine=${r.fine}`);
            });
            console.log();

            // These are likely from failed imports/backfills
            // Since they don't have complete data, delete them
            const result = await Attendance.deleteMany({
                $or: [
                    { studentId: { $in: [null, undefined, ''] } },
                    { eventName: { $in: [null, undefined, '', 'undefined'] } },
                    { sessionType: { $in: [null, undefined, ''] } },
                    { status: { $in: [null, undefined, ''] } },
                    { fine: { $in: [null, undefined] } }
                ]
            });

            console.log(`✅ Deleted ${result.deletedCount} incomplete/invalid records\n`);
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

mongoose.connect(mongoURI)
    .then(() => fixUndefinedRecords())
    .catch(err => {
        console.error('Connection error:', err.message);
        process.exit(1);
    });
