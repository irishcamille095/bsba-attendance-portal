const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

// Define Attendance Schema
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

mongoose.connect(mongoURI).then(async () => {
    try {
        // Create absence record for MM-055 for Clean Up Drive event
        const absence = new Attendance({
            studentId: 'MM-055',
            studentName: 'Test Student', // Change this to actual name
            firstName: 'Test',
            lastName: 'Student',
            yearLevel: '1st Year',
            eventName: 'Clean Up Drive (03/02/26)',
            sessionType: 'AM_IN',
            timestamp: null, // No timestamp since they didn't scan
            status: 'Absent',
            fine: 30 // Whole Day fine
        });
        
        await absence.save();
        console.log('✅ Created absence record for MM-055 for Clean Up Drive event');
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}).catch(err => {
    console.error('Connection error:', err);
    process.exit(1);
});
