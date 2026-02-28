/**
 * =======================================
 * SMART LOADER - High-End Portal Experience
 * =======================================
 * 
 * PREMIUM FEATURES:
 * ✓ Selective Triggering: Only .needs-loader elements
 * ✓ Instant Input Lockout: Prevents all interactions immediately
 * ✓ 1-Second Rule: Only shows spinner if page takes >1 second
 * ✓ Glassmorphism Design: Frosted glass effect with blur
 * ✓ Dual-Ring CSS Spinner: Marketing Gold (#FFD700)
 * ✓ Clean Exit: No loader stick on browser back button
 * ✓ Accessibility: Logout & Sidebar Toggle exempt
 * 
 * USAGE:
 * 1. Add class "needs-loader" to elements that trigger navigation:
 *    <button class="needs-loader">Submit</button>
 *    <a class="needs-loader">Back to Menu</a>
 * 
 * 2. EXCLUDE these elements (will NOT trigger loader):
 *    <button class="logout-btn">Logout</button>
 *    <button class="hamburger-btn">Menu</button>
 * 
 * 3. For AJAX requests, call window.hideLoaderAjax() when complete
 */

(function() {
    'use strict';

    let loaderOverlay = null;
    let loaderTimeout = null;
    let isPageLoading = false;

    /**
     * Initialize Smart Loader on DOM ready
     */
    window.initSmartLoader = function() {
        console.log('[Smart Loader] Initializing...');
        
        // Get or create loader overlay element
        loaderOverlay = document.getElementById('loader-overlay');
        console.log('[Smart Loader] Looking for existing overlay:', loaderOverlay ? 'FOUND' : 'NOT FOUND');
        
        if (!loaderOverlay) {
            console.log('[Smart Loader] Creating new overlay element...');
            loaderOverlay = document.createElement('div');
            loaderOverlay.id = 'loader-overlay';
            loaderOverlay.className = 'loader-overlay';
            loaderOverlay.innerHTML = `
                <div class="loader-content">
                    <div class="dual-ring-spinner"></div>
                    <p class="loader-message">Connecting to Portal...</p>
                </div>
            `;
            document.body.appendChild(loaderOverlay);
            console.log('[Smart Loader] Overlay element created and appended to body');
        }

        // Check if loader should be showing from previous page navigation
        const loaderFlag = sessionStorage.getItem('loaderActive');
        console.log('[Smart Loader] Checking sessionStorage.loaderActive:', loaderFlag);
        
        if (loaderFlag === 'true') {
            console.log('[Smart Loader] DETECTED ACTIVE LOADER FROM PREVIOUS PAGE - SHOWING SPINNER NOW');
            isPageLoading = true;
            loaderOverlay.classList.add('active');
            console.log('[Smart Loader] Added "active" class to overlay');
            sessionStorage.removeItem('loaderActive');
            console.log('[Smart Loader] Cleared sessionStorage flag');
        }

        // Get all elements with .needs-loader class
        // EXCLUDING: .logout-btn and .hamburger-btn
        const targetElements = document.querySelectorAll(
            'button.needs-loader, a.needs-loader'
        );
        console.log('[Smart Loader] Found ' + targetElements.length + ' elements with .needs-loader class');

        /**
         * Trigger loader with 1-second delay
         * Locks screen IMMEDIATELY
         */
        window.triggerSmartLoader = function() {
            console.log('[Smart Loader] triggerSmartLoader() called');
            console.log('[Smart Loader] isPageLoading status:', isPageLoading);
            
            if (isPageLoading) {
                console.log('[Smart Loader] Already loading, ignoring click');
                return;
            }

            isPageLoading = true;
            console.log('[Smart Loader] TRIGGERED - Screen locked immediately');

            // Mark loader as active for next page navigation
            sessionStorage.setItem('loaderActive', 'true');
            console.log('[Smart Loader] Set sessionStorage.loaderActive = true');

            // === INSTANT LOCKOUT ===
            document.body.style.pointerEvents = 'none';
            document.body.style.cursor = 'wait';
            console.log('[Smart Loader] Body pointer events locked');

            // === 1-SECOND RULE ===
            loaderTimeout = setTimeout(function() {
                console.log('[Smart Loader] 1 second elapsed - checking if overlay exists and isPageLoading is true');
                // If we reach here, page hasn't loaded yet
                // Show gorgeous spinner overlay
                if (loaderOverlay && isPageLoading) {
                    console.log('[Smart Loader] Showing spinner NOW (1 second passed, page still loading)');
                    loaderOverlay.classList.add('active');
                } else {
                    console.log('[Smart Loader] NOT showing spinner - overlay exists:', !!loaderOverlay, ', isPageLoading:', isPageLoading);
                }
            }, 1000);
        };

        /**
         * Hide loader and restore full interaction
         */
        window.hideSmartLoader = function() {
            // Cancel pending timeout
            if (loaderTimeout) {
                clearTimeout(loaderTimeout);
                loaderTimeout = null;
            }

            // Reset state
            isPageLoading = false;

            // Clear the session flag
            sessionStorage.removeItem('loaderActive');

            // Restore interaction
            document.body.style.pointerEvents = 'auto';
            document.body.style.cursor = 'auto';

            // Hide overlay
            if (loaderOverlay) {
                loaderOverlay.classList.remove('active');
                console.log('[Smart Loader] Hidden - Screen unlocked');
            }
        };

        /**
         * For AJAX requests: Hide and restore immediately
         */
        window.hideLoaderAjax = function() {
            if (loaderTimeout) {
                clearTimeout(loaderTimeout);
                loaderTimeout = null;
            }
            isPageLoading = false;
            sessionStorage.removeItem('loaderActive');
            document.body.style.pointerEvents = 'auto';
            document.body.style.cursor = 'auto';
            if (loaderOverlay) {
                loaderOverlay.classList.remove('active');
            }
        };

        /**
         * Attach click handlers to ALL .needs-loader elements
         */
        targetElements.forEach(element => {
            console.log('[Smart Loader] Attaching click handler to:', element.tagName, element.textContent.trim());
            element.addEventListener('click', function(e) {
                console.log('[Smart Loader] CLICK detected on:', element.tagName, element.textContent.trim());
                triggerSmartLoader();
            });
        });

        /**
         * CLEAN EXIT: Reset when page loads
         * (automatically happens on new page)
         */
        window.addEventListener('load', function() {
            console.log('[Smart Loader] Page LOAD event fired - hiding loader');
            hideSmartLoader();
        });

        /**
         * CLEAN EXIT: Ensure loader is hidden on DOMContentLoaded
         * This fires early during page load
         */
        document.addEventListener('DOMContentLoaded', function() {
            console.log('[Smart Loader] DOMContentLoaded fired');
            if (isPageLoading) {
                console.log('[Smart Loader] Page still loading at DOMContentLoaded, will hide on load event');
            }
        });

        /**
         * CLEAN EXIT: Reset on page visibility change
         */
        document.addEventListener('visibilitychange', function() {
            console.log('[Smart Loader] Visibility change - hidden:', document.hidden);
            if (!document.hidden && isPageLoading) {
                console.log('[Smart Loader] Page became visible while loading - hiding loader');
                hideSmartLoader();
            }
        });

        /**
         * Handle browser back button
         * State change event detects navigation
         */
        window.addEventListener('popstate', function() {
            console.log('[Smart Loader] Browser back button detected - hiding loader');
            hideSmartLoader();
        });

        /**
         * Also reset when page is about to unload
         * This ensures clean state for next page load
         */
        window.addEventListener('beforeunload', function() {
            console.log('[Smart Loader] beforeunload event - clearing isPageLoading flag');
            isPageLoading = false;
        });
        
        console.log('[Smart Loader] Initialization complete!');
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.initSmartLoader);
    } else {
        window.initSmartLoader();
    }
})();
