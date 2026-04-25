const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

mongoose.connect(mongoURI).then(async () => {
    const db = mongoose.connection.db;
    
    const events = await db.collection('attendancesessions').find({}).toArray();
    
    console.log('All events in database:');
    events.forEach(event => {
        console.log(`- Event: "${event.eventName}" | Type: "${event.eventType}"`);
    });
    
    process.exit(0);
}).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
