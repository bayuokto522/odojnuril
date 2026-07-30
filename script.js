// ========================================================
// PENTING: Ganti URL di bawah dengan Web App URL Anda 
// yang dihasilkan saat deploy Google Apps Script!
// ========================================================
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbznak6YpWdyOrsw30cOuhSYNFZN6AnE7tWVhv_fWkNsWNddNFm5qMHsaTYqbTZZ0z0O/exec'; 

let currentUser = null;
let chartInstance = null;
let globalTeachers = [];

async function fetchGAS(action, payload = {}) {
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            // Gunakan text/plain untuk bypass preflight CORS di Github Pages
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: action, payload: payload })
        });
        
        const data = await response.json();
        if(!data.success && data.message) {
            throw new Error(data.message);
        }
        return data;
    } catch (error) {
        throw error;
    }
}

const showLoading = () => document.getElementById('loading-overlay').style.display = 'flex';
const hideLoading = () => document.getElementById('loading-overlay').style.display = 'none';

const showAlert = (title, text, icon) => {
    Swal.fire({
        title: title,
        text: text,
        icon: icon,
        confirmButtonColor: '#064e3b',
        borderRadius: '1rem'
    });
};

const getTodayString = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const formatDisplayDate = (date) => {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
};

window.onload = () => {
    // Event listeners
    document.getElementById('form-login').addEventListener('submit', handleLogin);
    document.getElementById('form-submit-laporan').addEventListener('submit', submitLaporan);
    document.getElementById('form-guru').addEventListener('submit', saveGuru);

    // Populate Juz Select
    const juzSelect = document.getElementById('lap-juz');
    for(let i=1; i<=30; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.text = `Juz ${i}`;
        juzSelect.appendChild(opt);
    }
    
    document.getElementById('lap-tanggal').value = getTodayString();
    document.getElementById('form-date-display').innerText = formatDisplayDate(new Date());
    document.getElementById('rekap-date').value = getTodayString();

    // Cek Session Storage
    const session = localStorage.getItem('tilawahSession');
    if(session) {
        currentUser = JSON.parse(session);
        initApp();
    }
};

async function handleLogin(e) {
    e.preventDefault();
    const user = document.getElementById('login-username').value;
    const pass = document.getElementById('login-password').value;
    
    showLoading();
    try {
        const res = await fetchGAS('login', { username: user, password: pass });
        hideLoading();
        if(res.success) {
            currentUser = res;
            localStorage.setItem('tilawahSession', JSON.stringify(res));
            initApp();
        }
    } catch (err) {
        hideLoading();
        showAlert('Gagal Login', err.message, 'error');
    }
}

function logout() {
    localStorage.removeItem('tilawahSession');
    currentUser = null;
    document.getElementById('view-app').classList.add('hide');
    document.getElementById('view-login').classList.remove('hide');
    document.getElementById('form-login').reset();
}

function initApp() {
    document.getElementById('view-login').classList.add('hide');
    document.getElementById('view-app').classList.remove('hide');
    
    document.getElementById('user-name-display').innerText = currentUser.nama;
    document.getElementById('user-role-display').innerText = currentUser.role;
    document.getElementById('user-initial').innerText = currentUser.nama.charAt(0).toUpperCase();
    document.getElementById('lap-nama').value = currentUser.nama;

    const adminEls = document.querySelectorAll('.admin-only');
    if(currentUser.role !== 'Admin') {
        adminEls.forEach(el => el.style.display = 'none');
        navigate('laporan'); 
    } else {
        adminEls.forEach(el => el.style.display = 'flex');
        navigate('dashboard'); 
    }
}

function navigate(viewId) {
    document.querySelectorAll('.content-section').forEach(el => el.classList.add('hide'));
    document.querySelectorAll('[id^="nav-"]').forEach(el => el.classList.remove('nav-active'));
    
    document.getElementById(`content-${viewId}`).classList.remove('hide');
    document.getElementById(`nav-${viewId}`).classList.add('nav-active');
    
    document.getElementById('mobile-menu').classList.remove('flex');
    document.getElementById('mobile-menu').classList.add('hidden');

    if(viewId === 'dashboard') loadDashboard();
    if(viewId === 'guru') loadTeachers();
    if(viewId === 'laporan') loadMyReports();
    if(viewId === 'rekap') generateWA();
}

function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    if(menu.classList.contains('hidden')) {
        menu.classList.remove('hidden');
        menu.classList.add('flex');
    } else {
        menu.classList.add('hidden');
        menu.classList.remove('flex');
    }
}

async function loadDashboard() {
    if(currentUser.role !== 'Admin') return;
    
    showLoading();
    try {
        const response = await fetchGAS('getDashboardStats');
        const data = response.data;
        hideLoading();
        
        document.getElementById('stat-total').innerText = data.totalGuru;
        document.getElementById('stat-sudah').innerText = data.sudahLapor;
        document.getElementById('stat-belum').innerText = data.belumLapor;
        document.getElementById('stat-progress').innerText = `${data.progress}%`;
        document.getElementById('stat-bar').style.width = `${data.progress}%`;
        
        document.getElementById('det-khalas').innerText = data.khalas;
        document.getElementById('det-murojaah').innerText = data.murojaah;
        document.getElementById('det-hafalan').innerText = data.hafalan;
        document.getElementById('det-tidak').innerText = data.tidakTilawah;

        renderChart(data.chartLabels, data.chartValues);
    } catch (err) {
        hideLoading();
        showAlert('Error', err.message, 'error');
    }
}

function renderChart(labels, data) {
    const ctx = document.getElementById('tilawahChart').getContext('2d');
    if(chartInstance) chartInstance.destroy();
    
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Jumlah Laporan Harian',
                data: data,
                borderColor: '#064e3b',
                backgroundColor: 'rgba(6, 78, 59, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } },
                x: { display: false }
            }
        }
    });
}

function toggleJuzInput() {
    const status = document.getElementById('lap-status').value;
    const container = document.getElementById('juz-container');
    const input = document.getElementById('lap-juz');
    
    if(status.includes("Khalas Juz")) {
        container.classList.remove('hide');
        input.setAttribute('required', 'true');
    } else {
        container.classList.add('hide');
        input.removeAttribute('required');
        input.value = "";
    }
}

async function submitLaporan(e) {
    e.preventDefault();
    const data = {
        tanggal: document.getElementById('lap-tanggal').value,
        nama: currentUser.nama,
        status: document.getElementById('lap-status').value,
        juz: document.getElementById('lap-juz').value,
        catatan: document.getElementById('lap-catatan').value
    };

    showLoading();
    try {
        const res = await fetchGAS('submitReport', data);
        hideLoading();
        Swal.fire({
            title: 'Alhamdulillah',
            text: res.message,
            icon: 'success',
            confirmButtonColor: '#064e3b'
        });
        document.getElementById('lap-catatan').value = ''; 
        loadMyReports();
    } catch (err) {
        hideLoading();
        showAlert('Error', err.message, 'error');
    }
}

async function loadMyReports() {
    try {
        const response = await fetchGAS('getReportsForUser', { nama: currentUser.nama });
        const data = response.data;
        const tbody = document.getElementById('riwayat-body');
        tbody.innerHTML = '';
        
        if(data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-500">Belum ada riwayat laporan</td></tr>';
            return;
        }
        
        data.forEach(rep => {
            let icon = "";
            if(rep.status.includes("Khalas")) icon = "✅";
            else if(rep.status.includes("Tilawah")) icon = "📖";
            else if(rep.status.includes("Muroja'ah")) icon = "Ⓜ️";
            else if(rep.status.includes("Hafalan")) icon = "💬";
            else if(rep.status.includes("Halangan")) icon = "🩸";
            else icon = "❌";

            let detail = rep.status.includes("Khalas") ? `Juz ${rep.juz}` : rep.status;
            
            let tr = `<tr class="border-b hover:bg-gray-50">
                <td class="p-3 whitespace-nowrap">${rep.tanggal}</td>
                <td class="p-3"><span class="bg-gray-100 px-2 py-1 rounded-md text-xs font-medium border">${icon} ${detail}</span></td>
                <td class="p-3 text-gray-500 truncate max-w-[150px]" title="${rep.catatan}">${rep.catatan || '-'}</td>
            </tr>`;
            tbody.innerHTML += tr;
        });
    } catch(e) {
        console.error("Gagal load riwayat: " + e.message);
    }
}

async function generateWA() {
    if(currentUser.role !== 'Admin') return;
    const dateStr = document.getElementById('rekap-date').value;
    if(!dateStr) return;

    showLoading();
    try {
        const response = await fetchGAS('getWARecap', { dateString: dateStr });
        hideLoading();
        document.getElementById('rekap-result').value = response.data;
    } catch (err) {
        hideLoading();
        showAlert('Error', err.message, 'error');
    }
}

function copyWA() {
    const textarea = document.getElementById('rekap-result');
    textarea.select();
    document.execCommand('copy');
    
    Swal.fire({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        icon: 'success',
        title: 'Teks disalin ke clipboard'
    });
}

function shareWA() {
    const text = encodeURIComponent(document.getElementById('rekap-result').value);
    window.open(`https://wa.me/?text=${text}`, '_blank');
}

async function loadTeachers() {
    if(currentUser.role !== 'Admin') return;
    showLoading();
    try {
        const response = await fetchGAS('getTeachers');
        hideLoading();
        globalTeachers = response.data;
        renderTeachersTable();
    } catch (err) {
        hideLoading();
        showAlert('Error', err.message, 'error');
    }
}

function renderTeachersTable() {
    const tbody = document.getElementById('table-guru-body');
    tbody.innerHTML = '';
    
    globalTeachers.forEach((t, index) => {
        let badge = t.status === 'Aktif' 
            ? '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Aktif</span>'
            : '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Non-Aktif</span>';
        
        let jkIcon = t.jk === 'Laki-laki' ? '👨‍🏫' : '👩‍🏫';

        let tr = `<tr>
            <td class="p-4">
                <div class="flex items-center">
                    <div class="flex-shrink-0 h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-lg">${jkIcon}</div>
                    <div class="ml-4">
                        <div class="text-sm font-medium text-gray-900">${t.nama}</div>
                    </div>
                </div>
            </td>
            <td class="p-4 text-sm text-gray-500">${t.username}</td>
            <td class="p-4 text-sm text-gray-500">${t.jabatan}</td>
            <td class="p-4 whitespace-nowrap">${badge}</td>
            <td class="p-4 whitespace-nowrap text-right text-sm font-medium">
                <button onclick="editGuru(${index})" class="text-indigo-600 hover:text-indigo-900 mr-3"><i class="ph ph-pencil-simple text-lg"></i></button>
                <button onclick="deleteGuru(${t.row})" class="text-red-600 hover:text-red-900"><i class="ph ph-trash text-lg"></i></button>
            </td>
        </tr>`;
        tbody.innerHTML += tr;
    });
}

function openModalGuru() {
    document.getElementById('form-guru').reset();
    document.getElementById('guru-action').value = 'add';
    document.getElementById('modal-title').innerText = 'Tambah Guru Baru';
    document.getElementById('guru-password').setAttribute('required', 'true');
    
    const modal = document.getElementById('modal-guru');
    const content = document.getElementById('modal-guru-content');
    modal.classList.remove('hide');
    
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    }, 10);
}

function closeModalGuru() {
    const modal = document.getElementById('modal-guru');
    const content = document.getElementById('modal-guru-content');
    
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    
    setTimeout(() => {
        modal.classList.add('hide');
    }, 300);
}

function editGuru(index) {
    const t = globalTeachers[index];
    document.getElementById('guru-action').value = 'edit';
    document.getElementById('guru-row').value = t.row;
    document.getElementById('guru-nama').value = t.nama;
    document.getElementById('guru-username').value = t.username;
    document.getElementById('guru-password').removeAttribute('required');
    document.getElementById('guru-jk').value = t.jk;
    document.getElementById('guru-status').value = t.status;
    document.getElementById('guru-jabatan').value = t.jabatan;
    
    document.getElementById('modal-title').innerText = 'Edit Data Guru';
    
    const modal = document.getElementById('modal-guru');
    const content = document.getElementById('modal-guru-content');
    modal.classList.remove('hide');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    }, 10);
}

async function saveGuru(e) {
    e.preventDefault();
    const data = {
        action: document.getElementById('guru-action').value,
        row: document.getElementById('guru-row').value,
        nama: document.getElementById('guru-nama').value,
        username: document.getElementById('guru-username').value,
        password: document.getElementById('guru-password').value,
        jk: document.getElementById('guru-jk').value,
        status: document.getElementById('guru-status').value,
        jabatan: document.getElementById('guru-jabatan').value
    };

    showLoading();
    try {
        await fetchGAS('saveTeacher', data);
        hideLoading();
        closeModalGuru();
        showAlert('Berhasil', 'Data guru berhasil disimpan!', 'success');
        loadTeachers();
    } catch (err) {
        hideLoading();
        showAlert('Error', err.message, 'error');
    }
}

function deleteGuru(row) {
    Swal.fire({
        title: 'Yakin Hapus?',
        text: "Data guru akan dihapus permanen!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Ya, Hapus!'
    }).then(async (result) => {
        if (result.isConfirmed) {
            showLoading();
            try {
                await fetchGAS('deleteTeacher', { row: row });
                hideLoading();
                Swal.fire('Terhapus!', 'Data berhasil dihapus.', 'success');
                loadTeachers();
            } catch(err) {
                hideLoading();
                showAlert('Error', err.message, 'error');
            }
        }
    });
}