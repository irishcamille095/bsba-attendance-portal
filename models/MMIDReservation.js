const mongoose = require('mongoose');

const mmidReservationSchema = new mongoose.Schema({
    mmId: { 
        type: String, 
        required: true, 
        unique: true,
        index: true 
    }, // The MM-ID being reserved (e.g., MM-001)
    
    sessionId: { 
        type: String, 
        required: true 
    }, // Session ID to track which registration session this belongs to
    
    reservedAt: { 
        type: Date, 
        default: Date.now 
    }, // When the reservation was created
    
    expiresAt: { 
        type: Date,
        required: true
    }, // When the reservation expires (30 minutes from now)
    
    isUsed: { 
        type: Boolean, 
        default: false 
    } // Whether this reservation was actually used for signup
});

// Create a TTL index to automatically delete expired reservations
mmidReservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('MMIDReservation', mmidReservationSchema);
