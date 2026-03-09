// One-time migration script to add yearLevel field to existing users
// Run this script once: node migrate-yearLevel.js

require('dotenv').config();

const mongoose = require('mongoose');
const User = require('./models/User');

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

mongoose.connect(mongoURI)
    .then(async () => {
        console.log('[SUCCESS] Connected to MongoDB!');
        console.log('[INFO] Starting yearLevel migration...\n');

        try {
            // Update all students to '1st Year' (default)
            const studentResult = await User.updateMany(
                { role: { $ne: 'adviser' } },
                { yearLevel: '1st Year' }
            );
            console.log(`✓ Updated ${studentResult.modifiedCount} students with yearLevel = '1st Year'`);

            // Update all advisers to empty string
            const adviserResult = await User.updateMany(
                { role: 'adviser' },
                { yearLevel: '' }
            );
            console.log(`✓ Updated ${adviserResult.modifiedCount} advisers with yearLevel = ''`);

            console.log('\n[SUCCESS] Migration completed!');
            console.log('\nSummary:');
            console.log(`- Students/Officers set to: '1st Year'`);
            console.log(`- Advisers set to: '' (empty string)`);

        } catch (err) {
            console.error('[ERROR] Migration failed:', err.message);
        } finally {
            mongoose.connection.close();
            process.exit(0);
        }
    })
    .catch(err => {
        console.error('[ERROR] Connection failed:', err.message);
        process.exit(1);
    });
