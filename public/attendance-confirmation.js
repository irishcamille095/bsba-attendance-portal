/**
 * Universal Attendance Confirmation Modal System
 * Provides consistent attendance confirmations after scanning
 */

class AttendanceConfirmation {
    constructor(modalId = 'attendanceConfirmationModal') {
        this.modalId = modalId;
        this.modal = null;
        this.pendingCallback = null;
        this.pendingData = null;
        this.ensureModalExists();
    }

    // Ensure modal exists in DOM
    ensureModalExists() {
        let modal = document.getElementById(this.modalId);
        if (!modal) {
            modal = document.createElement('div');
            modal.id = this.modalId;
            modal.className = 'attendance-confirmation-modal';
            modal.innerHTML = `
                <div class="attendance-confirmation-content">
                    <h3 id="attendanceConfirmTitle">✅ Attendance Marked</h3>
                    <div id="attendanceConfirmDescription"></div>
                    <div id="attendanceStudentInfo"></div>
                    <div id="attendanceConfirmWarning"></div>
                    <div class="attendance-confirmation-buttons">
                        <button class="btn-attendance-continue" onclick="window.attendanceConfirmation.continueScan()">Continue Scanning</button>
                        <button class="btn-attendance-done" id="attendanceConfirmBtn" onclick="window.attendanceConfirmation.confirm()">Done</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        this.modal = modal;
    }

    // Show confirmation modal
    show(options = {}) {
        const {
            title = '✅ Attendance Marked',
            description = 'Student attendance has been recorded.',
            studentInfo = null,
            warning = null,
            onConfirm = null,
            data = null
        } = options;

        // Update modal content
        document.getElementById('attendanceConfirmTitle').textContent = title;
        document.getElementById('attendanceConfirmDescription').innerHTML = `<p>${description}</p>`;
        
        if (studentInfo) {
            const infoHtml = `
                <div class="attendance-student-box">
                    <p><strong>Student:</strong> ${studentInfo.name}</p>
                    <p><strong>MM-ID:</strong> ${studentInfo.mmId}</p>
                    <p><strong>Session:</strong> ${studentInfo.session}</p>
                </div>
            `;
            document.getElementById('attendanceStudentInfo').innerHTML = infoHtml;
        } else {
            document.getElementById('attendanceStudentInfo').innerHTML = '';
        }
        
        if (warning) {
            document.getElementById('attendanceConfirmWarning').innerHTML = 
                `<div class="attendance-warning-box">${warning}</div>`;
        } else {
            document.getElementById('attendanceConfirmWarning').innerHTML = '';
        }

        // Store callback and data
        this.pendingCallback = onConfirm;
        this.pendingData = data;

        // Show modal
        this.modal.classList.add('active');
    }

    // Confirm and execute callback
    confirm() {
        if (typeof this.pendingCallback === 'function') {
            this.pendingCallback(this.pendingData);
        }
        this.cancel();
    }

    // Continue scanning (just close the modal)
    continueScan() {
        this.cancel();
    }

    // Cancel/close
    cancel() {
        this.modal.classList.remove('active');
        this.pendingCallback = null;
        this.pendingData = null;
    }
}

// Helper function for quick attendance confirmations
function showAttendanceConfirmation(options = {}) {
    if (!window.attendanceConfirmation) {
        window.attendanceConfirmation = new AttendanceConfirmation();
    }
    window.attendanceConfirmation.show(options);
}

// Initialize global instance when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        window.attendanceConfirmation = new AttendanceConfirmation();
        
        // Close modal when clicking outside
        const modal = document.getElementById('attendanceConfirmationModal');
        if (modal) {
            window.addEventListener('click', function(event) {
                if (event.target === modal) {
                    window.attendanceConfirmation.cancel();
                }
            });
        }
    });
} else {
    window.attendanceConfirmation = new AttendanceConfirmation();
    
    // Close modal when clicking outside
    const modal = document.getElementById('attendanceConfirmationModal');
    if (modal) {
        window.addEventListener('click', function(event) {
            if (event.target === modal) {
                window.attendanceConfirmation.cancel();
            }
        });
    }
}
