#!/usr/bin/env node

/**
 * Migration Script: Update existing Attendance records with new format
 * 
 * This script:
 * 1. Connects to MongoDB
 * 2. Finds all Attendance records
 * 3. For each record, looks up the student by studentId (mmId)
 * 4. Updates the attendance record with:
 *    - firstName
 *    - lastName
 *    - yearLevel
 *    - studentName formatted as 'Last Name, First Name'
 * 5. Provides a summary of the migration
 * 
 * Run with: npm run migrate-attendance-format
 * or: node migrate-attendance-format.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

// Define User Schema
const userSchema = new mongoose.Schema({
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    middleName: { type: String, default: '', trim: true },
    name: { type: String, default: '' },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, required: true },
    mmId: { type: String, unique: true, sparse: true, index: true },
    qrCode: { type: String, unique: true, sparse: true },
    corPath: { type: String, default: null },
    resetRequest: { type: Boolean, default: false },
    yearLevel: { type: String, default: '1st Year' }
});

// Define Attendance Schema
const attendanceSchema = new mongoose.Schema({
    studentId: String,
    studentName: String,
    firstName: String,
    lastName: String,
    yearLevel: String,
    eventName: String,
    sessionType: String,
    sessionId: String,
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);

async function migrateAttendanceRecords() {
    try {
        await mongoose.connect(mongoURI);
        console.log('[INFO] Connected to MongoDB');

        // Find all attendance records
        const allAttendance = await Attendance.find({});
        console.log(`[INFO] Found ${allAttendance.length} attendance records to process`);

        let updatedCount = 0;
        let errorCount = 0;
        const errors = [];

        for (const record of allAttendance) {
            try {
                // Check if record already has the new fields properly formatted
                if (record.firstName && record.lastName && record.yearLevel) {
                    // Verify the studentName is in the correct format
                    const expectedName = `${record.lastName}, ${record.firstName}`;
                    if (record.studentName === expectedName) {
                        // Already migrated, skip
                        continue;
                    }
                }

                // Look up the student
                const student = await User.findOne({ mmId: record.studentId });

                if (!student) {
                    errors.push(`Student not found for MM-ID: ${record.studentId} (Record ID: ${record._id})`);
                    errorCount++;
                    continue;
                }

                // Format the student name
                const formattedName = `${student.lastName}, ${student.firstName}`;

                // Update the attendance record
                record.firstName = student.firstName;
                record.lastName = student.lastName;
                record.yearLevel = student.yearLevel || '1st Year';
                record.studentName = formattedName;

                await record.save();
                updatedCount++;

                // Log progress every 50 records
                if (updatedCount % 50 === 0) {
                    console.log(`[PROGRESS] Updated ${updatedCount} records...`);
                }
            } catch (err) {
                errors.push(`Error updating record ${record._id}: ${err.message}`);
                errorCount++;
                console.error(`[ERROR] Failed to update record ${record._id}:`, err.message);
            }
        }

        console.log('\n========== MIGRATION SUMMARY ==========');
        console.log(`✅ Total Attendance Records Updated: ${updatedCount}`);
        console.log(`❌ Errors Encountered: ${errorCount}`);

        if (errors.length > 0) {
            console.log('\n[ERRORS]');
            errors.forEach(error => console.log(`  - ${error}`));
        }

        console.log('=======================================\n');

        if (updatedCount > 0) {
            console.log(`[SUCCESS] Migration completed! ${updatedCount} records updated.`);
        } else {
            console.log('[INFO] All records are already in the correct format or no records found.');
        }

        process.exit(0);
    } catch (err) {
        console.error('[ERROR] Migration failed:', err);
        process.exit(1);
    }
}

// Run migration
migrateAttendanceRecords();
