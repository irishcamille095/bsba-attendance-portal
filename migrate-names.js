#!/usr/bin/env node

/**
 * Migration Script: Split existing 'name' field into firstName, lastName, and middleName
 * 
 * This script:
 * 1. Connects to MongoDB
 * 2. Finds all users with the 'name' field
 * 3. Splits the name into firstName, lastName, and middleName
 * 4. Updates each user document with the new fields
 * 5. Provides a summary of the migration
 * 
 * Run with: npm run migrate-names
 * or: node migrate-names.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

// Utility function to split a full name into firstName, lastName, and middleName
function splitName(fullName) {
    if (!fullName || typeof fullName !== 'string') {
        return {
            firstName: 'Unknown',
            lastName: 'User',
            middleName: ''
        };
    }

    const nameParts = fullName.trim().split(/\s+/);
    
    if (nameParts.length === 0) {
        return {
            firstName: 'Unknown',
            lastName: 'User',
            middleName: ''
        };
    } else if (nameParts.length === 1) {
        // Only one part: treat as first name, generate last name
        return {
            firstName: nameParts[0],
            lastName: 'User',
            middleName: ''
        };
    } else if (nameParts.length === 2) {
        // Two parts: first and last name
        return {
            firstName: nameParts[0],
            lastName: nameParts[1],
            middleName: ''
        };
    } else {
        // Three or more parts: first, middle(s), and last
        const firstName = nameParts.shift();
        const lastName = nameParts.pop();
        const middleName = nameParts.join(' ');
        
        return {
            firstName,
            lastName,
            middleName
        };
    }
}

async function migrateNames() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(mongoURI);
        console.log('✅ Connected to MongoDB Cloud!');

        // Get all users
        console.log('\n📋 Fetching all users...');
        const allUsers = await User.find({});
        console.log(`📊 Total users found: ${allUsers.length}`);

        // Filter users that need migration
        const usersToMigrate = allUsers.filter(user => 
            (!user.firstName || !user.lastName) && user.name
        );

        console.log(`\n⚙️  Users to migrate: ${usersToMigrate.length}`);

        if (usersToMigrate.length === 0) {
            console.log('✅ No users need migration. All users already have firstName and lastName.');
            await mongoose.disconnect();
            return;
        }

        // Migrate users
        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        console.log('\n🔄 Starting migration...\n');

        for (const user of usersToMigrate) {
            try {
                const { firstName, lastName, middleName } = splitName(user.name);

                // Update the user
                await User.findByIdAndUpdate(
                    user._id,
                    {
                        firstName,
                        lastName,
                        middleName
                    }
                );

                console.log(
                    `✅ [${successCount + 1}/${usersToMigrate.length}] ${user.name}` +
                    ` → ${firstName} ${middleName ? middleName + ' ' : ''}${lastName}`
                );
                successCount++;
            } catch (err) {
                errorCount++;
                errors.push({
                    user: user.name || user.email,
                    error: err.message
                });
                console.log(`❌ Failed to migrate ${user.name || user.email}: ${err.message}`);
            }
        }

        // Print summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 MIGRATION SUMMARY');
        console.log('='.repeat(60));
        console.log(`✅ Successfully migrated: ${successCount} users`);
        console.log(`❌ Failed: ${errorCount} users`);
        console.log(`📊 Total users in database: ${allUsers.length}`);
        console.log(`✅ Users already migrated: ${allUsers.length - usersToMigrate.length}`);
        console.log('='.repeat(60));

        if (errors.length > 0) {
            console.log('\n⚠️  Errors during migration:');
            errors.forEach(err => {
                console.log(`  - ${err.user}: ${err.error}`);
            });
        }

        console.log('\n✅ Migration completed!');

        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Migration failed:', err.message);
        console.error(err);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run the migration
migrateNames();
