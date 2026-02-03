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
            const cols = row.split(/[,;](?=(?:(?:[^"]*"){2})*[^**"]*$)/);
            if (cols.length < 2) return '';
            
            const name = cols[0].replace(/"/g, '').trim();
            const val = cols[1].replace(/"/g, '').trim();
            
            // Определяем, файл это или ссылка
            const isDownloadable = val.includes('export=download');
            
            // Формируем кнопку действия (Скачать или Открыть)
            const actionBtn = isDownloadable 
                ? `<a href="${val}" download class="copy-btn" style="text-decoration:none;" title="Скачать файл">📥</a>`
                : `<a href="${val}" target="_blank" class="copy-btn" style="text-decoration:none;" title="Открыть ссылку">🔗</a>`;

            // Условие для отображения текста ссылки: если файл, то скрываем (display: none)
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

async function getData() {
    const inn = document.getElementById('innInput').value.trim();
    const body = document.getElementById('resBody');
    const errorBox = document.getElementById('errorBox');
    
    if (!inn) return;
    
    errorBox.innerText = "";
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
            
            // 1. Индекс и адрес
            const postalCode = d.address?.data?.postal_code || "";
            let fullAddress = d.address?.value || "—";
            if (postalCode && !fullAddress.includes(postalCode)) {
                fullAddress = postalCode + ", " + fullAddress;
            }

            // 2. ЛОГИКА ИЗ ТВОЕГО PYTHON-КОДА (Поиск кода ИФНС)
            let taxOfficeTerr = "";
            
            // Сначала смотрим глубоко в адресе (tax_office)
            taxOfficeTerr = d.address?.data?.tax_office;

            // Если там пусто, смотрим в основном поле tax_office
            if (!taxOfficeTerr) {
                const rawTaxOffice = d.tax_authority; // В JS API DaData это поле называется tax_authority
                if (typeof rawTaxOffice === 'string' && rawTaxOffice.trim()) {
                    taxOfficeTerr = rawTaxOffice.trim();
                } else if (rawTaxOffice && typeof rawTaxOffice === 'object' && rawTaxOffice.code) {
                    taxOfficeTerr = String(rawTaxOffice.code).trim();
                }
            }

            // Если всё еще пусто, берем регистрационную (как запасной вариант из твоего кода)
            if (!taxOfficeTerr) {
                taxOfficeTerr = d.tax_authority_reg || "";
            }

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
                ["ИФНС Терр.", taxOfficeTerr || "—"],
                ["Код СФР", d.sfr_registration_number || d.pfr_registration_number || "—"]
            ];
            
            body.innerHTML = fields.map(f => `<tr><td>${f[0]}</td><td>${f[1] || "—"}</td></tr>`).join("");
            document.getElementById('resTable').style.display = 'table';
            
        } else { 
            errorBox.innerText = "Не найдено"; 
        }
    } catch (e) { 
        errorBox.innerText = "Ошибка API"; 
    }
}


function getIfnsByAddress() {
    const addr = document.getElementById('addressInput').value.trim();
    const resDiv = document.getElementById('addressIfnsResult');
    
    // ВСТАВЬ СВОЙ КЛЮЧ
    const AHUNTER_KEY = "trollfase1998jyJJbEhgoMhAqaETZXzhfd"; 
    
    if (!addr) return;
    resDiv.innerHTML = "Поиск...";

    // Создаем уникальное имя функции для ответа
    const callbackName = 'ahunter_cb_' + Math.round(Math.random() * 1000000);

    // Описываем, что делать, когда придут данные
    window[callbackName] = function(data) {
        if (data.suggestions && data.suggestions.length > 0) {
            const item = data.suggestions[0];
            const ifns = item.data?.ifns_fl || item.data?.ifns_ul || "Не найден";
            const zip = item.data?.zip || "";

            resDiv.innerHTML = `Код ИФНС: <span style="color:#d32f2f; font-size:18px;">${ifns}</span>
                                <br><small style="color:#666; font-weight:normal;">${zip} ${item.value}</small>`;
        } else {
            resDiv.innerHTML = `<span style="color:#666;">Адрес не найден</span>`;
        }
        // Удаляем скрипт после работы
        document.body.removeChild(script);
        delete window[callbackName];
    };

    // Создаем сам запрос (через JSONP)
    const script = document.createElement('script');
    script.src = `https://www.ahunter.ru/site/suggest/address?output=jsonp&query=${encodeURIComponent(addr)}&user=${AHUNTER_KEY}&callback=${callbackName}`;
    
    // Если через 5 секунд ничего не пришло — пишем ошибку
    script.onerror = () => {
        resDiv.innerHTML = `<span style="color:#d32f2f;">Ошибка сети или ключа</span>`;
    };

    document.body.appendChild(script);
}

function loadFnsFrame() {
    const container = document.getElementById('fnsFrameContainer');
    // Заменяем кнопку на фрейм
    container.innerHTML = `
        <iframe 
            src="https://service.nalog.ru/addrno.do" 
            width="100%" 
            height="550px" 
            style="border:1px solid #ddd; border-radius: 8px; background: white;"
            loading="lazy">
        </iframe>
        <button class="gen-btn" style="width:100%; margin-top:10px; background:#666;" onclick="reloadFnsFrame()">Обновить окно</button>
    `;
}

function reloadFnsFrame() {
    const frame = document.querySelector('#fnsFrameContainer iframe');
    if (frame) frame.src = frame.src;
}


initAll();