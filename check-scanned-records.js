const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI;

// Define schemas
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
        console.log('=== CHECKING FOR SCANNED RECORDS ===\n');
        
        const records = await Attendance.find({ eventName: 'Clean Up Drive (03/02/26)' });
        
        const scannedRecords = records.filter(r => r.scannedAt);
        const unscannedRecords = records.filter(r => !r.scannedAt);
        
        console.log(`Total records: ${records.length}`);
        console.log(`Records with scannedAt timestamp: ${scannedRecords.length}`);
        console.log(`Records without scannedAt (never scanned): ${unscannedRecords.length}`);
        
        if (scannedRecords.length > 0) {
            console.log('\n✓ These students have scannedAt timestamps (they DID scan in):');
            const studentsWithScans = {};
            scannedRecords.forEach(r => {
                if (!studentsWithScans[r.studentId]) {
                    studentsWithScans[r.studentId] = [];
                }
                studentsWithScans[r.studentId].push(r.sessionType);
            });
            
            Object.entries(studentsWithScans).forEach(([id, types]) => {
                console.log(`  ${id}: Scanned for ${types.join(', ')}`);
            });
        }
        
        if (unscannedRecords.length > 0) {
            console.log(`\n✗ These records have NO scannedAt timestamp (never scanned):`);
            const firstFew = unscannedRecords.slice(0, 10);
            firstFew.forEach(r => {
                console.log(`  ${r.studentId} (${r.firstName} ${r.lastName}): ${r.sessionType}`);
            });
            if (unscannedRecords.length > 10) {
                console.log(`  ... and ${unscannedRecords.length - 10} more`);
            }
        }
        
        await mongoose.connection.close();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}).catch(err => {
    console.error('Connection error:', err);
    process.exit(1);
});
