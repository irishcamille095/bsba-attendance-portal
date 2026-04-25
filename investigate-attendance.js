const mongoose = require('mongoose');
require('dotenv').config();

// Define Attendance schema and model like it is in app.js
const AttendanceSchema = new mongoose.Schema({
  studentId: String,
  firstName: String,
  lastName: String,
  eventName: String,
  status: { type: String, default: 'Present', enum: ['Present', 'Absent', 'Excused'] },
  fine: { type: Number, default: 0 },
  sessionType: String,
  createdAt: { type: Date, default: Date.now },
  scannedAt: { type: Date }
});

const Attendance = mongoose.model('Attendance', AttendanceSchema);

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Get all Clean Up Drive records
    const records = await Attendance.find({ eventName: 'Clean Up Drive (03/02/26)' });
    
    const absents = records.filter(r => r.status === 'Absent').length;
    const presents = records.filter(r => r.status === 'Present').length;
    
    console.log('Clean Up Drive Attendance Summary:');
    console.log('Total records:', records.length);
    console.log('Absent:', absents);
    console.log('Present:', presents);
    
    // Show all records
    console.log('\nAll records for Clean Up Drive:');
    records.slice(0, 20).forEach(s => {
      console.log(`${s.studentId}: Status=${s.status}, Fine=${s.fine}`);
    });
    
    if (records.length > 20) {
      console.log(`... and ${records.length - 20} more records`);
    }
    
    await mongoose.connection.close();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
