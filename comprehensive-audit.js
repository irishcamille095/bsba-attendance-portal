const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

// Define schemas
const UserSchema = new mongoose.Schema({ mmId: String, firstName: String, lastName: String, role: String });
const AttendanceSchema = new mongoose.Schema({
    studentId: String,
    eventName: String,
    sessionType: String,
    status: String,
    fine: Number,
    scannedAt: Date,
    createdAt: Date
});
const PaymentSchema = new mongoose.Schema({ studentId: String, amount: Number, status: String });
const SessionSchema = new mongoose.Schema({ eventName: String, eventType: String });

const User = mongoose.model('User', UserSchema);
const Attendance = mongoose.model('Attendance', AttendanceSchema);
const Payment = mongoose.model('Payment', PaymentSchema);
const AttendanceSession = mongoose.model('AttendanceSession', SessionSchema);

mongoose.connect(mongoURI).then(async () => {
    try {
        console.log('\n=== 🔍 COMPREHENSIVE DATA INTEGRITY AUDIT ===\n');

        const allStudentIds = (await User.find().select('mmId')).map(s => s.mmId);
        const allAttendance = await Attendance.find();
        const allPayments = await Payment.find();

        // CHECK 1: Orphaned attendance records
        console.log('CHECK 1: Orphaned Attendance Records');
        const orphanedAttendance = allAttendance.filter(a => !allStudentIds.includes(a.studentId));
        if (orphanedAttendance.length > 0) {
            console.log(`   ❌ FAIL: Found ${orphanedAttendance.length} orphaned records!\n`);
        } else {
            console.log(`   ✅ PASS: All attendance records linked to valid students\n`);
        }

        // CHECK 2: Orphaned payment records
        console.log('CHECK 2: Orphaned Payment Records');
        const orphanedPayments = allPayments.filter(p => !allStudentIds.includes(p.studentId));
        if (orphanedPayments.length > 0) {
            console.log(`   ❌ FAIL: Found ${orphanedPayments.length} orphaned payment records!\n`);
            const totalOrphanedAmount = orphanedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            console.log(`      Total amount: PHP ${totalOrphanedAmount.toFixed(2)}\n`);
        } else {
            console.log(`   ✅ PASS: All payment records linked to valid students\n`);
        }

        // CHECK 3: Duplicate attendance records
        console.log('CHECK 3: Duplicate Attendance Records');
        const duplicateCheck = {};
        allAttendance.forEach(record => {
            const key = `${record.studentId}|${record.eventName}|${record.sessionType}`;
            if (!duplicateCheck[key]) {
                duplicateCheck[key] = [];
            }
            duplicateCheck[key].push(record._id);
        });
        const duplicates = Object.entries(duplicateCheck).filter(([_, ids]) => ids.length > 1);
        if (duplicates.length > 0) {
            console.log(`   ❌ FAIL: Found ${duplicates.length} duplicate attendance combinations!\n`);
        } else {
            console.log(`   ✅ PASS: No duplicate attendance records\n`);
        }

        // CHECK 4: Records with missing scannedAt (cleanup script damage)
        console.log('CHECK 4: Absent Records Without Scan Tracking');
        const absences = allAttendance.filter(a => a.status === 'Absent');
        const unscannedAbsences = absences.filter(a => !a.scannedAt);
        console.log(`   Found ${unscannedAbsences.length}/${absences.length} absent records without scannedAt timestamps`);
        
        // Group by event to identify cleanup-affected events
        const byEvent = {};
        unscannedAbsences.forEach(a => {
            if (!byEvent[a.eventName]) byEvent[a.eventName] = 0;
            byEvent[a.eventName]++;
        });
        
        if (Object.keys(byEvent).length > 0) {
            console.log(`   ⚠️  WARNING - Events possibly affected by cleanup scripts:`);
            Object.entries(byEvent).forEach(([event, count]) => {
                console.log(`       • "${event}": ${count} records`);
            });
            console.log();
        } else {
            console.log(`   ✅ PASS: All absent records have proper scannedAt tracking\n`);
        }

        // CHECK 5: Fine calculations for absent records
        console.log('CHECK 5: Fine Consistency');
        const absentWithoutFines = absences.filter(a => !a.fine || a.fine === 0);
        if (absentWithoutFines.length > 0) {
            console.log(`   ❌ FAIL: Found ${absentWithoutFines.length} absent records without fines!\n`);
        } else {
            console.log(`   ✅ PASS: All absent records have proper fines\n`);
        }

        // CHECK 6: Event validity
        console.log('CHECK 6: Event Validity');
        const allEvents = await AttendanceSession.find();
        const attendanceEvents = new Set(allAttendance.map(a => a.eventName));
        const missingSessions = Array.from(attendanceEvents).filter(e => !allEvents.map(s => s.eventName).includes(e));
        if (missingSessions.length > 0) {
            console.log(`   ⚠️  WARNING: ${missingSessions.length} events have attendance but no session record`);
            missingSessions.slice(0, 5).forEach(e => console.log(`       • "${e}"`));
            console.log();
        } else {
            console.log(`   ✅ PASS: All attended events have session records\n`);
        }

        // SUMMARY
        console.log('=== SUMMARY ===');
        console.log(`Total Students: ${allStudentIds.length}`);
        console.log(`Total Attendance Records: ${allAttendance.length}`);
        console.log(`Total Payment Records: ${allPayments.length}`);
        console.log(`Total Events: ${allEvents.length}`);
        const uniqueStudents = new Set(allAttendance.map(r => r.studentId));
        console.log(`Unique Students in Attendance: ${uniqueStudents.size}`);
        
        const criticalIssues = orphanedAttendance.length + orphanedPayments.length + duplicates.length;
        console.log(`\n${criticalIssues === 0 ? '✅ NO CRITICAL ISSUES DETECTED' : `❌ ${criticalIssues} CRITICAL ISSUES FOUND`}\n`);

        await mongoose.connection.close();
        process.exit(criticalIssues > 0 ? 1 : 0);
    } catch (err) {
        console.error('Audit Error:', err.message);
        process.exit(1);
    }
}).catch(err => {
    console.error('Connection Error:', err.message);
    process.exit(1);
});
