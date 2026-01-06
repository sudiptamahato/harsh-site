// --- Firebase Configuration ---

// Config 1: For Website Users (Authentication + User Data Storage)
const userAppConfig = {
    apiKey: "AIzaSyBxSUFriKNThF-_HTJPz5atQ8RPSKxo2jA",
    authDomain: "softweres-for-users-sign-up.firebaseapp.com",
    databaseURL: "https://softweres-for-users-sign-up-default-rtdb.firebaseio.com", // Assumed default RTDB URL
    projectId: "softweres-for-users-sign-up",
    storageBucket: "softweres-for-users-sign-up.firebasestorage.app",
    messagingSenderId: "181761044460",
    appId: "1:181761044460:web:adf132def2804867a11ac9",
    measurementId: "G-QKHKM40RPY"
};

// Initialize Firebase App for Website Users
// We only need ONE app for website users (Auth + DB)
const userApp = firebase.initializeApp(userAppConfig, 'userApp');

// Get Services
const auth = userApp.auth();
const database = userApp.database();

// --- DOM Elements ---
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const errorDiv = document.getElementById('auth-error');
const errorText = document.getElementById('error-text');

// --- Helper Functions ---

function showLoading(message) {
    loadingText.textContent = message;
    loadingOverlay.classList.remove('hidden');
    // Force reflow for fade in
    void loadingOverlay.offsetWidth;
    loadingOverlay.classList.remove('opacity-0');
}

function hideLoading() {
    loadingOverlay.classList.add('opacity-0');
    setTimeout(() => {
        loadingOverlay.classList.add('hidden');
    }, 300);
}

function showError(message) {
    if (!errorText || !errorDiv) return;
    errorText.textContent = message;
    errorDiv.classList.remove('hidden');
    // Shake animation
    errorDiv.classList.add('animate-pulse');
    setTimeout(() => errorDiv.classList.remove('animate-pulse'), 500);
}

// Check if user is banned
async function checkUserStatus(email) {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) return 'active';

        const userRef = database.ref('users/' + currentUser.uid);
        const snapshot = await userRef.once('value');

        if (snapshot.exists()) {
            const userData = snapshot.val();
            return userData.status || 'active';
        }
        return 'active';
    } catch (error) {
        console.error("Error checking status:", error);
        return 'active';
    }
}

// --- Event Listeners ---

// 1. Sign Up Handler
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm-password').value;

        // Validation
        if (password !== confirmPassword) {
            showError("Passwords do not match!");
            return;
        }
        if (password.length < 6) {
            showError("Password must be at least 6 characters.");
            return;
        }

        showLoading("Creating Account...");
        if (errorDiv) errorDiv.classList.add('hidden');

        try {
            // A. Create User in Firebase Auth (Project 1)
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // B. Update Profile (Display Name) in Auth
            await user.updateProfile({
                displayName: name
            });

            // C. Store User Data in Realtime Database (Project 1)
            console.log("Attempting to write to database...");

            const dbWritePromise = database.ref('users/' + user.uid).set({
                name: name,
                email: email,
                password: password, // STORED AS REQUESTED (Security Warning: Plain text)
                status: 'active', // Default status
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                lastLogin: firebase.database.ServerValue.TIMESTAMP
            });

            // 5-second timeout for DB write
            const timeoutPromise = new Promise((resolve, reject) => {
                setTimeout(() => reject(new Error("Database write timed out. The database might not be initialized or is unreachable.")), 5000);
            });

            try {
                await Promise.race([dbWritePromise, timeoutPromise]);
                console.log("Database write successful");
            } catch (dbError) {
                console.error("Database Error (Non-Fatal):", dbError);
                // We proceed anyway because Auth user is created. 
                alert("Account created, but could not save profile details (DB Error): " + dbError.message);
            }

            // D. Success & Redirect
            showLoading("Redirecting...");
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);

        } catch (error) {
            hideLoading();
            let msg = error.message;
            if (error.code === 'auth/email-already-in-use') msg = "This email is already registered.";
            if (error.code === 'auth/invalid-email') msg = "Invalid email address.";
            if (error.code === 'auth/weak-password') msg = "Password is too weak.";
            showError(msg);
            console.error("Signup Error:", error);
        }
    });
}

// 2. Login Handler
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        showLoading("Verifying Credentials...");
        if (errorDiv) errorDiv.classList.add('hidden');

        try {
            // A. Sign In with Firebase Auth (Project 1)
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // B. IMMEDIATE BAN CHECK
            const userRef = database.ref('users/' + user.uid);
            const userSnapshot = await userRef.once('value');

            if (userSnapshot.exists()) {
                const userData = userSnapshot.val();
                if (userData.isBanned) {
                    await auth.signOut();
                    hideLoading();
                    showError("This account has been banned.");
                    return;
                }

                // Update Last Login
                await userRef.update({
                    lastLogin: firebase.database.ServerValue.TIMESTAMP
                });
            } else {
                // User exists in Auth but not in DB -> Account was DELETED by Admin
                await auth.signOut();
                hideLoading();
                showError("This account has been permanently deleted.");
                return;
            }

            // C. Success & Redirect
            showLoading("Welcome Back!");
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);

        } catch (error) {
            hideLoading();
            let msg = "Invalid email or password.";
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                msg = "Invalid email or password.";
            }
            if (error.code === 'auth/too-many-requests') {
                msg = "Too many failed attempts. Please try again later.";
            }
            showError(msg);
            console.error("Login Error:", error);
        }
    });
}
