// Add these routes to app.js after the existing document-related routes

// GET /api/get-all-students - Fetch all students for document management
app.get('/api/get-all-students', isAuthenticated, async (req, res) => {
    try {
        // Only officers and advisers can access this
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const students = await User.find({ role: 'student' }).select('_id firstName lastName yearLevel email mmId');
        res.json(students);
    } catch (err) {
        console.error('Error fetching students:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/get-all-student-documents - Fetch all student documents for document management
app.get('/api/get-all-student-documents', isAuthenticated, async (req, res) => {
    try {
        // Only officers and advisers can access this
        if (req.session.user.role !== 'officer' && req.session.user.role !== 'adviser') {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const studentDocs = await StudentDocument.find()
            .populate('student', 'firstName lastName yearLevel mmId')
            .populate('documentType', '_id title fileType maxUploads');
        
        res.json(studentDocs);
    } catch (err) {
        console.error('Error fetching student documents:', err);
        res.status(500).json({ error: err.message });
    }
});
