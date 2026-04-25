const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

const AttendanceSessionSchema = new mongoose.Schema({
    eventName: String,
    type: String
});

const AttendanceSession = mongoose.model('AttendanceSession', AttendanceSessionSchema);

mongoose.connect(mongoURI).then(async () => {
    try {
        console.log('🔍 Finding duplicate Clean Up Drive sessions...\n');

        // Find all Clean Up Drive sessions
        const sessions = await AttendanceSession.find({ eventName: 'Clean Up Drive (03/02/26)' });
        console.log(`Found ${sessions.length} sessions for Clean Up Drive`);
        sessions.forEach(s => console.log(`  - type: "${s.type}"`));

        // Check if "General" exists
        const generalSession = await AttendanceSession.findOne({ 
            eventName: 'Clean Up Drive (03/02/26)', 
            type: 'General' 
        });

        if (generalSession) {
            console.log('\n⚠️  Found duplicate "General" session');
            console.log('Deleting it since we have AM_IN, AM_OUT, PM_IN, PM_OUT...\n');
            
            await AttendanceSession.deleteOne({ 
                eventName: 'Clean Up Drive (03/02/26)', 
                type: 'General'
            });
            
            console.log('✅ Deleted General session');
            console.log('Now Clean Up Drive will only show as 1 event with 4 sessions (AM_IN, AM_OUT, PM_IN, PM_OUT)');
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}).catch(err => {
    console.error('❌ Connection error:', err);
    process.exit(1);
});
