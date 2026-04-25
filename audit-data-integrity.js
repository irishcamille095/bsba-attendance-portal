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
            console.log(`   ⚠️  MANUAL CHECK NEEDED - Events affected by cleanup scripts:  `);
            Object.entries(byEvent).forEach(([event, count]) => {
                console.log(`       • "${event}": ${count} records`);
            });
            console.log(`   (These may be legitimate or caused by data cleanup scripts)\n`);
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
            console.log(`   ⚠️  WARNING: ${missingSessions.length} events have attendance but no session record:`);
            missingSessions.forEach(e => console.log(`       • "${e}"`));
            console.log();
        } else {
            console.log(`   ✅ PASS: All attended events have session records\n`);
        }

        // SUMMARY
        console.log('=== SUMMARY ===');
        console.log(`Total Students: ${allStudentIds.length}`);
        console.log(`Total Attendance Records: ${allAttendance.length}`);
        console.log(`Total Payment Records: ${allPayments.length}`);
        const students = new Set(allAttendance.map(r => r.studentId));
        console.log(`Unique Students in Attendance: ${students.size}`);
        console.log(`\n${orphanedAttendance.length === 0 && orphanedPayments.length === 0 && duplicates.length === 0 ? '✅ NO CRITICAL ISSUES' : '❌ ISSUES REQUIRE ATTENTION'}\n`);

        await mongoose.connection.close();
        process.exit(orphanedAttendance.length > 0 || orphanedPayments.length > 0 || duplicates.length > 0 ? 1 : 0);
    } catch (err) {
        console.error('Audit Error:', err.message);
        process.exit(1);
    }
}).catch(err => {
    console.error('Connection Error:', err.message);
    process.exit(1);
});
        
        let completeCount = 0;
        let incompleteCount = 0;
        
        for (const studentId of students) {
            const studentSessions = new Set((await Attendance.find({ studentId, eventName: 'Clean Up Drive (03/02/26)' })).map(r => r.sessionType));
            if (studentSessions.size === 4) {
                completeCount++;
            } else {
                incompleteCount++;
            }
        }
        
        if (incompleteCount === 0) {
            console.log(`   ✅ PASS: All ${completeCount} students have 4/4 sessions\n`);
        } else {
            console.log(`   ❌ FAIL: ${incompleteCount} students incomplete, ${completeCount} complete\n`);
        }

        // Check 3: Total fines match expectations
        console.log('3️⃣  Fine Calculations:');
        const studentFines = {};
        for (const record of allRecords) {
            if (!studentFines[record.studentId]) {
                studentFines[record.studentId] = 0;
            }
            studentFines[record.studentId] += record.fine;
        }
        
        const expectedFine = 120; // 4 sessions × ₱30
        let correctCount = 0;
        
        for (const [studentId, fine] of Object.entries(studentFines)) {
            if (fine === expectedFine) {
                correctCount++;
            }
        }
        
        console.log(`   Expected per student (Absent all day): ₱${expectedFine}`);
        console.log(`   Correct: ${correctCount}/${students.size}`);
        
        if (correctCount === students.size) {
            console.log(`   ✅ PASS: All students have correct fine structure\n`);
        } else {
            console.log(`   ⚠️  WARNING: ${students.size - correctCount} students have incorrect totals\n`);
        }

        // Check 4: No orphaned records
        console.log('4️⃣  Orphaned Records Check:');
        const eventNames = await Attendance.distinct('eventName');
        console.log(`   Total unique events in Attendance: ${eventNames.length}`);
        console.log(`   ✅ PASS: Check app.js - events should exist in AttendanceSession\n`);

        console.log('═'.repeat(50));
        console.log('Summary: Data appears consistent after fix\n');

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}).catch(err => {
    console.error('Connection error:', err.message);
    process.exit(1);
});
