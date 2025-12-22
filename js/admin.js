// ==========================================
// Admin Authentication System
// ==========================================

const ADMIN_PASSWORD = '123456';
const ADMIN_KEY = 'isAdminAuthenticated';

// Check if admin is authenticated
function isAdmin() {
    return localStorage.getItem(ADMIN_KEY) === 'true';
}

// Prompt for admin password
function promptAdminLogin() {
    const password = prompt('Admin şifresi girin:');
    if (password === null) return false; // Cancelled

    if (password === ADMIN_PASSWORD) {
        localStorage.setItem(ADMIN_KEY, 'true');
        showToast('Admin yetkileri aktif edildi!', 'success');
        updateAdminUI();
        return true;
    } else {
        showToast('Yanlış şifre!', 'error');
        return false;
    }
}

// Logout admin
function logoutAdmin() {
    localStorage.removeItem(ADMIN_KEY);
    showToast('Admin yetkileri kapatıldı.', 'info');
    updateAdminUI();
}

// Toggle admin status
function toggleAdminStatus() {
    if (isAdmin()) {
        logoutAdmin();
    } else {
        promptAdminLogin();
    }
}

// Update UI based on admin status
function updateAdminUI() {
    const adminElements = document.querySelectorAll('.admin-only');
    const adminBtn = document.getElementById('admin-toggle-btn');

    if (isAdmin()) {
        adminElements.forEach(el => el.style.display = '');
        if (adminBtn) {
            adminBtn.innerHTML = '<i data-lucide="shield-off" style="width:16px;"></i> Admin Kapat';
            adminBtn.classList.add('btn-danger');
            adminBtn.classList.remove('btn-outline');
        }
    } else {
        adminElements.forEach(el => el.style.display = 'none');
        if (adminBtn) {
            adminBtn.innerHTML = '<i data-lucide="shield" style="width:16px;"></i> Admin Giriş';
            adminBtn.classList.remove('btn-danger');
            adminBtn.classList.add('btn-outline');
        }
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Initialize admin UI on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(updateAdminUI, 100);
});

// Window exports
window.isAdmin = isAdmin;
window.promptAdminLogin = promptAdminLogin;
window.logoutAdmin = logoutAdmin;
window.toggleAdminStatus = toggleAdminStatus;
window.updateAdminUI = updateAdminUI;

console.log('admin.js loaded successfully');
