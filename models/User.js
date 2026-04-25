const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Name fields (new structure)
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    middleName: { type: String, default: '', trim: true },
    
    // Legacy name field (for backward compatibility during migration)
    name: { type: String, default: '' },
    
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true }, // Email for password reset
    password: { type: String, required: true },
    role: { type: String, required: true },
    mmId: { type: String, unique: true, sparse: true, index: true }, // e.g., "MM-001" - INDEXED for fast lookups
    qrCode: { type: String, unique: true, sparse: true }, // Base64 encoded QR code
    corPath: { type: String, default: null }, // Path to uploaded COR file
    resetRequest: { type: Boolean, default: false }, // Flag for password reset requests
    yearLevel: { type: String, default: '1st Year' }, // Year level: '1st Year', '2nd Year', '3rd Year', '4th Year', or '' for advisers
    
    // Additional profile fields
    mobileNumber: { type: String, default: '' },
    dateOfBirth: { type: Date, default: null },
    gender: { type: String, enum: ['', 'Male', 'Female', 'Other'], default: '' },
    address: { type: String, default: '' },
    profilePhoto: { type: String, default: null }, // Path to profile photo
    
    // Fine management
    initialFine: { type: Number, default: 0 }, // Pre-portal fines entered by officers
    initialFineNotes: { type: String, default: '' }, // Notes about initial fines
    initialFineSetBy: { type: String, default: null }, // Which officer/adviser set it
    initialFineSetAt: { type: Date, default: null }, // When it was set
    
    // Consent tracking (Data Privacy Act compliance)
    hasConsent: { type: Boolean, default: false },
    consentDate: { type: Date, default: null },
    consentRevoked: { type: Boolean, default: false },
    revokedDate: { type: Date, default: null }
});

// Create index on role for faster filtering by role
userSchema.index({ role: 1 });

// Virtual field to get full name
userSchema.virtual('fullName').get(function() {
    const parts = [this.firstName, this.middleName, this.lastName].filter(part => part && part.trim());
    return parts.join(' ');
});

// Ensure virtuals are included in JSON
userSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('User', userSchema);