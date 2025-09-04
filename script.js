// Disable Right Click Inspect and F12 button
document.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('keydown', event => {
    if (event.key === 'F12' || (event.ctrlKey && event.shiftKey && event.key === 'I')) {
        event.preventDefault();
    }
});





// কনফিগারেশন - Google Sheets API এবং Sheet IDs
const CONFIG = {
    API_KEY: 'AIzaSyCiEgyS_hZLOPYfntM2b5imvAx9iIWBSHY',
    SHEET_IDS: [
        '1ia2pkU2Zx0IKF4XI4Os_pVZfdlFqb815IwkDmc9IBpc',
        '1clRNb9t9_w0ZaqOtRq6uGBV2_NVVG1GpwzShYLBaAho',
        '110mm_LHmzRXTJoBiNfG0oym1JzQv6W3BMDdfSs3loTw',
        '1l8bauZWJn3a1vOqI_LG1rFscaRsGVASSjDzpb7AJsiE',
        '1UsbkB0pvCtX378db8N0q-weHncWKvSN5vhj0mUJpFnU',
        '1jA7HEgX6I0Tw-yYmsMyDa6LtjNo2W23nz7a3GJpf7VM',
        '13ZFdfDjOlw4R4_qu0NhIuYwSw1Bp29eq6-dGtlySVhg'
    ],
    SHEET_NAME: 'Sheet1',
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
    PRELOAD_ENABLED: true,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    CAPTCHA_ENABLED: true  // ক্যাপচা চালু/বন্ধ করার জন্য - true মানে চালু, false মানে বন্ধ
};

// DOM Elements - HTML এলিমেন্ট গুলো
const admitNumberInput = document.getElementById('admitNumber');
const loadingSection = document.getElementById('loadingSection');
const resultSection = document.getElementById('resultSection');
const errorSection = document.getElementById('errorSection');
const resultCard = document.getElementById('resultCard');
const systemNote = document.getElementById('systemNote');
const searchSection = document.getElementById('searchSection');
const qrModal = document.getElementById('qrModal');
const loadingText = document.getElementById('loadingText');

// ম্যাথ ক্যাপচার জন্য DOM এলিমেন্ট এবং গ্লোবাল ভেরিয়েবল - নতুন যোগ করা হয়েছে
const captchaQuestion = document.getElementById('captchaQuestion');
const captchaAnswer = document.getElementById('captchaAnswer');
let currentCaptchaAnswer = 0; // ক্যাপচার সঠিক উত্তর সংরক্ষণ করা হয়

// Performance and Cache Management
class PerformanceManager {
    constructor() {
        this.cache = new Map();
        this.cacheTimestamps = new Map();
        this.preloadPromises = new Map();
        this.isPreloading = false;
        this.preloadProgress = 0;
        this.rollNumberIndex = new Map(); // Fast lookup index
    }

    // Initialize cache and start preloading
    async initialize() {
        if (CONFIG.PRELOAD_ENABLED) {
            await this.preloadAllSheets();
        }
    }

    // Preload all sheets in parallel
    async preloadAllSheets() {
        this.isPreloading = true;
        const startTime = performance.now();
        
        try {
            // Create all fetch promises simultaneously
            const fetchPromises = CONFIG.SHEET_IDS.map((sheetId, index) => 
                this.fetchSheetWithRetry(sheetId, index)
            );

            // Wait for all sheets to load in parallel
            const results = await Promise.allSettled(fetchPromises);
            
            // Process results
            let successCount = 0;
            let totalRecords = 0;
            
            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    successCount++;
                    totalRecords += result.value.length;
                    console.log(`Sheet ${index + 1} loaded: ${result.value.length} records`);
                } else {
                    console.warn(`Sheet ${index + 1} failed to load:`, result.reason);
                }
            });

            const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log(`Preload completed: ${successCount}/${CONFIG.SHEET_IDS.length} sheets, ${totalRecords} total records in ${loadTime}s`);
            
        } catch (error) {
            console.error('Preload failed:', error);
        } finally {
            this.isPreloading = false;
        }
    }

    // Fetch sheet data with retry mechanism
    async fetchSheetWithRetry(sheetId, sheetIndex, retryCount = 0) {
        const cacheKey = `sheet_${sheetId}`;
        
        try {
            // Check cache first
            if (this.isCacheValid(cacheKey)) {
                return this.cache.get(cacheKey);
            }

            const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${CONFIG.SHEET_NAME}!A:L?key=${CONFIG.API_KEY}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (!data.values || data.values.length < 2) {
                console.warn(`Sheet ${sheetIndex + 1} has no data`);
                return null;
            }

            // Process and cache the data
            const processedData = this.processSheetData(data.values, sheetIndex + 1);
            this.cacheData(cacheKey, processedData);
            
            return processedData;

        } catch (error) {
            console.error(`Error fetching sheet ${sheetIndex + 1} (attempt ${retryCount + 1}):`, error);
            
            if (retryCount < CONFIG.MAX_RETRIES) {
                await this.delay(CONFIG.RETRY_DELAY * (retryCount + 1));
                return this.fetchSheetWithRetry(sheetId, sheetIndex, retryCount + 1);
            }
            
            throw error;
        }
    }

    // Process sheet data and create index
    processSheetData(values, sheetNumber) {
        const headers = values[0];
        const rows = values.slice(1);
        const processedRows = [];

        rows.forEach(row => {
            if (row[0]) { // Has roll number
                const studentData = {
                    rollNumber: row[0].toString().trim(),
                    studentName: row[1] || 'N/A',
                    fatherName: row[2] || 'N/A',
                    motherName: row[3] || 'N/A',
                    board: row[4] || 'N/A',
                    group: row[5] || 'N/A',
                    result: row[6] || 'N/A',
                    institution: row[7] || 'N/A',
                    session: row[8] || 'N/A',
                    dob: row[9] || 'N/A',
                    gender: row[10] || 'N/A',
                    studentPhoto: this.processPhotoUrl(row[11]),
                    sheetNumber: sheetNumber
                };

                processedRows.push(studentData);
                
                // Create index for fast lookup
                const rollKey = studentData.rollNumber.toLowerCase();
                this.rollNumberIndex.set(rollKey, studentData);
            }
        });

        return processedRows;
    }

    // Process photo URLs for different formats
    processPhotoUrl(photoUrl) {
        if (!photoUrl) return '';

        // Google Drive link processing
        if (photoUrl.includes('drive.google.com')) {
            let fileIdMatch = photoUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (!fileIdMatch) {
                fileIdMatch = photoUrl.match(/id=([a-zA-Z0-9-_]+)/);
            }
            if (fileIdMatch) {
                return `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`;
            }
        }
        // Google Photos link processing
        else if (photoUrl.includes('photos.google.com')) {
            if (!photoUrl.includes('=w')) {
                return photoUrl + '=w500-h600-no';
            }
        }
        // Imgur link processing
        else if (photoUrl.includes('imgur.com') && !photoUrl.includes('.jpg') && !photoUrl.includes('.png')) {
            return photoUrl + '.jpg';
        }

        return photoUrl;
    }

    // Fast search in cached data
    searchInCache(rollNumber) {
        const rollKey = rollNumber.toLowerCase();
        return this.rollNumberIndex.get(rollKey);
    }

    // Cache management methods
    cacheData(key, data) {
        this.cache.set(key, data);
        this.cacheTimestamps.set(key, Date.now());
    }

    isCacheValid(key) {
        if (!this.cache.has(key)) return false;
        
        const timestamp = this.cacheTimestamps.get(key);
        return (Date.now() - timestamp) < CONFIG.CACHE_DURATION;
    }

    clearExpiredCache() {
        const now = Date.now();
        for (const [key, timestamp] of this.cacheTimestamps.entries()) {
            if (now - timestamp > CONFIG.CACHE_DURATION) {
                this.cache.delete(key);
                this.cacheTimestamps.delete(key);
            }
        }
    }

    // Utility methods
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    showPerformanceStatus(message) {
        if (performanceStatus) {
            document.getElementById('statusText').textContent = message;
            performanceStatus.style.display = 'block';
        }
    }

    hidePerformanceStatus() {
        if (performanceStatus) {
            performanceStatus.style.display = 'none';
        }
    }

    updateCacheStatus(message) {
        if (cacheStatus) {
            const cacheText = document.getElementById('cacheText');
            if (cacheText) {
                cacheText.textContent = 'ক্যাশ স্ট্যাটাস: ' + message;
            }
        }
    }
}

// Global variables
let currentResult = null;
let isQRSearch = false;
let performanceManager = new PerformanceManager();

// ম্যাথ ক্যাপচা জেনারেট করার ফাংশন - নতুন যোগ করা হয়েছে
function generateCaptcha() {
    // সিম্পল ম্যাথের জন্য দুটি সংখ্যা জেনারেট করা
    const num1 = Math.floor(Math.random() * 20) + 1; // ১ থেকে ২০
    const num2 = Math.floor(Math.random() * 20) + 1; // ১ থেকে ২০
    const operations = ['+', '-', '×']; // যোগ, বিয়োগ, গুণ
    const operation = operations[Math.floor(Math.random() * operations.length)];
    
    let answer;
    let questionText;
    
    // অপারেশন অনুযায়ী উত্তর ক্যালকুলেট করা
    switch(operation) {
        case '+':
            answer = num1 + num2;
            questionText = `${num1} + ${num2} =`;
            break;
        case '-':
            // নেগেটিভ উত্তর এড়ানোর জন্য বড় সংখ্যা থেকে ছোট সংখ্যা বিয়োগ করা
            const larger = Math.max(num1, num2);
            const smaller = Math.min(num1, num2);
            answer = larger - smaller;
            questionText = `${larger} - ${smaller} =`;
            break;
        case '×':
            // গুণফল বড় না হওয়ার জন্য ছোট সংখ্যা ব্যবহার করা
            const smallNum1 = Math.floor(Math.random() * 10) + 1; // ১ থেকে ১০
            const smallNum2 = Math.floor(Math.random() * 10) + 1; // ১ থেকে ১০
            answer = smallNum1 * smallNum2;
            questionText = `${smallNum1} × ${smallNum2} =`;
            break;
    }
    
    // গ্লোবাল ভেরিয়েবলে সঠিক উত্তর সংরক্ষণ করা
    currentCaptchaAnswer = answer;
    
    // HTML এ প্রশ্ন দেখানো (ফলব্যাক চেক সহ)
    if (captchaQuestion) {
        captchaQuestion.textContent = questionText;
        console.log(`নতুন ক্যাপচা জেনারেট হয়েছে: ${questionText} = ${answer}`);
    } else {
        console.warn('JavaScript ক্যাপচা এলিমেন্ট পাওয়া যায়নি, ফলব্যাক ক্যাপচা ব্যবহার করুন');
        // ফলব্যাক ক্যাপচার জন্য ডিফল্ট ভ্যালু সেট করা
        currentCaptchaAnswer = 8; // ৫ + ৩ = ৮ (HTML ফলব্যাক এর উত্তর)
        return;
    }
    
    // ক্যাপচা ইনপুট ফিল্ড ক্লিয়ার করা
    if (captchaAnswer) {
        captchaAnswer.value = '';
        captchaAnswer.style.borderColor = '#e0e0e0'; // ডিফল্ট বর্ডার কালার
    }
}

// ক্যাপচা ভ্যালিডেশন ফাংশন - নতুন যোগ করা হয়েছে
function validateCaptcha() {
    // ক্যাপচা বন্ধ থাকলে সরাসরি true রিটার্ন করা
    if (!CONFIG.CAPTCHA_ENABLED) {
        return true;
    }
    
    // ফলব্যাক ক্যাপচা চেক (JavaScript বন্ধ থাকলে বা এলিমেন্ট না পেলে)
    const fallbackInput = document.querySelector('input[name="fallback_captcha"]');
    const fallbackAnswer = document.querySelector('input[name="fallback_answer"]');
    
    if (fallbackInput && fallbackAnswer && fallbackInput.offsetParent !== null) {
        // ফলব্যাক ক্যাপচা ব্যবহার হচ্ছে
        const fallbackUserAnswer = parseInt(fallbackInput.value.trim());
        const correctFallbackAnswer = parseInt(fallbackAnswer.value);
        
        if (isNaN(fallbackUserAnswer)) {
            showError('দয়া করে ক্যাপচার উত্তর সংখ্যায় লিখুন।');
            return false;
        }
        
        if (fallbackUserAnswer !== correctFallbackAnswer) {
            showError('ক্যাপচার উত্তর ভুল। দয়া করে আবার চেষ্টা করুন।');
            return false;
        }
        
        return true;
    }
    
    // নরমাল JavaScript ক্যাপচা ভ্যালিডেশন
    const userAnswer = parseInt(captchaAnswer.value.trim());
    
    if (isNaN(userAnswer)) {
        // ইনপুট খালি বা ভুল ফরম্যাট
        captchaAnswer.style.borderColor = '#dc3545'; // লাল বর্ডার
        showError('দয়া করে ক্যাপচার উত্তর সংখ্যায় লিখুন।');
        return false;
    }
    
    if (userAnswer !== currentCaptchaAnswer) {
        // ভুল উত্তর
        captchaAnswer.style.borderColor = '#dc3545'; // লাল বর্ডার
        showError('ক্যাপচার উত্তর ভুল। দয়া করে আবার চেষ্টা করুন।');
        generateCaptcha(); // নতুন ক্যাপচা জেনারেট করা
        return false;
    }
    
    // সঠিক উত্তর
    captchaAnswer.style.borderColor = '#28a745'; // সবুজ বর্ডার
    return true;
}

// ক্যাপচা দৃশ্যমানতা নিয়ন্ত্রণ ফাংশন
function toggleCaptchaVisibility() {
    const captchaGroup = document.querySelector('.captcha-group');
    if (captchaGroup) {
        if (CONFIG.CAPTCHA_ENABLED) {
            captchaGroup.style.display = 'block';
            generateCaptcha(); // ক্যাপচা চালু হলে নতুন ক্যাপচা জেনারেট করা
        } else {
            captchaGroup.style.display = 'none';
        }
    }
}

// Event Listeners - ইভেন্ট লিসেনার সেটআপ
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize performance manager
    await performanceManager.initialize();
    
    // Setup captcha visibility based on config
    toggleCaptchaVisibility();
    
    // প্রাথমিক ক্যাপচা জেনারেট করা - শুধু চালু থাকলে
    if (CONFIG.CAPTCHA_ENABLED) {
        generateCaptcha();
    }
    
    // URL থেকে প্যারামিটার চেক করা
    checkURLParameters();
    
    // Enter key সাপোর্ট search input এর জন্য
    admitNumberInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchResult();
        }
    });
    
    // ক্যাপচা ইনপুটে Enter key সাপোর্ট - নতুন যোগ করা হয়েছে
    if (captchaAnswer) {
        captchaAnswer.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchResult();
            }
        });
        
        // ক্যাপচা ইনপুটে টাইপ করার সময় বর্ডার রিসেট করা
        captchaAnswer.addEventListener('input', function() {
            this.style.borderColor = '#e0e0e0';
        });
    }
    
    // Input validation - শুধুমাত্র alphanumeric অক্ষর গ্রহণ করা
    admitNumberInput.addEventListener('input', function(e) {
        e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '');
    });

    // Periodic cache cleanup
    setInterval(() => {
        performanceManager.clearExpiredCache();
    }, 60000); // Every minute
});

// URL প্যারামিটার চেক করার ফাংশন
function checkURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const rollNumber = urlParams.get('roll');
    
    if (rollNumber) {
        isQRSearch = true;
        admitNumberInput.value = rollNumber;
        
        // Hide search section for QR visitors
        if (searchSection) {
            searchSection.style.display = 'none';
        }
        
        // Auto search with slight delay
        setTimeout(() => {
            searchResult();
        }, 500);
    }
}

// Optimized search function - ক্যাপচা ভ্যালিডেশন যোগ করা হয়েছে
async function searchResult() {
    const admitNumber = admitNumberInput.value.trim();
    
    // Basic validation
    if (!admitNumber) {
        showError('দয়া করে একটি রোল নাম্বার লিখুন।');
        return;
    }
    
    if (admitNumber.length < 3) {
        showError('রোল নাম্বার কমপক্ষে ৩ অক্ষরের হতে হবে।');
        return;
    }
    
    // ক্যাপচা ভ্যালিডেশন - QR সার্চের জন্য স্কিপ করা হয়েছে
    if (!isQRSearch && !validateCaptcha()) {
        return; // ক্যাপচা ভুল হলে সার্চ বন্ধ করা
    }
    
    // Show loading
    showLoading();
    
    try {
        const startTime = performance.now();
        
        // Try cache first
        let result = performanceManager.searchInCache(admitNumber);
        
        if (result) {
            const searchTime = ((performance.now() - startTime)).toFixed(0);
            console.log(`Found in cache in ${searchTime}ms`);
            updateLoadingText(`লোড হচ্ছে...`);
            
            setTimeout(() => {
                showResult(result);
                clearUrlParameters();
            }, 500);
            
            return;
        }
        
        // If not in cache, fetch from API  
        updateLoadingText('লোড হচ্ছে...');
        result = await fetchStudentDataLive(admitNumber);
        
        if (result) {
            const searchTime = ((performance.now() - startTime)).toFixed(0);
            console.log(`Found via API in ${searchTime}ms`);
            showResult(result);
            clearUrlParameters();
        } else {
            showError();
        }
        
    } catch (error) {
        console.error('Error searching result:', error);
        showError('ডেটা লোড করতে সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।');
    }
}

// Live search when cache miss occurs
async function fetchStudentDataLive(admitNumber) {
    const fetchPromises = CONFIG.SHEET_IDS.map((sheetId, index) => 
        performanceManager.fetchSheetWithRetry(sheetId, index)
    );

    try {
        const results = await Promise.allSettled(fetchPromises);
        
        // Search through all loaded sheets
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                const found = result.value.find(student => 
                    student.rollNumber.toLowerCase() === admitNumber.toLowerCase()
                );
                if (found) {
                    return found;
                }
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('Live search failed:', error);
        throw error;
    }
}

// Clear URL parameters after successful search
function clearUrlParameters() {
    if (isQRSearch) {
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        isQRSearch = false;
    }
}

// UI Update Functions
function updateLoadingText(text) {
    if (loadingText) {
        loadingText.textContent = text;
    }
}

function showLoading() {
    hideAllSections();
    loadingSection.style.display = 'block';
    loadingSection.classList.add('fade-in');
    updateLoadingText('লোড হচ্ছে...');
}

function showResult(result) {
    currentResult = result;
    hideAllSections();
    
    // Update document title for print filename
    document.title = `সার্টিফিকেট ভেরিফায়ার-${result.rollNumber}`;
    
    // Student photo HTML with improved loading
    const studentPhotoHTML = result.studentPhoto ? 
        `<div class="student-photo">
            <img src="${result.studentPhoto}" 
                 alt="Student Photo" 
                 id="studentPhotoImg"
                 onerror="handleImageError(this)"
                 onload="handleImageLoad(this)">
            <div class="photo-loading" id="photoLoading">
                <i class="fas fa-spinner fa-spin"></i>
                <span>ছবি লোড হচ্ছে...</span>
            </div>
            <div class="photo-error" id="photoError" style="display: none;">
                <i class="fas fa-user"></i>
                <span>ছবি উপলব্ধ নেই</span>
            </div>
        </div>` : 
        `<div class="student-photo">
            <div class="photo-placeholder">
                <i class="fas fa-user"></i>
                <span>ছবি উপলব্ধ নেই</span>
            </div>
        </div>`;
    
    // রেজাল্ট HTML তৈরি করা - উন্নত টেবিল ফরম্যাট ইমেজ সহ
    const resultHTML = `
        <div class="result-header-info">
            <div class="result-title">
                <h3> SCIENCE & INFORMATION TECHNOLOGY-FOUNDATION</h3>
                <p>WEB BASED RESULT PUBLICATION SYSTEM</p>
                <p>PARAMEDICAL/DMA/LMAF AND EQUIVALENT EXAMINATION</p>
            </div>
        </div>
        <div class="result-content-wrapper">
            ${studentPhotoHTML}
            <div class="result-table">
                <table class="result-data-table">
                    <tr>
                        <td class="label">Roll No</td>
                        <td class="value">${result.rollNumber}</td>
                    </tr>
                    <tr>
                        <td class="label">Name of Student</td>
                        <td class="value">${result.studentName}</td>
                    </tr>
                    <tr>
                        <td class="label">Father's Name</td>
                        <td class="value">${result.fatherName}</td>
                    </tr>
                    <tr>
                        <td class="label">Mother's Name</td>
                        <td class="value">${result.motherName}</td>
                    </tr>
                    <tr>
                        <td class="label">Gender</td>
                        <td class="value">${result.gender}</td>
                    </tr>
                    <tr>
                        <td class="label">Date of Birth</td>
                        <td class="value">${result.dob}</td>
                    </tr>
                    <tr>
                        <td class="label">Board</td>
                        <td class="value">${result.board}</td>
                    </tr>
                    <tr>
                        <td class="label">Course</td>
                        <td class="value">${result.group}</td>
                    </tr>
                    <tr>
                        <td class="label">Session</td>
                        <td class="value">${result.session}</td>
                    </tr>
                    <tr>
                        <td class="label">Institute</td>
                        <td class="value">${result.institution}</td>
                    </tr>
                    <tr>
                        <td class="label result-grade">Result</td>
                        <td class="value result-grade">${result.result}</td>
                    </tr>
                </table>
            </div>
        </div>
    `;
    
    resultCard.innerHTML = resultHTML;
    systemNote.innerHTML = generateSystemNote(result.rollNumber);
    
    resultSection.style.display = 'block';
    resultSection.classList.add('fade-in');
    
    // সফল সার্চের পর নতুন ক্যাপচা জেনারেট করা - নতুন যোগ করা হয়েছে
    if (!isQRSearch) {
        generateCaptcha();
    }
}

function showError(message = 'কোনো ফলাফল পাওয়া যায়নি। দয়া করে আপনার রোল নাম্বার পুনরায় চেক করুন।') {
    hideAllSections();
    document.getElementById('errorMessage').textContent = message;
    errorSection.style.display = 'block';
    errorSection.classList.add('fade-in');
}

function hideAllSections() {
    const sections = [loadingSection, resultSection, errorSection];
    sections.forEach(section => {
        if (section) {
            section.style.display = 'none';
            section.classList.remove('fade-in');
        }
    });
}

// Image handling functions
function handleImageLoad(img) {
    const photoLoading = document.getElementById('photoLoading');
    const photoError = document.getElementById('photoError');
    
    if (photoLoading) photoLoading.style.display = 'none';
    if (photoError) photoError.style.display = 'none';
    img.style.display = 'block';
    
    // Show beautiful success message
    showImageSuccessMessage();
}

function showImageSuccessMessage() {
    // Create success message element
    const successMsg = document.createElement('div');
    successMsg.className = 'image-success-notification'; // Add class for print hiding
    successMsg.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #28a745, #20c997);
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
            z-index: 1000;
            font-family: 'Noto Sans Bengali', sans-serif;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
            animation: slideInRight 0.5s ease-out;
        ">
            <i class="fas fa-check-circle" style="color: #fff;"></i>
            <span>স্টুডেন্টের ছবি সফল ভাবে লোড হয়েছে</span>
        </div>
    `;
    
    // Add animation styles if not already present
    if (!document.getElementById('successAnimationStyles')) {
        const styles = document.createElement('style');
        styles.id = 'successAnimationStyles';
        styles.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes fadeOut {
                from {
                    opacity: 1;
                    transform: translateX(0);
                }
                to {
                    opacity: 0;
                    transform: translateX(100%);
                }
            }
            @media print {
                .image-success-notification {
                    display: none !important;
                }
            }
        `;
        document.head.appendChild(styles);
    }
    
    document.body.appendChild(successMsg);
    
    // Remove after 4 seconds with fade out animation
    setTimeout(() => {
        const msgElement = successMsg.firstElementChild;
        msgElement.style.animation = 'fadeOut 0.5s ease-in forwards';
        setTimeout(() => {
            if (successMsg.parentNode) {
                successMsg.parentNode.removeChild(successMsg);
            }
        }, 500);
    }, 4000);
}

function handleImageError(img) {
    const photoLoading = document.getElementById('photoLoading');
    const photoError = document.getElementById('photoError');
    
    if (photoLoading) photoLoading.style.display = 'none';
    if (photoError) {
        photoError.style.display = 'flex';
        photoError.innerHTML = `
            <i class="fas fa-user"></i>
            <span>ছবি লোড করা যায়নি</span>
            <small>ছবিটি হয়তো সরানো হয়েছে বা লিংক ভুল</small>
        `;
    }
    img.style.display = 'none';
}

// System note generation
function generateSystemNote(rollNumber) {
    return `
        <div class="system-note-footer">
            <p><i class="fas fa-info-circle"></i> এই ফলাফল সিস্টেম দ্বারা তৈরি এবং সত্যায়িত।</p>
        </div>
    `;
}

// QR Code generation and modal functions
function generateQR() {
    if (!currentResult) return;
    
    const currentDomain = window.location.origin;
    const currentPath = window.location.pathname;
    const qrUrl = `${currentDomain}${currentPath}?roll=${encodeURIComponent(currentResult.rollNumber)}`;
    
    // Set URL in input
    document.getElementById('qrUrlInput').value = qrUrl;
    
    // Clear previous QR code
    const qrContainer = document.getElementById('qrCodeImage');
    qrContainer.innerHTML = '';
    
    // Try different QR libraries for fallback
    let qrGenerated = false;
    
    // Try QRCode library first
    if (typeof QRCode !== 'undefined') {
        try {
            const canvas = document.createElement('canvas');
            qrContainer.appendChild(canvas);
            QRCode.toCanvas(canvas, qrUrl, {
                width: 256,
                height: 256,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            qrGenerated = true;
        } catch (error) {
            console.warn('QRCode library failed:', error);
        }
    }
    
    // Try QRious library as fallback
    if (!qrGenerated && typeof QRious !== 'undefined') {
        try {
            const qr = new QRious({
                element: document.createElement('canvas'),
                value: qrUrl,
                size: 256,
                foreground: '#000000',
                background: '#FFFFFF'
            });
            qrContainer.appendChild(qr.canvas);
            qrGenerated = true;
        } catch (error) {
            console.warn('QRious library failed:', error);
        }
    }
    
    // Try kjua library as last fallback
    if (!qrGenerated && typeof kjua !== 'undefined') {
        try {
            const qrCanvas = kjua({
                text: qrUrl,
                size: 256,
                fill: '#000000',
                back: '#FFFFFF',
                rounded: 10,
                quiet: 2
            });
            qrContainer.appendChild(qrCanvas);
            qrGenerated = true;
        } catch (error) {
            console.warn('kjua library failed:', error);
        }
    }
    
    // If all libraries fail, show fallback message
    if (!qrGenerated) {
        qrContainer.innerHTML = `
            <div class="qr-fallback">
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #ffc107; margin-bottom: 15px;"></i>
                <p>QR কোড জেনারেট করতে সমস্যা হয়েছে</p>
                <p>দয়া করে নিচের লিংকটি কপি করে ব্যবহার করুন</p>
            </div>
        `;
    }
    
    // Show modal
    qrModal.style.display = 'flex';
}

function closeQRModal() {
    qrModal.style.display = 'none';
}

function copyQRUrl() {
    const urlInput = document.getElementById('qrUrlInput');
    urlInput.select();
    urlInput.setSelectionRange(0, 99999);
    
    try {
        document.execCommand('copy');
        
        // Show success message
        const copyBtn = document.querySelector('.copy-btn');
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i> কপি হয়েছে!';
        copyBtn.style.background = '#28a745';
        
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
            copyBtn.style.background = '#667eea';
        }, 2000);
        
    } catch (err) {
        console.error('Copy failed:', err);
        alert('কপি করতে সমস্যা হয়েছে। দয়া করে ম্যানুয়ালি কপি করুন।');
    }
}

// Print function with QR code
function printResult() {
    if (!currentResult) return;
    
    // Generate QR code for print
    generateQRForPrint();
    
    // Small delay to ensure QR code is generated before printing
    setTimeout(() => {
        window.print();
    }, 500);
}

// Generate QR code specifically for print
function generateQRForPrint() {
    const currentDomain = window.location.origin;
    const currentPath = window.location.pathname;
    const qrUrl = `${currentDomain}${currentPath}?roll=${encodeURIComponent(currentResult.rollNumber)}`;
    
    // Create or update print QR code container
    let printQRContainer = document.getElementById('printQRCode');
    if (!printQRContainer) {
        printQRContainer = document.createElement('div');
        printQRContainer.id = 'printQRCode';
        printQRContainer.className = 'print-qr-section';
        
        // Insert QR code section at the end of result card
        const resultCard = document.getElementById('resultCard');
        if (resultCard) {
            resultCard.appendChild(printQRContainer);
        }
    }
    
    // Clear previous QR code
    printQRContainer.innerHTML = '';
    
    // Create QR code container HTML
    printQRContainer.innerHTML = `
        <div class="print-qr-content">
            <div class="print-qr-text">
                <h4>QR কোড স্ক্যান করুন</h4>
                <p>এই QR কোডটি স্ক্যান করে সরাসরি অনলাইনে ফলাফল যাচাই করুন</p>
                <div class="qr-url-text">${qrUrl}</div>
            </div>
            <div class="print-qr-image" id="printQRImage">
                <!-- QR code will be inserted here -->
            </div>
        </div>
    `;
    
    // Generate QR code
    const qrImageContainer = document.getElementById('printQRImage');
    
    // Try multiple QR libraries with proper error handling
    generatePrintQRWithFallback(qrImageContainer, qrUrl);
}

// Generate QR for print with fallback options
function generatePrintQRWithFallback(container, qrUrl) {
    // Try QRCode.js library first
    if (typeof QRCode !== 'undefined') {
        try {
            const canvas = document.createElement('canvas');
            QRCode.toCanvas(canvas, qrUrl, {
                width: 120,
                height: 120,
                margin: 1,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            }, function(error) {
                if (error) {
                    console.warn('QRCode.js failed for print:', error);
                    tryQRiousForPrint(container, qrUrl);
                } else {
                    container.appendChild(canvas);
                    console.log('Print QR generated with QRCode.js');
                }
            });
            return;
        } catch (error) {
            console.warn('QRCode.js library error:', error);
        }
    }
    
    // Try QRious as fallback
    tryQRiousForPrint(container, qrUrl);
}

// Try QRious library for print
function tryQRiousForPrint(container, qrUrl) {
    if (typeof QRious !== 'undefined') {
        try {
            const canvas = document.createElement('canvas');
            const qr = new QRious({
                element: canvas,
                value: qrUrl,
                size: 120,
                foreground: '#000000',
                background: '#FFFFFF'
            });
            container.appendChild(canvas);
            console.log('Print QR generated with QRious');
            return;
        } catch (error) {
            console.warn('QRious failed for print:', error);
        }
    }
    
    // Try kjua as last resort
    tryKjuaForPrint(container, qrUrl);
}

// Try kjua library for print
function tryKjuaForPrint(container, qrUrl) {
    if (typeof kjua !== 'undefined') {
        try {
            const qrCanvas = kjua({
                text: qrUrl,
                size: 120,
                fill: '#000000',
                back: '#FFFFFF',
                rounded: 0,
                quiet: 1
            });
            container.appendChild(qrCanvas);
            console.log('Print QR generated with kjua');
            return;
        } catch (error) {
            console.warn('kjua failed for print:', error);
        }
    }
    
    // All libraries failed, show fallback
    generateFallbackPrintQR(container);
}

// Fallback QR generation for print
function generateFallbackPrintQR(container) {
    container.innerHTML = `
        <div class="qr-fallback-print">
            <i class="fas fa-qrcode" style="font-size: 60px; color: #666;"></i>
            <p style="font-size: 10px; margin: 5px 0; color: #666;">QR কোড জেনারেট করা যায়নি</p>
        </div>
    `;
}

// Download QR code function
function downloadQR() {
    if (!currentResult) return;
    
    const currentDomain = window.location.origin;
    const currentPath = window.location.pathname;
    const qrUrl = `${currentDomain}${currentPath}?roll=${encodeURIComponent(currentResult.rollNumber)}`;
    
    // Show loading message
    showQRDownloadProgress();
    
    // Try multiple QR libraries for download
    downloadQRWithFallback(qrUrl, currentResult.rollNumber);
}

// Try different QR libraries for download with fallback
function downloadQRWithFallback(qrUrl, rollNumber) {
    // Try QRCode.js first
    if (typeof QRCode !== 'undefined') {
        try {
            const canvas = document.createElement('canvas');
            QRCode.toCanvas(canvas, qrUrl, {
                width: 512,
                height: 512,
                margin: 4,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            }, function (error) {
                if (error) {
                    console.warn('QRCode.js failed for download:', error);
                    tryQRiousForDownload(qrUrl, rollNumber);
                } else {
                    // Convert canvas to blob and download
                    try {
                        canvas.toBlob(function(blob) {
                            if (blob) {
                                downloadBlob(blob, `QR-${rollNumber}.png`);
                                showQRDownloadSuccess();
                            } else {
                                console.warn('Blob creation failed');
                                tryQRiousForDownload(qrUrl, rollNumber);
                            }
                        }, 'image/png');
                    } catch (blobError) {
                        console.warn('Blob conversion failed:', blobError);
                        tryQRiousForDownload(qrUrl, rollNumber);
                    }
                }
            });
            return;
        } catch (error) {
            console.warn('QRCode.js library error:', error);
        }
    }
    
    // Try QRious as fallback
    tryQRiousForDownload(qrUrl, rollNumber);
}

// Try QRious for download
function tryQRiousForDownload(qrUrl, rollNumber) {
    if (typeof QRious !== 'undefined') {
        try {
            const canvas = document.createElement('canvas');
            const qr = new QRious({
                element: canvas,
                value: qrUrl,
                size: 512,
                foreground: '#000000',
                background: '#FFFFFF'
            });
            
            // Convert to blob and download
            canvas.toBlob(function(blob) {
                if (blob) {
                    downloadBlob(blob, `QR-${rollNumber}.png`);
                    showQRDownloadSuccess();
                } else {
                    tryKjuaForDownload(qrUrl, rollNumber);
                }
            }, 'image/png');
            return;
        } catch (error) {
            console.warn('QRious failed for download:', error);
        }
    }
    
    // Try kjua as last resort
    tryKjuaForDownload(qrUrl, rollNumber);
}

// Try kjua for download
function tryKjuaForDownload(qrUrl, rollNumber) {
    if (typeof kjua !== 'undefined') {
        try {
            const canvas = kjua({
                text: qrUrl,
                size: 512,
                fill: '#000000',
                back: '#FFFFFF',
                rounded: 0,
                quiet: 4
            });
            
            // Convert to blob and download
            canvas.toBlob(function(blob) {
                if (blob) {
                    downloadBlob(blob, `QR-${rollNumber}.png`);
                    showQRDownloadSuccess();
                } else {
                    showQRDownloadError();
                }
            }, 'image/png');
            return;
        } catch (error) {
            console.warn('kjua failed for download:', error);
        }
    }
    
    // All libraries failed
    showQRDownloadError();
}

// Helper function to download blob
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

// Show download progress
function showQRDownloadProgress() {
    const progressMsg = document.createElement('div');
    progressMsg.id = 'qrDownloadProgress';
    progressMsg.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
            z-index: 1001;
            font-family: 'Noto Sans Bengali', sans-serif;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
            animation: slideInRight 0.5s ease-out;
        ">
            <i class="fas fa-spinner fa-spin" style="color: #fff;"></i>
            <span>QR কোড তৈরি হচ্ছে...</span>
        </div>
    `;
    
    // Remove any existing progress message
    const existing = document.getElementById('qrDownloadProgress');
    if (existing) {
        existing.remove();
    }
    
    document.body.appendChild(progressMsg);
    
    // Remove after 5 seconds as fallback
    setTimeout(() => {
        if (progressMsg.parentNode) {
            progressMsg.parentNode.removeChild(progressMsg);
        }
    }, 5000);
}

// Show QR download success message
function showQRDownloadSuccess() {
    // Remove progress message
    const progressMsg = document.getElementById('qrDownloadProgress');
    if (progressMsg) {
        progressMsg.remove();
    }
    
    const successMsg = document.createElement('div');
    successMsg.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #28a745, #20c997);
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
            z-index: 1001;
            font-family: 'Noto Sans Bengali', sans-serif;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
            animation: slideInRight 0.5s ease-out;
        ">
            <i class="fas fa-check-circle" style="color: #fff;"></i>
            <span>QR কোড সফলভাবে ডাউনলোড হয়েছে!</span>
        </div>
    `;
    
    document.body.appendChild(successMsg);
    
    // Remove after 4 seconds
    setTimeout(() => {
        if (successMsg.parentNode) {
            successMsg.parentNode.removeChild(successMsg);
        }
    }, 4000);
}

// Show QR download error message
function showQRDownloadError() {
    // Remove progress message
    const progressMsg = document.getElementById('qrDownloadProgress');
    if (progressMsg) {
        progressMsg.remove();
    }
    
    const errorMsg = document.createElement('div');
    errorMsg.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #dc3545, #c82333);
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
            z-index: 1001;
            font-family: 'Noto Sans Bengali', sans-serif;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
            animation: slideInRight 0.5s ease-out;
        ">
            <i class="fas fa-exclamation-triangle" style="color: #fff;"></i>
            <span>QR কোড ডাউনলোড করতে সমস্যা হয়েছে!</span>
        </div>
    `;
    
    document.body.appendChild(errorMsg);
    
    // Remove after 4 seconds
    setTimeout(() => {
        if (errorMsg.parentNode) {
            errorMsg.parentNode.removeChild(errorMsg);
        }
    }, 4000);
}

// Reset search function - ক্যাপচা রিসেট যোগ করা হয়েছে
function resetSearch() {
    // Clear inputs
    admitNumberInput.value = '';
    if (captchaAnswer) {
        captchaAnswer.value = '';
        captchaAnswer.style.borderColor = '#e0e0e0';
    }
    
    // Hide all sections and show search
    hideAllSections();
    searchSection.style.display = 'block';
    
    // Reset global variables
    currentResult = null;
    isQRSearch = false;
    
    // Reset document title to original
    document.title = 'সার্টিফিকেট ভেরিফায়ার';
    
    // Remove print QR code if exists
    const printQR = document.getElementById('printQRCode');
    if (printQR) {
        printQR.remove();
    }
    
    // নতুন ক্যাপচা জেনারেট করা - শুধু চালু থাকলে
    if (CONFIG.CAPTCHA_ENABLED) {
        generateCaptcha();
    }
    
    // Focus on roll number input
    admitNumberInput.focus();
}

// Modal click outside to close
qrModal.addEventListener('click', function(e) {
    if (e.target === qrModal) {
        closeQRModal();
    }
});

// ESC key to close modal
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && qrModal.style.display === 'flex') {
        closeQRModal();
    }
});
