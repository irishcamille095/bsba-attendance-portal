const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

mongoose.connect(mongoURI).then(async () => {
    const db = mongoose.connection.db;
    
    const result = await db.collection('attendancesessions').updateOne(
        { eventName: "Clean Up Drive (03/02/26)" },
        { $set: { eventType: "Whole Day" } }
    );
    
    console.log('Updated:', result.modifiedCount, 'document(s)');
    process.exit(0);
}).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
