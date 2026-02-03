const LOCAL_SERVER = 'http://127.0.0.1:5000';

async function initAll() {
    loadLinks(GOOGLE_SHEET_CSV_URL, 'linksContainer');
    loadLinks(OFD_CONFIG_CSV_URL, 'ofdLinksContainer');
    loadLinks(INSTRUCTIONS_CSV_URL, 'instructionsContainer'); 
    loadStaff();
}

async function loadLinks(url, targetId) {
    const container = document.getElementById(targetId);
    if (!url) return;
    try {
        const response = await fetch(url);
        const data = await response.text();
        const rows = data.split(/\r?\n/).slice(1);
        container.innerHTML = rows.map(row => {
            const cols = row.split(/[,;](?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (cols.length < 2) return '';
            
            const name = cols[0].replace(/"/g, '').trim();
            const val = cols[1].replace(/"/g, '').trim();
            
            const isDownloadable = val.includes('export=download');
            const actionBtn = isDownloadable 
                ? `<a href="${val}" download class="copy-btn" style="text-decoration:none;" title="Скачать файл">📥</a>`
                : `<a href="${val}" target="_blank" class="copy-btn" style="text-decoration:none;" title="Открыть ссылку">🔗</a>`;

            const urlDisplay = isDownloadable ? 'display: none;' : '';

            return `
                <div class="link-item">
                    <div class="link-info">
                        <span class="link-name">${name}</span>
                        <span class="link-url" style="${urlDisplay}">${val}</span>
                    </div>
                    <div style="display:flex; gap:5px;">
                        ${actionBtn}
                        <button class="copy-btn" onclick="copyText('${val}', this)" title="Копировать ссылку">📋</button>
                    </div>
                </div>`;
        }).join('');
    } catch(e) { 
        container.innerHTML = "<div style='padding:10px; color:red;'>Ошибка загрузки</div>"; 
    }
}

let staffData = [];
async function loadStaff() {
    if (typeof STAFF_CSV_URL === 'undefined' || !STAFF_CSV_URL) return;
    try {
        const response = await fetch(STAFF_CSV_URL);
        const data = await response.text();
        const rows = data.split(/\r?\n/).slice(1);
        const select = document.getElementById('staffSelect');
        rows.forEach(row => {
            const cols = row.split(/[,;](?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (cols.length >= 2) {
                const name = cols[0].replace(/"/g, '').trim();
                const email = cols[1].replace(/"/g, '').trim();
                staffData.push({name, email});
                let opt = document.createElement('option');
                opt.value = email; opt.innerText = name;
                select.appendChild(opt);
            }
        });
    } catch(e) {}
}

function toggleAstral() {
    const box = document.getElementById('astralBox');
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

function showStaffEmail() {
    const email = document.getElementById('staffSelect').value;
    const res = document.getElementById('staffEmailResult');
    res.innerHTML = email ? `Почта: <b>${email}</b> <button class="copy-btn" onclick="copyText('${email}', this)">📋</button>` : "";
}

function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        const old = btn.innerText; btn.innerText = "✅";
        setTimeout(() => btn.innerText = old, 1000);
    });
}

function generatePass() {
    const len = document.getElementById('passLen').value;
    const charset = (document.getElementById('genLower').checked ? "abcdefghijklmnopqrstuvwxyz" : "") +
                    (document.getElementById('genUpper').checked ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "") +
                    (document.getElementById('genNum').checked ? "0123456789" : "") +
                    (document.getElementById('genSym').checked ? "!@#$%^&*()_+" : "");
    if (!charset) return;
    let res = "";
    for (let i = 0; i < len; i++) res += charset.charAt(Math.floor(Math.random() * charset.length));
    document.getElementById('passResult').innerText = res;
}

function copyPass() {
    const p = document.getElementById('passResult').innerText;
    if (p !== "****") copyText(p, document.getElementById('passResult'));
}

// --- ОСНОВНОЙ ПОИСК РЕКВИЗИТОВ ---
async function getData() {
    const innRaw = document.getElementById('innInput').value.trim();
    const body = document.getElementById('resBody');
    const errorBox = document.getElementById('errorBox');
    const resDivSfr = document.getElementById('sfrResult');
    
    if (!innRaw) return;
    const inn = innRaw.replace(/\D/g, '');

    errorBox.innerText = "";
    resDivSfr.innerHTML = ""; // Сбрасываем старые запросы СФР
    document.getElementById('resTable').style.display = 'none';
    
    try {
        const response = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party", {
            method: "POST", 
            headers: { 
                "Content-Type": "application/json", 
                "Accept": "application/json", 
                "Authorization": "Token " + API_KEY 
            },
            body: JSON.stringify({query: inn})
        });
        
        const result = await response.json();
        
        if (result.suggestions && result.suggestions.length > 0) {
            const d = result.suggestions[0].data;
            
            const postalCode = d.address?.data?.postal_code || "";
            let fullAddress = d.address?.value || "—";
            if (postalCode && !fullAddress.includes(postalCode)) {
                fullAddress = postalCode + ", " + fullAddress;
            }

            let taxOfficeTerr = d.address?.data?.tax_office || d.tax_authority || d.tax_authority_reg || "—";

            const fields = [
                ["ИНН", d.inn], 
                ["КПП", d.kpp], 
                ["ОГРН", d.ogrn], 
                ["ОКПО", d.okpo],
                ["Полное имя", d.name?.full_with_opf], 
                ["Сокр. имя", d.name?.short_with_opf],
                ["Адрес", fullAddress], 
                ["ОКВЭД", d.okved],
                ["Руководитель", d.management?.name || result.suggestions[0].value],
                ["ИФНС Терр.", taxOfficeTerr],
            ];
            
            // Генерируем таблицу
            let html = fields.map(f => `<tr><td>${f[0]}</td><td>${f[1] || "—"}</td></tr>`).join("");
            
            // Добавляем строку СФР с кнопкой запроса
            html += `
                <tr>
                    <td>Код СФР</td>
                    <td>
                        <strong id="sfrValue" style="color:#007bff;">Не указан</strong>
                        <button id="btnGetSfr" class="copy-btn" onclick="getSfrOnly()" style="margin-left:10px; padding:2px 8px; font-size:11px;">Запросить</button>
                    </td>
                </tr>
            `;

            body.innerHTML = html;
            document.getElementById('resTable').style.display = 'table';
            
        } else { 
            errorBox.innerText = "Не найдено"; 
        }
    } catch (e) { 
        errorBox.innerText = "Ошибка API"; 
    }
}

// --- ЛОГИКА СФР ЧЕРЕЗ EXE МОДУЛЬ ---
async function getSfrOnly() {
    const inn = document.getElementById('innInput').value.replace(/\D/g, '');
    const resDiv = document.getElementById('sfrResult');
    
    if (inn.length < 10) {
        alert("Введите корректный ИНН!");
        return;
    }

    resDiv.innerHTML = "⌛ Проверка связи с модулем...";

    try {
        const ping = await fetch(`${LOCAL_SERVER}/ping`);
        if (!ping.ok) throw new Error();

        resDiv.innerHTML = "⌛ Получение капчи...";
        const capResp = await fetch(`${LOCAL_SERVER}/get_captcha`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ inn: inn })
        });
        const capData = await capResp.json();

        if (capData.image) {
            resDiv.innerHTML = `
                <div style="border:1px solid #ddd; padding:15px; margin-top:10px; background:#fff; border-radius:8px; display:inline-block;">
                    <p style="margin:0 0 10px 0;">Введите код с картинки:</p>
                    <img src="data:image/png;base64,${capData.image}" style="display:block; margin-bottom:10px; border:1px solid #eee;">
                    <input type="text" id="capAns" placeholder="Цифры" style="width:80px; padding:6px; border:1px solid #ccc;">
                    <button class="primary-btn" id="btnConfirmCap" onclick="confirmSfrOnly('${inn}')" style="padding:6px 12px;">ОК</button>
                </div>
            `;

            // Обработка Enter в поле капчи
            document.getElementById('capAns').addEventListener('keypress', function(e) {
                if (e.key === 'Enter') confirmSfrOnly(inn);
            });
            document.getElementById('capAns').focus();

        } else {
            resDiv.innerHTML = "❌ Ошибка: " + (capData.error || "неизвестно");
        }
    } catch (e) {
        resDiv.innerHTML = `
            <div style="background:#fff3cd; padding:15px; border:1px solid #ffeeba; color:#856404; border-radius:8px; margin-top:10px;">
                <strong>Модуль СФР не запущен!</strong><br>
                <a href="app/SFR_Engine_Setup.exe" download style="display:inline-block; background:#d32f2f; color:#fff; padding:8px 15px; text-decoration:none; border-radius:4px; margin-top:10px;">📥 Скачать установщик</a>
            </div>
        `;
    }
}

async function confirmSfrOnly(inn) {
    const ansInput = document.getElementById('capAns');
    const resDiv = document.getElementById('sfrResult');
    const sfrValue = document.getElementById('sfrValue');
    
    if (!ansInput || !ansInput.value) return;
    resDiv.innerHTML = "⌛ Запрос в СФР...";

    try {
        const resp = await fetch(`${LOCAL_SERVER}/submit_sfr`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ inn: inn, captchaAnswer: ansInput.value })
        });
        
        const result = await resp.json();

        if (result.regNum) {
            sfrValue.innerText = result.regNum;
            sfrValue.style.color = "#28a745";
            resDiv.innerHTML = "✅ Код успешно получен";
            document.getElementById('btnGetSfr').style.display = 'none';
        } else {
            alert("Ошибка СФР: " + (result.message || "Неверная капча"));
            getSfrOnly();
        }
    } catch (e) {
        resDiv.innerHTML = "❌ Ошибка связи с сервером.";
    }
}

// --- ОСТАЛЬНЫЕ ИНСТРУМЕНТЫ ---
async function getIfnsByAddress() {
    const addr = document.getElementById('addressInput').value.trim();
    const resDiv = document.getElementById('addressIfnsResult');
    const DADATA_KEY = "1e72b6fad742701b3a642bc189774e34e2ae7593"; 
    if (!addr) return;
    resDiv.innerHTML = "Связь с ФНС...";
    try {
        const response = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": "Token " + DADATA_KEY
            },
            body: JSON.stringify({ query: addr, count: 1 })
        });
        const result = await response.json();
        if (result.suggestions && result.suggestions.length > 0) {
            const data = result.suggestions[0].data;
            resDiv.innerHTML = `Код ИФНС: <span style="color:#d32f2f; font-size:18px; font-weight:bold;">${data.tax_office || "—"}</span>
                                <br><small>${data.postal_code || ""} ${result.suggestions[0].value}</small>`;
        } else {
            resDiv.innerHTML = "Адрес не найден";
        }
    } catch (error) {
        resDiv.innerHTML = "Ошибка связи";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initAll();
    // Enter для поиска ИФНС
    document.getElementById('addressInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') getIfnsByAddress();
    });
    // Enter для главного поиска ИНН
    document.getElementById('innInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') getData();
    });
});