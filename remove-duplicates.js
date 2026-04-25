/**
 * Remove duplicate attendance records
 * Keeps the first record, removes duplicates
 */

const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

const AttendanceSchema = new mongoose.Schema({
    studentId: String,
    eventName: String,
    sessionType: String,
    status: String,
    fine: Number,
    timestamp: Date
});

const Attendance = mongoose.model('Attendance', AttendanceSchema);

async function removeDuplicates() {
    console.log('\n🔧 Removing duplicate attendance records...\n');

    try {
        // Find all duplicates
        const pipeline = [
            {
                $group: {
                    _id: { studentId: '$studentId', eventName: '$eventName', sessionType: '$sessionType' },
                    count: { $sum: 1 },
                    records: { $push: '$_id' }
                }
            },
            { $match: { count: { $gt: 1 } } }
        ];
        
        const duplicates = await Attendance.aggregate(pipeline);
        console.log(`Found ${duplicates.length} duplicate groups\n`);

        let totalRemoved = 0;

        for (const dup of duplicates) {
            // Keep first record, remove the rest
            const recordsToDelete = dup.records.slice(1);
            
            const result = await Attendance.deleteMany({ _id: { $in: recordsToDelete } });
            
            if (result.deletedCount > 0) {
                console.log(`  ${dup._id.studentId} | ${dup._id.eventName} | ${dup._id.sessionType}: Removed ${result.deletedCount}`);
                totalRemoved += result.deletedCount;
            }
        }

        console.log(`\n✅ Removed ${totalRemoved} duplicate records\n`);

        // Verify
        const duplicatesAfter = await Attendance.aggregate(pipeline);
        if (duplicatesAfter.length === 0) {
            console.log('✨ All duplicates removed successfully!\n');
        } else {
            console.log(`⚠️  Warning: ${duplicatesAfter.length} duplicate groups still exist\n`);
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

mongoose.connect(mongoURI)
    .then(() => removeDuplicates())
    .catch(err => {
        console.error('Connection error:', err.message);
        process.exit(1);
    });
