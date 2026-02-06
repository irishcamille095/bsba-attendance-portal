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
    studentId: String,
    studentName: String,
    sessionType: String,
    date: String,
    time: String
});

const Attendance = mongoose.model('Attendance', AttendanceSchema);

// --- SETTINGS ---
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'bsba-mm-secret-key',
    resave: false,
    saveUninitialized: true
}));

app.get('/login', (req, res) => res.render('login'));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Find the user in the cloud database instead of the JSON file
        const user = await User.findOne({ username: username, password: password });

        if (user) {
            req.session.user = user;
            res.redirect('/dashboard');
        } else {
            res.send('<h1>Invalid Login</h1><a href="/">Try again</a>');
        }
    } catch (err) {
        res.status(500).send("Login error occurred.");
    }
});

app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/login');

    res.render('index', { 
        user: req.session.user, 
        announcements: announcements, 
        qrCodeImage: currentEventQR,    // Sending the QR
        currentSession: currentSession  // SENDING THE SESSION NAME (Fixes the error!)
    });
});

// Admin Route to show the QR Code on a screen

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.post('/signup', (req, res) => {
    const { name, studentId, password } = req.body;

    // 1. Check if ID already exists so we don't have duplicates
    const exists = users.find(u => u.id === studentId);
    if (exists) {
        return res.send("ID already registered. <a href='/signup'>Try again</a>");
    }

    // 2. Add the new student to the temporary list in memory
    const newUser = { id: studentId, password: password, name: name };
    users.push(newUser);

    // 3. PERMANENTLY save to the users.json file
    // This is the part that "includes" them even if you restart the app
    fs.writeFileSync('./data/users.json', JSON.stringify(users, null, 2));

    // 4. Send them back to login
    res.send(`
        <div style="text-align:center; margin-top:50px; font-family:sans-serif;">
            <h2>Account created for ${name}!</h2>
            <p>You can now log in with your ID: <b>${studentId}</b></p>
            <a href="/login" style="background:#800000; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Go to Login</a>
        </div>
    `);
}); //

app.get('/signup', (req, res) => {
    res.render('signup');
});

app.get('/view-attendance', async (req, res) => {
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

app.post('/generate-event-qr', async (req, res) => {
    // 1. Capture the choice from the dropdown
    const sessionType = req.body.sessionType; 
    currentSession = sessionType; // Save it to our global variable

    const today = new Date().toLocaleDateString();
    
    try {
        // 2. Create the QR with the session info inside it
        currentEventQR = await QRCode.toDataURL(`ATTENDANCE|${sessionType}|${today}`);
        res.redirect('/dashboard');
    } catch (err) {
        res.send("Error generating QR");
    }
});

app.get('/close-qr', (req, res) => {
    currentEventQR = ''; // This clears the QR data
    res.redirect('/dashboard');
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

    // Check if the QR code scanned belongs to the current session (AM IN, etc.)
    if (code && code.includes(currentSession)) {
        try {
            // 1. Create the entry using our MongoDB Blueprint
            const newRecord = new Attendance({
                studentId: user.id,
                studentName: user.name,
                sessionType: currentSession,
                date: new Date().toLocaleDateString(),
                time: new Date().toLocaleTimeString()
            });

            // 2. Save it to the Cloud
            await newRecord.save();

            // 3. Show success to the student
            res.send(`
                <div style="text-align:center; font-family:sans-serif; padding:50px;">
                    <h1 style="color:green;">✅ Attendance Recorded!</h1>
                    <p><b>${user.name}</b>, your <b>${currentSession}</b> has been saved.</p>
                    <a href="/dashboard" style="background:#800000; color:white; padding:10px; text-decoration:none; border-radius:5px;">Back to Dashboard</a>
                </div>
            `);
        } catch (err) {
            console.error("Save Error:", err);
            res.status(500).send("Error saving to cloud. Please show this to the Officer.");
        }
    } else {
        res.send(`<h1>❌ Invalid QR</h1><p>This code is not for the current ${currentSession} session.</p><a href="/scan">Try again</a>`);
    }
});

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