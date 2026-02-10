const mongoose = require('mongoose');

// Paste your link here. 
// IMPORTANT: Replace <password> with the password you created in MongoDB!
mongoose.connect('mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0')
    .then(() => console.log('✅ Connected to MongoDB Cloud!'))
    .catch(err => console.error('❌ Could not connect:', err));

const express = require('express');
const session = require('express-session');
const fs = require('fs');
const QRCode = require('qrcode');
const app = express();

// --- THE "DATABASE" (Create these ONLY ONCE at the top) ---
const users = JSON.parse(fs.readFileSync('./data/users.json', 'utf8'));
let announcements = [];
let attendanceLogs = [];
let currentEventQR = ''; // Make sure this exists
let currentSession = ''; // ADD THIS LINE RIGHT HERE

const AttendanceSchema = new mongoose.Schema({
    studentId: String,   // Link to the student
    studentName: String, // Their name
    eventName: String,   // Store the actual name (e.g., "Monthly Meeting")
    sessionId: String,   // The ID of the QR used
    timestamp: { type: Date, default: Date.now }
});
const Attendance = mongoose.model('Attendance', AttendanceSchema);

// --- SETTINGS ---
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads')); // This lets the browser see your photos
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(session({
    secret: 'bsba-mm-secret-key',
    resave: false,
    saveUninitialized: true
}));


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

const attendanceSessionSchema = new mongoose.Schema({
    type: String, // AM_IN, AM_OUT, PM_IN, PM_OUT
    date: { type: Date, default: Date.now },
    token: String,
    active: { type: Boolean, default: true }
});

const AttendanceSession = mongoose.model('AttendanceSession', attendanceSessionSchema);

// ... NOW come your routes like app.get('/dashboard') ...

const multer = require('multer');
const path = require('path');

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

// Create the Announcement Schema
const AnnouncementSchema = new mongoose.Schema({
    title: String,
    message: String,
    imageUrl: String,
    date: { type: Date, default: Date.now },
    author: String
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

app.use(express.static('public'));

app.get('/login', (req, res) => res.render('login'));

app.post('/login', async (req, res) => {
    const { studentId, password } = req.body; // Only taking ID and Password now

    try {
        // Find the user by their ID
        const user = await User.findOne({ username: studentId });

        // Check if the user exists and the password matches
        if (user && user.password === password) {
            // Save the user data (including their role!) into the session
            req.session.user = user; 
            return res.redirect('/dashboard');
        } else {
            return res.send("❌ Invalid Student ID or Password.");
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
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
        
        // 2. Fetch the Attendance data you just added
        const allAttendance = await Attendance.find().sort({ timestamp: -1 });
        const myAttendance = await Attendance.find({ studentId: user.studentId }).sort({ timestamp: -1 });

        // 3. Render the page once with ALL variables
        res.render('dashboard', { 
            user, 
            announcements, 
            achievements, 
            officers, 
            historyEntries, 
            files,
            allAttendance, // This fixes the Reference Error!
            myAttendance
        });
    } catch (err) {
        console.error("Dashboard Loading Error:", err);
        res.status(500).send("Error loading dashboard data.");
    }
});

// Admin Route to show the QR Code on a screen

app.get('/register', (req, res) => {
    res.render('register'); 
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
    const { name, studentId, password, role } = req.body;
    try {
        // 1. Save to MongoDB
        await User.create({
            name: name,
            username: studentId,
            password: password,
            role: role
        });

        // 2. ONLY ONE RESPONSE: Send a success page with a link to login
        res.send(`
            <div style="text-align:center; margin-top:50px; font-family:sans-serif;">
                <h2>Account created for ${name}!</h2>
                <p>You can now log in with your ID: <b>${studentId}</b></p>
                <a href="/login" style="color:#800000; font-weight:bold;">Click here to Login</a>
            </div>
       ` );
    } catch (err) {
        console.error(err);
        res.send("Error: ID already registered or Database Connection failed.");
    }
});

app.get('/signup', (req, res) => {
    res.render('signup');
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
        res.render('report', { logs: allLogs });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching logs from the cloud.");
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("-----------------------------------------");
    console.log(`🚀 SERVER IS LIVE: http://localhost:${PORT}`);
    console.log("-----------------------------------------");
});

app.post('/generate-qr', isAuthenticated, async (req, res) => {
    try {
        // 1. Capture the event name from your input label
        const { eventName, sessionType } = req.body; 
        const today = new Date().setHours(0,0,0,0);

        // 2. Add 'eventName' to the creation logic
        const newSession = await AttendanceSession.create({
            eventName: eventName, // This saves what you typed!
            type: sessionType,
            date: today,
            token: Math.random().toString(36).substring(7)
        });

        res.render('show-qr', { session: newSession });
    } catch (err) {
        res.status(500).send("Error creating session: " + err.message);
    }
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
            res.render('show-qr', { session: latestSession });
        } else {
            res.send("<script>alert('No QR has been generated yet today!'); window.location='/dashboard';</script>");
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Error retrieving QR.");
    }
});

// Show the scanner page
app.get('/scan', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.render('scanner');
});

// Record the attendance
app.get('/mark-attendance', async (req, res) => {
    const { code } = req.query;
    const user = req.session.user;

    try {
        // Find the session that matches the QR code token
        const currentSessionData = await AttendanceSession.findOne({ token: code });

        if (!currentSessionData) {
            return res.send("<h1>❌ Invalid QR</h1><p>This session does not exist.</p>");
        }

        // STEP 2: Create the record using data from THAT session
        const newRecord = new Attendance({
            studentId: user.id || user.studentId,
            studentName: user.name,
            eventName: currentSessionData.eventName, // <--- THIS SAVES YOUR LABEL
            sessionType: currentSessionData.type,
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString()
        });

        await newRecord.save();
        
        res.send(`<h1>✅ Success</h1><p>Recorded for: ${currentSessionData.eventName}</p>`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error saving attendance.");
    }
}); // <--- Ensure only ONE set of closing brackets here!

app.get('/attendance-report', (req, res) => {
    if (req.session.user.role === 'student') return res.redirect('/dashboard');
    
    res.render('report', { logs: attendanceLogs });
});

app.get('/view-attendance', async (req, res) => {
    // Only Officers and Advisers can see the list
    if (req.session.user.role === 'student') return res.redirect('/dashboard');

    try {
        // Fetch ALL records from the cloud, sorted by newest first
        const allLogs = await Attendance.find().sort({ _id: -1 });
        res.render('report', { logs: allLogs });
    } catch (err) {
        res.send("Error loading attendance logs.");
    }
});

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    name: String,
    role: String, // 'student', 'officer', or 'adviser'
    id: String
});
const User = mongoose.model('User', UserSchema);

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
        console.log("✅ Database is ready!");
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
        await Announcement.create({
            title,
            message,
            imageUrl,
            author: req.session.user.name
        });
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

app.post('/delete-file', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
        return res.status(403).send("Unauthorized");
    }

    try {
        const { fileId } = req.body;
        await FileModel.findByIdAndDelete(fileId);
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

// Post History
app.post('/add-history', upload.single('historyImage'), async (req, res) => {
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const newHistory = new History({
        content: req.body.message,
        imageUrl: imageUrl
    });
    await newHistory.save();
    res.redirect('/dashboard');
});

// Delete History
app.post('/delete-history/:id', async (req, res) => {
    await History.findByIdAndDelete(req.params.id);
    res.redirect('/dashboard');
});

// Note: Ensure you have similar routes for /add-officer and /delete-officer!

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

// TEMPORARY TEST ROUTE
app.get('/test-attendance', async (req, res) => {
    try {
        const testRecord = new Attendance({
            studentId: "2024-0001", // Match this to a real studentId if you have one
            studentName: "Test Student",
            eventName: "First General Assembly",
            sessionId: "TEST-SESSION-123",
            timestamp: new Date()
        });

        await testRecord.save();
        res.send("<h1>Success!</h1><p>Fake attendance added. Go back to your <a href='/dashboard'>Dashboard</a> and check the lists.</p>");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating test data: " + err.message);
    }
});