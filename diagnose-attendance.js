const mongoose = require('mongoose');

// Connection string
const mongoConnectionString = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

// Define Schema
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

const Attendance = mongoose.model('Attendance', AttendanceSchema);

async function diagnoseRecords() {
    try {
        await mongoose.connect(mongoConnectionString);
        console.log('Connected to MongoDB\n');

        // Get all records grouped by event
        const events = await Attendance.distinct('eventName');
        console.log(`Found ${events.length} events total\n`);

        for (const event of events.slice(0, 3)) {
            console.log(`\n=== Event: ${event} ===`);
            const records = await Attendance.find({ eventName: event }).lean();
            
            const statuses = {};
            records.forEach(r => {
                const status = r.status || 'undefined/missing';
                if (!statuses[status]) {
                    statuses[status] = 0;
                }
                statuses[status]++;
            });
            
            console.log(`Total records: ${records.length}`);
            console.log(`By status: ${JSON.stringify(statuses)}`);
            
            console.log('\nSample records (status, session, timestamp):');
            records.slice(0, 10).forEach(r => {
                const status = (r.status || 'undefined').padEnd(8);
                const session = (r.sessionType || 'unknown').padEnd(8);
                const hasTS = r.timestamp ? '✓ YES' : '✗ NO';
                console.log(`  ${r.studentName.padEnd(30)} | ${status} | ${session} | Has timestamp: ${hasTS}`);
            });
        }

        await mongoose.connection.close();
        console.log('\nConnection closed');
    } catch (error) {
        console.error('Diagnostic error:', error);
        await mongoose.connection.close();
        process.exit(1);
    }
}

diagnoseRecords();
