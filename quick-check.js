const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://irishcamille095:February095@cluster0.c33gokn.mongodb.net/?appName=Cluster0';

const AttendanceSchema = new mongoose.Schema({
    studentId: String,
    eventName: String,
    sessionType: String,
    status: String,
    fine: Number
});

const Attendance = mongoose.model('Attendance', AttendanceSchema);

async function checkStudent() {
  try {
    await mongoose.connect(mongoUri);

    const records = await Attendance.find({ 
      studentId: 'MM-055', 
      eventName: 'Clean Up Drive' 
    }).sort({ sessionType: 1 });

    console.log(`\n=== MM-055 Clean Up Drive Records ===`);
    console.log(`Total records: ${records.length}`);
    console.log(`\nBreakdown:`);
    
    records.forEach(r => {
      console.log(`  ${r.sessionType}: Status=${r.status}, Fine=${r.fine}`);
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkStudent();
