// Load environment variables from .env file
require('dotenv').config();

const mongoose = require('mongoose');
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const webpush = require('web-push');
const multer = require('multer');
const path = require('path');

// Import models upfront to avoid duplicates
const PushSubscription = require('./models/PushSubscription');
const StudentIDPool = require('./models/StudentIDPool');
const Event = require('./models/Event');
const User = require('./models/User');
const ResetRequest = require('./models/ResetRequest');

// Utility function to format UTC date to Philippines time string
function formatToPhilippinesTime(utcDate) {
    if (!utcDate) return '---';
    return new Date(utcDate).toLocaleString('en-US', { 
        timeZone: 'Asia/Manila',
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        hour12: true 
    });
}

// Utility function to sanitize and validate name fields
function sanitizeName(name) {
    if (!name || typeof name !== 'string') return '';
    return name.trim().replace(/\s+/g, ' '); // Trim and collapse multiple spaces
}

// Utility function to validate name fields
function validateNames(firstName, lastName, middleName = '') {
    const errors = [];
    
    // Validate firstName
    if (!firstName || !firstName.trim()) {
        errors.push('First name is required');
    } else if (firstName.trim().length < 2 || firstName.trim().length > 50) {
        errors.push('First name must be between 2 and 50 characters');
    }
    
    // Validate lastName
    if (!lastName || !lastName.trim()) {
        errors.push('Last name is required');
    } else if (lastName.trim().length < 2 || lastName.trim().length > 50) {
        errors.push('Last name must be between 2 and 50 characters');
    }
    
    // Validate middleName (optional)
    if (middleName && middleName.trim().length > 50) {
        errors.push('Middle name must be 50 characters or less');
    }
    
    return errors;
}

const app = express();

// Paste your link here. 
// IMPORTANT: Replace <password> with the password you created in MongoDB!
const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

let gridFSBucket; // GridFS bucket for storing COR files

mongoose.connect(mongoURI)
    .then(async () => {
        console.log('[SUCCESS] Connected to MongoDB Cloud!');
        
        // Initialize GridFS bucket for COR file storage
        gridFSBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'cors' });
        console.log('[SUCCESS] GridFS bucket initialized for COR storage!');
        
        async function initializeStudentIDPool() {
            try {
                const existingCount = await StudentIDPool.countDocuments();
                if (existingCount >= 300) {
                    console.log("[SUCCESS] Student ID pool already initialized!");
                    return;
                }

                console.log("[INFO] Initializing Student ID Pool (MM-001 to MM-300)...");
                const idsToCreate = [];

                for (let i = 1; i <= 300; i++) {
                    const mmId = `MM-${String(i).padStart(3, '0')}`;
                    const exists = await StudentIDPool.findOne({ mmId });
                    if (!exists) {
                        const qrCodeDataUrl = await QRCode.toDataURL(mmId);
                        idsToCreate.push({
                            mmId: mmId,
                            qrCode: qrCodeDataUrl,
                            isAssigned: false,
                            assignedToUsername: null
                        });
                    }
                }

                if (idsToCreate.length > 0) {
                    await StudentIDPool.insertMany(idsToCreate);
                    console.log(`[SUCCESS] Created ${idsToCreate.length} student IDs with QR codes!`);
                }
            } catch (err) {
                console.error("[ERROR] Error initializing student ID pool:", err);
            }
        }
        
        await initializeStudentIDPool();
        
        // START THE SERVER AFTER MONGODB CONNECTS
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log("-----------------------------------------");
            console.log(`[SUCCESS] SERVER IS LIVE: http://localhost:${PORT}`);
            console.log("-----------------------------------------");
        });
    })
    .catch(err => {
        console.error('[ERROR] Could not connect to MongoDB:', err.message);
        console.error('📌 Connection String:', mongoURI);
        console.error('⚠️  Please check:');
        console.error('   1. MongoDB credentials are correct');
        console.error('   2. Cluster is running and accepting connections');
        console.error('   3. IP address is whitelisted in MongoDB Atlas');
        process.exit(1);
    });

// --- THE "DATABASE" (Create these ONLY ONCE at the top) ---
let announcements = [];
let attendanceLogs = [];
let currentEventQR = ''; // Make sure this exists
let currentSession = ''; // ADD THIS LINE RIGHT HERE

// --- CACHING FOR PERFORMANCE ---
let cachedAvailableIDs = null; // Cache for MM-001 to MM-300 available list
let lastAvailableIDsUpdate = null; // Track when cache was last updated
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// Function to refresh available IDs cache
async function refreshAvailableIDsCache() {
    try {
        const fullRange = Array.from({ length: 300 }, (_, i) => `MM-${String(i + 1).padStart(3, '0')}`);
        const usersWithMM = await User.find({ mmId: { $exists: true } }).select('mmId').lean();
        const assignedIDs = new Set(usersWithMM.map(u => u.mmId));
        cachedAvailableIDs = fullRange.filter(id => !assignedIDs.has(id));
        lastAvailableIDsUpdate = Date.now();
        console.log('[SUCCESS] Available IDs cache refreshed:', cachedAvailableIDs.length, 'available');
    } catch (err) {
        console.error('[ERROR] Error refreshing available IDs cache:', err);
    }
}

// Function to get available IDs (use cache if fresh, otherwise recalculate)
async function getAvailableIDs() {
    if (!cachedAvailableIDs || !lastAvailableIDsUpdate || Date.now() - lastAvailableIDsUpdate > CACHE_DURATION) {
        await refreshAvailableIDsCache();
    }
    return cachedAvailableIDs || [];
}

const AttendanceSchema = new mongoose.Schema({
    studentId: String,   // The student's MM-ID
    studentName: String, // Their name
    eventName: String,   // Event name (e.g., "Monthly Meeting")
    sessionType: String, // AM_IN, AM_OUT, PM_IN, PM_OUT
    sessionId: String,   // The session ID
    timestamp: { type: Date, default: Date.now }
});
const Attendance = mongoose.model('Attendance', AttendanceSchema);

// --- SETTINGS ---
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads')); // This lets the browser see your photos
app.use(express.static('public'));

// --- Web Push / Service Worker Support ---
let vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY
};

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    vapidKeys = webpush.generateVAPIDKeys();
    console.log('⚠️ Generated ephemeral VAPID keys. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in env to persist.');
    console.log('📋 VAPID Public Key:', vapidKeys.publicKey);
    console.log('📋 VAPID Private Key:', vapidKeys.privateKey);
    console.log('💾 Copy these keys into your .env file to make them permanent!');
}

webpush.setVapidDetails('mailto:admin@example.com', vapidKeys.publicKey, vapidKeys.privateKey);

app.get('/vapidPublicKey', (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
});

app.post('/subscribe', async (req, res) => {
    try {
        const sub = req.body;
        if (!sub || !sub.endpoint) return res.status(400).send('Invalid subscription');
        // Avoid duplicates by endpoint
        const exists = await PushSubscription.findOne({ 'subscription.endpoint': sub.endpoint });
        if (!exists) {
            await PushSubscription.create({ subscription: sub });
        }
        res.status(201).send('Subscribed');
    } catch (err) {
        console.error('Subscribe error', err);
        res.status(500).send('Error');
    }
});

app.post('/unsubscribe', async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (!endpoint) return res.status(400).send('Missing endpoint');
        await PushSubscription.deleteMany({ 'subscription.endpoint': endpoint });
        res.send('Unsubscribed');
    } catch (err) {
        console.error('Unsubscribe error', err);
        res.status(500).send('Error');
    }
});

app.use(session({
    secret: 'bsba-mm-secret-key',
    resave: false,
    saveUninitialized: true
}));

// Prevent browser caching of dynamic pages
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// Ensure upload directories exist
const uploadDirs = ['public/uploads', 'public/uploads/cor'];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[SUCCESS] Created directory: ${dir}`);
    }
});

// This is your Guard (Middleware)
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        // If the user has a session, let them in!
        return next();
    }
    // If not, kick them back to the login page
    res.redirect('/login');
}

// ... after your User model ...

const AttendanceSessionSchema = new mongoose.Schema({
    eventName: String,
    folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder' }, // The link to the folder
    type: String,
    date: Date,
    token: String
});

// Ensure unique event name per folder combination
AttendanceSessionSchema.index({ eventName: 1, folderId: 1 }, { unique: true });

const AttendanceSession = mongoose.model('AttendanceSession', AttendanceSessionSchema);

const FolderSchema = new mongoose.Schema({
    name: String, // e.g., "2nd Sem 2026"
    createdBy: String,
    createdAt: { type: Date, default: Date.now }
});
const Folder = mongoose.model('Folder', FolderSchema);

// ... NOW come your routes like app.get('/dashboard') ...

// Change this part in your app.js
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/'); // Just point to the folder, don't try to "mkdir" it
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Multer configuration for COR uploads (Certificate of Registration)
const corStorage = multer.memoryStorage(); // Store uploaded files in memory before piping to GridFS

const uploadCor = multer({ 
    storage: corStorage,
    fileFilter: (req, file, cb) => {
        // Only allow PDF and image files
        const allowedTypes = /pdf|jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only PDF and image files are allowed'));
        }
    }
});

// Create the Announcement Schema
const AnnouncementSchema = new mongoose.Schema({
    title: String,
    message: String,
    imageUrl: String,
    date: { type: Date, default: Date.now },
    author: String,
    viewedBy: { type: [String], default: [] } // Array of user IDs who have viewed this announcement
});
const Announcement = mongoose.model('Announcement', AnnouncementSchema);

// Achievement Schema and Model
const AchievementSchema = new mongoose.Schema({
    content: String,
    imageUrl: String,
    updatedBy: String,
    date: { type: Date, default: Date.now }
});
const Achievement = mongoose.model('Achievement', AchievementSchema);

// Officer Schema and Model
const OfficerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    position: { type: String, required: true },
    imageUrl: { type: String }, // Ensure this exists!
    dateAdded: { type: Date, default: Date.now }
});
const Officer = mongoose.model('Officer', OfficerSchema);

// New Schema for Department History
const HistorySchema = new mongoose.Schema({
    content: String,
    imageUrl: String,
    updatedBy: String
});
const History = mongoose.model('History', HistorySchema);

const FileSchema = new mongoose.Schema({
    displayName: String,
    filename: String,
    category: { type: String, default: 'General' },
    uploadedBy: String, // Ensure this line exists!
    uploadDate: { type: Date, default: Date.now }
});
const File = mongoose.model('File', FileSchema);

app.get('/login', (req, res) => {
    const error = req.query.error || null;
    res.render('login', { error });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Find the user by their ID
        const user = await User.findOne({ username: req.body.username });

        // Check if the user exists and the password matches
        if (user && user.password === password) {
            // Save the user data (including their role!) into the session
            req.session.user = user;
            return res.redirect('/dashboard');
        } else if (!user) {
            // No account with this email
            return res.render('login', { error: 'No account found with this email address.' });
        } else {
            // Password is incorrect
            return res.render('login', { error: 'The password is incorrect.' });
        }
    } catch (err) {
        console.error(err);
        res.render('login', { error: 'An error occurred. Please try again.' });
    }
});

app.get('/', (req, res) => {
    res.redirect('/login'); 
});

app.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const user = req.session.user;

        // 1. Fetch ALL data needed for the portal
        const announcements = await Announcement.find().sort({ date: -1 });
        const achievements = await Achievement.find();
        const officers = await Officer.find();
        const historyEntries = await History.find();
        const files = await File.find();
        const folders = await Folder.find({});
        const events = await Event.find({});
        
        // 2. Fetch the Attendance data you just added
        const allAttendance = await Attendance.find().sort({ timestamp: -1 });
        const myAttendance = await Attendance.find({ studentId: user.mmId }).sort({ timestamp: -1 });

        // 3. Count notification items
        let pendingResetRequestsCount = 0;
        if (user.role === 'adviser' || user.role === 'officer') {
            pendingResetRequestsCount = await User.countDocuments({ resetRequest: true });
        }
        // Count only unviewed announcements for this user (handle missing viewedBy for old announcements)
        const newAnnouncementsCount = announcements.filter(ann => 
            !ann.viewedBy || !ann.viewedBy.includes(user._id.toString())
        ).length;

        // 4. Render the page once with ALL variables
        res.render('dashboard', { 
            user, 
            announcements, 
            achievements, 
            officers, 
            historyEntries, 
            files,
            allAttendance, // This fixes the Reference Error!
            myAttendance,
            user: req.session.user,
            folders: folders,
            events: events,
            pendingResetRequestsCount: pendingResetRequestsCount,
            newAnnouncementsCount: newAnnouncementsCount
        });
    } catch (err) {
        console.error("Dashboard Loading Error:", err);
        res.status(500).send("Error loading dashboard data.");
    }
});

// Registration route - Automatically assign MM-ID from pool
app.get('/register', async (req, res) => {
    try {
        // Generate the reference list: Create an array of strings representing MM-001 to MM-300
        const fullRange = Array.from({ length: 300 }, (_, i) => `MM-${String(i + 1).padStart(3, '0')}`);

        // Scan the database: Query the User collection to get all currently assigned studentID values
        const usersWithMM = await User.find({ mmId: { $exists: true } }).select('mmId');
        const databaseIDs = usersWithMM.map(u => u.mmId);

        // Find the first gap: Compare the reference list against the database IDs
        // Pick the first one that is NOT present in the database
        const availableID = fullRange.find(id => !databaseIDs.includes(id));

        // Update the form: Ensure this gap-filling ID is passed to the register.ejs view
        if (availableID) {
            return res.render('register', { studentID: availableID });
        }

        // If no IDs available, render the register page with a friendly message
        return res.render('register', { studentID: null, message: 'All student ID slots are currently assigned. Please contact an administrator.' });
    } catch (err) {
        console.error('Error computing available MM-ID:', err);
        return res.render('register', { studentID: null, message: 'Unable to calculate Student ID right now. Please try again later.' });
    }
});

app.post('/update-user-role', isAuthenticated, async (req, res) => {
    const { targetUsername, newRole } = req.body;

    try {
        // --- THIS IS THE CATCH ---
        const currentTargetUser = await User.findOne({ username: targetUsername });

        if (!currentTargetUser) {
            return res.send("❌ Error: That Student ID does not exist in our database.");
        }
        // -------------------------

        // Now the rest of your "Safety Lock" code follows...
        if (currentTargetUser.role === 'adviser' && newRole !== 'adviser') {
            const adviserCount = await User.countDocuments({ role: 'adviser' });
            if (adviserCount <= 1) {
                return res.send("❌ Access Denied: You are the last Adviser!");
            }
        }

        await User.findOneAndUpdate({ username: targetUsername }, { role: newRole });
        res.redirect('/dashboard');

    } catch (err) {
        console.error(err);
        res.status(500).send("An error occurred on the server.");
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log(err);
            return res.redirect('/dashboard');
        }
        res.clearCookie('connect.sid'); // Clears the session cookie
        res.redirect('/login');
    });
});

app.post('/signup', async (req, res) => {
    try {
        const { mmId, name, firstName, lastName, middleName, email, password, role, yearLevel } = req.body;
        
        // 1. Validate MM-ID format
        if (!mmId || !/^MM-[0-9]{3}$/.test(mmId)) {
            return res.status(400).send("❌ Invalid Student ID format.");
        }

        // 2. Check if the MM-ID is already claimed in the User collection
        const existingUser = await User.findOne({ mmId });
        if (existingUser) {
            return res.status(400).send("❌ This Student ID is already assigned. Please contact an admin.");
        }

        // 3. Get QR code from StudentIDPool if available
        let qrCode = null;
        try {
            const studentID = await StudentIDPool.findOne({ mmId });
            if (studentID) {
                qrCode = studentID.qrCode;
            }
        } catch (e) {
            console.error("Warning: Could not fetch QR code from StudentIDPool:", e);
        }

        // 4. Process name fields (support both new separate fields and legacy single name field)
        let processedFirstName = firstName ? sanitizeName(firstName) : null;
        let processedLastName = lastName ? sanitizeName(lastName) : null;
        let processedMiddleName = middleName ? sanitizeName(middleName) : '';
        
        // If only legacy 'name' field is provided, split it
        if (!processedFirstName && !processedLastName && name) {
            const nameParts = name.trim().split(/\s+/);
            processedLastName = nameParts.pop(); // Last part is last name
            processedFirstName = nameParts.shift() || ''; // First part is first name
            if (nameParts.length > 0) {
                processedMiddleName = nameParts.join(' '); // Middle parts are middle name
            }
        }
        
        // Validate name fields
        const nameErrors = validateNames(processedFirstName, processedLastName, processedMiddleName);
        if (nameErrors.length > 0) {
            return res.status(400).send(`❌ ${nameErrors[0]}`);
        }

        // 5. Create the new user with the specified MM-ID
        const newUser = new User({ 
            firstName: processedFirstName,
            lastName: processedLastName,
            middleName: processedMiddleName,
            name: `${processedFirstName} ${processedMiddleName} ${processedLastName}`.trim(), // Keep for backward compatibility
            username: email, // Use email as username
            email,
            password, 
            role: role || 'student',
            mmId: mmId,
            qrCode: qrCode,
            yearLevel: role === 'adviser' ? '' : (yearLevel || '1st Year')
        });

        // 6. Save the user
        await newUser.save();

        // 7. Mark the MM-ID as assigned in the pool (for consistency)
        try {
            await StudentIDPool.findOneAndUpdate(
                { mmId },
                { 
                    isAssigned: true,
                    assignedToUsername: email
                }
            );
        } catch (e) {
            console.error("Warning: Could not update StudentIDPool:", e);
        }

        res.redirect('/login');
    } catch (err) {
        console.error("Signup Error:", err);
        res.status(500).send("Error creating account. Email might already be taken.");
    }
});

app.get('/signup', async (req, res) => {
    try {
        // Generate the reference list: Create an array of strings representing MM-001 to MM-300
        const fullRange = Array.from({ length: 300 }, (_, i) => `MM-${String(i + 1).padStart(3, '0')}`);

        // Scan the database: Query the User collection to get all currently assigned studentID values
        const usersWithMM = await User.find({ mmId: { $exists: true } }).select('mmId');
        const databaseIDs = usersWithMM.map(u => u.mmId);

        // Find the first gap: Compare the reference list against the database IDs
        // Pick the first one that is NOT present in the database
        const mmId = fullRange.find(id => !databaseIDs.includes(id)) || 'UNAVAILABLE';

        res.render('signup', { mmId });
    } catch (err) {
        console.error('Error assigning MM-ID:', err);
        res.render('signup', { mmId: 'ERROR' });
    }
});

app.get('/view-attendance', isAuthenticated, async (req, res) => {
    // 1. Security check: Only let Officers/Advisers in
    if (!req.session.user || (req.session.user.role !== 'adviser' && req.session.user.role !== 'officer')) {
        return res.redirect('/dashboard');
    }

    try {
        // 2. Pull all records from the MongoDB Cloud
        // .sort({ _id: -1 }) puts the newest scans at the top
        const allLogs = await Attendance.find().sort({ _id: -1 });

        // 3. Send the data to a new page called 'report'
        res.render('report', { logs: allLogs, user: req.session.user });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching logs from the cloud.");
    }
});

// GET version for dashboard form submission
app.get('/generate-qr', isAuthenticated, async (req, res) => {
    const { eventName, sessionType, folderId } = req.query;

    try {
        const newSession = await AttendanceSession.create({
            eventName: eventName,
            folderId: folderId,
            type: sessionType,
            date: new Date(),
            token: Math.random().toString(36).substring(7)
        });
        res.render('show-qr', { session: newSession, user: req.session.user });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error generating QR session");
    }
});

app.post('/generate-qr', isAuthenticated, async (req, res) => {
    const { eventName, sessionType, folderId } = req.body; // Grab the folder selection

    const newSession = await AttendanceSession.create({
        eventName: eventName,
        folderId: folderId, // File it into the chosen folder
        type: sessionType,
        date: new Date(),
        token: Math.random().toString(36).substring(7)
    });
    res.render('show-qr', { session: newSession, user: req.session.user });
});

app.get('/close-qr', (req, res) => {
    currentEventQR = ''; // This clears the QR data
    res.redirect('/dashboard');
});

app.get('/view-active-qr', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
        return res.redirect('/dashboard');
    }

    const today = new Date().setHours(0,0,0,0);

    try {
        // Find the most recent session created today
        const latestSession = await AttendanceSession.findOne({ 
            date: { $gte: today } 
        }).sort({ _id: -1 });

        if (latestSession) {
            // Send them back to the show-qr page with the existing data
            res.render('show-qr', { session: latestSession, user: req.session.user });
        } else {
            res.send("<script>alert('No QR has been generated yet today!'); window.location='/dashboard';</script>");
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Error retrieving QR.");
    }
});

// This is the page that actually opens the camera
app.get('/attendance', isAuthenticated, (req, res) => {
    // Only officers and advisers can scan
    if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
        return res.redirect('/dashboard');
    }
    
    const { folderId, eventName, sessionType } = req.query;
    res.render('scanner', { folderId, eventName, sessionType, user: req.session.user }); // Ensure you have a file named 'scanner.ejs'
});

// Record the attendance - Now scans student MM-ID instead of event QR
app.get('/mark-attendance', isAuthenticated, async (req, res) => {
    const { code, folderId, eventName, sessionType } = req.query;
    const officer = req.session.user;

    // Only officers and advisers can mark attendance
    if (officer.role !== 'officer' && officer.role !== 'adviser') {
        return res.status(403).json({ success: false, message: "❌ Unauthorized" });
    }

    try {
        // The 'code' from the QR contains the student's MM-ID
        // Find the student with this MM-ID
        const student = await User.findOne({ mmId: code });

        if (!student) {
            return res.status(404).json({ 
                success: false, 
                message: "Student Not Found",
                detail: `No student with MM-ID: ${code}`
            });
        }

        // Check if this student already scanned for THIS SPECIFIC event + session type
        const alreadyScanned = await Attendance.findOne({
            studentId: student.mmId,
            eventName: eventName,
            sessionType: sessionType
        });

        if (alreadyScanned) {
            return res.status(400).json({
                success: false,
                message: "Already Recorded",
                detail: `${student.name} already checked in for ${sessionType.replace('_', ' ')}`
            });
        }

        // Create the attendance record with UTC timestamp
        const newRecord = new Attendance({
            studentId: student.mmId,
            studentName: student.name,
            eventName: eventName,
            sessionType: sessionType,
            timestamp: new Date()
        });

        await newRecord.save();
        
        res.json({
            success: true,
            message: "Attendance Marked",
            student: {
                name: student.name,
                mmId: student.mmId,
                session: sessionType.replace('_', ' ')
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error saving attendance." });
    }
});

app.get('/attendance-report', (req, res) => {
    if (req.session.user.role === 'student') return res.redirect('/dashboard');
    
    res.render('report', { logs: attendanceLogs, user: req.session.user });
});

// API Endpoint: Get events for a folder
app.get('/api/folder-events/:folderId', isAuthenticated, async (req, res) => {
    try {
        const sessions = await AttendanceSession.find({ folderId: req.params.folderId });
        
        // Get unique event names
        const uniqueEvents = [...new Set(sessions.map(s => s.eventName))].map(name => ({
            eventName: name
        }));
        
        res.json(uniqueEvents);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error loading events' });
    }
});

// API Endpoint: Get all students with their QR codes for printing
app.get('/api/student-qr-codes', isAuthenticated, async (req, res) => {
    try {
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const students = await User.find({ role: 'student' }).select('_id name username mmId qrCode');
        
        res.json({ students });
    } catch (err) {
        console.error('Error fetching student QR codes:', err);
        res.status(500).json({ error: 'Error loading student data' });
    }
});

// API Endpoint: Download individual QR code
app.get('/api/download-qr/:studentId', isAuthenticated, async (req, res) => {
    try {
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const student = await User.findById(req.params.studentId).select('mmId qrCode name');
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Convert base64 QR code to buffer
        const base64Data = student.qrCode.replace(/^data:image\/png;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `attachment; filename="${student.mmId}_${student.name}.png"`);
        res.send(buffer);
    } catch (err) {
        console.error('Error downloading QR code:', err);
        res.status(500).json({ error: 'Error downloading QR code' });
    }
});

// API Endpoint: Get QR code on demand for student list (lazy loading) - QR code tied to MM ID (source of truth from StudentIDPool)
app.get('/api/student-qr/:mmId', isAuthenticated, async (req, res) => {
    try {
        const { mmId } = req.params;
        
        // Fetch QR from StudentIDPool (source of truth for QR codes tied to MM IDs)
        const poolEntry = await StudentIDPool.findOne({ mmId }).select('qrCode').lean();
        
        if (poolEntry && poolEntry.qrCode) {
            res.json({ mmId, qrCode: poolEntry.qrCode });
        } else {
            // Fallback: Generate QR code on the fly if not found (should rarely happen with proper initialization)
            const qrCode = await QRCode.toDataURL(mmId);
            res.json({ mmId, qrCode });
        }
    } catch (err) {
        console.error('Error fetching QR code:', err);
        res.status(500).json({ error: 'Error fetching QR code' });
    }
});

// Route: Download a PDF containing all 300 student QR cards (MM-001 to MM-300)
app.get('/download-all-qrs', isAuthenticated, async (req, res) => {
    // Only Officers and Advisers can download the master PDF
    if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
        return res.redirect('/dashboard');
    }

    try {
        // Fetch ALL 300 MM IDs from the pool (regardless of assignment status)
        const allIDs = await StudentIDPool.find().sort({ mmId: 1 });

        if (!allIDs || allIDs.length === 0) {
            return res.send('No student ID pool found. Please contact an administrator.');
        }

        // Prepare PDF response
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="all-student-qrcards.pdf"');

        const doc = new PDFDocument({ size: 'A4', margin: 36 });
        doc.pipe(res);

        const cols = 3;
        const gap = 10;
        const cardWidth = (doc.page.width - doc.options.margin * 2 - (cols - 1) * gap) / cols;
        const cardHeight = 220;

        let xStart = doc.options.margin;
        let y = doc.options.margin;
        let col = 0;

        for (let i = 0; i < allIDs.length; i++) {
            const entry = allIDs[i];
            const mmId = entry.mmId;

            // Prepare image buffer for the QR (either existing base64 or generate)
            let imgBuffer;
            try {
                if (entry.qrCode && entry.qrCode.startsWith('data:')) {
                    const base64 = entry.qrCode.replace(/^data:image\/[a-z]+;base64,/, '');
                    imgBuffer = Buffer.from(base64, 'base64');
                } else {
                    const dataUrl = await QRCode.toDataURL(mmId);
                    const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
                    imgBuffer = Buffer.from(base64, 'base64');
                }
            } catch (e) {
                console.error('Error preparing QR image for', mmId, e);
            }

            const x = xStart + col * (cardWidth + gap);

            // Card border (department yellow)
            doc.save();
            doc.lineWidth(2).strokeColor('#FFCC00').rect(x, y, cardWidth, cardHeight).stroke();

            // Student ID text (large bold, black) above the QR
            doc.font('Helvetica-Bold').fontSize(16).fillColor('#000').text(mmId, x, y + 8, {
                width: cardWidth,
                align: 'center'
            });

            // Draw QR centered under the ID text
            const imgSize = Math.min(cardWidth - 40, 140);
            const imgX = x + (cardWidth - imgSize) / 2;
            const imgY = y + 36;
            if (imgBuffer) {
                try { doc.image(imgBuffer, imgX, imgY, { width: imgSize, height: imgSize }); } catch (e) { console.error('PDF image draw error', e); }
            }

            // Move to next column/row
            col++;
            if (col >= cols) {
                col = 0;
                y += cardHeight + gap;
                if (y + cardHeight > doc.page.height - doc.options.margin) {
                    doc.addPage();
                    y = doc.options.margin;
                }
            }
        }

        doc.end();
    } catch (err) {
        console.error('Error generating all QR PDF:', err);
        res.status(500).send('Error generating PDF');
    }
});

// Admin/Officer view: List students with their MM-IDs and QR codes
app.get('/student-ids', isAuthenticated, async (req, res) => {
    try {
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.redirect('/dashboard');
        }

        const students = await User.find({ role: 'student' }).select('name username mmId qrCode').sort({ name: 1 });
        res.render('student-ids', { students, user: req.session.user });
    } catch (err) {
        console.error('Error loading student IDs:', err);
        res.status(500).send('Error loading student list');
    }
});

// Printable mini ID cards
app.get('/print-student-cards', isAuthenticated, async (req, res) => {
    try {
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.redirect('/dashboard');
        }

        const students = await User.find({ role: 'student' }).select('name mmId qrCode').sort({ name: 1 });
        res.render('print-student-cards', { students, user: req.session.user });
    } catch (err) {
        console.error('Error loading printable cards:', err);
        res.status(500).send('Error loading printable cards');
    }
});

app.get('/folder-details/:folderId', isAuthenticated, async (req, res) => {
    try {
        const folder = await Folder.findById(req.params.folderId);
        
        // 1. Get all AttendanceSessions in this folder
        const sessions = await AttendanceSession.find({ folderId: req.params.folderId });

        // 2. Check if the user clicked a specific event
        const selectedEvent = req.query.event;
        let records = [];
        let attendanceData = [];

        if (selectedEvent) {
            // 3. Get all attendance records for this event
            records = await Attendance.find({ 
                eventName: selectedEvent 
            }).sort({ studentId: 1 });

            // 4. Group records by student and organize by session type
            const studentMap = {};
            records.forEach(record => {
                if (!studentMap[record.studentId]) {
                    studentMap[record.studentId] = {
                        studentId: record.studentId,
                        studentName: record.studentName,
                        amIn: null,
                        amOut: null,
                        pmIn: null,
                        pmOut: null
                    };
                }
                
                if (record.sessionType === 'AM_IN') studentMap[record.studentId].amIn = record.timestamp;
                if (record.sessionType === 'AM_OUT') studentMap[record.studentId].amOut = record.timestamp;
                if (record.sessionType === 'PM_IN') studentMap[record.studentId].pmIn = record.timestamp;
                if (record.sessionType === 'PM_OUT') studentMap[record.studentId].pmOut = record.timestamp;
            });

            // Sort by studentId to maintain registration order
            attendanceData = Object.values(studentMap).sort((a, b) => {
                const aNum = parseInt(a.studentId.split('-')[1]) || 0;
                const bNum = parseInt(b.studentId.split('-')[1]) || 0;
                return aNum - bNum;
            });
        }

        // 5. Create helper function for template to format times in Philippines timezone
        const formatPhilippinesTime = formatToPhilippinesTime;

        // Send everything to folder-details.ejs
        res.render('folder-details', {
            folder, 
            sessions, 
            records, 
            attendanceData,
            selectedEvent, 
            user: req.session.user,
            formatPhilippinesTime
        });
    } catch (err) {
        console.error("Error loading folder details:", err);
        res.status(500).send("Internal Server Error");
    }
});

// Student View: Show ONLY my attendance in a folder
app.get('/my-folder-attendance/:folderId', isAuthenticated, async (req, res) => {
    const user = req.session.user;
    const sessions = await AttendanceSession.find({ folderId: req.params.folderId });
    const myRecords = await Attendance.find({ 
        studentId: user.mmId,
        eventName: { $in: sessions.map(s => s.eventName) }
    }).sort({ timestamp: -1 });

    const formatPhilippinesTime = formatToPhilippinesTime;

    res.render('folder-details', { 
        folder: { name: "My Records" }, 
        records: myRecords, 
        user,
        formatPhilippinesTime
    });
});

// Route to create a new Semester folder
app.post('/create-folder', isAuthenticated, async (req, res) => {
    try {
        await Folder.create({ name: req.body.folderName });
        res.redirect('/dashboard'); // Refresh the page to show the new folder
    } catch (err) {
        res.status(500).send("Error creating folder");
    }
});

// Route to delete a folder
app.get('/delete-folder/:id', isAuthenticated, async (req, res) => {
    try {
        await Folder.findByIdAndDelete(req.params.id);
        res.redirect('/dashboard');
    } catch (err) {
        res.status(500).send("Error deleting folder");
    }
});

app.get('/delete-attendance/:sessionId', isAuthenticated, async (req, res) => {
    try {
        // 1. Find the session first to get the event name
        const session = await AttendanceSession.findById(req.params.sessionId);
        
        if (session) {
            // 2. Delete all attendance records associated with this event name
            await Attendance.deleteMany({ eventName: session.eventName });
            
            // 3. Delete the session itself
            await AttendanceSession.findByIdAndDelete(req.params.sessionId);
        }

        res.redirect('back'); // Refresh the page to show it's gone
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting event");
    }
});

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    name: String,
    role: String, // 'student', 'officer', or 'adviser'
    id: String
});

async function migrateUsers() {
    try {
        const userData = JSON.parse(fs.readFileSync('./data/users.json'));
        for (let u of userData) {
            // ONLY try to save if the user actually has a username
            if (u.username) { 
                const exists = await User.findOne({ username: u.username });
                if (!exists) {
                    await User.create(u);
                    console.log(`👤 Migrated: ${u.username}`);
                }
            } else {
                console.log("⚠️ Skipping a blank or invalid user in JSON");
            }
        }
        console.log("[SUCCESS] Database is ready!");
    } catch (e) {
        console.log("Migration error:", e);
    }
}

app.post('/change-password', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    
    const { newPassword } = req.body;
    
    try {
        await User.findOneAndUpdate(
            { username: req.session.user.username },
            { password: newPassword }
        );
        res.send("Password updated permanently in the cloud!");
    } catch (err) {
        res.send("Error updating password.");
    }
});

app.post('/delete-session', isAuthenticated, async (req, res) => {
    // Only officers/advisers can delete
    if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
        return res.status(403).send("Unauthorized");
    }

    try {
        const { sessionId } = req.body;
        // Delete the mistaken session from the database
        await AttendanceSession.findByIdAndDelete(sessionId);
        
        // Redirect back to dashboard with a success message
        res.send("<script>alert('Session deleted! You can now generate the correct one.'); window.location='/dashboard';</script>");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting session.");
    }
});

app.post('/post-announcement', upload.single('image'), async (req, res) => {
    const { title, message } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    try {
                const created = await Announcement.create({
                        title,
                        message,
                        imageUrl,
                        author: req.session.user.name
                });

                // Send push notifications to all saved subscriptions
                try {
                    const subs = await PushSubscription.find().lean();
                    const payload = JSON.stringify({
                        title: title,
                        body: message && message.length > 120 ? message.substring(0, 117) + '...' : (message || ''),
                        icon: '/assets/img/logo.jpg',
                        data: { url: '/dashboard' }
                    });

                    await Promise.all(subs.map(async s => {
                        try {
                            await webpush.sendNotification(s.subscription, payload);
                        } catch (err) {
                            // If subscription is no longer valid, remove it
                            if (err.statusCode === 410 || err.statusCode === 404) {
                                await PushSubscription.deleteOne({ _id: s._id });
                            } else {
                                console.error('Push send error:', err);
                            }
                        }
                    }));
                } catch (pushErr) {
                    console.error('Error sending push notifications:', pushErr);
                }

                res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.send("Error posting announcement.");
    }
});

app.post('/delete-announcement', isAuthenticated, async (req, res) => {
    // Check if the user is an officer or adviser
    if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
        return res.status(403).send("Unauthorized");
    }

    try {
        const { announcementId } = req.body;
        await Announcement.findByIdAndDelete(announcementId);
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting announcement.");
    }
});

// Mark all announcements as viewed for current user
app.post('/mark-announcements-viewed', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.session.user || !req.session.user._id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.session.user._id.toString();
        console.log('Marking announcements as viewed for user:', userId);
        
        // Add current user to viewedBy array for all announcements that don't already have them
        const result = await Announcement.updateMany(
            { viewedBy: { $ne: userId } },
            { $push: { viewedBy: userId } }
        );
        
        console.log('Announcements updated:', result.modifiedCount, 'documents modified');
        res.json({ success: true, modifiedCount: result.modifiedCount });
    } catch (err) {
        console.error('Error marking announcements as viewed:', err);
        res.status(500).json({ error: 'Error marking announcements as viewed' });
    }
});

app.post('/delete-file', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
        return res.status(403).send("Unauthorized");
    }

    try {
        const { fileId } = req.body;
        await File.findByIdAndDelete(fileId);
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting file.");
    }
});

app.post('/update-achievements', upload.single('achievementImage'), async (req, res) => {
    try {
        // Check if an image was uploaded
        const imageUrl = req.file ?`/uploads/${req.file.filename}`: null;

        const newAchievement = new Achievement({
            content: req.body.message,
            imageUrl: imageUrl, // Save the path here
            updatedBy: req.session.user.name
        });

        await newAchievement.save();
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating achievements.");
    }
});

app.post('/delete-achievement/:id', async (req, res) => {
    try {
        await Achievement.findByIdAndDelete(req.params.id);
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting achievement.");
    }
});

// Ensure 'officerImage' matches your EJS input name!
app.post('/add-officer', upload.single('officerImage'), async (req, res) => {
    try {
        console.log("File received:", req.file); // This helps you debug in the terminal!
        
        // If no file is uploaded, this will just be null instead of crashing
        const imageUrl = req.file ?` /uploads/${req.file.filename}` : null;

        const newOfficer = new Officer({
            name: req.body.name,
            position: req.body.position,
            imageUrl: imageUrl
        });

        await newOfficer.save();
        res.redirect('/dashboard');
    } catch (err) {
        console.error("DETAILED ERROR:", err); // Look at your VS Code terminal!
        res.status(500).send("Error adding officer: " + err.message);
    }
});

// 1. Route to Add History Entry (Text + Optional Image)
app.post('/add-history', upload.single('historyImage'), async (req, res) => {
    try {
        const imageUrl = req.file ?`/uploads/${req.file.filename}` : null; // Handles the photo
        
        const newHistory = new History({
            content: req.body.message, // Gets text from the textarea
            imageUrl: imageUrl
        });

        await newHistory.save(); // Saves to MongoDB
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error adding history.");
    }
});

// 2. Route to Delete a Specific History Entry
app.post('/delete-history/:id', async (req, res) => {
    try {
        await History.findByIdAndDelete(req.params.id); // Uses the unique ID to delete
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting history entry.");
    }
});

// 3. Route to Delete a Specific Officer
app.post('/delete-officer/:id', async (req, res) => {
    try {
        await Officer.findByIdAndDelete(req.params.id); // Allows you to remove officers one by one
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting officer.");
    }
});

app.post('/upload-file', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send("No file selected.");
        }

        const newFile = new File({
            displayName: req.body.displayName,
            filename: req.file.filename,
            category: "General",
            // This checks if user exists first to avoid crashing
            uploadedBy: req.user ? req.user.name : "Admin" 
        });

        await newFile.save();
        res.redirect('/dashboard');
    } catch (err) {
        console.error("DATABASE ERROR:", err); // Check your VS Code terminal for the real reason!
        res.status(500).send("Error saving file info: " + err.message);
    }
});

// CSV field escape function
function escapeCSV(field) {
    if (field === null || field === undefined || field === '---') return '---';
    const fieldStr = String(field);
    // If field contains comma, newline, or quotes, wrap in quotes and escape internal quotes
    if (fieldStr.includes(',') || fieldStr.includes('\n') || fieldStr.includes('"')) {
        return '"' + fieldStr.replace(/"/g, '""') + '"';
    }
    return fieldStr;
}

app.get('/download-attendance/:folderId', isAuthenticated, async (req, res) => {
    try {
        const eventName = req.query.event;
        const records = await Attendance.find({ eventName }).sort({ studentId: 1 });

        // Group records by student (same logic as folder-details view)
        const studentMap = {};
        records.forEach(record => {
            if (!studentMap[record.studentId]) {
                studentMap[record.studentId] = {
                    studentId: record.studentId,
                    studentName: record.studentName,
                    amIn: null,
                    amOut: null,
                    pmIn: null,
                    pmOut: null
                };
            }
            
            if (record.sessionType === 'AM_IN') studentMap[record.studentId].amIn = record.timestamp;
            if (record.sessionType === 'AM_OUT') studentMap[record.studentId].amOut = record.timestamp;
            if (record.sessionType === 'PM_IN') studentMap[record.studentId].pmIn = record.timestamp;
            if (record.sessionType === 'PM_OUT') studentMap[record.studentId].pmOut = record.timestamp;
        });

        // Convert to array and sort by studentId
        const attendanceData = Object.values(studentMap).sort((a, b) => {
            const aNum = parseInt(a.studentId.split('-')[1]) || 0;
            const bNum = parseInt(b.studentId.split('-')[1]) || 0;
            return aNum - bNum;
        });

        // Create CSV Header
        let csvContent = "Student ID,Student Name,AM IN,AM OUT,PM IN,PM OUT\n";

        // Add records to CSV with Philippines timezone formatting (same as table display)
        attendanceData.forEach(record => {
            const amIn = formatToPhilippinesTime(record.amIn);
            const amOut = formatToPhilippinesTime(record.amOut);
            const pmIn = formatToPhilippinesTime(record.pmIn);
            const pmOut = formatToPhilippinesTime(record.pmOut);
            
            // Properly escape CSV fields
            const studentId = escapeCSV(record.studentId);
            const studentName = escapeCSV(record.studentName);
            const amInCSV = escapeCSV(amIn);
            const amOutCSV = escapeCSV(amOut);
            const pmInCSV = escapeCSV(pmIn);
            const pmOutCSV = escapeCSV(pmOut);
            
            csvContent += `${studentId},${studentName},${amInCSV},${amOutCSV},${pmInCSV},${pmOutCSV}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${eventName}_Attendance.csv`);
        res.status(200).send(csvContent);
    } catch (err) {
        console.error('Error generating CSV:', err);
        res.status(500).send("Error generating download");
    }
});

app.get('/my-attendance/:folderId', isAuthenticated, async (req, res) => {
    try {
        const folder = await Folder.findById(req.params.folderId);
        const student = req.session.user;
        
        // 1. Get all sessions in this folder
        const sessions = await AttendanceSession.find({ folderId: req.params.folderId });

        // 2. Check if the student clicked a specific event
        const selectedEvent = req.query.event;
        let records = [];
        let attendanceData = [];

        if (selectedEvent) {
            // 3. Get all attendance records for THIS student for this event
            records = await Attendance.find({ 
                eventName: selectedEvent,
                studentId: student.mmId // Use mmId for the logged-in student
            }).sort({ timestamp: -1 });

            // 4. Format the data for display (same as officer view)
            const studentMap = {};
            records.forEach(record => {
                if (!studentMap[record.studentId]) {
                    studentMap[record.studentId] = {
                        studentId: record.studentId,
                        studentName: record.studentName,
                        amIn: null,
                        amOut: null,
                        pmIn: null,
                        pmOut: null
                    };
                }
                
                if (record.sessionType === 'AM_IN') studentMap[record.studentId].amIn = record.timestamp;
                if (record.sessionType === 'AM_OUT') studentMap[record.studentId].amOut = record.timestamp;
                if (record.sessionType === 'PM_IN') studentMap[record.studentId].pmIn = record.timestamp;
                if (record.sessionType === 'PM_OUT') studentMap[record.studentId].pmOut = record.timestamp;
            });

            attendanceData = Object.values(studentMap);
        }

        // 5. Create helper function for template to format times in Philippines timezone
        const formatPhilippinesTime = formatToPhilippinesTime;

        // Render folder-details (same template for both students and officers)
        res.render('folder-details', { 
            folder, 
            sessions, 
            records, 
            attendanceData,
            selectedEvent, 
            user: req.session.user,
            formatPhilippinesTime
        });
    } catch (err) {
        console.error("Student attendance error:", err);
        res.status(500).send("Error loading your attendance.");
    }
});

app.get('/my-account', async (req, res) => {
    // 1. Check if user is logged in
    if (!req.session.user) {
        return res.redirect('/login');
    }

    // 2. Check if the URL has ?success=true (for the confirmation box)
    const successStatus = req.query.success === 'true';
    const corSuccessStatus = req.query.cor_success === 'true';

    // 3. Count notification items
    let pendingResetRequestsCount = 0;
    if (req.session.user.role === 'adviser' || req.session.user.role === 'officer') {
        pendingResetRequestsCount = await User.countDocuments({ resetRequest: true });
    }

    // 4. Render the page and PASS the variables
    res.render('my-account', { 
        user: req.session.user, 
        showSuccess: successStatus,
        cor_success: corSuccessStatus,
        pendingResetRequestsCount: pendingResetRequestsCount
    });
});

app.post('/update-password', async (req, res) => {
    try {
        const { newPassword } = req.body;

        // 1. Check if the user is in the session
        if (!req.session.user || !req.session.user._id) {
            console.log("Update failed: No user ID in session.");
            return res.status(401).send("Please log out and log back in to refresh your session.");
        }

        const userId = req.session.user._id;

        // 2. Use the User model to update the password in MongoDB Atlas
        const updatedUser = await User.findByIdAndUpdate(
            userId, 
            { password: newPassword }, 
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).send("User not found in the cloud database.");
        }

        // 3. Success! Redirect back with a success message
          res.redirect('/my-account?success=true');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating password");
    }
});

// Route for users to update their own name
app.post('/update-name', async (req, res) => {
    try {
        const { firstName, lastName, middleName } = req.body;

        // 1. Check if the user is in the session
        if (!req.session.user || !req.session.user._id) {
            return res.status(401).json({ error: 'Please log out and log back in to refresh your session.' });
        }

        // 2. Sanitize and validate name fields
        const sanitizedFirstName = sanitizeName(firstName);
        const sanitizedLastName = sanitizeName(lastName);
        const sanitizedMiddleName = sanitizeName(middleName || '');

        const nameErrors = validateNames(sanitizedFirstName, sanitizedLastName, sanitizedMiddleName);
        if (nameErrors.length > 0) {
            return res.status(400).json({ error: nameErrors[0] });
        }

        // 3. Update the user
        const userId = req.session.user._id;
        const updatedUser = await User.findByIdAndUpdate(
            userId, 
            { 
                firstName: sanitizedFirstName,
                lastName: sanitizedLastName,
                middleName: sanitizedMiddleName,
                // Also update the legacy name field for backward compatibility
                name: `${sanitizedFirstName} ${sanitizedMiddleName} ${sanitizedLastName}`.trim()
            }, 
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // 4. Update session data
        req.session.user.firstName = sanitizedFirstName;
        req.session.user.lastName = sanitizedLastName;
        req.session.user.middleName = sanitizedMiddleName;
        req.session.user.name = updatedUser.name;

        res.redirect('/my-account?name_success=true');
    } catch (err) {
        console.error('Error updating name:', err);
        res.status(500).json({ error: 'Error updating name' });
    }
});

// Route for officers/advisers to update any user's name
app.post('/admin/update-student-name', isAuthenticated, async (req, res) => {
    try {
        // Verify authorization
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { userId, firstName, lastName, middleName } = req.body;

        // Validate userId
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        // Sanitize and validate name fields
        const sanitizedFirstName = sanitizeName(firstName);
        const sanitizedLastName = sanitizeName(lastName);
        const sanitizedMiddleName = sanitizeName(middleName || '');

        const nameErrors = validateNames(sanitizedFirstName, sanitizedLastName, sanitizedMiddleName);
        if (nameErrors.length > 0) {
            return res.status(400).json({ error: nameErrors[0] });
        }

        // Update the user
        const updatedUser = await User.findByIdAndUpdate(
            userId, 
            { 
                firstName: sanitizedFirstName,
                lastName: sanitizedLastName,
                middleName: sanitizedMiddleName,
                // Also update the legacy name field for backward compatibility
                name: `${sanitizedFirstName} ${sanitizedMiddleName} ${sanitizedLastName}`.trim()
            }, 
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ error: 'Student not found' });
        }

        res.json({ success: true, message: 'Name updated successfully', user: updatedUser });
    } catch (err) {
        console.error('Error updating student name:', err);
        res.status(500).json({ error: 'Error updating name' });
    }
});

// COR Upload Route - Students can upload their COR to MongoDB GridFS
app.post('/upload-cor', isAuthenticated, uploadCor.single('cor'), async (req, res) => {
    try {
        // Security: Students and officers can upload their own COR
        if (req.session.user.role !== 'student' && req.session.user.role !== 'officer') {
            return res.status(403).send("❌ Only students and officers can upload COR");
        }

        if (!req.file) {
            return res.status(400).send("❌ No file selected");
        }

        if (!gridFSBucket) {
            return res.status(500).send("❌ File storage service is not available");
        }

        const userId = req.session.user._id;
        const mmId = req.session.user.mmId || 'unknown';
        
        // Get the user's previous COR file ID (if any) to delete it
        const user = await User.findById(userId);
        const oldCORFileId = user?.corPath;
        
        // Create a readable stream from the uploaded file buffer
        const { Readable } = require('stream');
        const readStream = Readable.from(req.file.buffer);
        
        // Create GridFS upload stream with unique filename
        const uploadStream = gridFSBucket.openUploadStream(
            `COR_${mmId}_${Date.now()}_${req.file.originalname}`,
            {
                metadata: {
                    userId: userId.toString(),
                    mmId: mmId,
                    uploadedAt: new Date(),
                    originalFilename: req.file.originalname,
                    mimeType: req.file.mimetype
                }
            }
        );
        
        // Pipe the file to GridFS
        readStream.pipe(uploadStream);
        
        uploadStream.on('finish', async () => {
            try {
                // Store the file ID in the database
                const corFileId = uploadStream.id.toString();
                
                // Delete old COR file from GridFS if it exists and is a GridFS ID
                if (oldCORFileId && mongoose.Types.ObjectId.isValid(oldCORFileId) && oldCORFileId.length === 24) {
                    try {
                        const oldFileId = new mongoose.Types.ObjectId(oldCORFileId);
                        await gridFSBucket.delete(oldFileId);
                        console.log(`[INFO] Deleted old COR file from GridFS: ${oldFileId}`);
                    } catch (deleteErr) {
                        console.error("Error deleting old COR file:", deleteErr);
                        // Continue anyway - the old file won't affect the new one
                    }
                } else if (oldCORFileId && oldCORFileId.startsWith('/uploads/')) {
                    // Delete old disk-based file if it exists
                    try {
                        const oldFilePath = path.join(__dirname, 'public', oldCORFileId);
                        if (fs.existsSync(oldFilePath)) {
                            fs.unlinkSync(oldFilePath);
                            console.log(`[INFO] Deleted old COR file from disk: ${oldFilePath}`);
                        }
                    } catch (diskErr) {
                        console.error("Error deleting old disk COR file:", diskErr);
                        // Continue anyway
                    }
                }
                
                // Update user's corFileId in database
                const updatedUser = await User.findByIdAndUpdate(
                    userId,
                    { corPath: corFileId }, // Store GridFS file ID instead of path
                    { new: true }
                );

                if (!updatedUser) {
                    return res.status(404).send("User not found");
                }

                // Update session
                req.session.user.corPath = corFileId;

                // Redirect back to my-account with success
                res.redirect('/my-account?cor_success=true');
            } catch (err) {
                console.error("COR Database Update Error:", err);
                res.status(500).send("Error saving COR: " + err.message);
            }
        });
        
        uploadStream.on('error', (err) => {
            console.error("COR GridFS Upload Error:", err);
            res.status(500).send("Error uploading COR: " + err.message);
        });
    } catch (err) {
        console.error("COR Upload Error:", err);
        res.status(500).send("Error uploading COR: " + err.message);
    }
});

// COR Download Route - Officers and advisers can download student COR (supports both GridFS and old disk files)
app.get('/download-cor/:studentId', isAuthenticated, async (req, res) => {
    try {
        // Security: Only officers and advisers can download COR
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.status(403).json({ error: "Unauthorized" });
        }

        // Get student data including corPath
        const student = await User.findById(req.params.studentId);

        if (!student || !student.corPath) {
            return res.status(404).json({ error: "COR not found" });
        }

        // Check if corPath is a GridFS ObjectId (new format) or file path (old format)
        const isGridFSId = mongoose.Types.ObjectId.isValid(student.corPath) && student.corPath.length === 24;

        if (isGridFSId && gridFSBucket) {
            try {
                // Download from GridFS (new format)
                const fileId = new mongoose.Types.ObjectId(student.corPath);
                const downloadStream = gridFSBucket.openDownloadStream(fileId);
                
                // Get file info to extract metadata
                const filesCollection = mongoose.connection.collection('cors.files');
                const fileInfo = await filesCollection.findOne({ _id: fileId });
                
                let downloadFileName = `${student.mmId}_COR`;
                let contentType = 'application/octet-stream';
                
                if (fileInfo && fileInfo.metadata) {
                    // Extract original filename for proper extension
                    if (fileInfo.metadata.originalFilename) {
                        const ext = path.extname(fileInfo.metadata.originalFilename);
                        downloadFileName = `${student.mmId}_COR${ext}`;
                    }
                    // Use stored MIME type for proper file recognition
                    if (fileInfo.metadata.mimeType) {
                        contentType = fileInfo.metadata.mimeType;
                    }
                }
                
                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', `attachment; filename="${downloadFileName}"`);
                
                downloadStream.pipe(res);
                
                downloadStream.on('error', (err) => {
                    console.error("COR Download Stream Error:", err);
                    if (!res.headersSent) {
                        res.status(404).json({ error: "COR file not found" });
                    }
                });
            } catch (gridErr) {
                console.error("GridFS Download Error:", gridErr);
                return res.status(500).json({ error: "Error downloading COR" });
            }
        } else if (student.corPath.startsWith('/uploads/')) {
            // Download from file system (old format for backward compatibility)
            try {
                const filePath = path.join(__dirname, 'public', student.corPath);
                
                if (!fs.existsSync(filePath)) {
                    return res.status(404).json({ error: "COR file not found" });
                }
                
                // Extract extension from original file path
                const ext = path.extname(filePath);
                res.download(filePath, `${student.mmId}_COR${ext}`);
            } catch (fileErr) {
                console.error("File System Download Error:", fileErr);
                return res.status(500).json({ error: "Error downloading COR" });
            }
        } else {
            return res.status(400).json({ error: "Invalid COR file format" });
        }
    } catch (err) {
        console.error("COR Download Error:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: "Error downloading COR" });
        }
    }
});

// COR View Route - Anyone can view their own COR file (for inline viewing)
app.get('/view-cor/:userId', isAuthenticated, async (req, res) => {
    try {
        // Security: Users can only view their own COR, or officers/advisers can view any student's COR
        if (req.session.user._id.toString() !== req.params.userId && 
            req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.status(403).json({ error: "Unauthorized" });
        }

        if (!gridFSBucket) {
            return res.status(500).json({ error: "File storage service is not available" });
        }

        // Get user data including corPath
        const user = await User.findById(req.params.userId);

        if (!user || !user.corPath) {
            return res.status(404).json({ error: "COR not found" });
        }

        // Check if corPath is a GridFS ObjectId (new format) or file path (old format)
        const isGridFSId = mongoose.Types.ObjectId.isValid(user.corPath) && user.corPath.length === 24;

        if (isGridFSId && gridFSBucket) {
            try {
                // View from GridFS (new format) - inline view
                const fileId = new mongoose.Types.ObjectId(user.corPath);
                const downloadStream = gridFSBucket.openDownloadStream(fileId);
                
                // Get file info to extract metadata
                const filesCollection = mongoose.connection.collection('cors.files');
                const fileInfo = await filesCollection.findOne({ _id: fileId });
                
                let viewFileName = `${user.mmId}_COR`;
                let contentType = 'application/octet-stream';
                
                if (fileInfo && fileInfo.metadata) {
                    // Extract original filename for proper extension
                    if (fileInfo.metadata.originalFilename) {
                        const ext = path.extname(fileInfo.metadata.originalFilename);
                        viewFileName = `${user.mmId}_COR${ext}`;
                    }
                    // Use stored MIME type for proper file recognition
                    if (fileInfo.metadata.mimeType) {
                        contentType = fileInfo.metadata.mimeType;
                    }
                }
                
                // Don't force download - allow inline viewing
                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', `inline; filename="${viewFileName}"`);
                
                downloadStream.pipe(res);
                
                downloadStream.on('error', (err) => {
                    console.error("COR View Stream Error:", err);
                    if (!res.headersSent) {
                        res.status(404).json({ error: "COR file not found" });
                    }
                });
            } catch (gridErr) {
                console.error("GridFS View Error:", gridErr);
                return res.status(500).json({ error: "Error viewing COR" });
            }
        } else if (user.corPath.startsWith('/uploads/')) {
            // View from file system (old format for backward compatibility)
            try {
                const filePath = path.join(__dirname, 'public', user.corPath);
                
                if (!fs.existsSync(filePath)) {
                    return res.status(404).json({ error: "COR file not found" });
                }
                
                // Send the file for inline viewing with proper extension
                const ext = path.extname(filePath);
                res.setHeader('Content-Disposition', `inline; filename="${user.mmId}_COR${ext}"`);
                res.sendFile(filePath);
            } catch (fileErr) {
                console.error("File System View Error:", fileErr);
                return res.status(500).json({ error: "Error viewing COR" });
            }
        } else {
            return res.status(400).json({ error: "Invalid COR file format" });
        }
    } catch (err) {
        console.error("COR View Error:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: "Error viewing COR" });
        }
    }
});

// COR Delete Route - Students can delete their own COR (supports both GridFS and old disk files)
app.post('/delete-cor', isAuthenticated, async (req, res) => {
    try {
        // Security: Only students can delete their own COR
        if (req.session.user.role !== 'student') {
            return res.status(403).json({ success: false, message: "Only students can delete COR" });
        }

        const userId = req.session.user._id;
        
        // Get user's current COR file ID or path
        const user = await User.findById(userId);
        
        if (!user || !user.corPath) {
            return res.status(404).json({ success: false, message: "No COR file found" });
        }

        // Check if corPath is a GridFS ObjectId (new format) or file path (old format)
        const isGridFSId = mongoose.Types.ObjectId.isValid(user.corPath) && user.corPath.length === 24;

        if (isGridFSId && gridFSBucket) {
            // Delete from GridFS (new format)
            try {
                const fileId = new mongoose.Types.ObjectId(user.corPath);
                await gridFSBucket.delete(fileId);
                console.log(`[INFO] Deleted COR file from GridFS: ${fileId}`);
            } catch (gridErr) {
                console.error("Error deleting COR file from GridFS:", gridErr);
                // Continue with database update even if file deletion fails
            }
        } else if (user.corPath.startsWith('/uploads/')) {
            // Delete from file system (old format for backward compatibility)
            try {
                const filePath = path.join(__dirname, 'public', user.corPath);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`[INFO] Deleted COR file from disk: ${filePath}`);
                }
            } catch (fileErr) {
                console.error("Error deleting COR file from disk:", fileErr);
                // Continue with database update even if file deletion fails
            }
        } else {
            console.warn("Unknown COR file format:", user.corPath);
        }

        // Clear the corPath in the database
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { corPath: null },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Update session
        req.session.user.corPath = null;

        return res.json({ success: true, message: "COR deleted successfully" });
    } catch (err) {
        console.error("COR Delete Error:", err);
        res.status(500).json({ success: false, message: "Error deleting COR: " + err.message });
    }
});

app.get('/delete-download/:id', isAuthenticated, async (req, res) => {
    try {
        // Security check
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.status(403).send("Unauthorized");
        }

        // Check if needed: Download model does not exist in ./models/Download
        // TODO: Verify if this route is still needed. If needed, replace 'Download' with 'File' model
        res.redirect('/dashboard');
    } catch (err) {
        console.error("Error deleting file:", err);
        res.status(500).send("Server Error");
    }
});

// Master Student List Page - Admin only
app.get('/admin/students', isAuthenticated, async (req, res) => {
    try {
        // Check if user is officer or adviser
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.redirect('/dashboard');
        }

        // Parse page number (default to 1)
        const page = Math.max(1, parseInt(req.query.page || 1));
        const pageSize = 50; // Show 50 students per page
        const totalSlots = 300; // Total MM-IDs: MM-001 to MM-300
        const totalPages = Math.ceil(totalSlots / pageSize); // Should be 6 pages
        
        // Validate page number
        if (page > totalPages) {
            return res.redirect(`/admin/students?page=${totalPages}`);
        }

        const skip = (page - 1) * pageSize;
        const startSlot = skip + 1;
        const endSlot = Math.min(skip + pageSize, totalSlots);

        // Get all students from database
        const allUsersInDb = await User.find()
            .select('name username mmId role corPath yearLevel _id firstName lastName middleName')
            .lean();

        // Create a map for quick lookup
        const userMap = {};
        allUsersInDb.forEach(user => {
            if (user.mmId) {
                userMap[user.mmId] = user;
            }
        });

        // Build the complete list for this page (both assigned and empty slots)
        const students = [];
        for (let i = startSlot; i <= endSlot; i++) {
            const mmId = `MM-${String(i).padStart(3, '0')}`;
            if (userMap[mmId]) {
                // Student is assigned
                students.push({
                    ...userMap[mmId],
                    isAssigned: true
                });
            } else {
                // Empty slot
                students.push({
                    _id: null,
                    mmId: mmId,
                    name: '',
                    username: '',
                    firstName: '',
                    lastName: '',
                    middleName: '',
                    role: '',
                    corPath: null,
                    yearLevel: '',
                    isAssigned: false
                });
            }
        }

        // Get total count of assigned students
        const totalAssigned = allUsersInDb.length;

        // Build complete list of all 300 slots for sorting (both assigned and empty)
        const allStudents = [];
        for (let i = 1; i <= totalSlots; i++) {
            const mmId = `MM-${String(i).padStart(3, '0')}`;
            if (userMap[mmId]) {
                // Student is assigned
                allStudents.push({
                    ...userMap[mmId],
                    isAssigned: true
                });
            } else {
                // Empty slot
                allStudents.push({
                    _id: null,
                    mmId: mmId,
                    name: '',
                    username: '',
                    firstName: '',
                    lastName: '',
                    middleName: '',
                    role: '',
                    corPath: null,
                    yearLevel: '',
                    isAssigned: false
                });
            }
        }

        // Count pending reset requests for notification badge
        let pendingResetRequestsCount = 0;
        if (req.session.user.role === 'adviser' || req.session.user.role === 'officer') {
            pendingResetRequestsCount = await User.countDocuments({ resetRequest: true });
        }

        res.render('master-student-list', { 
            students: students,
            allStudentsJSON: JSON.stringify(allStudents),
            user: req.session.user,
            page: page,
            pageSize: pageSize,
            totalPages: totalPages,
            totalAssigned: totalAssigned,
            pendingResetRequestsCount: pendingResetRequestsCount
        });
    } catch (err) {
        console.error('Error loading master student list:', err);
        res.status(500).send('Error loading student list');
    }
});

// API: Search across all 300 student slots
app.get('/api/search-students', isAuthenticated, async (req, res) => {
    try {
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const searchQuery = (req.query.q || '').toLowerCase();
        if (!searchQuery) {
            return res.json({ results: [] });
        }

        // Get all users from database
        const allUsers = await User.find()
            .select('name username mmId role corPath yearLevel _id')
            .lean();

        // Create a map for quick lookup
        const userMap = {};
        allUsers.forEach(user => {
            if (user.mmId) {
                userMap[user.mmId] = user;
            }
        });

        // Search across all 300 slots
        const results = [];
        for (let i = 1; i <= 300; i++) {
            const mmId = `MM-${String(i).padStart(3, '0')}`;
            const name = userMap[mmId]?.name || '';
            
            // Check if search query matches mmId or name
            if (mmId.toLowerCase().includes(searchQuery) || name.toLowerCase().includes(searchQuery)) {
                const pageSize = 50;
                const page = Math.ceil(i / pageSize);
                
                results.push({
                    mmId: mmId,
                    name: name,
                    page: page,
                    isAssigned: !!userMap[mmId],
                    role: userMap[mmId]?.role || '',
                    yearLevel: userMap[mmId]?.yearLevel || '',
                    username: userMap[mmId]?.username || '',
                    _id: userMap[mmId]?._id || null
                });
            }
        }

        res.json({ results });
    } catch (err) {
        console.error('Error searching students:', err);
        res.status(500).json({ error: 'Search error' });
    }
});

// API: Get master student list (for live updates)
app.get('/api/master-students', isAuthenticated, async (req, res) => {
    try {
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Parse page number and page size from query
        const page = Math.max(1, parseInt(req.query.page || 1));
        const pageSize = 50; // 50 results per page
        const skip = (page - 1) * pageSize;

        // Get total count
        const totalAssigned = await User.countDocuments();
        const totalPages = Math.ceil(totalAssigned / pageSize);

        // Get paginated students (no QR codes)
        const assignedStudents = await User.find()
            .select('name username mmId role corPath yearLevel')
            .sort({ mmId: 1 })
            .skip(skip)
            .limit(pageSize)
            .lean();

        // Build response with pagination info
        res.json({ 
            students: assignedStudents,
            page: page,
            pageSize: pageSize,
            totalPages: totalPages,
            totalAssigned: totalAssigned
        });
    } catch (err) {
        console.error('Error fetching master student list:', err);
        res.status(500).json({ error: 'Error loading student list' });
    }
});

// Update student role
app.post('/admin/update-student-role', isAuthenticated, async (req, res) => {
    try {
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.status(403).send('Unauthorized');
        }

        const { mmId, newRole } = req.body;

        // Find the user by mmId
        const user = await User.findOne({ mmId });
        if (!user) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Prevent removing the last adviser
        if (user.role === 'adviser' && newRole !== 'adviser') {
            const adviserCount = await User.countDocuments({ role: 'adviser' });
            if (adviserCount <= 1) {
                return res.status(400).json({ error: 'Cannot remove the last adviser!' });
            }
        }

        // Update the role
        await User.findByIdAndUpdate(user._id, { role: newRole });

        res.json({ success: true, message: `Role updated to ${newRole}` });
    } catch (err) {
        console.error('Error updating role:', err);
        res.status(500).json({ error: 'Error updating role' });
    }
});

// Update student year level (Officer/Adviser only)
app.post('/admin/update-student-year-level', isAuthenticated, async (req, res) => {
    try {
        console.log('[INFO] Year level update request received:', {
            userId: req.session.user._id,
            userRole: req.session.user.role,
            body: req.body
        });

        // Role-based security: only officer or adviser can update year level
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            console.log('[ERROR] Unauthorized - user role is:', req.session.user.role);
            return res.status(403).json({ error: 'Unauthorized access. Only officers and advisers can update year levels.' });
        }

        const { mmId, yearLevel } = req.body;
        console.log('[INFO] Processing update for mmId:', mmId, 'yearLevel:', yearLevel);

        // Validate year level input
        const validYearLevels = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
        if (!yearLevel || !validYearLevels.includes(yearLevel)) {
            console.log('[ERROR] Invalid year level:', yearLevel, 'Valid options:', validYearLevels);
            return res.status(400).json({ error: 'Invalid year level selected' });
        }

        // Find the user by mmId
        const user = await User.findOne({ mmId });
        if (!user) {
            console.log('[ERROR] Student not found with mmId:', mmId);
            return res.status(404).json({ error: 'Student not found' });
        }

        console.log('[INFO] Found user:', user.name, '- updating yearLevel to:', yearLevel);
        
        // Update the year level
        const updatedUser = await User.findByIdAndUpdate(
            user._id, 
            { yearLevel }, 
            { new: true }  // Returns the updated document
        );

        console.log('[SUCCESS] Year level updated in MongoDB for user:', updatedUser.name);
        console.log('[VERIFY] Updated user record:', {
            name: updatedUser.name,
            mmId: updatedUser.mmId,
            yearLevel: updatedUser.yearLevel,
            role: updatedUser.role,
            savedToCloud: true
        });

        res.json({ 
            success: true, 
            message: `Year level updated to ${yearLevel}`,
            savedUser: {
                name: updatedUser.name,
                mmId: updatedUser.mmId,
                yearLevel: updatedUser.yearLevel
            }
        });
    } catch (err) {
        console.error('[ERROR] Exception in year level update:', err);
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// Remove student (wipe profile)
app.post('/admin/remove-student', isAuthenticated, async (req, res) => {
    try {
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.status(403).send('Unauthorized');
        }

        const { mmId } = req.body;

        // Find the user by mmId
        const user = await User.findOne({ mmId });
        if (!user) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Prevent removing the last adviser
        if (user.role === 'adviser') {
            const adviserCount = await User.countDocuments({ role: 'adviser' });
            if (adviserCount <= 1) {
                return res.status(400).json({ error: 'Cannot remove the last adviser!' });
            }
        }

        // 1. Delete the user to wipe their profile
        await User.findByIdAndDelete(user._id);

        // 2. Clear all attendance records for this student
        await Attendance.deleteMany({ studentId: mmId });

        // 3. Mark the MM-ID as unassigned in the student pool
        await StudentIDPool.updateOne(
            { mmId },
            { isAssigned: false, assignedToUsername: null }
        );

        res.json({ success: true, message: 'Student removed. Attendance records cleared. ID slot is now available.' });
    } catch (err) {
        console.error('Error removing student:', err);
        res.status(500).json({ error: 'Error removing student' });
    }
});

app.post('/admin-reset-password', async (req, res) => {
    try {
        const idFromForm = req.body.studentId.trim();

        // Use findOneAndUpdate to bypass the validation crash
        const result = await User.findOneAndUpdate(
            { username: idFromForm }, 
            { $set: { password: "123456", resetRequest: false } },
            { new: true }
        );

        if (!result) {
            return res.status(404).send("User not found.");
        }
        await ResetRequest.deleteOne({ studentId: idFromForm });
        res.redirect('/admin/reset-requests');
    } catch (err) {
        console.error(err);
        res.status(500).send("Update failed: " + err.message);
    }
});

// 1. Show the request page
app.get('/request-reset', (req, res) => {
    res.render('request-reset'); // This looks for a file named request-reset.ejs
});

app.post('/request-reset', async (req, res) => {
    try {
        let searchInput = req.body.email;

        if (!searchInput || !searchInput.trim()) {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: 'Segoe UI', sans-serif; background: #f4f4f4; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                        .error-box { background: white; padding: 40px; border-radius: 12px; border: 3px solid #000; border-top: 6px solid #ffcc00; max-width: 450px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
                        .error-box h2 { color: #000; margin-bottom: 15px; }
                        .error-box p { color: #666; line-height: 1.6; margin-bottom: 20px; }
                        .error-message { color: #d32f2f; font-weight: 600; padding: 12px; background: #ffebee; border-radius: 6px; margin-bottom: 20px; }
                        a { color: #fff; text-decoration: none; background: #000; padding: 12px 25px; border-radius: 6px; font-weight: 600; display: inline-block; transition: all 0.3s ease; border: 2px solid #ffcc00; }
                        a:hover { background: #ffcc00; color: #000; }
                    </style>
                </head>
                <body>
                    <div class="error-box">
                        <h2>❌ Email Required</h2>
                        <div class="error-message">Please enter a valid email address</div>
                        <a href="/request-reset">← Try Again</a>
                    </div>
                </body>
                </html>
            `);
        }

        // Trim and normalize input
        const cleanInput = searchInput.trim();

        // Try to find user by email (case-insensitive) first
        let user = await User.findOne({ email: { $regex: `^${cleanInput}$`, $options: 'i' } });

        // If not found by email, try by studentID
        if (!user) {
            user = await User.findOne({ studentId: cleanInput });
        }

        if (!user) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: 'Segoe UI', sans-serif; background: #f4f4f4; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                        .error-box { background: white; padding: 40px; border-radius: 12px; border: 3px solid #000; border-top: 6px solid #ffcc00; max-width: 450px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
                        .error-box h2 { color: #000; margin-bottom: 15px; }
                        .error-box p { color: #666; line-height: 1.6; margin-bottom: 20px; }
                        .error-message { color: #d32f2f; font-weight: 600; padding: 12px; background: #ffebee; border-radius: 6px; margin-bottom: 20px; }
                        a { color: #fff; text-decoration: none; background: #000; padding: 12px 25px; border-radius: 6px; font-weight: 600; display: inline-block; transition: all 0.3s ease; border: 2px solid #ffcc00; }
                        a:hover { background: #ffcc00; color: #000; }
                    </style>
                </head>
                <body>
                    <div class="error-box">
                        <h2>❌ Account Not Found</h2>
                        <div class="error-message">No account found with this email address</div>
                        <p>Please contact an Administrator or Officer for assistance.</p>
                        <a href="/request-reset">← Try Another Email</a>
                    </div>
                </body>
                </html>
            `);
        }

        // Update the user's resetRequest flag to true
        const updateResult = await User.findByIdAndUpdate(user._id, { resetRequest: true }, { new: true });

        // Success response with styled page
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Reset Request Submitted</title>
                <style>
                    body { font-family: 'Segoe UI', sans-serif; background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; }
                    .success-box { background: white; padding: 40px; border-radius: 12px; border: 3px solid #000; border-top: 6px solid #ffcc00; max-width: 500px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.3); }
                    .success-box h2 { color: #000; margin-bottom: 15px; font-size: 1.8em; }
                    .success-message { color: #1b5e20; font-weight: 600; padding: 15px; background: #e8f5e9; border-radius: 8px; border-left: 4px solid #4caf50; margin-bottom: 20px; text-align: left; }
                    .success-box p { color: #666; line-height: 1.8; margin-bottom: 15px; }
                    .info-section { background: #fffbf0; padding: 15px; border-radius: 8px; border-left: 4px solid #ffcc00; margin-bottom: 20px; text-align: left; }
                    .info-section h4 { color: #000; margin: 0 0 10px 0; }
                    .info-section p { color: #666; margin: 5px 0; font-size: 0.9em; }
                    a { color: #fff; text-decoration: none; background: #000; padding: 13px 30px; border-radius: 6px; font-weight: 600; display: inline-block; transition: all 0.3s ease; border: 2px solid #ffcc00; margin-top: 10px; }
                    a:hover { background: #ffcc00; color: #000; }
                </style>
            </head>
            <body>
                <div class="success-box">
                    <h2>✅ Request sent to Officers</h2>
                    <div class="success-message">
                        <strong>Please wait for manual reset</strong>
                    </div>
                    <div class="info-section">
                        <h4>📋 What Happens Next:</h4>
                        <p>✓ An Officer will review your request</p>
                        <p>✓ Your password will be reset to 123456</p>
                        <p>✓ You'll be able to log in and change it afterwards</p>
                    </div>
                    <div class="info-section">
                        <h4>⏱️ Timeline:</h4>
                        <p>Please check back within 24-48 hours. If you don't receive a response, contact your department adviser.</p>
                    </div>
                    <a href="/login">← Back to Login</a>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        console.error("[ERROR] Password reset error:", err);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Segoe UI', sans-serif; background: #f4f4f4; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .error-box { background: white; padding: 40px; border-radius: 12px; border: 3px solid #000; border-top: 6px solid #ffcc00; max-width: 450px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
                    .error-box h2 { color: #000; margin-bottom: 15px; }
                    .error-box p { color: #666; line-height: 1.6; margin-bottom: 20px; }
                    .error-message { color: #d32f2f; font-weight: 600; padding: 12px; background: #ffebee; border-radius: 6px; margin-bottom: 20px; }
                    a { color: #fff; text-decoration: none; background: #000; padding: 12px 25px; border-radius: 6px; font-weight: 600; display: inline-block; transition: all 0.3s ease; border: 2px solid #ffcc00; }
                    a:hover { background: #ffcc00; color: #000; }
                </style>
            </head>
            <body>
                <div class="error-box">
                    <h2>⚠️ Server Error</h2>
                    <div class="error-message">An error occurred while processing your request</div>
                    <p>Please try again later or contact an administrator.</p>
                    <a href="/request-reset">← Try Again</a>
                </div>
            </body>
            </html>
        `);
    }
});

app.post('/create-event/:folderId', isAuthenticated, async (req, res) => {
    try {
        const { eventName } = req.body;
        const folderId = req.params.folderId;
        
        // Validate event name
        if (!eventName || !eventName.trim()) {
            return res.status(400).send("❌ Event name is required.");
        }

        console.log("📝 Creating event:", { eventName, folderId });
        
        // Check if an event with the same name already exists in this folder
        const existingEvent = await AttendanceSession.findOne({ 
            eventName: eventName.trim(), 
            folderId: folderId 
        });

        if (existingEvent) {
            console.log("⚠️ Event with this name already exists in this folder");
            return res.status(409).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Event Already Exists - BSBA-MM Portal</title>
                    <style>
                        body { font-family: 'Segoe UI', sans-serif; background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; }
                        .error-box { background: white; padding: 40px; border-radius: 12px; border: 3px solid #000; border-top: 6px solid #ffcc00; max-width: 500px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.3); }
                        .error-box h2 { color: #000; margin-bottom: 15px; font-size: 1.8em; }
                        .error-message { color: #d32f2f; font-weight: 600; padding: 15px; background: #ffebee; border-radius: 8px; border-left: 4px solid #d32f2f; margin-bottom: 20px; text-align: left; }
                        .error-box p { color: #666; line-height: 1.8; margin-bottom: 15px; }
                        .suggestion-box { background: #fffbf0; padding: 15px; border-radius: 8px; border-left: 4px solid #ffcc00; margin-bottom: 20px; text-align: left; }
                        .suggestion-box h4 { color: #000; margin: 0 0 10px 0; }
                        .suggestion-box p { color: #666; margin: 5px 0; font-size: 0.9em; }
                        a { color: #fff; text-decoration: none; background: #000; padding: 12px 25px; border-radius: 6px; font-weight: 600; display: inline-block; transition: all 0.3s ease; border: 2px solid #ffcc00; }
                        a:hover { background: #ffcc00; color: #000; }
                    </style>
                </head>
                <body>
                    <div class="error-box">
                        <h2>⚠️ Event Name Already Exists</h2>
                        <div class="error-message">
                            <strong>Error:</strong> An event with the name "<strong>${eventName}</strong>" already exists in this folder.
                        </div>
                        <div class="suggestion-box">
                            <h4>💡 Suggestions:</h4>
                            <p>✓ Use a different event name (e.g., add a date or number)</p>
                            <p>✓ View existing events before creating a new one</p>
                            <p>✓ Edit or delete the existing event if needed</p>
                        </div>
                        <p>Please choose a unique event name and try again.</p>
                        <a href="javascript:history.back()">← Back</a>
                    </div>
                </body>
                </html>
            `);
        }
        
        // Create an AttendanceSession with the unique event name
        const newSession = await AttendanceSession.create({
            eventName: eventName.trim(),
            folderId: folderId,
            type: 'General',
            date: new Date(),
            token: Math.random().toString(36).substring(7)
        });

        console.log("[SUCCESS] Event created successfully:", newSession._id);
        res.redirect(`/folder-details/${folderId}`); 
    } catch (err) {
        console.error("[ERROR] Error creating event:", err.message);
        res.status(500).send("Error creating event: " + err.message);
    }
});

app.get('/delete-event/:id/:folderId', async (req, res) => {
    try {
        await AttendanceSession.findByIdAndDelete(req.params.id);
        // We redirect back to the folder details so the page refreshes automatically
        res.redirect(`/folder-details/${req.params.folderId}`);
    } catch (err) {
        console.log(err);
        res.status(500).send("Error deleting event");
    }
});

// === REMOVE ATTENDANCE ROUTE (Removes attendance records for a student at a specific event only) ===
app.post('/remove-attendance', isAuthenticated, async (req, res) => {
    try {
        // Security check: only officers/advisers can remove attendance
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        const { studentId, eventName } = req.body;

        if (!studentId || !eventName) {
            return res.status(400).json({ success: false, error: 'Missing studentId or eventName' });
        }

        // Delete all attendance records for this student at this specific event
        const result = await Attendance.deleteMany({
            studentId: studentId,
            eventName: eventName
        });

        if (result.deletedCount > 0) {
            res.json({ 
                success: true, 
                message: `Removed attendance for ${studentId} at event "${eventName}"`
            });
        } else {
            res.json({ 
                success: false, 
                error: 'No attendance records found to delete'
            });
        }
    } catch (err) {
        console.error("Error removing attendance:", err);
        res.status(500).json({ success: false, error: 'Error removing attendance' });
    }
});

// === DELETE STUDENT ROUTE (Removes user from DB + clears attendance) ===
app.post('/delete-student/:mmId', isAuthenticated, async (req, res) => {
    try {
        // Security check: only officers/advisers can delete
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { mmId } = req.params;

        // Find the user by mmId
        const user = await User.findOne({ mmId });
        if (!user) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Prevent removing the last adviser
        if (user.role === 'adviser') {
            const adviserCount = await User.countDocuments({ role: 'adviser' });
            if (adviserCount <= 1) {
                return res.status(400).json({ error: 'Cannot remove the last adviser!' });
            }
        }

        // 1. Delete the user profile
        await User.findByIdAndDelete(user._id);

        // 2. Clear all attendance records for this student
        await Attendance.deleteMany({ studentId: mmId });

        // 3. Mark the MM-ID as unassigned in the student pool
        await StudentIDPool.updateOne(
            { mmId },
            { isAssigned: false, assignedToUsername: null }
        );

        res.json({ success: true, message: 'Student deleted successfully. Attendance records cleared. ID slot is now available.' });
    } catch (err) {
        console.error('Error deleting student:', err);
        res.status(500).json({ error: 'Error deleting student: ' + err.message });
    }
});

// === UPDATE STUDENT ROLE ROUTE ===
app.post('/update-student-role/:mmId', isAuthenticated, async (req, res) => {
    try {
        // Security check: only officers/advisers can change roles
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { mmId } = req.params;
        const { newRole } = req.body;

        // Find the user by mmId
        const user = await User.findOne({ mmId });
        if (!user) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Prevent removing the last adviser
        if (user.role === 'adviser' && newRole !== 'adviser') {
            const adviserCount = await User.countDocuments({ role: 'adviser' });
            if (adviserCount <= 1) {
                return res.status(400).json({ error: 'Cannot remove the last adviser!' });
            }
        }

        // Update the role
        const updatedUser = await User.findByIdAndUpdate(user._id, { role: newRole }, { new: true });

        res.json({ success: true, message: `Role updated to ${newRole}`, user: updatedUser });
    } catch (err) {
        console.error('Error updating role:', err);
        res.status(500).json({ error: 'Error updating role: ' + err.message });
    }
});

// === DELETE ATTENDANCE RECORD ROUTE ===
app.post('/delete-attendance-record/:recordId', isAuthenticated, async (req, res) => {
    try {
        // Security check: only officers/advisers can delete
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { recordId } = req.params;
        const deletedRecord = await Attendance.findByIdAndDelete(recordId);

        if (!deletedRecord) {
            return res.status(404).json({ error: 'Record not found' });
        }

        res.json({ success: true, message: 'Attendance record deleted', deletedRecord });
    } catch (err) {
        console.error('Error deleting attendance record:', err);
        res.status(500).json({ error: 'Error deleting record: ' + err.message });
    }
});

// === PDF GENERATION ROUTE (All student QR codes) ===
app.get('/generate-qr-pdf', isAuthenticated, async (req, res) => {
    try {
        // Security check: only officers/advisers can generate
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.status(403).send('Unauthorized');
        }

        // Get all student IDs with their QR codes
        const studentIds = await StudentIDPool.find().sort({ mmId: 1 });

        if (studentIds.length === 0) {
            return res.status(404).send('No student IDs found');
        }

        // Send the data to the PDF template
        res.render('generate-qr-pdf', { 
            studentIds: studentIds,
            user: req.session.user,
            title: 'Student ID QR Codes'
        });
    } catch (err) {
        console.error('Error generating QR PDF:', err);
        res.status(500).send('Error generating PDF: ' + err.message);
    }
});

// === PASSWORD RESET REQUESTS ROUTE ===
app.get('/admin/reset-requests', isAuthenticated, async (req, res) => {
    try {
        // Check authorization - only adviser and officer roles can access
        if (req.session.user.role !== 'adviser' && req.session.user.role !== 'officer') {
            return res.status(403).send('Access Denied: Only Officers and Advisers can access this page.');
        }

        // Find all users with resetRequest: true flag
        const resetRequests = await User.find({ resetRequest: true }).sort({ createdAt: -1 });

        res.render('reset-requests', {
            user: req.session.user,
            resetRequests: resetRequests
        });
    } catch (err) {
        console.error('Error loading reset requests:', err);
        res.status(500).send('Error loading reset requests: ' + err.message);
    }
});

// === RESET PASSWORD ACTION ROUTE ===
app.post('/admin/reset-password/:userId', isAuthenticated, async (req, res) => {
    try {
        // Check authorization - only adviser and officer roles can reset
        if (req.session.user.role !== 'adviser' && req.session.user.role !== 'officer') {
            return res.status(403).json({ error: 'Access Denied' });
        }

        const { userId } = req.params;
        const defaultPassword = '123456'; // Default reset password
        console.log('[DEBUG] Admin Reset Password - userId from params:', userId);

        // Update the user: set password and resetRequest to false
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { 
                password: defaultPassword,
                resetRequest: false 
            },
            { new: true }
        );

        if (!updatedUser) {
            console.log('[ERROR] User not found for userId:', userId);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log(`[SUCCESS] Password reset for: ${updatedUser.name} (${updatedUser.email}). resetRequest now: ${updatedUser.resetRequest}`);

        res.json({ 
            success: true, 
            message: `Password reset for ${updatedUser.name}. New password: 123456`
        });
    } catch (err) {
        console.error('Error resetting password:', err);
        res.status(500).json({ error: 'Error resetting password: ' + err.message });
    }
});

// === DATABASE REPAIR ROUTE ===
// This route helps fix users with missing/undefined emails
app.get('/admin/repair-emails', isAuthenticated, async (req, res) => {
    try {
        // Check authorization
        if (req.session.user.role !== 'adviser' && req.session.user.role !== 'officer') {
            return res.status(403).send('Access Denied: Only Officers and Advisers can access this.');
        }

        console.log('\n========== EMAIL REPAIR DIAGNOSTIC ==========');
        
        // Find all users
        const allUsers = await User.find({});
        console.log(`Total Users: ${allUsers.length}\n`);
        
        // Check which ones have missing emails
        const missingEmails = allUsers.filter(u => !u.email || u.email === 'undefined');
        const haveEmails = allUsers.filter(u => u.email && u.email !== 'undefined');
        
        console.log(`Users with email: ${haveEmails.length}`);
        console.log(`Users WITHOUT email (undefined): ${missingEmails.length}`);
        
        if (missingEmails.length > 0) {
            console.log('\nUsers needing email repair:');
            missingEmails.forEach(u => {
                console.log(`  - ${u.name} | username: ${u.username} | email: ${u.email}`);
            });
            
            // Auto-repair: Copy username to email for users missing email
            console.log('\nAttempting to repair emails from usernames...');
            for (const user of missingEmails) {
                if (user.username) {
                    const updated = await User.findByIdAndUpdate(
                        user._id,
                        { email: user.username },
                        { new: true }
                    );
                    console.log(`  ✓ Fixed ${updated.name}: email now = ${updated.email}`);
                }
            }
        }
        
        console.log('=========================================\n');
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial; background: #f4f4f4; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                    h1 { color: #000; }
                    .success { color: #4caf50; font-weight: bold; }
                    .error { color: #d32f2f; font-weight: bold; }
                    .info { background: #e3f2fd; padding: 15px; border-left: 4px solid #2196f3; margin: 15px 0; }
                    a { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #000; color: #ffcc00; text-decoration: none; border-radius: 6px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>✓ Email Repair Complete</h1>
                    <div class="info">
                        <p>The system has automatically repaired all missing emails by copying from the username field.</p>
                        <p><strong>Check the terminal for the repair report.</strong></p>
                    </div>
                    <p>All users should now have valid emails. You can now use the password reset feature.</p>
                    <a href="/dashboard">← Back to Dashboard</a>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('Error repairing emails:', err);
        res.status(500).send('Error repairing emails: ' + err.message);
    }
});
