const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

mongoose.connect(mongoURI).then(async () => {
    const db = mongoose.connection.db;
    
    const studentId = 'MM-055'; // Change this to your test student ID
    
    console.log('\n=== ATTENDANCE RECORDS ===');
    const attendanceRecords = await db.collection('attendances').find({ studentId }).toArray();
    attendanceRecords.forEach(record => {
        console.log(`Event: "${record.eventName}" | Status: "${record.status}" | Fine: ${record.fine}`);
    });
    
    console.log('\n=== ALL EVENTS ===');
    const events = await db.collection('attendancesessions').find({}).toArray();
    events.forEach(event => {
        console.log(`Event: "${event.eventName}" | Type: "${event.eventType}"`);
    });
    
    console.log('\n=== MATCHING LOGIC ===');
    const eventTypeMap = {};
    events.forEach(event => {
        eventTypeMap[event.eventName] = event.eventType;
    });
    
    attendanceRecords.forEach(record => {
        const hasEvent = eventTypeMap.hasOwnProperty(record.eventName);
        const hasEventType = eventTypeMap[record.eventName];
        const isAbsent = record.status === 'Absent';
        
        console.log(`"${record.eventName}": hasEvent=${hasEvent}, hasEventType=${hasEventType}, isAbsent=${isAbsent}, shouldShowFine=${hasEvent && hasEventType && isAbsent}`);
    });
    
    process.exit(0);
}).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
