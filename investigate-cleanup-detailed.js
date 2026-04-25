const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI;

// Define schemas matching app.js
const AttendanceSchema = new mongoose.Schema({
    studentId: String,
    firstName: String,
    lastName: String,
    eventName: String,
    status: { type: String, default: 'Present', enum: ['Present', 'Absent', 'Excused'] },
    fine: { type: Number, default: 0 },
    sessionType: String,
    createdAt: { type: Date, default: Date.now },
    scannedAt: { type: Date }
});

const Attendance = mongoose.model('Attendance', AttendanceSchema);

mongoose.connect(mongoURI).then(async () => {
    try {
        console.log('=== CLEAN UP DRIVE ATTENDANCE INVESTIGATION ===\n');
        
        const records = await Attendance.find({ eventName: 'Clean Up Drive (03/02/26)' }).sort({ studentId: 1 });
        
        console.log(`Total records: ${records.length}`);
        
        const statusCounts = {};
        const finesBreakdown = {};
        
        records.forEach(record => {
            // Count by status
            statusCounts[record.status] = (statusCounts[record.status] || 0) + 1;
            
            // Track fine amounts
            if (!finesBreakdown[record.status]) {
                finesBreakdown[record.status] = [];
            }
            finesBreakdown[record.status].push(record.fine);
        });
        
        console.log('\nStatus breakdown:');
        Object.entries(statusCounts).forEach(([status, count]) => {
            console.log(`  ${status}: ${count} students`);
        });
        
        console.log('\nFine amount breakdown:');
        Object.entries(finesBreakdown).forEach(([status, amounts]) => {
            const total = amounts.reduce((a, b) => a + b, 0);
            const withFines = amounts.filter(a => a > 0).length;
            const avgFine = withFines > 0 ? (total / withFines).toFixed(2) : 0;
            console.log(`  ${status}:`);
            console.log(`    - Students with fines: ${withFines}`);
            console.log(`    - Total fine amount: PHP ${total.toFixed(2)}`);
            console.log(`    - Average fine (non-zero): PHP ${avgFine}`);
        });
        
        console.log('\nSample records (showing all):');
        records.forEach(record => {
            console.log(`  ${record.studentId} (${record.firstName} ${record.lastName}) - Status: ${record.status}, Fine: PHP ${record.fine}, SessionType: ${record.sessionType}`);
        });
        
        // Check if there are both session types
        const sessionTypes = [...new Set(records.map(r => r.sessionType))];
        console.log(`\nSession types in records: ${sessionTypes.join(', ')}`);
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}).catch(err => {
    console.error('Connection error:', err);
    process.exit(1);
});
