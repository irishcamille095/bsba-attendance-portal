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

mongoose.connect(mongoURI).then(async () => {
    try {
        console.log('\n🔍 DUPLICATE RECORD ANALYSIS\n');

        const eventName = 'Clean Up Drive (03/02/26)';

        // Find students with more than 4 records
        const allRecords = await Attendance.find({ eventName });
        const recordsByStudent = {};

        for (const record of allRecords) {
            if (!recordsByStudent[record.studentId]) {
                recordsByStudent[record.studentId] = [];
            }
            recordsByStudent[record.studentId].push(record.sessionType);
        }

        console.log('Students with MORE than 4 records:\n');
        let duplicateIssues = [];
        let totalDuplicates = 0;

        for (const [studentId, sessions] of Object.entries(recordsByStudent)) {
            if (sessions.length > 4) {
                const sessionCounts = {};
                sessions.forEach(s => {
                    sessionCounts[s] = (sessionCounts[s] || 0) + 1;
                });
                
                console.log(`  ${studentId}: ${sessions.length} records`);
                Object.entries(sessionCounts).forEach(([type, count]) => {
                    if (count > 1) {
                        console.log(`    - ${type}: ${count}x (${count-1} duplicate(s))`);
                        totalDuplicates += count - 1;
                    }
                });
                
                duplicateIssues.push({ studentId, recordCount: sessions.length, sessionCounts });
            }
        }

        console.log(`\n📊 Summary:`);
        console.log(`   Affected students: ${duplicateIssues.length}`);
        console.log(`   Total duplicate records: ${totalDuplicates}`);

        // Sample check
        if (duplicateIssues.length > 0) {
            console.log(`\n💾 Sample (${duplicateIssues[0].studentId}):`);
            const sample = await Attendance.find({ 
                studentId: duplicateIssues[0].studentId, 
                eventName 
            });
            console.log(`   Total records stored: ${sample.length}`);
            sample.forEach((r, i) => {
                console.log(`   [${i+1}] ${r.sessionType} - Status: ${r.status}, Fine: ₱${r.fine}`);
            });
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}).catch(err => {
    console.error('Connection error:', err.message);
    process.exit(1);
});
