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
        const eventName = 'Clean Up Drive (03/02/26)';
        const requiredSessions = ['AM_IN', 'AM_OUT', 'PM_IN', 'PM_OUT'];

        // Get all students for this event
        const allRecords = await Attendance.find({ eventName });
        const students = new Set(allRecords.map(r => r.studentId));

        console.log(`\n🔍 Checking all ${students.size} students for missing sessions in ${eventName}\n`);

        let studentsWithIssues = [];
        
        for (const studentId of students) {
            const studentRecords = await Attendance.find({ studentId, eventName });
            const hasSessions = new Set(studentRecords.map(r => r.sessionType));
            
            const missingSessions = requiredSessions.filter(s => !hasSessions.has(s));
            
            if (missingSessions.length > 0) {
                studentsWithIssues.push({
                    studentId,
                    missing: missingSessions,
                    hasRecords: hasSessions.size
                });
            }
        }

        if (studentsWithIssues.length > 0) {
            console.log(`⚠️  Found ${studentsWithIssues.length} student(s) with missing sessions:\n`);
            studentsWithIssues.forEach(s => {
                console.log(`  ${s.studentId}: Missing ${s.missing.join(', ')} (has ${s.hasRecords}/4)`);
            });
        } else {
            console.log(`✅ All students have complete session records (4/4)!`);
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
