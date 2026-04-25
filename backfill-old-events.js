const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

// Define schemas
const AttendanceSchema = new mongoose.Schema({
    studentId: String,
    studentName: String,
    firstName: String,
    lastName: String,
    yearLevel: String,
    eventName: String,
    sessionType: String,
    timestamp: Date,
    status: String,
    fine: Number
});

const AttendanceSessionSchema = new mongoose.Schema({
    eventName: String,
    folderId: mongoose.Schema.Types.ObjectId,
    type: String,
    date: Date,
    token: String,
    eventType: { type: String, enum: ['Half Day', 'Whole Day'], required: true }
});

const UserSchema = new mongoose.Schema({
    mmId: String,
    firstName: String,
    lastName: String,
    yearLevel: String,
    role: String
});

const Attendance = mongoose.model('Attendance', AttendanceSchema);
const AttendanceSession = mongoose.model('AttendanceSession', AttendanceSessionSchema);
const User = mongoose.model('User', UserSchema);

async function backfillOldEvents() {
    try {
        await mongoose.connect(mongoURI);
        console.log('✅ Connected to MongoDB\n');

        // Get all attendance sessions
        const allSessions = await AttendanceSession.find();
        console.log(`Found ${allSessions.length} attendance sessions\n`);

        // Get all students
        const allStudents = await User.find({ role: 'student' });
        console.log(`Found ${allStudents.length} students\n`);

        let totalRecordsCreated = 0;

        for (const session of allSessions) {
            // Find students with records for this event+sessionType
            const existingRecords = await Attendance.find({
                eventName: session.eventName,
                sessionType: session.type
            }).select('studentId');

            const recordedStudentIds = new Set(existingRecords.map(r => r.studentId));

            // Create absence records for students missing from this session
            const missingStudents = allStudents.filter(s => !recordedStudentIds.has(s.mmId));

            if (missingStudents.length > 0) {
                const absenceRecords = missingStudents.map(student => ({
                    studentId: student.mmId,
                    studentName: `${student.lastName}, ${student.firstName}`,
                    firstName: student.firstName,
                    lastName: student.lastName,
                    yearLevel: student.yearLevel || '1st Year',
                    eventName: session.eventName,
                    sessionType: session.type,
                    timestamp: null,
                    status: 'Absent',
                    fine: session.eventType === 'Half Day' ? 50 : 30
                }));

                await Attendance.insertMany(absenceRecords);
                
                console.log(`✅ Created ${missingStudents.length} absence records for "${session.eventName}" (${session.type})`);
                totalRecordsCreated += missingStudents.length;
            } else {
                console.log(`ℹ️  "${session.eventName}" (${session.type}) - all students already have records`);
            }
        }

        console.log(`\n✅ Migration complete! Created ${totalRecordsCreated} absence records for old events`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

backfillOldEvents();
