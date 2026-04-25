const Settings = require('../models/Settings');

// Generate a random 6-character password (alphanumeric)
function generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < 6; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// Check if today is January 1st or July 1st
function isPasswordChangeDay() {
    const today = new Date();
    const month = today.getMonth() + 1; // 1-12
    const date = today.getDate();
    return (month === 1 && date === 1) || (month === 7 && date === 1);
}

// Get the current override password, regenerate if needed
async function getOverridePassword() {
    try {
        const setting = await Settings.findOne({ key: 'override_password' });
        
        if (!setting) {
            // Create new password if it doesn't exist
            const newPassword = generatePassword();
            const newSetting = await Settings.create({
                key: 'override_password',
                value: newPassword,
                description: 'Override password for fines reset (6 characters, changes on Jan 1st and July 1st)',
                updatedAt: new Date()
            });
            return newPassword;
        }

        // Check if we need to regenerate (password change day)
        if (isPasswordChangeDay()) {
            const lastUpdate = new Date(setting.updatedAt);
            const today = new Date();
            
            // If it wasn't updated today, regenerate it
            if (lastUpdate.toDateString() !== today.toDateString()) {
                const newPassword = generatePassword();
                setting.value = newPassword;
                setting.updatedAt = new Date();
                await setting.save();
                return newPassword;
            }
        }

        return setting.value;
    } catch (err) {
        console.error('Error getting override password:', err);
        throw err;
    }
}

// Verify override password
async function verifyOverridePassword(inputPassword) {
    try {
        const currentPassword = await getOverridePassword();
        return inputPassword === currentPassword;
    } catch (err) {
        console.error('Error verifying override password:', err);
        return false;
    }
}

module.exports = {
    generatePassword,
    isPasswordChangeDay,
    getOverridePassword,
    verifyOverridePassword
};
