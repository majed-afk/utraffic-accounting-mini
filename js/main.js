const CURRENT_DOCS_KEY = "utraffic-accounting-current-docs-v3";
const LEGACY_CURRENT_DOC_KEY_V2 = "utraffic-accounting-state-v2";
const LEGACY_CURRENT_DOC_KEY_V1 = "utraffic-accounting-state-v1";
const DRAFTS_KEY = "utraffic-accounting-drafts-v2";
const LEGACY_DRAFTS_KEY_V1 = "utraffic-accounting-saved-v1";
const COUNTER_KEY = "utraffic-accounting-counters-v2";
const LEGACY_COUNTER_KEY_V1 = "utraffic-accounting-counters-v1";
const CUSTOMERS_KEY = "utraffic-accounting-customers-v2";
const EXPENSES_KEY = "utraffic-accounting-expenses-v2";
const LEDGER_KEY = "utraffic-accounting-ledger-v2";
const CONTRACTS_KEY = "utraffic-accounting-contracts-v1";
const UI_KEY = "utraffic-accounting-ui-v3";
const BACKUP_VERSION = 1;
const AUTOSAVE_DELAY_MS = 500;
const USERS = [
    { id: "user-1", name: "ماجد" },
    { id: "user-2", name: "عمرو" },
    { id: "user-3", name: "صالح" }
];
const ACTIVITY_LOG_KEY = "utraffic-accounting-activity-log-v1";
const ACTIVITY_LOG_MAX = 500;
const ACTIVE_USER_KEY = "utraffic-accounting-active-user";
const PASSWORDS_KEY = "utraffic-accounting-passwords-v1";
const DEFAULT_PASSWORD = "1234";
const STORAGE_SYNC_KEYS = new Set([
    CURRENT_DOCS_KEY,
    DRAFTS_KEY,
    COUNTER_KEY,
    CUSTOMERS_KEY,
    EXPENSES_KEY,
    LEDGER_KEY,
    CONTRACTS_KEY,
    UI_KEY,
    ACTIVITY_LOG_KEY,
    PASSWORDS_KEY
]);
const SAFE_STATUS_TONES = new Set(["draft", "sent", "confirmed", "settled"]);

const DEFAULT_COMPANY = {
    name: "UTraffic",
    phone: "",
    email: "finance@utraffic.sa"
};

const documentLabels = {
    invoice: "فاتورة",
    quote: "عرض سعر"
};

const expenseCategoryLabels = {
    operations: "تشغيل",
    ads: "إعلانات",
    tools: "اشتراكات وأدوات",
    salary: "رواتب وتعاون",
    travel: "تنقلات",
    other: "أخرى"
};

const docFieldIds = [
    "documentType",
    "documentNumber",
    "issueDate",
    "dueDate",
    "currency",
    "companyName",
    "companyPhone",
    "companyEmail",
    "clientName",
    "clientTitle",
    "clientPhone",
    "clientEmail",
    "clientAddress",
    "clientVatNumber",
    "introNote",
    "notes",
    "terms",
    "discount",
    "taxRate",
    "documentStatus"
];

const numericDocFields = new Set(["discount", "taxRate"]);
const page = document.body.dataset.page || "dashboard";
const docType = document.body.dataset.docType || "";
const toastEl = byId("toast");

let toastTimer = null;
let lastStorageErrorAt = 0;
let activePageController = null;
let uiState = {};
let customers = [];
let expenses = [];
let ledger = [];
let drafts = [];
let contracts = [];
let currentDocs = {};

initDefaultPasswords();

if (getActiveUser()) {
    bootApp();
} else {
    showUserSelectionScreen();
}

function bootApp() {
    uiState = loadUiState();
    customers = normalizeCustomers(readJSON(CUSTOMERS_KEY, []));
    expenses = normalizeExpenses(readJSON(EXPENSES_KEY, []));
    ledger = normalizeLedger(readJSON(LEDGER_KEY, []));
    drafts = normalizeDrafts(readJSON(DRAFTS_KEY, readJSON(LEGACY_DRAFTS_KEY_V1, [])));
    contracts = normalizeContracts(readJSON(CONTRACTS_KEY, []));
    currentDocs = loadCurrentDocs();

    saveCurrentDocs();
    initGlobalSidebarTools();
    initStorageSync();
    activePageController = initPage();
    renderActiveUserInTopbar();
    hideUserSelectionScreen();
}

function getActiveUser() {
    try {
        const raw = sessionStorage.getItem(ACTIVE_USER_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return USERS.find(u => u.id === parsed.id) || null;
    } catch {
        return null;
    }
}

function setActiveUser(userId) {
    const user = USERS.find(u => u.id === userId);
    if (!user) return false;
    sessionStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(user));
    return true;
}

function clearActiveUser() {
    sessionStorage.removeItem(ACTIVE_USER_KEY);
}

function getUserPasswords() {
    return readJSON(PASSWORDS_KEY, {});
}

function setUserPassword(userId, newPassword) {
    const passwords = getUserPasswords();
    passwords[userId] = newPassword;
    return writeJSON(PASSWORDS_KEY, passwords, { silent: true });
}

function initDefaultPasswords() {
    const passwords = getUserPasswords();
    let changed = false;
    for (const user of USERS) {
        if (!passwords[user.id]) {
            passwords[user.id] = DEFAULT_PASSWORD;
            changed = true;
        }
    }
    if (changed) {
        writeJSON(PASSWORDS_KEY, passwords, { silent: true });
    }
}

function verifyPassword(userId, password) {
    const passwords = getUserPasswords();
    return passwords[userId] === password;
}

function showUserSelectionScreen() {
    const existing = byId("userSelectionOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "userSelectionOverlay";
    overlay.className = "user-selection-overlay";

    function renderUserList() {
        const card = overlay.querySelector(".user-selection-card");
        card.innerHTML = `
            <div class="brand-logo-frame">
                <img src="assets/utraffic-logo.png" alt="شعار UTraffic">
            </div>
            <h2>UTraffic Mini Accounting</h2>
            <p>اختر المستخدم للمتابعة</p>
            <div class="user-selection-list">
                ${USERS.map(user => `
                    <button type="button" class="user-select-btn"
                            data-user-id="${escapeAttribute(user.id)}">
                        <span class="user-select-avatar">${escapeHtml(user.name.charAt(0))}</span>
                        <span>${escapeHtml(user.name)}</span>
                    </button>
                `).join("")}
            </div>
        `;
    }

    function renderPasswordForm(userId) {
        const user = USERS.find(u => u.id === userId);
        if (!user) return;
        const card = overlay.querySelector(".user-selection-card");
        card.innerHTML = `
            <div class="brand-logo-frame">
                <img src="assets/utraffic-logo.png" alt="شعار UTraffic">
            </div>
            <div class="user-select-avatar" style="width:56px;height:56px;font-size:1.4rem;margin:0 auto 12px;">
                ${escapeHtml(user.name.charAt(0))}
            </div>
            <h2>${escapeHtml(user.name)}</h2>
            <p>أدخل الرقم السري</p>
            <form class="user-login-form" data-user-id="${escapeAttribute(userId)}">
                <input type="password" class="user-login-input" placeholder="الرقم السري"
                       autocomplete="off" inputmode="numeric" maxlength="20" autofocus>
                <p class="user-login-error" style="display:none;">الرقم السري غير صحيح</p>
                <div class="user-login-actions">
                    <button type="submit" class="btn btn-primary">دخول</button>
                    <button type="button" class="btn btn-secondary user-login-back">رجوع</button>
                </div>
            </form>
        `;
        const input = card.querySelector(".user-login-input");
        if (input) input.focus();
    }

    overlay.innerHTML = `<div class="user-selection-card"></div>`;
    document.body.appendChild(overlay);
    renderUserList();

    overlay.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-user-id]:not(form)");
        if (btn && !btn.closest("form")) {
            renderPasswordForm(btn.dataset.userId);
            return;
        }

        const backBtn = event.target.closest(".user-login-back");
        if (backBtn) {
            renderUserList();
            return;
        }
    });

    overlay.addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.target.closest(".user-login-form");
        if (!form) return;

        const userId = form.dataset.userId;
        const input = form.querySelector(".user-login-input");
        const errorEl = form.querySelector(".user-login-error");
        const password = input ? input.value : "";

        if (verifyPassword(userId, password)) {
            errorEl.style.display = "none";
            if (setActiveUser(userId)) {
                bootApp();
            }
        } else {
            errorEl.style.display = "";
            input.value = "";
            input.focus();
        }
    });
}

function hideUserSelectionScreen() {
    const overlay = byId("userSelectionOverlay");
    if (overlay) overlay.remove();
}

function renderActiveUserInTopbar() {
    const user = getActiveUser();
    if (!user) return;

    const topbar = document.querySelector(".site-topbar");
    if (!topbar) return;

    const existing = topbar.querySelector(".active-user-badge");
    if (existing) existing.remove();

    const badge = document.createElement("div");
    badge.className = "active-user-badge";
    badge.innerHTML = `
        <div class="active-user-info">
            <span class="active-user-avatar">${escapeHtml(user.name.charAt(0))}</span>
            <span class="active-user-name">${escapeHtml(user.name)}</span>
        </div>
        <div class="active-user-actions">
            <button type="button" class="btn btn-secondary btn-small" data-action="change-password">تغيير الرقم السري</button>
            <button type="button" class="btn btn-secondary btn-small" data-action="logout">خروج</button>
        </div>
    `;

    const nav = topbar.querySelector(".page-nav");
    if (nav) {
        nav.before(badge);
    } else {
        topbar.appendChild(badge);
    }

    badge.querySelector("[data-action='logout']").addEventListener("click", () => {
        clearActiveUser();
        window.location.reload();
    });

    badge.querySelector("[data-action='change-password']").addEventListener("click", () => {
        showChangePasswordModal();
    });
}

function showChangePasswordModal() {
    const user = getActiveUser();
    if (!user) return;

    const existing = byId("changePasswordModal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "changePasswordModal";
    overlay.className = "change-password-overlay";
    overlay.innerHTML = `
        <div class="change-password-card">
            <div class="activity-log-header">
                <h2>تغيير الرقم السري</h2>
                <button type="button" class="activity-log-close" data-action="close-cp">✕</button>
            </div>
            <form class="change-password-form">
                <div class="change-password-field">
                    <label>الرقم السري الحالي</label>
                    <input type="password" id="cpCurrent" autocomplete="off" inputmode="numeric" maxlength="20">
                </div>
                <div class="change-password-field">
                    <label>الرقم السري الجديد</label>
                    <input type="password" id="cpNew" autocomplete="off" inputmode="numeric" maxlength="20">
                </div>
                <div class="change-password-field">
                    <label>تأكيد الرقم السري الجديد</label>
                    <input type="password" id="cpConfirm" autocomplete="off" inputmode="numeric" maxlength="20">
                </div>
                <p class="change-password-error" style="display:none;"></p>
                <div class="change-password-actions">
                    <button type="submit" class="btn btn-primary">حفظ</button>
                    <button type="button" class="btn btn-secondary" data-action="close-cp">إلغاء</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(overlay);

    const currentInput = byId("cpCurrent");
    if (currentInput) currentInput.focus();

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay || event.target.closest("[data-action='close-cp']")) {
            overlay.remove();
        }
    });

    overlay.addEventListener("submit", (event) => {
        event.preventDefault();
        const errorEl = overlay.querySelector(".change-password-error");
        const currentVal = byId("cpCurrent").value;
        const newVal = byId("cpNew").value;
        const confirmVal = byId("cpConfirm").value;

        if (!verifyPassword(user.id, currentVal)) {
            errorEl.textContent = "الرقم السري الحالي غير صحيح";
            errorEl.style.display = "";
            return;
        }

        if (newVal.length < 4) {
            errorEl.textContent = "الرقم السري الجديد يجب أن يكون 4 أحرف على الأقل";
            errorEl.style.display = "";
            return;
        }

        if (newVal !== confirmVal) {
            errorEl.textContent = "الرقم السري الجديد غير متطابق مع التأكيد";
            errorEl.style.display = "";
            return;
        }

        setUserPassword(user.id, newVal);
        logActivity("update", "password", user.id, user.name, "تغيير الرقم السري");
        overlay.remove();
        showToast("تم تغيير الرقم السري بنجاح");
    });
}

function byId(id) {
    return document.getElementById(id);
}

function readJSON(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch (error) {
        console.warn(`Unable to read ${key}`, error);
        return fallback;
    }
}

function writeJSON(key, value, options = {}) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error(`Unable to write ${key}`, error);
        if (!options.silent) {
            notifyStorageWriteFailure(error);
        }
        return false;
    }
}

function createId(prefix = "id") {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return `${prefix}-${window.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function getToday() {
    return new Date().toISOString().slice(0, 10);
}

function getRelativeDate(daysAhead) {
    const date = new Date();
    date.setDate(date.getDate() + daysAhead);
    return date.toISOString().slice(0, 10);
}

function toNumber(value, fallback = 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value = "") {
    return String(value).trim().toLowerCase();
}

function escapeHtml(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttribute(value = "") {
    return escapeHtml(value);
}

function formatDate(dateString) {
    if (!dateString) {
        return "-";
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return new Intl.DateTimeFormat("ar-SA", {
        year: "numeric",
        month: "short",
        day: "numeric"
    }).format(date);
}

function formatDateTime(dateString) {
    if (!dateString) {
        return "الآن";
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return "الآن";
    }

    return new Intl.DateTimeFormat("ar-SA", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function formatTime(date = new Date()) {
    return new Intl.DateTimeFormat("ar-SA", {
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function formatNumber(value) {
    return new Intl.NumberFormat("ar-SA").format(value || 0);
}

function formatMoney(value, currency = "SAR") {
    return new Intl.NumberFormat("ar-SA", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value || 0);
}

function formatMultiline(parts) {
    const filtered = parts
        .filter(Boolean)
        .map((part) => escapeHtml(part).replace(/\n/g, "<br>"));
    return filtered.length ? filtered.join("<br>") : "-";
}

function markUpdated() {
    uiState.lastUpdatedAt = new Date().toISOString();
    writeJSON(UI_KEY, uiState, { silent: true });
}

function loadUiState() {
    const raw = readJSON(UI_KEY, {});
    return {
        lastUpdatedAt: raw.lastUpdatedAt || "",
        statementClientFilter: raw.statementClientFilter || "",
        statementDocTypeFilter: raw.statementDocTypeFilter || "",
        statementStatusFilter: raw.statementStatusFilter || "",
        reportMonth: raw.reportMonth || "",
        reportYear: raw.reportYear || "",
        companyName: raw.companyName || DEFAULT_COMPANY.name,
        companyPhone: raw.companyPhone || DEFAULT_COMPANY.phone,
        companyEmail: raw.companyEmail || DEFAULT_COMPANY.email
    };
}

function getCompanyDefaults() {
    return {
        name: uiState.companyName || DEFAULT_COMPANY.name,
        phone: uiState.companyPhone || DEFAULT_COMPANY.phone,
        email: uiState.companyEmail || DEFAULT_COMPANY.email
    };
}

function updateCompanyDefaults(name, phone, email) {
    const trimName = (name || "").trim();
    const trimPhone = (phone || "").trim();
    const trimEmail = (email || "").trim();
    let changed = false;
    if (trimName && trimName !== uiState.companyName) { uiState.companyName = trimName; changed = true; }
    if (trimPhone && trimPhone !== uiState.companyPhone) { uiState.companyPhone = trimPhone; changed = true; }
    if (trimEmail && trimEmail !== uiState.companyEmail) { uiState.companyEmail = trimEmail; changed = true; }
    if (changed) saveUiState();
}

function getCounters() {
    return readJSON(COUNTER_KEY, readJSON(LEGACY_COUNTER_KEY_V1, { invoice: 0, quote: 0 }));
}

function normalizeCounters(counters = {}) {
    return {
        invoice: Math.max(0, Math.floor(toNumber(counters.invoice, 0))),
        quote: Math.max(0, Math.floor(toNumber(counters.quote, 0))),
        contract: Math.max(0, Math.floor(toNumber(counters.contract, 0)))
    };
}

function saveCounters(counters) {
    const saved = writeJSON(COUNTER_KEY, normalizeCounters(counters));
    if (saved) {
        markUpdated();
    }
    return saved;
}

function getTypePrefix(type) {
    if (type === "invoice") return "INV";
    if (type === "quote") return "QT";
    if (type === "contract") return "CON";
    return "DOC";
}

function generateNextNumber(type) {
    const counters = getCounters();
    counters[type] = (counters[type] || 0) + 1;
    saveCounters(counters);
    return `${getTypePrefix(type)}-${new Date().getFullYear()}-${String(counters[type]).padStart(3, "0")}`;
}

function previewNumber(type) {
    const counters = getCounters();
    const nextSequence = (counters[type] || 0) + 1;
    return `${getTypePrefix(type)}-${new Date().getFullYear()}-${String(nextSequence).padStart(3, "0")}`;
}

function getDefaultIntro(type) {
    return type === "invoice"
        ? "فاتورة الخدمات المنفذة."
        : "عرض سعر للخدمات المطلوبة.";
}

function getDefaultNotes(type) {
    return type === "invoice"
        ? "حسب البنود الموضحة."
        : "حسب البنود الموضحة.";
}

function getDefaultTerms(type) {
    return type === "invoice"
        ? "السداد خلال 7 أيام."
        : "صلاحية العرض 7 أيام.";
}

function getDefaultItems(type) {
    return type === "invoice"
        ? [
            { description: "إدارة الحساب الإعلاني الشهري", qty: 1, price: 2800 },
            { description: "تصميم 12 مادة إبداعية", qty: 1, price: 1800 }
        ]
        : [
            { description: "إدارة الحملات الإعلانية لمدة شهر", qty: 1, price: 3000 },
            { description: "إنتاج 10 تصاميم ثابتة للسوشيال ميديا", qty: 1, price: 1500 }
        ];
}

function getStatusLabel(type, status) {
    if (status === "confirmed") {
        return type === "quote" ? "مؤكد" : "بانتظار السداد";
    }
    return {
        draft: "قيد الإعداد",
        sent: "تم الإرسال",
        settled: "مكتمل"
    }[status] || "قيد الإعداد";
}

function createTemplateState(type, allocateNumber = true) {
    return {
        id: createId("doc"),
        clientId: "",
        documentType: type,
        documentNumber: allocateNumber ? generateNextNumber(type) : previewNumber(type),
        issueDate: getToday(),
        dueDate: getRelativeDate(type === "invoice" ? 14 : 7),
        currency: "SAR",
        companyName: getCompanyDefaults().name,
        companyPhone: getCompanyDefaults().phone,
        companyEmail: getCompanyDefaults().email,
        clientName: "",
        clientTitle: "",
        clientPhone: "",
        clientEmail: "",
        clientAddress: "",
        clientVatNumber: "",
        introNote: getDefaultIntro(type),
        notes: getDefaultNotes(type),
        terms: getDefaultTerms(type),
        discount: 0,
        taxRate: 0,
        documentStatus: type === "invoice" ? "confirmed" : "draft",
        items: getDefaultItems(type)
    };
}

function normalizeItem(item = {}) {
    return {
        description: item.description || "",
        qty: toNumber(item.qty, 1),
        price: toNumber(item.price, 0)
    };
}

function normalizeDoc(rawDoc = {}, fallbackType = "invoice") {
    const type = rawDoc.documentType === "invoice" || rawDoc.documentType === "quote"
        ? rawDoc.documentType
        : fallbackType;
    const template = createTemplateState(type, false);

    return {
        ...template,
        ...rawDoc,
        documentType: type,
        discount: toNumber(rawDoc.discount, template.discount),
        taxRate: toNumber(rawDoc.taxRate, template.taxRate),
        items: Array.isArray(rawDoc.items) && rawDoc.items.length
            ? rawDoc.items.map(normalizeItem)
            : template.items.map(normalizeItem)
    };
}

function cloneDoc(doc) {
    return {
        ...doc,
        items: doc.items.map((item) => ({ ...item }))
    };
}

function normalizeCustomer(customer = {}) {
    return {
        id: customer.id || createId("customer"),
        name: customer.name || "",
        title: customer.title || "",
        phone: customer.phone || "",
        email: customer.email || "",
        address: customer.address || "",
        vatNumber: customer.vatNumber || "",
        createdAt: customer.createdAt || new Date().toISOString(),
        updatedAt: customer.updatedAt || customer.createdAt || new Date().toISOString()
    };
}

function normalizeCustomers(list = []) {
    return Array.isArray(list)
        ? list.map(normalizeCustomer).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
        : [];
}

function normalizeExpense(expense = {}) {
    return {
        id: expense.id || createId("expense"),
        date: expense.date || getToday(),
        category: expense.category || "operations",
        vendor: expense.vendor || "",
        amount: toNumber(expense.amount, 0),
        notes: expense.notes || "",
        createdAt: expense.createdAt || new Date().toISOString()
    };
}

function normalizeExpenses(list = []) {
    return Array.isArray(list)
        ? list.map(normalizeExpense).sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        : [];
}

function calculateTotals(doc) {
    const subtotal = doc.items.reduce((sum, item) => sum + toNumber(item.qty, 0) * toNumber(item.price, 0), 0);
    const discount = Math.max(0, toNumber(doc.discount, 0));
    const taxable = Math.max(subtotal - discount, 0);
    const tax = taxable * (Math.max(0, toNumber(doc.taxRate, 0)) / 100);
    const total = taxable + tax;
    return { subtotal, discount, tax, total };
}

function normalizeLedgerEntry(entry = {}) {
    const type = entry.documentType === "quote" ? "quote" : "invoice";
    const doc = normalizeDoc(entry, type);
    const totals = calculateTotals(doc);
    return {
        ...doc,
        subtotalAmount: toNumber(entry.subtotalAmount, totals.subtotal),
        taxAmount: toNumber(entry.taxAmount, totals.tax),
        totalAmount: toNumber(entry.totalAmount, totals.total),
        postedAt: entry.postedAt || new Date().toISOString()
    };
}

function normalizeLedger(list = []) {
    return Array.isArray(list)
        ? list.map(normalizeLedgerEntry).sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || ""))
        : [];
}

function normalizeDraft(entry = {}) {
    return {
        ...normalizeDoc(entry, entry.documentType === "quote" ? "quote" : "invoice"),
        savedAt: entry.savedAt || new Date().toISOString()
    };
}

function normalizeDrafts(list = []) {
    return Array.isArray(list)
        ? list.map(normalizeDraft).sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""))
        : [];
}

function getDocumentTotal(doc) {
    return typeof doc.totalAmount === "number" ? doc.totalAmount : calculateTotals(doc).total;
}

function loadCurrentDocs() {
    const stored = readJSON(CURRENT_DOCS_KEY, null);
    if (stored && (stored.invoice || stored.quote)) {
        return {
            invoice: normalizeDoc(stored.invoice || {}, "invoice"),
            quote: normalizeDoc(stored.quote || {}, "quote")
        };
    }

    const legacy = readJSON(LEGACY_CURRENT_DOC_KEY_V2, readJSON(LEGACY_CURRENT_DOC_KEY_V1, null));
    const docs = {
        invoice: createTemplateState("invoice"),
        quote: createTemplateState("quote")
    };

    if (legacy) {
        const type = legacy.documentType === "quote" ? "quote" : "invoice";
        docs[type] = normalizeDoc(legacy, type);
    }

    return docs;
}

function saveCurrentDocs() {
    const saved = writeJSON(CURRENT_DOCS_KEY, currentDocs);
    if (saved) {
        markUpdated();
    }
    return saved;
}

function saveDrafts() {
    const saved = writeJSON(DRAFTS_KEY, drafts);
    if (saved) {
        markUpdated();
    }
    return saved;
}

function saveCustomers() {
    const saved = writeJSON(CUSTOMERS_KEY, customers);
    if (saved) {
        markUpdated();
    }
    return saved;
}

function saveExpenses() {
    const saved = writeJSON(EXPENSES_KEY, expenses);
    if (saved) {
        markUpdated();
    }
    return saved;
}

function saveLedger() {
    const saved = writeJSON(LEDGER_KEY, ledger);
    if (saved) {
        markUpdated();
    }
    return saved;
}

function normalizeContract(entry = {}) {
    return {
        id: entry.id || crypto.randomUUID(),
        contractNumber: entry.contractNumber || "",
        contractDate: entry.contractDate || "",
        contractValue: toNumber(entry.contractValue, 0),
        currency: entry.currency || "SAR",
        companyName: entry.companyName || "",
        companyPhone: entry.companyPhone || "",
        companyEmail: entry.companyEmail || "",
        clientName: entry.clientName || "",
        clientTitle: entry.clientTitle || "",
        clientPhone: entry.clientPhone || "",
        clientEmail: entry.clientEmail || "",
        clientAddress: entry.clientAddress || "",
        subject: entry.subject || "",
        body: entry.body || "",
        signatory1: entry.signatory1 || "",
        signatory2: entry.signatory2 || "",
        savedAt: entry.savedAt || new Date().toISOString()
    };
}

function normalizeContracts(list = []) {
    return Array.isArray(list)
        ? list.map(normalizeContract).sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""))
        : [];
}

function saveContracts() {
    const saved = writeJSON(CONTRACTS_KEY, contracts);
    if (saved) {
        markUpdated();
    }
    return saved;
}

function saveUiState() {
    uiState.lastUpdatedAt = new Date().toISOString();
    return writeJSON(UI_KEY, uiState);
}

function notifyStorageWriteFailure(error) {
    const now = Date.now();
    if (now - lastStorageErrorAt < 2200) {
        return;
    }

    lastStorageErrorAt = now;
    showToast(
        error?.name === "QuotaExceededError"
            ? "امتلأت مساحة التخزين المحلي. نزّل نسخة احتياطية ثم احذف بعض البيانات."
            : "تعذر حفظ البيانات محليًا في المتصفح."
    );
}

function getSafeStatusTone(status) {
    return SAFE_STATUS_TONES.has(status) ? status : "draft";
}

function renderStatusBadge(type, status) {
    const tone = getSafeStatusTone(status);
    return `<span class="status-badge" data-tone="${tone}">${escapeHtml(getStatusLabel(type, tone))}</span>`;
}

function confirmDestructiveAction(message) {
    return window.confirm(message);
}

function refreshStoredState() {
    uiState = loadUiState();
    customers = normalizeCustomers(readJSON(CUSTOMERS_KEY, []));
    expenses = normalizeExpenses(readJSON(EXPENSES_KEY, []));
    ledger = normalizeLedger(readJSON(LEDGER_KEY, []));
    drafts = normalizeDrafts(readJSON(DRAFTS_KEY, readJSON(LEGACY_DRAFTS_KEY_V1, [])));
    contracts = normalizeContracts(readJSON(CONTRACTS_KEY, []));
    currentDocs = loadCurrentDocs();
}

function initGlobalSidebarTools() {
    const sidebar = document.querySelector(".site-topbar");
    if (!sidebar || sidebar.querySelector(".sidebar-tools")) {
        return;
    }

    const toolsStack = document.createElement("div");
    toolsStack.className = "sidebar-tools-stack";

    const wrapper = document.createElement("section");
    wrapper.className = "sidebar-tools sidebar-tools-inline";
    wrapper.innerHTML = `
        <p class="sidebar-tools-label">النسخ الاحتياطي</p>
        <div class="sidebar-tools-actions">
            <button type="button" class="btn btn-secondary btn-small" data-action="export-backup">تصدير</button>
            <button type="button" class="btn btn-secondary btn-small" data-action="import-backup">استيراد</button>
        </div>
        <input type="file" class="sidebar-tools-input" accept="application/json">
    `;

    const activitySection = document.createElement("section");
    activitySection.className = "sidebar-tools sidebar-tools-inline";
    activitySection.innerHTML = `
        <p class="sidebar-tools-label">سجل النشاط</p>
        <div class="sidebar-tools-actions">
            <button type="button" class="btn btn-secondary btn-small" data-action="view-activity-log">عرض سجل النشاط</button>
        </div>
    `;

    toolsStack.append(wrapper, activitySection);

    const nav = sidebar.querySelector(".page-nav");
    if (nav) {
        nav.after(toolsStack);
    } else {
        sidebar.appendChild(toolsStack);
    }

    activitySection.querySelector("[data-action='view-activity-log']").addEventListener("click", showActivityLogModal);

    const exportBtn = wrapper.querySelector("[data-action='export-backup']");
    const importBtn = wrapper.querySelector("[data-action='import-backup']");
    const input = wrapper.querySelector(".sidebar-tools-input");

    addClick(exportBtn, () => {
        activePageController?.flush?.();
        exportBackupData();
    });

    addClick(importBtn, () => {
        input?.click();
    });

    if (input) {
        input.addEventListener("change", async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
                return;
            }

            activePageController?.flush?.();

            if (!confirmDestructiveAction("سيتم استبدال البيانات الحالية بالنسخة المستوردة. هل تريد المتابعة؟")) {
                input.value = "";
                return;
            }

            try {
                await importBackupData(file);
                showToast("تم استيراد النسخة الاحتياطية");
            } catch (error) {
                console.error(error);
                showToast("تعذر استيراد الملف. تأكد أنه نسخة JSON صحيحة.");
            } finally {
                input.value = "";
            }
        });
    }
}

function exportBackupData() {
    const payload = {
        app: "UTraffic Mini Accounting",
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        data: {
            currentDocs,
            drafts,
            counters: normalizeCounters(getCounters()),
            customers,
            expenses,
            ledger,
            contracts,
            uiState,
            passwords: getUserPasswords(),
            activityLog: readJSON(ACTIVITY_LOG_KEY, [])
        }
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `utraffic-accounting-backup-${getToday()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 200);
    showToast("تم تنزيل النسخة الاحتياطية");
}

async function importBackupData(file) {
    const rawText = await file.text();
    const parsed = JSON.parse(rawText);
    const data = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;

    if (!data || typeof data !== "object") {
        throw new Error("Invalid backup format");
    }

    const importedCurrentDocs = {
        invoice: normalizeDoc(data.currentDocs?.invoice || {}, "invoice"),
        quote: normalizeDoc(data.currentDocs?.quote || {}, "quote")
    };
    const importedDrafts = normalizeDrafts(data.drafts || []);
    const importedCustomers = normalizeCustomers(data.customers || []);
    const importedExpenses = normalizeExpenses(data.expenses || []);
    const importedLedger = normalizeLedger(data.ledger || []);
    const importedContracts = normalizeContracts(data.contracts || []);
    const importedCounters = normalizeCounters(data.counters || {});
    const importedUiState = {
        ...loadUiState(),
        ...(typeof data.uiState === "object" && data.uiState ? data.uiState : {}),
        lastUpdatedAt: new Date().toISOString()
    };
    const importedPasswords = typeof data.passwords === "object" && data.passwords ? data.passwords : null;
    const importedActivityLog = Array.isArray(data.activityLog) ? data.activityLog : null;

    const writesSucceeded = [
        writeJSON(CURRENT_DOCS_KEY, importedCurrentDocs, { silent: true }),
        writeJSON(DRAFTS_KEY, importedDrafts, { silent: true }),
        writeJSON(CUSTOMERS_KEY, importedCustomers, { silent: true }),
        writeJSON(EXPENSES_KEY, importedExpenses, { silent: true }),
        writeJSON(LEDGER_KEY, importedLedger, { silent: true }),
        writeJSON(CONTRACTS_KEY, importedContracts, { silent: true }),
        writeJSON(COUNTER_KEY, importedCounters, { silent: true }),
        writeJSON(UI_KEY, importedUiState, { silent: true }),
        importedPasswords ? writeJSON(PASSWORDS_KEY, importedPasswords, { silent: true }) : true,
        importedActivityLog ? writeJSON(ACTIVITY_LOG_KEY, importedActivityLog, { silent: true }) : true
    ].every(Boolean);

    if (!writesSucceeded) {
        throw new Error("Import write failed");
    }

    refreshStoredState();
    activePageController?.refresh?.({ forceCurrentDoc: true });
    logActivity("import", "backup", "", "", "استيراد نسخة احتياطية");
}

function initStorageSync() {
    window.addEventListener("storage", (event) => {
        if (event.storageArea !== localStorage || (event.key && !STORAGE_SYNC_KEYS.has(event.key))) {
            return;
        }

        refreshStoredState();
        activePageController?.refresh?.(event.key || "");
        showToast("تم تحديث البيانات من تبويب آخر");
    });
}

function showToast(message) {
    if (!toastEl) {
        return;
    }
    toastEl.textContent = message;
    toastEl.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        toastEl.classList.remove("visible");
    }, 2600);
}

function logActivity(action, entityType, entityId, entityLabel, details) {
    const user = getActiveUser();
    if (!user) return;
    const entry = {
        id: createId("log"),
        userId: user.id,
        userName: user.name,
        action,
        entityType,
        entityId: entityId || "",
        entityLabel: entityLabel || "",
        timestamp: new Date().toISOString(),
        details: details || ""
    };
    const log = readJSON(ACTIVITY_LOG_KEY, []);
    log.unshift(entry);
    if (log.length > ACTIVITY_LOG_MAX) log.length = ACTIVITY_LOG_MAX;
    writeJSON(ACTIVITY_LOG_KEY, log, { silent: true });
}

function getActivityLog() {
    return readJSON(ACTIVITY_LOG_KEY, []);
}

function showActivityLogModal() {
    const existing = byId("activityLogModal");
    if (existing) existing.remove();

    const log = getActivityLog();
    const actionLabels = {
        "create": "إنشاء",
        "update": "تعديل",
        "delete": "حذف",
        "status-change": "تغيير حالة",
        "import": "استيراد"
    };
    const entityLabels = {
        "customer": "عميل",
        "expense": "مصروف",
        "ledger": "مستند",
        "draft": "مسودة",
        "backup": "نسخة احتياطية"
    };

    const overlay = document.createElement("div");
    overlay.id = "activityLogModal";
    overlay.className = "activity-log-overlay";
    overlay.innerHTML = `
        <div class="activity-log-card">
            <div class="activity-log-header">
                <h2>سجل النشاط</h2>
                <button type="button" class="activity-log-close" data-action="close-log">✕</button>
            </div>
            <div class="activity-log-list">
                ${log.length ? log.slice(0, 100).map(entry => `
                    <div class="activity-log-entry">
                        <div class="activity-log-entry-head">
                            <span class="activity-log-user">${escapeHtml(entry.userName || "مجهول")}</span>
                            <span class="activity-log-action">${escapeHtml(actionLabels[entry.action] || entry.action)} ${escapeHtml(entityLabels[entry.entityType] || entry.entityType)}</span>
                            <time class="activity-log-time">${formatDateTime(entry.timestamp)}</time>
                        </div>
                        ${entry.entityLabel ? `<p class="activity-log-detail">${escapeHtml(entry.entityLabel)}</p>` : ""}
                        ${entry.details ? `<p class="activity-log-detail">${escapeHtml(entry.details)}</p>` : ""}
                    </div>
                `).join("") : '<div class="activity-log-empty">لا توجد عمليات مسجلة بعد.</div>'}
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay || event.target.closest("[data-action='close-log']")) {
            overlay.remove();
        }
    });
}

function findCustomerById(id) {
    return customers.find((customer) => customer.id === id) || null;
}

function findMatchingCustomer(doc) {
    if (doc.clientId) {
        const match = findCustomerById(doc.clientId);
        if (match) {
            return match;
        }
    }

    const email = normalizeText(doc.clientEmail);
    if (email) {
        const emailMatch = customers.find((customer) => normalizeText(customer.email) === email);
        if (emailMatch) {
            return emailMatch;
        }
    }

    const name = normalizeText(doc.clientName);
    if (name) {
        return customers.find((customer) => normalizeText(customer.name) === name) || null;
    }

    return null;
}

function upsertCustomerFromDoc(doc, silent = false) {
    if (!doc.clientName.trim()) {
        if (!silent) {
            showToast("أدخل اسم العميل أولًا");
        }
        return null;
    }

    const existing = findMatchingCustomer(doc);
    const customer = normalizeCustomer({
        ...existing,
        id: existing?.id || doc.clientId || createId("customer"),
        name: doc.clientName.trim(),
        title: doc.clientTitle.trim(),
        phone: doc.clientPhone.trim(),
        email: doc.clientEmail.trim(),
        address: doc.clientAddress.trim(),
        vatNumber: (doc.clientVatNumber || "").trim(),
        updatedAt: new Date().toISOString()
    });

    customers = [customer, ...customers.filter((entry) => entry.id !== customer.id)];
    saveCustomers();
    logActivity(existing ? "update" : "create", "customer", customer.id, customer.name, existing ? "تحديث عميل من المستند" : "إنشاء عميل من المستند");
    doc.clientId = customer.id;

    if (!silent) {
        showToast("تم حفظ العميل");
    }

    return customer;
}

function documentBelongsToCustomer(doc, customer) {
    if (!customer) {
        return false;
    }

    if (doc.clientId && doc.clientId === customer.id) {
        return true;
    }

    return (
        normalizeText(doc.clientName) === normalizeText(customer.name) ||
        (customer.email && normalizeText(doc.clientEmail) === normalizeText(customer.email))
    );
}

function getCustomerStats(customer) {
    const docs = ledger.filter((doc) => documentBelongsToCustomer(doc, customer));
    const invoices = docs.filter((doc) => doc.documentType === "invoice");
    const receivables = invoices
        .filter((doc) => doc.documentStatus !== "settled")
        .reduce((sum, doc) => sum + getDocumentTotal(doc), 0);

    return {
        docsCount: docs.length,
        invoicesCount: invoices.length,
        receivables
    };
}

function renderEmptyRow(colspan, message) {
    return `<tr><td colspan="${colspan}" class="table-empty">${escapeHtml(message)}</td></tr>`;
}

function initPage() {
    if (page === "dashboard") {
        return initDashboardPage();
    }

    if (page === "invoices") {
        return initBillingPage("invoice");
    }

    if (page === "quotes") {
        return initBillingPage("quote");
    }

    if (page === "customers") {
        return initCustomersPage();
    }

    if (page === "expenses") {
        return initExpensesPage();
    }

    if (page === "statements") {
        return initStatementsPage();
    }

    if (page === "contracts") {
        return initContractsPage();
    }

    if (page === "reports") {
        return initReportsPage();
    }

    return null;
}

function initDashboardPage() {
    const allInvoices = [];
    const allQuotes = [];
    const settledInvoices = [];
    const unsettledInvoices = [];
    const sentQuotes = [];

    for (const doc of ledger) {
        if (doc.documentType === "invoice") {
            allInvoices.push(doc);
            if (doc.documentStatus === "settled") {
                settledInvoices.push(doc);
            } else {
                unsettledInvoices.push(doc);
            }
        } else if (doc.documentType === "quote") {
            allQuotes.push(doc);
            if (doc.documentStatus !== "draft") {
                sentQuotes.push(doc);
            }
        }
    }

    const invoices = allInvoices.slice(0, 5);
    const quotes = allQuotes.slice(0, 5);
    const receivables = unsettledInvoices.reduce((sum, doc) => sum + getDocumentTotal(doc), 0);
    const expensesTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const settledRevenue = settledInvoices.reduce((sum, doc) => sum + getDocumentTotal(doc), 0);

    setText("dashboardCustomersMetric", formatNumber(customers.length));
    setText("dashboardInvoicesMetric", formatNumber(allInvoices.length));
    setText("dashboardQuotesMetric", formatNumber(allQuotes.length));
    setText("dashboardReceivablesMetric", formatMoney(receivables));
    setText("dashboardExpensesMetric", formatMoney(expensesTotal));
    setText("dashboardNetMetric", formatMoney(settledRevenue - expensesTotal));
    setText("dashboardSettledInvoicesMetric", formatNumber(settledInvoices.length));
    setText("dashboardSentQuotesMetric", formatNumber(sentQuotes.length));
    setText("dashboardUpdatedAt", formatDateTime(uiState.lastUpdatedAt));

    const invoicesBody = byId("dashboardInvoicesBody");
    const quotesBody = byId("dashboardQuotesBody");

    if (invoicesBody) {
        invoicesBody.innerHTML = invoices.length
            ? invoices.map((doc) => `
                <tr>
                    <td><a class="table-link" href="invoices.html?doc=${encodeURIComponent(doc.id)}">${escapeHtml(doc.documentNumber || "-")}</a></td>
                    <td>${escapeHtml(doc.clientName || "-")}</td>
                    <td>${renderStatusBadge("invoice", doc.documentStatus)}</td>
                    <td class="font-numbers">${formatMoney(getDocumentTotal(doc), doc.currency || "SAR")}</td>
                </tr>
            `).join("")
            : renderEmptyRow(4, "لا توجد فواتير معتمدة بعد.");
    }

    if (quotesBody) {
        quotesBody.innerHTML = quotes.length
            ? quotes.map((doc) => `
                <tr>
                    <td><a class="table-link" href="quotes.html?doc=${encodeURIComponent(doc.id)}">${escapeHtml(doc.documentNumber || "-")}</a></td>
                    <td>${escapeHtml(doc.clientName || "-")}</td>
                    <td>${renderStatusBadge("quote", doc.documentStatus)}</td>
                    <td class="font-numbers">${formatMoney(getDocumentTotal(doc), doc.currency || "SAR")}</td>
                </tr>
            `).join("")
            : renderEmptyRow(4, "لا توجد عروض أسعار معتمدة بعد.");
    }

    renderCompactCustomers(byId("dashboardCustomersList"), customers.slice(0, 4));
    renderCompactExpenses(byId("dashboardExpensesList"), expenses.slice(0, 4));

    return {
        refresh: initDashboardPage,
        flush: () => {}
    };
}

function renderCompactCustomers(container, list) {
    if (!container) {
        return;
    }

    if (!list.length) {
        container.innerHTML = '<div class="empty-state">لا يوجد عملاء.</div>';
        return;
    }

    container.innerHTML = list.map((customer) => {
        const stats = getCustomerStats(customer);
        return `
            <article class="entity-card compact">
                <div class="entity-head">
                    <div>
                        <h3>${escapeHtml(customer.name || "بدون اسم")}</h3>
                        <p>${escapeHtml(customer.title || "بدون جهة")}</p>
                    </div>
                    <span class="status-badge status-badge-neutral">${formatNumber(stats.docsCount)} سجل</span>
                </div>
                <div class="entity-actions">
                    <a class="table-btn" href="statements.html?client=customer:${encodeURIComponent(customer.id)}">كشف الحساب</a>
                    <a class="table-btn" href="invoices.html?client=${encodeURIComponent(customer.id)}">فاتورة</a>
                </div>
            </article>
        `;
    }).join("");
}

function renderCompactExpenses(container, list) {
    if (!container) {
        return;
    }

    if (!list.length) {
        container.innerHTML = '<div class="empty-state">لا توجد مصروفات.</div>';
        return;
    }

    container.innerHTML = list.map((expense) => `
        <article class="entity-card compact">
            <div class="entity-head">
                <div>
                    <h3>${escapeHtml(expense.vendor || expenseCategoryLabels[expense.category])}</h3>
                    <p>${formatDate(expense.date)} - ${escapeHtml(expenseCategoryLabels[expense.category] || expense.category)}</p>
                </div>
                <span class="status-badge status-badge-neutral">${formatMoney(expense.amount)}</span>
            </div>
        </article>
    `).join("");
}

function initBillingPage(type) {
    const params = new URLSearchParams(window.location.search);
    let docState = cloneDoc(normalizeDoc(currentDocs[type], type));
    const refs = Object.fromEntries(docFieldIds.map((id) => [id, byId(id)]));
    const itemsList = byId("itemsList");
    const draftsList = byId("draftsList");
    const recentDocumentsList = byId("recentDocumentsList");
    const clientPicker = byId("clientPicker");
    const saveClientBtn = byId("saveClientBtn");
    const addItemBtn = byId("addItemBtn");
    const newDocumentBtn = byId("newDocumentBtn");
    const saveDraftBtn = byId("saveDraftBtn");
    const recordDocumentBtn = byId("recordDocumentBtn");
    const printBtn = byId("printBtn");
    const downloadPdfBtn = byId("downloadPdfBtn");
    const preview = byId("documentPreview");
    let persistTimer = null;

    if (params.get("doc")) {
        const id = params.get("doc");
        const found = ledger.find((doc) => doc.id === id && doc.documentType === type)
            || drafts.find((draft) => draft.id === id && draft.documentType === type);
        if (found) {
            docState = cloneDoc(normalizeDoc(found, type));
        }
    }

    if (params.get("client")) {
        const customer = findCustomerById(params.get("client"));
        if (customer) {
            docState.clientId = customer.id;
            docState.clientName = customer.name;
            docState.clientTitle = customer.title;
            docState.clientPhone = customer.phone;
            docState.clientEmail = customer.email;
            docState.clientAddress = customer.address;
        }
    }

    docState.documentType = type;
    syncForm();
    persistCurrentDoc();
    renderAll();

    docFieldIds.forEach((id) => {
        const ref = refs[id];
        if (!ref) {
            return;
        }

        const eventName = ref.tagName === "SELECT" ? "change" : "input";
        ref.addEventListener(eventName, (event) => {
            if (id === "documentType") {
                return;
            }

            docState[id] = numericDocFields.has(id)
                ? toNumber(event.target.value, 0)
                : event.target.value;

            if (id === "documentStatus") {
                logActivity("status-change", "ledger", docState.id, docState.documentNumber, `تغيير الحالة إلى: ${getStatusLabel(type, event.target.value)}`);
            }

            queueCurrentDocPersist();
            renderSummaryAndPreview();
        });
    });

    if (itemsList) {
        itemsList.addEventListener("input", (event) => {
            const row = event.target.closest(".item-row");
            if (!row) {
                return;
            }

            const index = Number(row.dataset.index);
            const field = event.target.dataset.field;
            if (!docState.items[index]) {
                return;
            }

            docState.items[index][field] = field === "description"
                ? event.target.value
                : toNumber(event.target.value, 0);

            const lineTotal = toNumber(docState.items[index].qty, 0) * toNumber(docState.items[index].price, 0);
            row.querySelector(".item-total").textContent = formatMoney(lineTotal, docState.currency);
            queueCurrentDocPersist();
            renderSummaryAndPreview();
        });

        itemsList.addEventListener("click", (event) => {
            const button = event.target.closest("[data-action='remove-item']");
            if (!button) {
                return;
            }

            const row = button.closest(".item-row");
            const index = Number(row.dataset.index);
            if (docState.items.length === 1) {
                showToast("يجب أن يحتوي المستند على بند واحد على الأقل");
                return;
            }

            docState.items.splice(index, 1);
            persistCurrentDoc();
            renderItemsEditor();
            renderSummaryAndPreview();
        });
    }

    addClick(addItemBtn, () => {
        docState.items.push({ description: "خدمة إضافية", qty: 1, price: 0 });
        persistCurrentDoc();
        renderItemsEditor();
        renderSummaryAndPreview();
    });

    addClick(saveClientBtn, () => {
        if (upsertCustomerFromDoc(docState)) {
            persistCurrentDoc();
            renderClientPicker();
            renderRecentDrafts();
        }
    });

    if (clientPicker) {
        clientPicker.addEventListener("change", (event) => {
            const customer = findCustomerById(event.target.value);
            if (!customer) {
                docState.clientId = "";
                persistCurrentDoc();
                return;
            }

            docState.clientId = customer.id;
            docState.clientName = customer.name;
            docState.clientTitle = customer.title;
            docState.clientPhone = customer.phone;
            docState.clientEmail = customer.email;
            docState.clientAddress = customer.address;
            docState.clientVatNumber = customer.vatNumber || "";
            syncForm();
            persistCurrentDoc();
            renderAll();
        });
    }

    addClick(saveDraftBtn, () => {
        flushCurrentDocPersist();
        const snapshot = {
            ...cloneDoc(docState),
            savedAt: new Date().toISOString()
        };

        drafts = [snapshot, ...drafts.filter((draft) => draft.id !== snapshot.id)].sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
        saveDrafts();
        logActivity("create", "draft", snapshot.id, snapshot.documentNumber || snapshot.id, `حفظ مسودة ${documentLabels[type]}`);
        renderRecentDrafts();
        renderSummaryAndPreview();
        showToast("تم حفظ المسودة");
    });

    addClick(recordDocumentBtn, () => {
        flushCurrentDocPersist();
        if (!docState.clientName.trim()) {
            showToast("أدخل اسم العميل قبل اعتماد المستند");
            return;
        }

        upsertCustomerFromDoc(docState, true);
        const totals = calculateTotals(docState);
        const entry = normalizeLedgerEntry({
            ...cloneDoc(docState),
            subtotalAmount: totals.subtotal,
            taxAmount: totals.tax,
            totalAmount: totals.total,
            postedAt: new Date().toISOString()
        });

        ledger = [entry, ...ledger.filter((doc) => doc.id !== entry.id)].sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || ""));
        saveLedger();
        logActivity("create", "ledger", entry.id, entry.documentNumber, `اعتماد ${documentLabels[type]} في السجل`);
        renderRecentDocuments();
        showToast("تم اعتماد المستند في السجل");
    });

    addClick(newDocumentBtn, () => {
        window.clearTimeout(persistTimer);
        docState = createTemplateState(type);
        syncForm();
        persistCurrentDoc();
        renderAll();
        showToast(type === "invoice" ? "تم إنشاء فاتورة جديدة" : "تم إنشاء عرض سعر جديد");
    });

    addClick(printBtn, async () => {
        try {
            const canvas = await renderDocumentCanvas(preview);
            const printWindow = window.open("", "_blank", "noopener,noreferrer");
            if (!printWindow) {
                throw new Error("print window blocked");
            }
            printWindow.document.open();
            printWindow.document.write(buildPrintableMarkup(canvas.toDataURL("image/png")));
            printWindow.document.close();
        } catch (error) {
            console.error(error);
            window.print();
        }
    });

    addClick(downloadPdfBtn, async () => {
        const originalLabel = downloadPdfBtn.textContent;
        downloadPdfBtn.disabled = true;
        downloadPdfBtn.textContent = "جاري تجهيز PDF...";
        try {
            await downloadPdfFromPreview(preview, docState);
            showToast("تم تنزيل ملف PDF");
        } catch (error) {
            console.error(error);
            showToast("تعذر إنشاء PDF. افتح الصفحة عبر localhost ثم جرّب مجددًا");
        } finally {
            downloadPdfBtn.disabled = false;
            downloadPdfBtn.textContent = originalLabel;
        }
    });

    if (draftsList) {
        draftsList.addEventListener("click", (event) => {
            const card = event.target.closest(".saved-doc");
            if (!card) {
                return;
            }

            const id = card.dataset.id;
            const action = event.target.dataset.action;
            if (action === "load-draft") {
                const draft = drafts.find((entry) => entry.id === id && entry.documentType === type);
                if (draft) {
                    docState = cloneDoc(normalizeDoc(draft, type));
                    syncForm();
                    persistCurrentDoc();
                    renderAll();
                    showToast("تم تحميل المسودة");
                }
            }
            if (action === "delete-draft") {
                if (!confirmDestructiveAction("سيتم حذف هذه المسودة نهائيًا. هل تريد المتابعة؟")) {
                    return;
                }
                drafts = drafts.filter((entry) => entry.id !== id);
                saveDrafts();
                logActivity("delete", "draft", id, "", `حذف مسودة ${documentLabels[type]}`);
                renderRecentDrafts();
                renderSummaryAndPreview();
                showToast("تم حذف المسودة");
            }
        });
    }

    if (recentDocumentsList) {
        recentDocumentsList.addEventListener("click", (event) => {
            const card = event.target.closest(".saved-doc");
            if (!card) {
                return;
            }

            const id = card.dataset.id;
            const action = event.target.dataset.action;
            if (action === "load-ledger") {
                const entry = ledger.find((doc) => doc.id === id && doc.documentType === type);
                if (entry) {
                    docState = cloneDoc(normalizeDoc(entry, type));
                    syncForm();
                    persistCurrentDoc();
                    renderAll();
                    showToast("تم تحميل المستند من السجل");
                }
            }
            if (action === "delete-ledger") {
                if (!confirmDestructiveAction("سيتم حذف هذا المستند من السجل نهائيًا. هل تريد المتابعة؟")) {
                    return;
                }
                const deletedDoc = ledger.find(doc => doc.id === id);
                ledger = ledger.filter((doc) => doc.id !== id);
                saveLedger();
                logActivity("delete", "ledger", id, deletedDoc?.documentNumber || "", `حذف مستند من السجل`);
                renderRecentDocuments();
                showToast("تم حذف المستند من السجل");
            }
        });
    }

    function persistCurrentDoc() {
        window.clearTimeout(persistTimer);
        persistTimer = null;
        currentDocs[type] = cloneDoc(docState);
        if (saveCurrentDocs()) {
            setText("autosaveStatus", formatTime(new Date()));
        }
        updateCompanyDefaults(docState.companyName, docState.companyPhone, docState.companyEmail);
    }

    function queueCurrentDocPersist() {
        window.clearTimeout(persistTimer);
        setText("autosaveStatus", "جاري الحفظ...");
        persistTimer = window.setTimeout(() => {
            persistCurrentDoc();
        }, AUTOSAVE_DELAY_MS);
    }

    function flushCurrentDocPersist() {
        if (persistTimer) {
            persistCurrentDoc();
        }
    }

    function syncForm() {
        docFieldIds.forEach((id) => {
            const ref = refs[id];
            if (!ref) {
                return;
            }
            ref.value = numericDocFields.has(id) ? docState[id] : docState[id] ?? "";
        });
        renderClientPicker();
        renderItemsEditor();
    }

    function renderClientPicker() {
        if (!clientPicker) {
            return;
        }

        clientPicker.innerHTML = [
            '<option value="">عميل جديد</option>',
            ...customers.map((customer) => `<option value="${customer.id}">${escapeHtml(customer.name || customer.title || "عميل")}</option>`)
        ].join("");
        clientPicker.value = docState.clientId || "";
    }

    function renderItemsEditor() {
        if (!itemsList) {
            return;
        }
        itemsList.innerHTML = docState.items.map((item, index) => {
            const lineTotal = toNumber(item.qty, 0) * toNumber(item.price, 0);
            return `
                <div class="item-row" data-index="${index}">
                    <label class="field">
                        <span>الوصف</span>
                        <input type="text" data-field="description" value="${escapeHtml(item.description)}" placeholder="اسم الخدمة أو البند">
                    </label>
                    <label class="field">
                        <span>الكمية</span>
                        <input type="number" min="0" step="0.01" data-field="qty" value="${item.qty}">
                    </label>
                    <label class="field">
                        <span>سعر الوحدة</span>
                        <input type="number" min="0" step="0.01" data-field="price" value="${item.price}">
                    </label>
                    <div class="item-total">${formatMoney(lineTotal, docState.currency)}</div>
                    <button type="button" class="icon-btn" data-action="remove-item" aria-label="حذف">حذف</button>
                </div>
            `;
        }).join("");
    }

    function renderSummaryAndPreview() {
        const totals = calculateTotals(docState);
        setText("summaryDocLabel", documentLabels[type]);
        setText("summaryTotal", formatMoney(totals.total, docState.currency));
        setText("summaryItems", formatNumber(docState.items.length));
        setText("summarySaved", formatNumber(drafts.filter((draft) => draft.documentType === type).length));

        setText("previewDocTitle", documentLabels[type]);
        setText("previewNumber", docState.documentNumber || "-");
        setText("previewIssueDate", formatDate(docState.issueDate));
        setText("previewDueDate", formatDate(docState.dueDate));
        setText("previewCurrency", docState.currency);
        setText("previewCompanyName", docState.companyName || "UTraffic");
        setText("previewClientName", docState.clientName || "اسم العميل");
        setHtml("previewCompanyMeta", formatMultiline([docState.companyPhone, docState.companyEmail]));
        setHtml("previewClientMeta", formatMultiline([docState.clientTitle, docState.clientPhone, docState.clientEmail, docState.clientAddress, docState.clientVatNumber ? `الرقم الضريبي: ${docState.clientVatNumber}` : ""]));
        setText("previewMessage", docState.introNote || getDefaultIntro(type));
        setText("previewNotes", docState.notes || "-");
        setText("previewTerms", docState.terms || "-");
        setText("previewSubtotal", formatMoney(totals.subtotal, docState.currency));
        setText("previewDiscount", formatMoney(totals.discount, docState.currency));
        setText("previewTax", formatMoney(totals.tax, docState.currency));
        setText("previewTotal", formatMoney(totals.total, docState.currency));
        setText("previewFooterStamp", [docState.companyEmail, docState.companyPhone].filter(Boolean).join(" - ") || "UTraffic");

        const previewItems = byId("previewItems");
        if (previewItems) {
            previewItems.innerHTML = docState.items.length
                ? docState.items.map((item, index) => {
                    const lineTotal = toNumber(item.qty, 0) * toNumber(item.price, 0);
                    return `
                        <tr>
                            <td class="font-numbers">${index + 1}</td>
                            <td>${escapeHtml(item.description || "بند بدون وصف")}</td>
                            <td class="font-numbers">${formatNumber(item.qty)}</td>
                            <td class="font-numbers">${formatMoney(item.price, docState.currency)}</td>
                            <td class="font-numbers">${formatMoney(lineTotal, docState.currency)}</td>
                        </tr>
                    `;
                }).join("")
                : '<tr><td colspan="5" class="table-empty">لا توجد بنود بعد</td></tr>';
        }
    }

    function renderRecentDrafts() {
        if (!draftsList) {
            return;
        }

        const list = drafts.filter((draft) => draft.documentType === type).slice(0, 6);
        if (!list.length) {
            draftsList.innerHTML = '<div class="empty-state">لا توجد مسودات.</div>';
            return;
        }

        draftsList.innerHTML = list.map((draft) => `
            <article class="saved-doc" data-id="${escapeAttribute(draft.id)}">
                <div class="saved-doc-head">
                    <h3>${escapeHtml(draft.documentNumber || "-")}</h3>
                    ${renderStatusBadge(type, draft.documentStatus)}
                </div>
                <div class="saved-doc-meta">
                    <p>${escapeHtml(draft.clientName || "بدون عميل")}</p>
                    <p>${formatMoney(calculateTotals(draft).total, draft.currency || "SAR")}</p>
                </div>
                <div class="saved-doc-actions">
                    <button type="button" class="load-btn" data-action="load-draft">تحميل</button>
                    <button type="button" class="delete-btn" data-action="delete-draft">حذف</button>
                </div>
            </article>
        `).join("");
    }

    function renderRecentDocuments() {
        if (!recentDocumentsList) {
            return;
        }

        const list = ledger.filter((doc) => doc.documentType === type).slice(0, 5);
        if (!list.length) {
            recentDocumentsList.innerHTML = '<div class="empty-state">لا توجد مستندات.</div>';
            return;
        }

        recentDocumentsList.innerHTML = list.map((doc) => `
            <article class="saved-doc" data-id="${escapeAttribute(doc.id)}">
                <div class="saved-doc-head">
                    <h3>${escapeHtml(doc.documentNumber || "-")}</h3>
                    ${renderStatusBadge(type, doc.documentStatus)}
                </div>
                <div class="saved-doc-meta">
                    <p>${escapeHtml(doc.clientName || "بدون عميل")}</p>
                    <p>${formatMoney(getDocumentTotal(doc), doc.currency || "SAR")}</p>
                </div>
                <div class="saved-doc-actions">
                    <button type="button" class="load-btn" data-action="load-ledger">تحميل</button>
                    <button type="button" class="delete-btn" data-action="delete-ledger">حذف</button>
                </div>
            </article>
        `).join("");
    }

    function renderAll() {
        renderClientPicker();
        renderItemsEditor();
        renderSummaryAndPreview();
        renderRecentDrafts();
        renderRecentDocuments();
    }

    window.addEventListener("beforeunload", flushCurrentDocPersist);

    return {
        refresh: (options = {}) => {
            if (options.forceCurrentDoc) {
                window.clearTimeout(persistTimer);
                persistTimer = null;
                docState = cloneDoc(normalizeDoc(currentDocs[type], type));
                syncForm();
            }
            renderClientPicker();
            renderRecentDrafts();
            renderRecentDocuments();
            renderSummaryAndPreview();
        },
        flush: flushCurrentDocPersist
    };
}

function initCustomersPage() {
    const form = byId("customerForm");
    const customerId = byId("customerId");
    const customerName = byId("customerName");
    const customerTitle = byId("customerTitle");
    const customerPhone = byId("customerPhone");
    const customerEmail = byId("customerEmail");
    const customerAddress = byId("customerAddress");
    const customerVatNumber = byId("customerVatNumber");
    const customerSearchInput = byId("customerSearchInput");
    const clearCustomerBtn = byId("clearCustomerBtn");
    const customersList = byId("customersList");

    renderCustomersPage();

    if (form) {
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            if (!customerName.value.trim()) {
                showToast("أدخل اسم العميل أولًا");
                return;
            }

            const customer = normalizeCustomer({
                id: customerId.value || createId("customer"),
                name: customerName.value.trim(),
                title: customerTitle.value.trim(),
                phone: customerPhone.value.trim(),
                email: customerEmail.value.trim(),
                address: customerAddress.value.trim(),
                vatNumber: customerVatNumber ? customerVatNumber.value.trim() : "",
                updatedAt: new Date().toISOString()
            });

            const isEdit = customers.some(c => c.id === customer.id);
            customers = [customer, ...customers.filter((entry) => entry.id !== customer.id)];
            saveCustomers();
            logActivity(isEdit ? "update" : "create", "customer", customer.id, customer.name, isEdit ? "تعديل بيانات العميل" : "إضافة عميل جديد");
            form.reset();
            customerId.value = "";
            renderCustomersPage();
            showToast("تم حفظ العميل");
        });
    }

    addClick(clearCustomerBtn, () => {
        form?.reset();
        if (customerId) {
            customerId.value = "";
        }
    });

    if (customerSearchInput) {
        customerSearchInput.addEventListener("input", () => renderCustomersPage());
    }

    if (customersList) {
        customersList.addEventListener("click", (event) => {
            const card = event.target.closest(".entity-card");
            if (!card) {
                return;
            }

            const id = card.dataset.id;
            const action = event.target.dataset.action;
            const customer = findCustomerById(id);
            if (!customer) {
                return;
            }

            if (action === "edit-customer") {
                customerId.value = customer.id;
                customerName.value = customer.name;
                customerTitle.value = customer.title;
                customerPhone.value = customer.phone;
                customerEmail.value = customer.email;
                customerAddress.value = customer.address;
                if (customerVatNumber) customerVatNumber.value = customer.vatNumber || "";
                showToast("تم تحميل بيانات العميل إلى النموذج");
            }

            if (action === "delete-customer") {
                if (!confirmDestructiveAction("سيتم حذف العميل من القائمة. هل تريد المتابعة؟")) {
                    return;
                }
                const deletedCustomer = customers.find(c => c.id === id);
                customers = customers.filter((entry) => entry.id !== id);
                saveCustomers();
                logActivity("delete", "customer", id, deletedCustomer?.name || "", "حذف العميل");
                renderCustomersPage();
                showToast("تم حذف العميل");
            }
        });
    }

    function renderCustomersPage() {
        const invoicesCount = ledger.filter((doc) => doc.documentType === "invoice").length;
        const receivables = ledger
            .filter((doc) => doc.documentType === "invoice" && doc.documentStatus !== "settled")
            .reduce((sum, doc) => sum + getDocumentTotal(doc), 0);

        setText("customersMetricCount", formatNumber(customers.length));
        setText("customersMetricInvoices", formatNumber(invoicesCount));
        setText("customersMetricReceivables", formatMoney(receivables));
        setText("customersUpdatedAt", formatDateTime(uiState.lastUpdatedAt));

        const searchTerm = (customerSearchInput ? customerSearchInput.value : "").trim().toLowerCase();
        const filtered = searchTerm
            ? customers.filter((c) => {
                const haystack = [c.name, c.title, c.phone, c.email, c.address, c.vatNumber].join(" ").toLowerCase();
                return haystack.includes(searchTerm);
            })
            : customers;

        setText("customersCountHint", searchTerm
            ? `${formatNumber(filtered.length)} من ${formatNumber(customers.length)} عميل`
            : `${formatNumber(customers.length)} عميل`
        );

        if (!filtered.length) {
            customersList.innerHTML = searchTerm
                ? '<div class="empty-state">لا توجد نتائج مطابقة للبحث.</div>'
                : '<div class="empty-state">لا يوجد عملاء.</div>';
            return;
        }

        customersList.innerHTML = filtered.map((customer) => {
            const stats = getCustomerStats(customer);
            return `
                <article class="entity-card" data-id="${escapeAttribute(customer.id)}">
                    <div class="entity-head">
                        <div>
                            <h3>${escapeHtml(customer.name || "بدون اسم")}</h3>
                            <p>${escapeHtml(customer.title || "بدون جهة")}</p>
                        </div>
                        <span class="status-badge status-badge-neutral">${formatNumber(stats.docsCount)} سجل</span>
                    </div>
                    <div class="entity-meta">
                        <span>${escapeHtml(customer.phone || "بدون هاتف")}</span>
                        <span>${escapeHtml(customer.email || "بدون بريد")}</span>
                        ${customer.vatNumber ? `<span>ض: ${escapeHtml(customer.vatNumber)}</span>` : ""}
                    </div>
                    <div class="entity-stats">
                        <div>
                            <span>الفواتير</span>
                            <strong>${formatNumber(stats.invoicesCount)}</strong>
                        </div>
                        <div>
                            <span>المستحقات</span>
                            <strong>${formatMoney(stats.receivables)}</strong>
                        </div>
                    </div>
                    <div class="entity-actions">
                        <a class="table-btn" href="invoices.html?client=${encodeURIComponent(customer.id)}">فاتورة</a>
                        <a class="table-btn" href="quotes.html?client=${encodeURIComponent(customer.id)}">عرض سعر</a>
                        <a class="table-btn" href="statements.html?client=customer:${encodeURIComponent(customer.id)}">كشف الحساب</a>
                        <button type="button" class="table-btn" data-action="edit-customer">تعديل</button>
                        <button type="button" class="table-btn table-btn-danger" data-action="delete-customer">حذف</button>
                    </div>
                </article>
            `;
        }).join("");
    }

    return {
        refresh: renderCustomersPage,
        flush: () => {}
    };
}

function initExpensesPage() {
    const form = byId("expenseForm");
    const expenseDate = byId("expenseDate");
    const expenseCategory = byId("expenseCategory");
    const expenseVendor = byId("expenseVendor");
    const expenseAmount = byId("expenseAmount");
    const expenseNotes = byId("expenseNotes");
    const expensesBody = byId("expensesTableBody");
    const expenseEditId = byId("expenseEditId");
    const expenseFormTitle = byId("expenseFormTitle");
    const expenseSubmitBtn = byId("expenseSubmitBtn");
    const expenseCancelEdit = byId("expenseCancelEdit");

    if (expenseDate) {
        expenseDate.value = getToday();
    }
    renderExpensesPage();

    function enterEditMode(expense) {
        if (!form || !expenseEditId) return;
        expenseEditId.value = expense.id;
        if (expenseDate) expenseDate.value = expense.date || getToday();
        if (expenseCategory) expenseCategory.value = expense.category || "operations";
        if (expenseVendor) expenseVendor.value = expense.vendor || "";
        if (expenseAmount) expenseAmount.value = expense.amount || "";
        if (expenseNotes) expenseNotes.value = expense.notes || "";
        if (expenseFormTitle) expenseFormTitle.textContent = "تعديل المصروف";
        if (expenseSubmitBtn) expenseSubmitBtn.textContent = "تحديث المصروف";
        if (expenseCancelEdit) expenseCancelEdit.style.display = "";
        form.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function exitEditMode() {
        if (!form) return;
        if (expenseEditId) expenseEditId.value = "";
        form.reset();
        if (expenseDate) expenseDate.value = getToday();
        if (expenseCategory) expenseCategory.value = "operations";
        if (expenseFormTitle) expenseFormTitle.textContent = "إضافة مصروف جديد";
        if (expenseSubmitBtn) expenseSubmitBtn.textContent = "حفظ المصروف";
        if (expenseCancelEdit) expenseCancelEdit.style.display = "none";
    }

    if (expenseCancelEdit) {
        expenseCancelEdit.addEventListener("click", exitEditMode);
    }

    if (form) {
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const amount = toNumber(expenseAmount.value, 0);
            if (amount <= 0) {
                showToast("أدخل مبلغًا صحيحًا للمصروف");
                return;
            }

            const editId = expenseEditId ? expenseEditId.value : "";

            if (editId) {
                const idx = expenses.findIndex((e) => e.id === editId);
                if (idx !== -1) {
                    expenses[idx] = normalizeExpense({
                        ...expenses[idx],
                        date: expenseDate.value || getToday(),
                        category: expenseCategory.value,
                        vendor: expenseVendor.value.trim(),
                        amount,
                        notes: expenseNotes.value.trim()
                    });
                    saveExpenses();
                    logActivity("update", "expense", expenses[idx].id, expenses[idx].vendor || expenseCategoryLabels[expenses[idx].category], "تعديل المصروف");
                    exitEditMode();
                    renderExpensesPage();
                    showToast("تم تحديث المصروف");
                    return;
                }
            }

            expenses = [
                normalizeExpense({
                    id: createId("expense"),
                    date: expenseDate.value || getToday(),
                    category: expenseCategory.value,
                    vendor: expenseVendor.value.trim(),
                    amount,
                    notes: expenseNotes.value.trim(),
                    createdAt: new Date().toISOString()
                }),
                ...expenses
            ];
            saveExpenses();
            logActivity("create", "expense", expenses[0].id, expenses[0].vendor || expenseCategoryLabels[expenses[0].category], "إضافة مصروف جديد");
            exitEditMode();
            renderExpensesPage();
            showToast("تم حفظ المصروف");
        });
    }

    if (expensesBody) {
        expensesBody.addEventListener("click", (event) => {
            const action = event.target.dataset.action;
            const row = event.target.closest("tr[data-id]");
            if (!row) return;

            if (action === "edit-expense") {
                const expense = expenses.find((e) => e.id === row.dataset.id);
                if (expense) enterEditMode(expense);
                return;
            }

            if (action !== "delete-expense") {
                return;
            }
            if (!confirmDestructiveAction("سيتم حذف هذا المصروف نهائيًا. هل تريد المتابعة؟")) {
                return;
            }
            const deletedExpenseId = row.dataset.id;
            expenses = expenses.filter((expense) => expense.id !== deletedExpenseId);
            saveExpenses();
            logActivity("delete", "expense", deletedExpenseId, "", "حذف مصروف");
            if (expenseEditId && expenseEditId.value === deletedExpenseId) exitEditMode();
            renderExpensesPage();
            showToast("تم حذف المصروف");
        });
    }

    function renderExpensesPage() {
        const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
        const thisMonth = expenses
            .filter((expense) => (expense.date || "").slice(0, 7) === getToday().slice(0, 7))
            .reduce((sum, expense) => sum + expense.amount, 0);

        setText("expensesMetricTotal", formatMoney(total));
        setText("expensesMetricMonth", formatMoney(thisMonth));
        setText("expensesMetricCount", formatNumber(expenses.length));
        setText("expensesUpdatedAt", formatDateTime(uiState.lastUpdatedAt));
        setText("expensesCountHint", `${formatNumber(expenses.length)} سجل`);

        if (!expensesBody) {
            return;
        }

        expensesBody.innerHTML = expenses.length
            ? expenses.map((expense) => `
                <tr data-id="${escapeAttribute(expense.id)}">
                    <td>${formatDate(expense.date)}</td>
                    <td>${escapeHtml(expenseCategoryLabels[expense.category] || expense.category)}</td>
                    <td>${escapeHtml(expense.vendor || "-")}</td>
                    <td class="font-numbers">${formatMoney(expense.amount)}</td>
                    <td>${escapeHtml(expense.notes || "-")}</td>
                    <td>
                        <button type="button" class="table-btn" data-action="edit-expense">تعديل</button>
                        <button type="button" class="table-btn table-btn-danger" data-action="delete-expense">حذف</button>
                    </td>
                </tr>
            `).join("")
            : renderEmptyRow(6, "لا توجد مصروفات مسجلة بعد.");
    }

    return {
        refresh: renderExpensesPage,
        flush: () => {}
    };
}

function initContractsPage() {
    const form = byId("contractForm");
    const saveBtn = byId("saveContractBtn");
    const newBtn = byId("newContractBtn");
    const printBtn = byId("contractPrintBtn");
    const pdfBtn = byId("contractDownloadPdfBtn");
    const preview = byId("contractPreview");
    const savedList = byId("savedContractsList");
    const searchInput = byId("contractSearchInput");
    const clientPicker = byId("contractClientPicker");

    const fieldMap = {
        contractNumber: byId("contractNumber"),
        contractDate: byId("contractDate"),
        contractValue: byId("contractValue"),
        contractCurrency: byId("contractCurrency"),
        contractCompanyName: byId("contractCompanyName"),
        contractCompanyPhone: byId("contractCompanyPhone"),
        contractCompanyEmail: byId("contractCompanyEmail"),
        contractClientName: byId("contractClientName"),
        contractClientTitle: byId("contractClientTitle"),
        contractClientPhone: byId("contractClientPhone"),
        contractClientEmail: byId("contractClientEmail"),
        contractClientAddress: byId("contractClientAddress"),
        contractSubject: byId("contractSubject"),
        contractBody: byId("contractBody"),
        contractSignatory1: byId("contractSignatory1"),
        contractSignatory2: byId("contractSignatory2")
    };

    let editingId = null;

    function getFormState() {
        return normalizeContract({
            id: editingId || crypto.randomUUID(),
            contractNumber: (fieldMap.contractNumber?.value || "").trim(),
            contractDate: fieldMap.contractDate?.value || "",
            contractValue: toNumber(fieldMap.contractValue?.value, 0),
            currency: fieldMap.contractCurrency?.value || "SAR",
            companyName: (fieldMap.contractCompanyName?.value || "").trim(),
            companyPhone: (fieldMap.contractCompanyPhone?.value || "").trim(),
            companyEmail: (fieldMap.contractCompanyEmail?.value || "").trim(),
            clientName: (fieldMap.contractClientName?.value || "").trim(),
            clientTitle: (fieldMap.contractClientTitle?.value || "").trim(),
            clientPhone: (fieldMap.contractClientPhone?.value || "").trim(),
            clientEmail: (fieldMap.contractClientEmail?.value || "").trim(),
            clientAddress: (fieldMap.contractClientAddress?.value || "").trim(),
            subject: (fieldMap.contractSubject?.value || "").trim(),
            body: (fieldMap.contractBody?.value || "").trim(),
            signatory1: (fieldMap.contractSignatory1?.value || "").trim(),
            signatory2: (fieldMap.contractSignatory2?.value || "").trim()
        });
    }

    function loadIntoForm(contract) {
        editingId = contract.id;
        if (fieldMap.contractNumber) fieldMap.contractNumber.value = contract.contractNumber;
        if (fieldMap.contractDate) fieldMap.contractDate.value = contract.contractDate;
        if (fieldMap.contractValue) fieldMap.contractValue.value = contract.contractValue || "";
        if (fieldMap.contractCurrency) fieldMap.contractCurrency.value = contract.currency;
        if (fieldMap.contractCompanyName) fieldMap.contractCompanyName.value = contract.companyName;
        if (fieldMap.contractCompanyPhone) fieldMap.contractCompanyPhone.value = contract.companyPhone;
        if (fieldMap.contractCompanyEmail) fieldMap.contractCompanyEmail.value = contract.companyEmail;
        if (fieldMap.contractClientName) fieldMap.contractClientName.value = contract.clientName;
        if (fieldMap.contractClientTitle) fieldMap.contractClientTitle.value = contract.clientTitle;
        if (fieldMap.contractClientPhone) fieldMap.contractClientPhone.value = contract.clientPhone;
        if (fieldMap.contractClientEmail) fieldMap.contractClientEmail.value = contract.clientEmail;
        if (fieldMap.contractClientAddress) fieldMap.contractClientAddress.value = contract.clientAddress;
        if (fieldMap.contractSubject) fieldMap.contractSubject.value = contract.subject;
        if (fieldMap.contractBody) fieldMap.contractBody.value = contract.body;
        if (fieldMap.contractSignatory1) fieldMap.contractSignatory1.value = contract.signatory1;
        if (fieldMap.contractSignatory2) fieldMap.contractSignatory2.value = contract.signatory2;
        renderPreview();
    }

    function clearForm() {
        editingId = null;
        if (form) form.reset();
        const co = getCompanyDefaults();
        if (fieldMap.contractNumber) fieldMap.contractNumber.value = previewNumber("contract");
        if (fieldMap.contractDate) fieldMap.contractDate.value = getToday();
        if (fieldMap.contractCompanyName) fieldMap.contractCompanyName.value = co.name;
        if (fieldMap.contractCompanyPhone) fieldMap.contractCompanyPhone.value = co.phone;
        if (fieldMap.contractCompanyEmail) fieldMap.contractCompanyEmail.value = co.email;
        renderPreview();
    }

    function renderPreview() {
        const state = getFormState();
        setText("previewContractNumber", state.contractNumber || "-");
        setText("previewContractDate", formatDate(state.contractDate));
        setText("previewContractValue", state.contractValue ? formatMoney(state.contractValue, state.currency) : "-");
        setText("previewContractCurrency", state.currency);
        setText("previewContractCompany", state.companyName || "UTraffic");
        setHtml("previewContractCompanyMeta", formatMultiline([state.companyPhone, state.companyEmail]));
        setText("previewContractClient", state.clientName || "اسم العميل");
        setHtml("previewContractClientMeta", formatMultiline([state.clientTitle, state.clientPhone, state.clientEmail, state.clientAddress]));
        setText("previewContractSubject", state.subject || "موضوع العقد");

        const bodyEl = byId("previewContractBody");
        if (bodyEl) {
            bodyEl.innerHTML = state.body
                ? escapeHtml(state.body).replace(/\n/g, "<br>")
                : '<span style="color: var(--ink-muted)">نص العقد سيظهر هنا...</span>';
        }

        setText("previewSignatory1", state.signatory1 || "ممثل الطرف الأول");
        setText("previewSignatory2", state.signatory2 || "ممثل الطرف الثاني");
        setText("previewContractFooter", [state.companyEmail, state.companyPhone].filter(Boolean).join(" - ") || "UTraffic");
    }

    function renderMetrics() {
        const totalValue = contracts.reduce((sum, c) => sum + toNumber(c.contractValue, 0), 0);
        setText("contractsMetricTotal", formatNumber(contracts.length));
        setText("contractsMetricValue", formatMoney(totalValue));
        setText("contractsMetricActive", formatNumber(contracts.length));
        setText("contractsUpdatedAt", formatDateTime(uiState.lastUpdatedAt));
    }

    function renderSavedContracts() {
        if (!savedList) return;

        const searchTerm = (searchInput ? searchInput.value : "").trim().toLowerCase();
        const filtered = searchTerm
            ? contracts.filter((c) => {
                const haystack = [c.contractNumber, c.clientName, c.subject].join(" ").toLowerCase();
                return haystack.includes(searchTerm);
            })
            : contracts;

        setText("contractsCountHint", searchTerm
            ? `${formatNumber(filtered.length)} من ${formatNumber(contracts.length)} عقد`
            : `${formatNumber(contracts.length)} عقد`
        );

        if (!filtered.length) {
            savedList.innerHTML = searchTerm
                ? '<div class="empty-state">لا توجد نتائج مطابقة.</div>'
                : '<div class="empty-state">لا توجد عقود محفوظة.</div>';
            return;
        }

        savedList.innerHTML = filtered.map((contract) => `
            <article class="saved-doc" data-id="${escapeAttribute(contract.id)}">
                <div class="saved-doc-head">
                    <h3>${escapeHtml(contract.contractNumber || "-")}</h3>
                    <span class="status-badge status-badge-neutral">${escapeHtml(formatDate(contract.contractDate))}</span>
                </div>
                <div class="saved-doc-meta">
                    <p>${escapeHtml(contract.clientName || "بدون عميل")}</p>
                    <p>${contract.contractValue ? formatMoney(contract.contractValue, contract.currency) : "-"}</p>
                </div>
                <div class="saved-doc-actions">
                    <button type="button" class="load-btn" data-action="load-contract">تحميل</button>
                    <button type="button" class="delete-btn" data-action="delete-contract">حذف</button>
                </div>
            </article>
        `).join("");
    }

    function renderClientPicker() {
        if (!clientPicker) return;
        clientPicker.innerHTML = '<option value="">عميل جديد</option>' +
            customers.map((c) => `<option value="${escapeAttribute(c.id)}">${escapeHtml(c.name || c.title || "عميل")}</option>`).join("");
    }

    function renderAll() {
        renderPreview();
        renderMetrics();
        renderSavedContracts();
        renderClientPicker();
    }

    // Event listeners
    if (form) {
        form.addEventListener("input", renderPreview);
    }

    if (searchInput) {
        searchInput.addEventListener("input", () => renderSavedContracts());
    }

    if (clientPicker) {
        clientPicker.addEventListener("change", (event) => {
            const customer = customers.find((c) => c.id === event.target.value);
            if (customer) {
                if (fieldMap.contractClientName) fieldMap.contractClientName.value = customer.name || "";
                if (fieldMap.contractClientTitle) fieldMap.contractClientTitle.value = customer.title || "";
                if (fieldMap.contractClientPhone) fieldMap.contractClientPhone.value = customer.phone || "";
                if (fieldMap.contractClientEmail) fieldMap.contractClientEmail.value = customer.email || "";
                if (fieldMap.contractClientAddress) fieldMap.contractClientAddress.value = customer.address || "";
                renderPreview();
            }
        });
    }

    addClick(saveBtn, () => {
        const state = getFormState();
        if (!state.clientName && !state.subject) {
            showToast("أدخل بيانات العقد قبل الحفظ");
            return;
        }

        const existingIndex = contracts.findIndex((c) => c.id === state.id);
        state.savedAt = new Date().toISOString();

        if (existingIndex < 0) {
            state.contractNumber = generateNextNumber("contract");
            if (fieldMap.contractNumber) fieldMap.contractNumber.value = state.contractNumber;
            contracts.unshift(state);
        } else {
            contracts[existingIndex] = state;
        }

        saveContracts();
        updateCompanyDefaults(state.companyName, state.companyPhone, state.companyEmail);
        logActivity("save", "contract", state.id, state.contractNumber, existingIndex >= 0 ? "تعديل عقد" : "حفظ عقد جديد");
        renderAll();
        showToast(existingIndex >= 0 ? "تم تحديث العقد" : "تم حفظ العقد");
    });

    addClick(newBtn, () => {
        clearForm();
        renderAll();
        showToast("تم تجهيز عقد جديد");
    });

    addClick(printBtn, async () => {
        if (!preview) return;
        try {
            const canvas = await renderDocumentCanvas(preview);
            const imageDataUrl = canvas.toDataURL("image/png");
            const printWindow = window.open("", "_blank");
            if (printWindow) {
                printWindow.document.write(buildPrintableMarkup(imageDataUrl));
                printWindow.document.close();
            }
        } catch (error) {
            console.error(error);
            showToast("تعذرت الطباعة");
        }
    });

    addClick(pdfBtn, async () => {
        if (!preview) return;
        try {
            const state = getFormState();
            await downloadPdfFromPreview(preview, {
                documentType: "contract",
                documentNumber: state.contractNumber,
                id: state.id
            });
            showToast("تم تنزيل PDF");
        } catch (error) {
            console.error(error);
            showToast("تعذر تنزيل PDF");
        }
    });

    if (savedList) {
        savedList.addEventListener("click", (event) => {
            const card = event.target.closest(".saved-doc");
            if (!card) return;
            const id = card.dataset.id;

            if (event.target.closest("[data-action='load-contract']")) {
                const contract = contracts.find((c) => c.id === id);
                if (contract) {
                    loadIntoForm(contract);
                    renderAll();
                    showToast("تم تحميل العقد");
                }
            }

            if (event.target.closest("[data-action='delete-contract']")) {
                if (!confirmDestructiveAction("هل تريد حذف هذا العقد؟")) return;
                const deleted = contracts.find((c) => c.id === id);
                contracts = contracts.filter((c) => c.id !== id);
                saveContracts();
                logActivity("delete", "contract", id, deleted?.contractNumber || "", "حذف عقد");
                if (editingId === id) clearForm();
                renderAll();
                showToast("تم حذف العقد");
            }
        });
    }

    // Set defaults for new contract on page load
    const company = getCompanyDefaults();
    if (fieldMap.contractNumber && !fieldMap.contractNumber.value) {
        fieldMap.contractNumber.value = previewNumber("contract");
    }
    if (fieldMap.contractDate && !fieldMap.contractDate.value) {
        fieldMap.contractDate.value = getToday();
    }
    if (fieldMap.contractCompanyName && !fieldMap.contractCompanyName.value) {
        fieldMap.contractCompanyName.value = company.name;
    }
    if (fieldMap.contractCompanyPhone && !fieldMap.contractCompanyPhone.value) {
        fieldMap.contractCompanyPhone.value = company.phone;
    }
    if (fieldMap.contractCompanyEmail && !fieldMap.contractCompanyEmail.value) {
        fieldMap.contractCompanyEmail.value = company.email;
    }

    renderAll();

    return {
        refresh: () => renderAll(),
        flush: () => {}
    };
}

function initStatementsPage() {
    const params = new URLSearchParams(window.location.search);
    const clientFilter = byId("statementClientFilter");
    const docTypeFilter = byId("statementDocTypeFilter");
    const statusFilter = byId("statementStatusFilter");
    const searchInput = byId("statementSearchInput");
    const ledgerBody = byId("ledgerTableBody");
    const statementBody = byId("statementTableBody");

    if (params.get("client")) {
        uiState.statementClientFilter = params.get("client");
        saveUiState();
    }

    renderStatementOptions();
    renderStatementsPage();

    if (clientFilter) {
        clientFilter.addEventListener("change", (event) => {
            uiState.statementClientFilter = event.target.value;
            saveUiState();
            renderStatementsPage();
        });
    }

    if (docTypeFilter) {
        docTypeFilter.addEventListener("change", (event) => {
            uiState.statementDocTypeFilter = event.target.value;
            saveUiState();
            renderStatementsPage();
        });
    }

    if (statusFilter) {
        statusFilter.addEventListener("change", (event) => {
            uiState.statementStatusFilter = event.target.value;
            saveUiState();
            renderStatementsPage();
        });
    }

    if (searchInput) {
        searchInput.addEventListener("input", () => renderStatementsPage());
    }

    function renderStatementOptions() {
        const options = [
            '<option value="">جميع العملاء</option>',
            ...customers.map((customer) => `<option value="customer:${customer.id}">${escapeHtml(customer.name || customer.title || "عميل")}</option>`)
        ];

        const selectedExists = customers.some((customer) => `customer:${customer.id}` === uiState.statementClientFilter);
        if (uiState.statementClientFilter && uiState.statementClientFilter.startsWith("customer:") && !selectedExists) {
            uiState.statementClientFilter = "";
            saveUiState();
        }

        if (clientFilter) {
            clientFilter.innerHTML = options.join("");
            clientFilter.value = uiState.statementClientFilter || "";
        }
        if (docTypeFilter) {
            docTypeFilter.value = uiState.statementDocTypeFilter || "";
        }
        if (statusFilter) {
            statusFilter.value = uiState.statementStatusFilter || "";
        }
    }

    function getFilteredLedger() {
        const searchTerm = (searchInput ? searchInput.value : "").trim().toLowerCase();
        return ledger.filter((doc) => {
            if (uiState.statementDocTypeFilter && doc.documentType !== uiState.statementDocTypeFilter) {
                return false;
            }
            if (uiState.statementStatusFilter && doc.documentStatus !== uiState.statementStatusFilter) {
                return false;
            }
            if (uiState.statementClientFilter && uiState.statementClientFilter.startsWith("customer:")) {
                const customer = findCustomerById(uiState.statementClientFilter.replace("customer:", ""));
                if (!documentBelongsToCustomer(doc, customer)) return false;
            }
            if (searchTerm) {
                const haystack = [doc.documentNumber, doc.clientName, doc.notes].join(" ").toLowerCase();
                if (!haystack.includes(searchTerm)) return false;
            }
            return true;
        });
    }

    function renderStatementsPage() {
        const filtered = getFilteredLedger();
        const invoices = filtered.filter((doc) => doc.documentType === "invoice");
        const pending = invoices
            .filter((doc) => doc.documentStatus !== "settled")
            .reduce((sum, doc) => sum + getDocumentTotal(doc), 0);
        const settled = invoices
            .filter((doc) => doc.documentStatus === "settled")
            .reduce((sum, doc) => sum + getDocumentTotal(doc), 0);
        const quotesCount = filtered.filter((doc) => doc.documentType === "quote").length;

        setText("statementMetricTotal", formatNumber(filtered.length));
        setText("statementMetricPending", formatMoney(pending));
        setText("statementMetricSettled", formatMoney(settled));
        setText("statementMetricQuotes", formatNumber(quotesCount));
        setText("ledgerCountHint", `${formatNumber(filtered.length)} سجل`);
        setText("statementSelectedLabel", getSelectedStatementLabel());

        if (ledgerBody) {
            ledgerBody.innerHTML = filtered.length
                ? filtered.map((doc) => `
                    <tr>
                        <td>${documentLabels[doc.documentType]}</td>
                        <td>${escapeHtml(doc.documentNumber || "-")}</td>
                        <td>${escapeHtml(doc.clientName || "-")}</td>
                        <td>${formatDate(doc.issueDate)}</td>
                        <td>${formatDate(doc.dueDate)}</td>
                        <td>${renderStatusBadge(doc.documentType, doc.documentStatus)}</td>
                        <td class="font-numbers">${formatMoney(getDocumentTotal(doc), doc.currency || "SAR")}</td>
                        <td><a class="table-btn" href="${doc.documentType === "invoice" ? "invoices.html" : "quotes.html"}?doc=${encodeURIComponent(doc.id)}">فتح</a></td>
                    </tr>
                `).join("")
                : renderEmptyRow(8, "لا توجد سجلات مطابقة للفلاتر الحالية.");
        }

        if (statementBody) {
            statementBody.innerHTML = filtered.length
                ? filtered.map((doc) => `
                    <tr>
                        <td>${documentLabels[doc.documentType]}</td>
                        <td>${escapeHtml(doc.documentNumber || "-")}</td>
                        <td>${renderStatusBadge(doc.documentType, doc.documentStatus)}</td>
                        <td>${formatDate(doc.issueDate)}</td>
                        <td class="font-numbers">${formatMoney(getDocumentTotal(doc), doc.currency || "SAR")}</td>
                        <td>${escapeHtml(doc.notes || "-")}</td>
                    </tr>
                `).join("")
                : renderEmptyRow(6, "لا توجد حركات لعرضها.");
        }
    }

    function getSelectedStatementLabel() {
        if (!uiState.statementClientFilter) {
            return "جميع العملاء";
        }
        if (uiState.statementClientFilter.startsWith("customer:")) {
            const customer = findCustomerById(uiState.statementClientFilter.replace("customer:", ""));
            return customer ? customer.name || customer.title || "عميل" : "عميل غير موجود";
        }
        return "عميل محدد";
    }

    return {
        refresh: () => {
            renderStatementOptions();
            renderStatementsPage();
        },
        flush: () => {}
    };
}

function initReportsPage() {
    const monthSelect = byId("reportMonth");
    const yearSelect = byId("reportYear");
    const incomeStatementBody = byId("incomeStatementBody");
    const categoryBreakdown = byId("categoryBreakdown");
    const trendTableBody = byId("trendTableBody");

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    populateYearOptions(yearSelect, currentYear);

    const selectedYear = uiState.reportYear ? parseInt(uiState.reportYear, 10) : currentYear;
    const selectedMonth = uiState.reportMonth ? parseInt(uiState.reportMonth, 10) : currentMonth;

    if (monthSelect) {
        monthSelect.value = String(selectedMonth);
    }
    if (yearSelect) {
        yearSelect.value = String(selectedYear);
    }

    if (monthSelect) {
        monthSelect.addEventListener("change", () => {
            uiState.reportMonth = monthSelect.value;
            saveUiState();
            renderReportsPage();
        });
    }

    if (yearSelect) {
        yearSelect.addEventListener("change", () => {
            uiState.reportYear = yearSelect.value;
            saveUiState();
            renderReportsPage();
        });
    }

    function populateYearOptions(select, defaultYear) {
        if (!select) {
            return;
        }

        const allYears = new Set();
        allYears.add(defaultYear);
        ledger.forEach((doc) => {
            if (doc.issueDate) {
                allYears.add(parseInt(doc.issueDate.slice(0, 4), 10));
            }
        });
        expenses.forEach((exp) => {
            if (exp.date) {
                allYears.add(parseInt(exp.date.slice(0, 4), 10));
            }
        });

        const sorted = [...allYears].filter((y) => y > 2000).sort((a, b) => b - a);
        select.innerHTML = sorted.map((y) => `<option value="${y}">${y}</option>`).join("");
    }

    function getSelectedPeriod() {
        const year = parseInt((yearSelect ? yearSelect.value : uiState.reportYear) || currentYear, 10);
        const month = parseInt((monthSelect ? monthSelect.value : uiState.reportMonth) || currentMonth, 10);
        return { year, month };
    }

    function getMonthKey(year, month) {
        return `${year}-${String(month).padStart(2, "0")}`;
    }

    function getArabicMonthName(month) {
        const names = ["", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
        return names[month] || "";
    }

    function getMonthlySettledInvoices(year, month) {
        const key = getMonthKey(year, month);
        return ledger.filter((doc) =>
            doc.documentType === "invoice" &&
            doc.documentStatus === "settled" &&
            (doc.issueDate || "").slice(0, 7) === key
        );
    }

    function getMonthlyRevenue(year, month) {
        return getMonthlySettledInvoices(year, month).reduce((sum, doc) => sum + getDocumentTotal(doc), 0);
    }

    function getMonthlyExpensesList(year, month) {
        const key = getMonthKey(year, month);
        return expenses.filter((exp) => (exp.date || "").slice(0, 7) === key);
    }

    function getMonthlyExpensesTotal(year, month) {
        return getMonthlyExpensesList(year, month).reduce((sum, exp) => sum + exp.amount, 0);
    }

    function getMonthlyExpensesByCategory(year, month) {
        const list = getMonthlyExpensesList(year, month);
        const grouped = {};
        for (const exp of list) {
            const cat = exp.category || "other";
            grouped[cat] = (grouped[cat] || 0) + exp.amount;
        }
        return grouped;
    }

    function getLast12MonthsData() {
        const { year: selYear, month: selMonth } = getSelectedPeriod();
        const result = [];
        let y = selYear;
        let m = selMonth;
        for (let i = 0; i < 12; i++) {
            const revenue = getMonthlyRevenue(y, m);
            const expTotal = getMonthlyExpensesTotal(y, m);
            const invoiceCount = getMonthlySettledInvoices(y, m).length;
            result.push({
                year: y,
                month: m,
                revenue,
                expenses: expTotal,
                net: revenue - expTotal,
                invoiceCount
            });
            m--;
            if (m < 1) {
                m = 12;
                y--;
            }
        }
        return result;
    }

    const SVG_NS = "http://www.w3.org/2000/svg";
    const CHART_COLORS = [
        "#6e63d3", "#63cfff", "#d6e35e", "#ff6b7b",
        "#ffb347", "#65d98e", "#e577a8", "#8bb4f7"
    ];

    renderReportsPage();

    function renderReportsPage() {
        const { year, month } = getSelectedPeriod();
        const revenue = getMonthlyRevenue(year, month);
        const expTotal = getMonthlyExpensesTotal(year, month);
        const net = revenue - expTotal;
        const invoiceCount = getMonthlySettledInvoices(year, month).length;
        const byCategory = getMonthlyExpensesByCategory(year, month);
        const periodLabel = `${getArabicMonthName(month)} ${year}`;

        setText("reportRevenue", formatMoney(revenue));
        setText("reportExpenses", formatMoney(expTotal));
        setText("reportNetProfit", formatMoney(net));
        setText("reportInvoiceCount", formatNumber(invoiceCount));
        setText("reportPeriodLabel", periodLabel);

        renderIncomeStatement(revenue, expTotal, net, byCategory);
        renderCategoryBreakdown(byCategory, expTotal);
        renderDonutChart(byCategory, expTotal);
        renderTrendTable();

        const trendData = getLast12MonthsData().slice().reverse();
        renderBarChart(trendData);
        renderLineChart(trendData);
    }

    /* ── Donut Chart ── */
    function renderDonutChart(byCategory, totalExpenses) {
        const container = byId("chartDonut");
        if (!container) return;

        const categoryKeys = Object.keys(expenseCategoryLabels);
        const slices = categoryKeys
            .map((key, i) => ({
                label: expenseCategoryLabels[key],
                value: byCategory[key] || 0,
                color: CHART_COLORS[i % CHART_COLORS.length]
            }))
            .filter(s => s.value > 0)
            .sort((a, b) => b.value - a.value);

        if (!slices.length || totalExpenses <= 0) {
            container.innerHTML = '<div class="empty-state">لا توجد بيانات.</div>';
            return;
        }

        const size = 220;
        const cx = size / 2;
        const cy = size / 2;
        const outerR = 95;
        const innerR = 58;

        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
        svg.setAttribute("class", "chart-donut-svg");

        let startAngle = -90;

        for (const slice of slices) {
            const angle = (slice.value / totalExpenses) * 360;
            const endAngle = startAngle + angle;

            const startRad = (startAngle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;

            const x1o = cx + outerR * Math.cos(startRad);
            const y1o = cy + outerR * Math.sin(startRad);
            const x2o = cx + outerR * Math.cos(endRad);
            const y2o = cy + outerR * Math.sin(endRad);

            const x1i = cx + innerR * Math.cos(endRad);
            const y1i = cy + innerR * Math.sin(endRad);
            const x2i = cx + innerR * Math.cos(startRad);
            const y2i = cy + innerR * Math.sin(startRad);

            const largeArc = angle > 180 ? 1 : 0;

            const d = [
                `M ${x1o} ${y1o}`,
                `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o}`,
                `L ${x1i} ${y1i}`,
                `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2i} ${y2i}`,
                "Z"
            ].join(" ");

            const path = document.createElementNS(SVG_NS, "path");
            path.setAttribute("d", d);
            path.setAttribute("fill", slice.color);
            path.setAttribute("class", "chart-donut-slice");

            const pct = ((slice.value / totalExpenses) * 100).toFixed(1);
            const title = document.createElementNS(SVG_NS, "title");
            title.textContent = `${slice.label}: ${formatMoney(slice.value)} (${pct}%)`;
            path.appendChild(title);

            svg.appendChild(path);
            startAngle = endAngle;
        }

        const centerText = document.createElementNS(SVG_NS, "text");
        centerText.setAttribute("x", cx);
        centerText.setAttribute("y", cy - 6);
        centerText.setAttribute("text-anchor", "middle");
        centerText.setAttribute("class", "chart-donut-center-label");
        centerText.textContent = "الإجمالي";

        const centerValue = document.createElementNS(SVG_NS, "text");
        centerValue.setAttribute("x", cx);
        centerValue.setAttribute("y", cy + 16);
        centerValue.setAttribute("text-anchor", "middle");
        centerValue.setAttribute("class", "chart-donut-center-value");
        centerValue.textContent = formatMoney(totalExpenses);

        svg.appendChild(centerText);
        svg.appendChild(centerValue);

        const legendHtml = slices.map(s => {
            const pct = ((s.value / totalExpenses) * 100).toFixed(1);
            return `<span class="chart-donut-legend-item">
                <span class="chart-legend-dot" style="background:${s.color}"></span>
                <span>${escapeHtml(s.label)}</span>
                <span class="font-numbers chart-donut-legend-pct">${pct}%</span>
            </span>`;
        }).join("");

        container.innerHTML = "";
        const svgWrap = document.createElement("div");
        svgWrap.className = "chart-donut-svg-wrap";
        svgWrap.appendChild(svg);
        container.appendChild(svgWrap);

        const legendEl = document.createElement("div");
        legendEl.className = "chart-donut-legend";
        legendEl.innerHTML = legendHtml;
        container.appendChild(legendEl);
    }

    /* ── Bar Chart (12 months) ── */
    function renderBarChart(trendData) {
        const container = byId("chartBar");
        if (!container) return;

        const hasData = trendData.some(d => d.revenue > 0 || d.expenses > 0);
        if (!hasData) {
            container.innerHTML = '<div class="empty-state">لا توجد بيانات.</div>';
            return;
        }

        const W = 780;
        const H = 320;
        const padTop = 20;
        const padBottom = 56;
        const padLeft = 70;
        const padRight = 16;
        const plotW = W - padLeft - padRight;
        const plotH = H - padTop - padBottom;

        const maxVal = Math.max(...trendData.map(d => Math.max(d.revenue, d.expenses)), 1);
        const niceMax = ceilNice(maxVal);

        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
        svg.setAttribute("class", "chart-bar-svg");
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

        const gridLines = 5;
        for (let i = 0; i <= gridLines; i++) {
            const y = padTop + (plotH / gridLines) * i;
            const val = niceMax - (niceMax / gridLines) * i;

            const line = document.createElementNS(SVG_NS, "line");
            line.setAttribute("x1", padLeft);
            line.setAttribute("x2", W - padRight);
            line.setAttribute("y1", y);
            line.setAttribute("y2", y);
            line.setAttribute("class", "chart-grid-line");
            svg.appendChild(line);

            const label = document.createElementNS(SVG_NS, "text");
            label.setAttribute("x", padLeft - 8);
            label.setAttribute("y", y + 4);
            label.setAttribute("text-anchor", "end");
            label.setAttribute("class", "chart-axis-label");
            label.textContent = shortMoney(val);
            svg.appendChild(label);
        }

        const n = trendData.length;
        const groupWidth = plotW / n;
        const barWidth = Math.min(groupWidth * 0.32, 28);
        const gap = 4;

        for (let i = 0; i < n; i++) {
            const d = trendData[i];
            const gx = padLeft + groupWidth * i + groupWidth / 2;

            const revH = niceMax > 0 ? (d.revenue / niceMax) * plotH : 0;
            const expH = niceMax > 0 ? (d.expenses / niceMax) * plotH : 0;

            if (revH > 0) {
                const rect = document.createElementNS(SVG_NS, "rect");
                rect.setAttribute("x", gx - barWidth - gap / 2);
                rect.setAttribute("y", padTop + plotH - revH);
                rect.setAttribute("width", barWidth);
                rect.setAttribute("height", revH);
                rect.setAttribute("rx", 4);
                rect.setAttribute("class", "chart-bar-revenue");

                const title = document.createElementNS(SVG_NS, "title");
                title.textContent = `${getArabicMonthName(d.month)} ${d.year} — إيرادات: ${formatMoney(d.revenue)}`;
                rect.appendChild(title);
                svg.appendChild(rect);
            }

            if (expH > 0) {
                const rect = document.createElementNS(SVG_NS, "rect");
                rect.setAttribute("x", gx + gap / 2);
                rect.setAttribute("y", padTop + plotH - expH);
                rect.setAttribute("width", barWidth);
                rect.setAttribute("height", expH);
                rect.setAttribute("rx", 4);
                rect.setAttribute("class", "chart-bar-expenses");

                const title = document.createElementNS(SVG_NS, "title");
                title.textContent = `${getArabicMonthName(d.month)} ${d.year} — مصروفات: ${formatMoney(d.expenses)}`;
                rect.appendChild(title);
                svg.appendChild(rect);
            }

            const monthLabel = document.createElementNS(SVG_NS, "text");
            monthLabel.setAttribute("x", gx);
            monthLabel.setAttribute("y", H - padBottom + 20);
            monthLabel.setAttribute("text-anchor", "middle");
            monthLabel.setAttribute("class", "chart-axis-label");
            monthLabel.textContent = getArabicMonthName(d.month).slice(0, 5);
            svg.appendChild(monthLabel);

            const yearLabel = document.createElementNS(SVG_NS, "text");
            yearLabel.setAttribute("x", gx);
            yearLabel.setAttribute("y", H - padBottom + 38);
            yearLabel.setAttribute("text-anchor", "middle");
            yearLabel.setAttribute("class", "chart-axis-label chart-axis-sub");
            yearLabel.textContent = d.year;
            svg.appendChild(yearLabel);
        }

        container.innerHTML = "";
        container.appendChild(svg);
    }

    /* ── Line Chart (net profit) ── */
    function renderLineChart(trendData) {
        const container = byId("chartLine");
        if (!container) return;

        const hasData = trendData.some(d => d.net !== 0);
        if (!hasData) {
            container.innerHTML = '<div class="empty-state">لا توجد بيانات.</div>';
            return;
        }

        const W = 780;
        const H = 280;
        const padTop = 24;
        const padBottom = 56;
        const padLeft = 70;
        const padRight = 16;
        const plotW = W - padLeft - padRight;
        const plotH = H - padTop - padBottom;

        const allNets = trendData.map(d => d.net);
        const minVal = Math.min(...allNets, 0);
        const maxVal = Math.max(...allNets, 0);
        const niceMin = floorNice(minVal);
        const niceMax = ceilNice(maxVal);
        const niceRange = niceMax - niceMin || 1;

        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
        svg.setAttribute("class", "chart-line-svg");
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

        const gridLines = 5;
        for (let i = 0; i <= gridLines; i++) {
            const y = padTop + (plotH / gridLines) * i;
            const val = niceMax - (niceRange / gridLines) * i;

            const line = document.createElementNS(SVG_NS, "line");
            line.setAttribute("x1", padLeft);
            line.setAttribute("x2", W - padRight);
            line.setAttribute("y1", y);
            line.setAttribute("y2", y);
            line.setAttribute("class", "chart-grid-line");
            svg.appendChild(line);

            const label = document.createElementNS(SVG_NS, "text");
            label.setAttribute("x", padLeft - 8);
            label.setAttribute("y", y + 4);
            label.setAttribute("text-anchor", "end");
            label.setAttribute("class", "chart-axis-label");
            label.textContent = shortMoney(val);
            svg.appendChild(label);
        }

        const zeroY = padTop + ((niceMax - 0) / niceRange) * plotH;
        if (niceMin < 0 && niceMax > 0) {
            const zeroLine = document.createElementNS(SVG_NS, "line");
            zeroLine.setAttribute("x1", padLeft);
            zeroLine.setAttribute("x2", W - padRight);
            zeroLine.setAttribute("y1", zeroY);
            zeroLine.setAttribute("y2", zeroY);
            zeroLine.setAttribute("class", "chart-zero-line");
            svg.appendChild(zeroLine);
        }

        const n = trendData.length;
        const stepX = n > 1 ? plotW / (n - 1) : 0;

        const points = trendData.map((d, i) => {
            const x = padLeft + stepX * i;
            const y = padTop + ((niceMax - d.net) / niceRange) * plotH;
            return { x, y, d };
        });

        if (points.length > 1) {
            const gradId = "netGrad";
            const defs = document.createElementNS(SVG_NS, "defs");
            const grad = document.createElementNS(SVG_NS, "linearGradient");
            grad.setAttribute("id", gradId);
            grad.setAttribute("x1", "0");
            grad.setAttribute("y1", "0");
            grad.setAttribute("x2", "0");
            grad.setAttribute("y2", "1");

            const stop1 = document.createElementNS(SVG_NS, "stop");
            stop1.setAttribute("offset", "0%");
            stop1.setAttribute("stop-color", "#65d98e");
            stop1.setAttribute("stop-opacity", "0.35");

            const stop2 = document.createElementNS(SVG_NS, "stop");
            stop2.setAttribute("offset", "100%");
            stop2.setAttribute("stop-color", "#65d98e");
            stop2.setAttribute("stop-opacity", "0.02");

            grad.appendChild(stop1);
            grad.appendChild(stop2);
            defs.appendChild(grad);
            svg.appendChild(defs);

            const areaPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
            const area = document.createElementNS(SVG_NS, "path");
            area.setAttribute("d", `${areaPath} L ${points[points.length - 1].x} ${padTop + plotH} L ${points[0].x} ${padTop + plotH} Z`);
            area.setAttribute("fill", `url(#${gradId})`);
            area.setAttribute("class", "chart-line-area");
            svg.appendChild(area);

            const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
            const polyline = document.createElementNS(SVG_NS, "path");
            polyline.setAttribute("d", linePath);
            polyline.setAttribute("fill", "none");
            polyline.setAttribute("class", "chart-line-path");
            svg.appendChild(polyline);
        }

        for (const pt of points) {
            const circle = document.createElementNS(SVG_NS, "circle");
            circle.setAttribute("cx", pt.x);
            circle.setAttribute("cy", pt.y);
            circle.setAttribute("r", 5);
            circle.setAttribute("class", pt.d.net >= 0 ? "chart-dot-positive" : "chart-dot-negative");

            const title = document.createElementNS(SVG_NS, "title");
            title.textContent = `${getArabicMonthName(pt.d.month)} ${pt.d.year} — صافي: ${formatMoney(pt.d.net)}`;
            circle.appendChild(title);
            svg.appendChild(circle);
        }

        for (let i = 0; i < n; i++) {
            const d = trendData[i];
            const x = padLeft + stepX * i;

            const monthLabel = document.createElementNS(SVG_NS, "text");
            monthLabel.setAttribute("x", x);
            monthLabel.setAttribute("y", H - padBottom + 20);
            monthLabel.setAttribute("text-anchor", "middle");
            monthLabel.setAttribute("class", "chart-axis-label");
            monthLabel.textContent = getArabicMonthName(d.month).slice(0, 5);
            svg.appendChild(monthLabel);

            const yearLabel = document.createElementNS(SVG_NS, "text");
            yearLabel.setAttribute("x", x);
            yearLabel.setAttribute("y", H - padBottom + 38);
            yearLabel.setAttribute("text-anchor", "middle");
            yearLabel.setAttribute("class", "chart-axis-label chart-axis-sub");
            yearLabel.textContent = d.year;
            svg.appendChild(yearLabel);
        }

        container.innerHTML = "";
        container.appendChild(svg);
    }

    /* ── Chart helpers ── */
    function ceilNice(val) {
        if (val <= 0) return 0;
        const mag = Math.pow(10, Math.floor(Math.log10(val)));
        return Math.ceil(val / mag) * mag;
    }

    function floorNice(val) {
        if (val >= 0) return 0;
        const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(val))));
        return -Math.ceil(Math.abs(val) / mag) * mag;
    }

    function shortMoney(val) {
        if (val === 0) return "0";
        const abs = Math.abs(val);
        const sign = val < 0 ? "-" : "";
        if (abs >= 1000000) return sign + (abs / 1000000).toFixed(1) + "م";
        if (abs >= 1000) return sign + (abs / 1000).toFixed(0) + "ك";
        return sign + abs.toFixed(0);
    }

    function renderIncomeStatement(revenue, expTotal, net, byCategory) {
        if (!incomeStatementBody) {
            return;
        }

        const rows = [];

        rows.push(`<tr class="report-section-header"><td><strong>الإيرادات</strong></td><td></td></tr>`);
        rows.push(`<tr><td>إيرادات الفواتير المسددة</td><td class="font-numbers">${formatMoney(revenue)}</td></tr>`);
        rows.push(`<tr class="report-subtotal-row"><td><strong>إجمالي الإيرادات</strong></td><td class="font-numbers"><strong>${formatMoney(revenue)}</strong></td></tr>`);

        rows.push(`<tr class="report-section-header"><td><strong>المصروفات</strong></td><td></td></tr>`);

        const categoryKeys = Object.keys(expenseCategoryLabels);
        for (const key of categoryKeys) {
            const amount = byCategory[key] || 0;
            if (amount > 0) {
                rows.push(`<tr><td>${escapeHtml(expenseCategoryLabels[key])}</td><td class="font-numbers">${formatMoney(amount)}</td></tr>`);
            }
        }

        rows.push(`<tr class="report-subtotal-row"><td><strong>إجمالي المصروفات</strong></td><td class="font-numbers"><strong>${formatMoney(expTotal)}</strong></td></tr>`);

        const netClass = net >= 0 ? "report-positive" : "report-negative";
        const netLabel = net >= 0 ? "صافي الربح" : "صافي الخسارة";
        rows.push(`<tr class="report-net-row ${netClass}"><td><strong>${netLabel}</strong></td><td class="font-numbers"><strong>${formatMoney(Math.abs(net))}</strong></td></tr>`);

        incomeStatementBody.innerHTML = rows.join("");
    }

    function renderCategoryBreakdown(byCategory, totalExpenses) {
        if (!categoryBreakdown) {
            return;
        }

        const categoryKeys = Object.keys(expenseCategoryLabels);
        const items = categoryKeys
            .map((key) => ({
                key,
                label: expenseCategoryLabels[key],
                amount: byCategory[key] || 0
            }))
            .filter((item) => item.amount > 0)
            .sort((a, b) => b.amount - a.amount);

        if (!items.length) {
            categoryBreakdown.innerHTML = '<div class="empty-state">لا توجد مصروفات.</div>';
            return;
        }

        const maxAmount = items[0].amount;

        categoryBreakdown.innerHTML = items.map((item) => {
            const pct = totalExpenses > 0 ? ((item.amount / totalExpenses) * 100).toFixed(1) : "0";
            const barWidth = maxAmount > 0 ? Math.max(4, (item.amount / maxAmount) * 100) : 0;
            return `
                <div class="report-category-item">
                    <div class="report-category-head">
                        <span>${escapeHtml(item.label)}</span>
                        <span class="font-numbers">${formatMoney(item.amount)}</span>
                    </div>
                    <div class="report-category-bar-track">
                        <div class="report-category-bar-fill" style="width: ${barWidth}%"></div>
                    </div>
                    <span class="report-category-pct font-numbers">${pct}%</span>
                </div>
            `;
        }).join("");
    }

    function renderTrendTable() {
        if (!trendTableBody) {
            return;
        }

        const data = getLast12MonthsData();
        let totalRevenue = 0;
        let totalExp = 0;
        let totalNet = 0;
        let totalInv = 0;

        trendTableBody.innerHTML = data.map((row) => {
            totalRevenue += row.revenue;
            totalExp += row.expenses;
            totalNet += row.net;
            totalInv += row.invoiceCount;
            const netClass = row.net >= 0 ? "report-positive" : "report-negative";
            return `
                <tr>
                    <td>${getArabicMonthName(row.month)} ${row.year}</td>
                    <td class="font-numbers">${formatMoney(row.revenue)}</td>
                    <td class="font-numbers">${formatMoney(row.expenses)}</td>
                    <td class="font-numbers ${netClass}">${formatMoney(row.net)}</td>
                    <td class="font-numbers">${formatNumber(row.invoiceCount)}</td>
                </tr>
            `;
        }).join("");

        setText("trendTotalRevenue", formatMoney(totalRevenue));
        setText("trendTotalExpenses", formatMoney(totalExp));
        setText("trendTotalNet", formatMoney(totalNet));
        setText("trendTotalInvoices", formatNumber(totalInv));
    }

    return {
        refresh: () => {
            populateYearOptions(yearSelect, currentYear);
            renderReportsPage();
        },
        flush: () => {}
    };
}

function setText(id, value) {
    const element = byId(id);
    if (element) {
        element.textContent = value;
    }
}

function setHtml(id, value) {
    const element = byId(id);
    if (element) {
        element.innerHTML = value;
    }
}

function addClick(element, handler) {
    if (element) {
        element.addEventListener("click", handler);
    }
}

function inlineImageToBase64(img) {
    if (!img || !img.naturalWidth || !img.naturalHeight || img.src.startsWith("data:")) {
        return;
    }

    try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        img.src = canvas.toDataURL("image/png");
    } catch (_) {
        // Keep original src if conversion fails.
    }
}

function inlineAllImages(container) {
    if (!container) {
        return;
    }
    container.querySelectorAll("img").forEach(inlineImageToBase64);
}

async function renderDocumentCanvas(previewElement) {
    if (typeof window.html2canvas !== "function") {
        throw new Error("html2canvas unavailable");
    }

    const jsPdfCtor = window.jspdf?.jsPDF || window.jsPDF;
    if (!jsPdfCtor) {
        throw new Error("jsPDF unavailable");
    }

    if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
    }

    inlineAllImages(previewElement);

    return window.html2canvas(previewElement, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#fffdf9",
        logging: false,
        windowWidth: document.documentElement.scrollWidth
    });
}

async function downloadPdfFromPreview(previewElement, doc) {
    const canvas = await renderDocumentCanvas(previewElement);
    const jsPdfCtor = window.jspdf?.jsPDF || window.jsPDF;
    const pdf = new jsPdfCtor("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 5;
    const maxWidth = pageWidth - margin * 2;
    const imageData = canvas.toDataURL("image/png");

    const imageWidth = maxWidth;
    const imageHeight = (canvas.height * imageWidth) / canvas.width;
    const maxHeight = pageHeight - margin * 2;
    const x = (pageWidth - imageWidth) / 2;

    if (imageHeight <= maxHeight) {
        const y = (pageHeight - imageHeight) / 2;
        pdf.addImage(imageData, "PNG", x, y, imageWidth, imageHeight, undefined, "FAST");
    } else {
        const pageContentHeightPx = (maxHeight / imageWidth) * canvas.width;
        const totalPages = Math.ceil(canvas.height / pageContentHeightPx);

        for (let i = 0; i < totalPages; i++) {
            if (i > 0) pdf.addPage();

            const sliceY = i * pageContentHeightPx;
            const sliceH = Math.min(pageContentHeightPx, canvas.height - sliceY);

            const sliceCanvas = document.createElement("canvas");
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = sliceH;
            const ctx = sliceCanvas.getContext("2d");
            ctx.drawImage(canvas, 0, sliceY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

            const sliceData = sliceCanvas.toDataURL("image/png");
            const sliceImgHeight = (sliceH * imageWidth) / canvas.width;
            pdf.addImage(sliceData, "PNG", x, margin, imageWidth, sliceImgHeight, undefined, "FAST");
        }
    }

    const safeNumber = (doc.documentNumber || doc.id || "document").replace(/[^\w-]+/g, "-");
    pdf.save(`${doc.documentType}-${safeNumber}.pdf`);
}

function buildPrintableMarkup(imageDataUrl) {
    return `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>${escapeHtml(document.title)}</title>
            <style>
                @page { size: A4 portrait; margin: 0; }
                html, body {
                    margin: 0;
                    background: #ffffff;
                }
                body {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .sheet {
                    width: 210mm;
                    height: 297mm;
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                img {
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                    display: block;
                }
            </style>
        </head>
        <body>
            <div class="sheet">
                <img src="${escapeAttribute(imageDataUrl)}" alt="document preview">
            </div>
            <script>
                window.addEventListener("load", () => {
                    setTimeout(() => {
                        window.print();
                        setTimeout(() => window.close(), 300);
                    }, 150);
                });
            <\/script>
        </body>
        </html>
    `;
}
