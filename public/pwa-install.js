// PWA Installation Detection and Prompt
let deferredPrompt;
let installButton = null;

// Detect if app is already installed
let isAppInstalled = false;
if (window.navigator.standalone === true) {
  isAppInstalled = true;
}

window.addEventListener('beforeinstallprompt', (event) => {
  // Prevent the mini-infobar from appearing on mobile
  event.preventDefault();
  
  // Stash the event so it can be triggered later
  deferredPrompt = event;
  
  // Show the install button if app is not already installed
  if (!isAppInstalled) {
    showInstallPrompt();
  }
});

function showInstallPrompt() {
  // Create or show the install button
  if (!installButton) {
    installButton = document.createElement('button');
    installButton.id = 'install-app-btn';
    installButton.className = 'install-btn';
    installButton.innerHTML = '<i class="fas fa-cloud-download-alt"></i> Download App';
    
    // Add to the page (adjust selector based on your layout)
    const targetElement = document.querySelector('.header') || document.querySelector('header') || document.body;
    targetElement.insertBefore(installButton, targetElement.firstChild);
    
    installButton.addEventListener('click', installApp);
  }
  
  installButton.style.display = 'block';
}

async function installApp() {
  if (!deferredPrompt) {
    return;
  }

  // Show the install prompt
  deferredPrompt.prompt();
  
  // Wait for the user to respond to the prompt
  const { outcome } = await deferredPrompt.userChoice;
  
  console.log(`User response to the install prompt: ${outcome}`);
  
  // We've used the prompt, and can't use it again, throw it away
  deferredPrompt = null;
  
  // Hide the install button after install attempt
  if (installButton) {
    installButton.style.display = 'none';
  }
}

// Detect if app was successfully installed
window.addEventListener('appinstalled', () => {
  console.log('BSBA Portal app was installed.');
  isAppInstalled = true;
  
  // Hide the install button
  if (installButton) {
    installButton.style.display = 'none';
  }
});

// Service Worker disabled - offline functionality disabled to prevent caching issues
// if ('serviceWorker' in navigator) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker.register('/sw.js')
//       .then((registration) => {
//         console.log('Service Worker registered successfully:', registration);
//       })
//       .catch((error) => {
//         console.log('Service Worker registration failed:', error);
//       });
//   });
// }
