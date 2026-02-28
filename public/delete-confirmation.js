/**
 * Universal Delete Confirmation Modal System
 * Provides consistent delete confirmations across the portal
 */

class DeleteConfirmation {
    constructor(modalId = 'deleteConfirmationModal') {
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
            modal.className = 'delete-confirmation-modal';
            modal.innerHTML = `
                <div class="delete-confirmation-content">
                    <h3 id="deleteConfirmTitle">⚠️ Confirm Deletion</h3>
                    <div id="deleteConfirmDescription"></div>
                    <div id="deleteConfirmWarning"></div>
                    <div class="delete-confirmation-buttons">
                        <button class="btn-delete-cancel" onclick="window.deleteConfirmation.cancel()">Cancel</button>
                        <button class="btn-delete-confirm" id="deleteConfirmBtn" onclick="window.deleteConfirmation.confirm()">Delete</button>
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
            title = '⚠️ Confirm Deletion',
            description = 'Are you sure you want to delete this item?',
            warning = null,
            buttonText = 'Delete',
            onConfirm = null,
            data = null
        } = options;

        // Update modal content
        document.getElementById('deleteConfirmTitle').textContent = title;
        document.getElementById('deleteConfirmDescription').innerHTML = `<p>${description}</p>`;
        
        if (warning) {
            document.getElementById('deleteConfirmWarning').innerHTML = 
                `<div class="delete-warning-box">${warning}</div>`;
        } else {
            document.getElementById('deleteConfirmWarning').innerHTML = '';
        }

        document.getElementById('deleteConfirmBtn').textContent = buttonText;

        // Store callback and data
        this.pendingCallback = onConfirm;
        this.pendingData = data;

        // Show modal
        this.modal.classList.add('active');
    }

    // Confirm deletion
    confirm() {
        if (typeof this.pendingCallback === 'function') {
            this.pendingCallback(this.pendingData);
        }
        this.cancel();
    }

    // Cancel deletion
    cancel() {
        this.modal.classList.remove('active');
        this.pendingCallback = null;
        this.pendingData = null;
    }
}

// Helper function for quick delete confirmations
function showDeleteConfirmation(options = {}) {
    if (!window.deleteConfirmation) {
        window.deleteConfirmation = new DeleteConfirmation();
    }
    window.deleteConfirmation.show(options);
}

// Initialize global instance when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        window.deleteConfirmation = new DeleteConfirmation();
        
        // Close modal when clicking outside
        const modal = document.getElementById('deleteConfirmationModal');
        if (modal) {
            window.addEventListener('click', function(event) {
                if (event.target === modal) {
                    window.deleteConfirmation.cancel();
                }
            });
        }
    });
} else {
    // DOM is already loaded
    window.deleteConfirmation = new DeleteConfirmation();
    
    // Close modal when clicking outside
    const modal = document.getElementById('deleteConfirmationModal');
    if (modal) {
        window.addEventListener('click', function(event) {
            if (event.target === modal) {
                window.deleteConfirmation.cancel();
            }
        });
    }
}
