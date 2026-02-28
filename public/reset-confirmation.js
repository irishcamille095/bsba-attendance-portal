/**
 * Universal Reset Confirmation Modal System
 * Provides consistent reset confirmations across the portal
 */

class ResetConfirmation {
    constructor(modalId = 'resetConfirmationModal') {
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
            modal.className = 'reset-confirmation-modal';
            modal.innerHTML = `
                <div class="reset-confirmation-content">
                    <h3 id="resetConfirmTitle">🔐 Confirm Password Reset</h3>
                    <div id="resetConfirmDescription"></div>
                    <div id="resetConfirmWarning"></div>
                    <div class="reset-confirmation-buttons">
                        <button class="btn-reset-cancel" onclick="window.resetConfirmation.cancel()">Cancel</button>
                        <button class="btn-reset-confirm" id="resetConfirmBtn" onclick="window.resetConfirmation.confirm()">Reset Password</button>
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
            title = '🔐 Confirm Password Reset',
            description = 'Are you sure you want to reset this student\'s password?',
            warning = null,
            buttonText = 'Reset Password',
            onConfirm = null,
            data = null
        } = options;

        // Update modal content
        document.getElementById('resetConfirmTitle').textContent = title;
        document.getElementById('resetConfirmDescription').innerHTML = `<p>${description}</p>`;
        
        if (warning) {
            document.getElementById('resetConfirmWarning').innerHTML = 
                `<div class="reset-warning-box">${warning}</div>`;
        } else {
            document.getElementById('resetConfirmWarning').innerHTML = '';
        }

        document.getElementById('resetConfirmBtn').textContent = buttonText;

        // Store callback and data
        this.pendingCallback = onConfirm;
        this.pendingData = data;

        // Show modal
        this.modal.classList.add('active');
    }

    // Confirm reset
    confirm() {
        if (typeof this.pendingCallback === 'function') {
            this.pendingCallback(this.pendingData);
        }
        this.cancel();
    }

    // Cancel reset
    cancel() {
        this.modal.classList.remove('active');
        this.pendingCallback = null;
        this.pendingData = null;
    }
}

// Helper function for quick reset confirmations
function showResetConfirmation(options = {}) {
    if (!window.resetConfirmation) {
        window.resetConfirmation = new ResetConfirmation();
    }
    window.resetConfirmation.show(options);
}

// Initialize global instance when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        window.resetConfirmation = new ResetConfirmation();
        
        // Close modal when clicking outside
        const modal = document.getElementById('resetConfirmationModal');
        if (modal) {
            window.addEventListener('click', function(event) {
                if (event.target === modal) {
                    window.resetConfirmation.cancel();
                }
            });
        }
    });
} else {
    // DOM is already loaded
    window.resetConfirmation = new ResetConfirmation();
    
    // Close modal when clicking outside
    const modal = document.getElementById('resetConfirmationModal');
    if (modal) {
        window.addEventListener('click', function(event) {
            if (event.target === modal) {
                window.resetConfirmation.cancel();
            }
        });
    }
}
