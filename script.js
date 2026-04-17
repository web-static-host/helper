const LOCAL_SERVER = 'http://127.0.0.1:5000';
let okvedDb = {};

// Функция для рекурсивного обхода вложенного JSON и вытаскивания кодов
function flattenOkved(node) {
    // Если это массив (например, корневой список или список items)
    if (Array.isArray(node)) {
        node.forEach(item => flattenOkved(item));
    } 
    // Если это объект с кодом и названием
    else if (node && typeof node === 'object') {
        if (node.code && node.name) {
            okvedDb[node.code] = node.name; // Записываем в наш плоский словарь
        }
        // Если внутри есть вложенные пункты, проваливаемся в них
        if (node.items) {
            flattenOkved(node.items);
        }
    }
}

// Загружаем справочник из папки
fetch('okved/okved.json')
    .then(response => response.json())
    .then(data => {
        flattenOkved(data); // Превращаем дерево в плоский словарь
    })
    .catch(error => {
        console.error('Не удалось загрузить okved.json. Проверь путь к файлу.', error);
    });
// Хранилище для объектов файлов
let attachedFiles = {
    license: null,      // ZIP (Лицензия)
    registration: null  // PDF (Карточка)
};

// Хранилище для менеджеров
let allManagers = [];
let filteredManagers = [];

// --- ИНИЦИАЛИЗАЦИЯ ---
async function initAll() {
    checkGateway(); // Проверяем шлюз первым делом
    loadLinks(GOOGLE_SHEET_CSV_URL, 'linksContainer');
    loadLinks(OFD_CONFIG_CSV_URL, 'ofdLinksContainer');
    loadLinks(INSTRUCTIONS_CSV_URL, 'instructionsContainer'); 
    loadStaff();
    loadManagers();
    initDragAndDrop(); 
}

// --- ПРОВЕРКА ШЛЮЗА ПРИ ЗАГРУЗКЕ ---
async function checkGateway() {
    const notify = document.getElementById('gatewayNotify');
    try {
        const response = await fetch(`${LOCAL_SERVER}/ping`, { method: 'GET' });
        if (response.ok) {
            notify.style.display = 'none'; // Скрываем, если работает
        } else {
            throw new Error();
        }
    } catch (e) {
        notify.style.display = 'flex'; // Показываем красную плашку, если упало
    }
}

window.addEventListener('DOMContentLoaded', initAll);

// --- ЗАГРУЗКА ДАННЫХ ИЗ CSV ---
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
            const logoUrl = cols.length > 2 ? cols[2].replace(/"/g, '').trim() : '';
            const isDownloadable = val.includes('export=download');

            // --- ИЗМЕНЕНИЯ ТОЛЬКО ДЛЯ linksContainer (Часто используемые) ---
            if (targetId === 'linksContainer') {
                // ДОБАВЛЕНО: Формируем HTML для логотипа, если URL существует
                const logoHtml = logoUrl ? `<img src="${logoUrl}" alt="logo" style="width: 24px; height: 24px; object-fit: contain; margin-right: 10px; border-radius: 4px; flex-shrink: 0;">` : '';

                return `<div class="link-item" style="display:flex; align-items:center;">
                    <div style="display:flex; align-items:center; flex-grow: 1; overflow: hidden;">
                        ${logoHtml}
                        <div class="link-info">
                            <span class="link-name" style="font-weight:bold; color:#333; cursor:default; user-select:none;">${name}</span>
                            <a href="${val}" target="_blank" class="link-url" style="font-size: 13px; color: #1a73e8; text-decoration: underline; display: block; margin-top: 2px;">${val}</a>
                        </div>
                    </div>
                    <div style="display:flex; gap:5px; flex-shrink: 0;">
                        <button class="copy-btn" onclick="copyText('${val}', this)" title="Копировать">📋</button>
                    </div>
                </div>`;
            }

            // --- ОСТАЛЬНЫЕ ВКЛАДКИ (БЕЗ ИЗМЕНЕНИЙ) ---
            let actionBtn = '';
            if (targetId !== 'ofdLinksContainer') {
                actionBtn = isDownloadable 
                    ? `<a href="${val}" download class="copy-btn" style="text-decoration:none;" title="Скачать файл">📥</a>`
                    : `<a href="${val}" target="_blank" class="copy-btn" style="text-decoration:none;" title="Открыть ссылку">🔗</a>`;
            }
            const urlDisplay = isDownloadable ? 'display: none;' : '';
            
            return `<div class="link-item">
                <div class="link-info">
                    <span class="link-name">${name}</span>
                    <span class="link-url" style="${urlDisplay}">${val}</span>
                </div>
                <div style="display:flex; gap:5px;">
                    ${actionBtn}
                    <button class="copy-btn" onclick="copyText('${val}', this)" title="Копировать">📋</button>
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
                if (select) select.appendChild(opt);
            }
        });
    } catch(e) {}
}

// --- ЛОГИКА МЕНЕДЖЕРОВ ---

async function loadManagers() {
    if (typeof MANAGERS_CSV_URL === 'undefined' || !MANAGERS_CSV_URL) return;
    try {
        const response = await fetch(MANAGERS_CSV_URL);
        const data = await response.text();
        const rows = data.split(/\r?\n/).slice(1);
        allManagers = [];
        rows.forEach(row => {
            const cols = row.split(/[,;](?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (cols.length >= 2) {
                const name = cols[0].replace(/"/g, '').trim();
                const email = cols[1].replace(/"/g, '').trim();
                if (name && email) allManagers.push({ name, email });
            }
        });
        filteredManagers = [...allManagers];
    } catch(e) { console.error("Ошибка загрузки менеджеров"); }
}

function showAllManagers() {
    const input = document.getElementById('managerSearch');
    const term = input.value.toLowerCase().trim();
    filteredManagers = term 
        ? allManagers.filter(m => m.name.toLowerCase().includes(term))
        : allManagers;
    renderManagerDropdown();
}

function filterManagers() {
    const input = document.getElementById('managerSearch');
    const term = input.value.toLowerCase().trim();
    filteredManagers = term 
        ? allManagers.filter(m => m.name.toLowerCase().includes(term))
        : allManagers;
    renderManagerDropdown();
}

function renderManagerDropdown() {
    const dropdown = document.getElementById('managerDropdown');
    if (!dropdown) return;
    if (filteredManagers.length > 0) {
        dropdown.innerHTML = filteredManagers.map(m => 
            `<div class="dropdown-item" onclick="selectManager('${m.name}', '${m.email}')">${m.name}</div>`
        ).join('');
        dropdown.style.display = 'block';
    } else {
        dropdown.style.display = 'none';
    }
}

function handleManagerKey(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredManagers.length > 0) {
            selectManager(filteredManagers[0].name, filteredManagers[0].email);
        }
    }
}

function selectManager(name, email) {
    const input = document.getElementById('managerSearch');
    const emailField = document.getElementById('mailTo');
    const dropdown = document.getElementById('managerDropdown');
    if (input) input.value = name;
    if (emailField) emailField.value = email;
    if (dropdown) dropdown.style.display = 'none';
}

document.addEventListener('click', (e) => {
    const search = document.getElementById('managerSearch');
    const dropdown = document.getElementById('managerDropdown');
    if (search && !search.contains(e.target) && dropdown && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
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
                    (document.getElementById('genNum').checked ? "0123456789" : "");
    if (!charset) return;
    let res = "";
    for (let i = 0; i < len; i++) res += charset.charAt(Math.floor(Math.random() * charset.length));
    document.getElementById('passResult').innerText = res;
}

function copyPass() {
    const p = document.getElementById('passResult').innerText;
    if (p !== "****") copyText(p, document.getElementById('passResult'));
}

// --- ПОЧТОВАЯ ЛОГИКА ---
function initDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    if (!dropZone) return;
    dropZone.onclick = () => document.getElementById('fileLic').click();
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.background = '#e1f5fe'; };
    dropZone.ondragleave = () => { dropZone.style.background = '#fafafa'; };
    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.style.background = '#fafafa';
        handleFiles(e.dataTransfer.files);
    };
    document.getElementById('fileLic').onchange = (e) => handleFiles(e.target.files);
}

function handleFiles(files) {
    for (let file of files) {
        if (file.name.toLowerCase().endsWith('.zip')) {
            attachedFiles.license = file; 
        } else if (file.name.toLowerCase().endsWith('.pdf')) {
            attachedFiles.registration = file; 
        }
    }
    renderFileList();
}

function renderFileList() {
    const fileList = document.getElementById('fileList');
    if (!fileList) return;
    fileList.innerHTML = "";
    if (attachedFiles.license) fileList.innerHTML += `<div style="color:green">📦 Лицензия (ZIP): ${attachedFiles.license.name}</div>`;
    if (attachedFiles.registration) fileList.innerHTML += `<div style="color:green">📄 Карточка (PDF): ${attachedFiles.registration.name}</div>`;
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

function applyTemplate() {
    const delivery = document.getElementById('mailDeliveryName')?.value || "Программный продукт 1С";
    const bodyArea = document.getElementById('mailBody');
    const orderType = document.getElementById('orderTypeSelect')?.value;
    const instrBox = document.getElementById('defaultInstructionBox');
    const instrName = document.getElementById('instructionFileName');
    const dropText = document.getElementById('dropZoneText');

    if (!bodyArea) return;

    // Настройка отображения инструкций и подсказок в DropZone
    if (orderType === 'local') {
        if (instrBox) instrBox.style.display = 'flex';
        if (instrName) instrName.innerText = "Инструкция_по_установке_электронной_версии_программы_1С.pdf (по умолчанию)";
        if (dropText) dropText.innerHTML = "Перетащите <b>Лицензию .ZIP</b> и <b>Карточку .PDF</b> или нажмите сюда";
    } 
    else if (orderType === 'dop') {
        if (instrBox) instrBox.style.display = 'none';
        if (dropText) dropText.innerHTML = "Перетащите <b>Лицензию .ZIP</b> и <b>Карточку .PDF</b> или нажмите сюда";
    } 
    else if (orderType === 'otrasl') {
        if (instrBox) instrBox.style.display = 'flex';
        if (instrName) instrName.innerText = "Инструкция по активации КП Отраслевой.ppsx (по умолчанию)";
        if (dropText) dropText.innerHTML = "Перетащите <b>Лицензию .ZIP</b> или нажмите сюда";
    }

    // Определяем текст в зависимости от типа отгрузки
    let middleText = "Отгрузка выполнена, направляю Вам во вложении<br>инструкцию для установки программного продукта, а также архив лицензии.";
    
    if (orderType === 'dop') {
        middleText = "Отгрузка выполнена, направляю Вам во вложении архив лицензии.";
    }

    const content = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff;"><tr><td align="center"><div style="width: 580px; font-family: Arial, sans-serif; font-size: 18px; line-height: 1.2; color: #000000; text-align: center;"><h2 style="color: #D71920; font-size: 26px; font-weight: bold; margin-bottom: 20px;">Уважаемый клиент!</h2><p style="margin-bottom: 15px;"><b>Вы заказывали программный продукт<br>${delivery}.</b></p><p style="margin-bottom: 25px;">${middleText}</p><p style="margin-bottom: 10px;">Обращаю Ваше внимание, приложенный архив с лицензией рекомендую отдельно сохранить в надежном месте, на случай переустановки программы или выхода из строя персонального компьютера.</p></div></td></tr></table>`.replace(/>\s+</g, '><').replace(/\n/g, ' ').trim();
    
    bodyArea.value = content;
}

async function sendMail() {
    const to = document.getElementById('mailTo')?.value;
    const org = document.getElementById('mailOrg')?.value;
    const delivery = document.getElementById('mailDeliveryName')?.value;
    const body = document.getElementById('mailBody')?.value;
    const orderType = document.getElementById('orderTypeSelect')?.value || 'local';

    if (!to || !org || !delivery) { alert("Заполните Кому, Организацию и Поставку!"); return; }

    // --- ОБНОВЛЕННАЯ ЛОГИКА ПРОВЕРКИ ФАЙЛОВ ---
    if (orderType === 'local' || orderType === 'dop') {
        // Для локальной и ДОП нужны ОБА файла (ZIP + PDF)
        if (!attachedFiles.license || !attachedFiles.registration) {
            alert("Для этого типа отгрузки нужны и Лицензия (ZIP), и Карточка (PDF)!"); 
            return;
        }
    } else if (orderType === 'otrasl') {
        // Для отраслевой нужен ТОЛЬКО ZIP
        if (!attachedFiles.license) {
            alert("Для отраслевой отгрузки обязательна Лицензия (ZIP)!"); 
            return;
        }
    }

    try {
        const filesToUpload = [];
        if (attachedFiles.license) filesToUpload.push({ name: attachedFiles.license.name, content: await fileToBase64(attachedFiles.license) });
        if (attachedFiles.registration) filesToUpload.push({ name: attachedFiles.registration.name, content: await fileToBase64(attachedFiles.registration) });

        // --- ОПРЕДЕЛЯЕМ ИНСТРУКЦИЮ ПО УМОЛЧАНИЮ ---
        let defaultInstruction = null;
        if (orderType === 'local') {
            defaultInstruction = "Инструкция_по_установке_электронной_версии_программы_1С.pdf";
        } else if (orderType === 'otrasl') {
            defaultInstruction = "Инструкция по активации КП Отраслевой.ppsx";
        }

        const payload = { 
            order_type: orderType,
            to, 
            subject: `${delivery} ${org} (лицензия)`.trim(), 
            body,
            files: filesToUpload,
            default_instruction: defaultInstruction // Передаем серверу, какую инструкцию приложить
        };

        const response = await fetch(`${LOCAL_SERVER}/send_email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        if (response.ok && result.status === "success") {
            alert("Окно письма открыто в Thunderbird");
            closeMailModal();
        } else {
            alert("Ошибка шлюза: " + (result.error || "Неизвестная ошибка"));
        }
        
            if (response.ok && result.status === "success") {
            alert("Окно письма открыто в Thunderbird");
            
            // --- ПРАВКА: ОЧИСТКА ПОЛЕЙ ПОСЛЕ УСПЕХА ---
            document.getElementById('mailTo').value = "";
            document.getElementById('mailOrg').value = "";
            document.getElementById('mailDeliveryName').value = "";
            // Сбрасываем прикрепленные файлы
            attachedFiles = { license: null, registration: null };
            if (document.getElementById('fileList')) document.getElementById('fileList').innerHTML = "";
            if (document.getElementById('fileLic')) document.getElementById('fileLic').value = "";
            
            closeMailModal();
        }
    } catch (error) { alert("Шлюз не отвечает!"); }


}

// --- МОДАЛКА ---
async function openMailModal() {
    const modal = document.getElementById('mailModal');
    const errorBox = document.getElementById('gatewayError');
    
    if (modal) {
        modal.style.display = 'block';
        
        // --- ПРОВЕРКА ШЛЮЗА ---
        try {
            // Быстрый запрос на проверку (таймаут 1 сек)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);
            
            const response = await fetch(`${LOCAL_SERVER}/ping`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
                if (errorBox) errorBox.style.display = 'none';
            } else {
                throw new Error();
            }
        } catch (err) {
            if (errorBox) errorBox.style.display = 'flex'; // Показываем ошибку
        }

        // 1. Сразу применяем шаблон при открытии
        applyTemplate();

        // 2. Вешаем событие на СЕЛЕКТОР
        const typeSelect = document.getElementById('orderTypeSelect');
        if (typeSelect) {
            typeSelect.onchange = applyTemplate; 
        }

        // 3. Обновляем текст письма при вводе данных в поля
        document.getElementById('mailOrg')?.addEventListener('input', applyTemplate);
        document.getElementById('mailDeliveryName')?.addEventListener('input', applyTemplate);
    }
}

function closeMailModal() {
    document.getElementById('mailModal').style.display = 'none';
    attachedFiles = { license: null, registration: null }; 
    if (document.getElementById('fileList')) document.getElementById('fileList').innerHTML = "";
    if (document.getElementById('fileLic')) document.getElementById('fileLic').value = "";
    if (document.getElementById('managerSearch')) document.getElementById('managerSearch').value = "";
    if (document.getElementById('mailTo')) document.getElementById('mailTo').value = "";
}

window.onclick = function(event) {
    const modal = document.getElementById('mailModal');
    if (event.target == modal) closeMailModal();
}

// --- РЕКВИЗИТЫ И СФР ---

// --- ОСНОВНОЙ ПОИСК РЕКВИЗИТОВ ---
async function getData() {
    const innRaw = document.getElementById('innInput').value.trim();
    const body = document.getElementById('resBody');
    const errorBox = document.getElementById('errorBox');
    const resDivSfr = document.getElementById('sfrResult');
    
    if (!innRaw) return;
    const inn = innRaw.replace(/\D/g, '');

    errorBox.innerText = "";
    resDivSfr.innerHTML = ""; 
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
                ["ОКВЭД", d.okved ? `${d.okved} ${okvedDb[d.okved] || ''}`.trim() : "—"],
                ["Руководитель", d.management?.name || result.suggestions[0].value],
                ["ИФНС Терр.", taxOfficeTerr],
            ];
            
            let html = fields.map(f => `<tr><td>${f[0]}</td><td>${f[1] || "—"}</td></tr>`).join("");
            
            // Добавляем строку СФР с кнопкой и ТУЛТИПОМ
            html += `
                <tr>
                    <td>Код СФР 
                        <span class="tooltip"><span class="tooltip-icon">?</span><span class="tooltiptext">Из-за протоколов безопасности сайта СФР данные запрашиваются через защищенный шлюз с вводом капчи. Для работы функции необходимо один раз установить на ПК локальный шлюз (gateway.exe). Он автоматически прописывается в автозагрузку, работает в фоновом режиме и не требует ручного запуска при каждом использовании сайта.</span></span>
                    </td>
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
                    <button class="primary-btn" id="btnConfirmCap" onclick="confirmSfrOnly('${inn}')" style="padding:6px 12px; cursor:pointer;">ОК</button>
                </div>
            `;

            const capInput = document.getElementById('capAns');
            capInput.focus();
            capInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') confirmSfrOnly(inn);
            });

        } else {
            resDiv.innerHTML = "❌ Ошибка: " + (capData.error || "неизвестно");
        }
    } catch (e) {
        resDiv.innerHTML = `
            <div style="background:#fff3cd; padding:15px; border:1px solid #ffeeba; color:#856404; border-radius:8px; margin-top:10px;">
                <strong>Шлюз не запущен!</strong><br>
                <a href="app/gateway.exe" download style="display:inline-block; background:#d32f2f; color:#fff; padding:8px 15px; text-decoration:none; border-radius:4px; margin-top:10px; font-weight:bold;">📥 Скачать Шлюз</a>
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
    
    document.getElementById('addressInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') getIfnsByAddress();
    });
    document.getElementById('innInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') getData();
    });
});