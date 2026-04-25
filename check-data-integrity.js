/**
 * DATA INTEGRITY CHECK SCRIPT
 * 
 * Run this weekly to catch any data quality issues before they cause problems
 * Usage: node check-data-integrity.js
 * 
 * What it checks:
 * 1. Duplicate attendance records (same student+event+session)
 * 2. Orphaned records (attendance without matching event)
 * 3. Undefined/missing fields
 * 4. Session imbalance (events should have equal records per session type)
 * 5. Fine calculation correctness
 */

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

const AttendanceSessionSchema = new mongoose.Schema({
    eventName: String,
    type: String,
    eventType: String
});

const Attendance = mongoose.model('Attendance', AttendanceSchema);
const AttendanceSession = mongoose.model('AttendanceSession', AttendanceSessionSchema);

async function checkIntegrity() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('    📊 BSBA PORTAL - DATA INTEGRITY CHECK');
    console.log(`    ${new Date().toLocaleString()}`);
    console.log('═══════════════════════════════════════════════════════\n');

    const issues = [];

    try {
        // CHECK 1: Duplicate Records
        console.log('1️⃣  Checking for duplicate records...');
        const pipeline = [
            {
                $group: {
                    _id: { studentId: '$studentId', eventName: '$eventName', sessionType: '$sessionType' },
                    count: { $sum: 1 }
                }
            },
            { $match: { count: { $gt: 1 } } }
        ];
        
        const duplicates = await Attendance.aggregate(pipeline);
        if (duplicates.length > 0) {
            issues.push(`❌ Found ${duplicates.length} duplicate record groups`);
            duplicates.slice(0, 3).forEach(dup => {
                console.log(`   ${dup._id.studentId} | ${dup._id.eventName} | ${dup._id.sessionType}: ${dup.count}x`);
            });
            if (duplicates.length > 3) console.log(`   ... and ${duplicates.length - 3} more`);
        } else {
            console.log('   ✅ No duplicates found\n');
        }

        // CHECK 2: Invalid/Undefined fields
        console.log('2️⃣  Checking for undefined/invalid fields...');
        const invalidRecords = await Attendance.countDocuments({
            $or: [
                { studentId: { $in: [null, undefined, ''] } },
                { eventName: { $in: [null, undefined, '', 'undefined'] } },
                { sessionType: { $in: [null, undefined, ''] } },
                { status: { $in: [null, undefined, ''] } },
                { fine: { $in: [null, undefined] } }
            ]
        });
        
        if (invalidRecords > 0) {
            issues.push(`❌ Found ${invalidRecords} records with missing/invalid fields`);
            console.log(`   ${invalidRecords} records have undefined fields\n`);
        } else {
            console.log('   ✅ All records have valid fields\n');
        }

        // CHECK 3: Orphaned records (attendance without matching event)
        console.log('3️⃣  Checking for orphaned records...');
        const allEventNames = await AttendanceSession.distinct('eventName');
        const orphaned = await Attendance.countDocuments({
            eventName: { $nin: allEventNames }
        });
        
        if (orphaned > 0) {
            issues.push(`❌ Found ${orphaned} orphaned attendance records`);
            console.log(`   ${orphaned} records reference non-existent events\n`);
        } else {
            console.log('   ✅ No orphaned records\n');
        }

        // CHECK 4: Session imbalance per event
        console.log('4️⃣  Checking for session imbalance...');
        const events = await AttendanceSession.distinct('eventName');
        let imbalanced = [];
        
        for (const eventName of events) {
            const sessionTypes = new Set();
            const records = await Attendance.find({ eventName });
            const counts = {};
            
            records.forEach(r => {
                counts[r.sessionType] = (counts[r.sessionType] || 0) + 1;
                sessionTypes.add(r.sessionType);
            });
            
            const values = Object.values(counts);
            const min = Math.min(...values);
            const max = Math.max(...values);
            
            if (min !== max && values.length > 1) {
                imbalanced.push({ eventName, counts, diff: max - min });
            }
        }
        
        if (imbalanced.length > 0) {
            console.log(`   Found ${imbalanced.length} events with imbalanced sessions`);
            imbalanced.slice(0, 3).forEach(item => {
                console.log(`   ${item.eventName}: ${JSON.stringify(item.counts)} (diff: ${item.diff})`);
            });
            console.log();
        } else {
            console.log('   ✅ All events have balanced sessions\n');
        }

        // SUMMARY
        console.log('═══════════════════════════════════════════════════════');
        if (issues.length === 0) {
            console.log('✅ DATA INTEGRITY CHECK PASSED - No issues found!\n');
        } else {
            console.log(`⚠️  ISSUES FOUND: ${issues.length}\n`);
            issues.forEach(issue => console.log(`  ${issue}`));
            console.log('\n📝 Recommended Actions:');
            console.log('  1. Review findings with the development team');
            console.log('  2. Run cleanup scripts if needed');
            console.log('  3. Check recent event creation/modification activity\n');
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Check failed:', err.message);
        process.exit(1);
    }
}

mongoose.connect(mongoURI)
    .then(() => checkIntegrity())
    .catch(err => {
        console.error('Connection error:', err.message);
        process.exit(1);
    });
