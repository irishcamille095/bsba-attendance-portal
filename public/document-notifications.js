// Document Notification Badge Utility
// This script checks for pending documents and updates UI with badges

async function checkDocumentNotifications() {
    try {
        const response = await fetch('/api/check-document-notifications');
        if (!response.ok) return;

        const data = await response.json();

        if (data.hasPendingDocuments) {
            // Show badge on hamburger menu
            updateHamburgerBadge(data.pendingCount);
            
            // Show badge on My Documents link in sidebar
            updateSidebarBadge('my-documents-link', data.pendingCount);
        }
    } catch (err) {
        console.error('Error checking document notifications:', err);
    }
}

function updateHamburgerBadge(count) {
    let hamburger = document.querySelector('.hamburger-menu');
    if (!hamburger) {
        hamburger = document.querySelector('button[onclick="toggleSidebar()"]:not(.sidebar-close-btn)');
    }

    if (hamburger) {
        // Remove existing badge if any
        const existingBadge = hamburger.querySelector('.notification-badge');
        if (existingBadge) existingBadge.remove();

        // Add new number badge
        const badge = document.createElement('span');
        badge.className = 'notification-badge';
        badge.textContent = count;
        badge.title = `${count} document(s) pending`;
        hamburger.style.position = 'relative';
        hamburger.appendChild(badge);
    }
}

function updateSidebarBadge(linkId, count) {
    let link = document.getElementById(linkId);
    if (!link) {
        link = document.querySelector(`a[href="/my-documents"]`);
    }

    if (link) {
        // Remove existing badge if any
        const existingBadge = link.querySelector('.small-badge');
        if (existingBadge) existingBadge.remove();

        // Add new badge
        const badge = document.createElement('span');
        badge.className = 'small-badge';
        badge.textContent = count;
        badge.style.marginLeft = '8px';
        link.appendChild(badge);
    }
}

// Check for notifications on page load
document.addEventListener('DOMContentLoaded', () => {
    // Only check for students and only on dashboard page
    const userRole = document.querySelector('[data-user-role]')?.dataset.userRole;
    const isDashboard = window.location.pathname === '/dashboard';
    if (userRole === 'student' && isDashboard) {
        checkDocumentNotifications();
        // Check again every 30 seconds
        setInterval(checkDocumentNotifications, 30000);
    }
});
