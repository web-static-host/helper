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
            
            // Проверяем: файл или ссылка. 
            // Добавил проверку на "export=download" для ссылок с Google Drive
            const isFile = /\.(pdf|docx|doc|zip|rar|xlsx|txt|jpg|png)$/i.test(val) || val.includes('export=download');
            
            let actionBtn = '';
            if (isFile) {
                // Если файл — кнопка СКАЧАТЬ
                actionBtn = `<a href="${val}" download class="copy-btn" style="text-decoration:none;" title="Скачать">📥</a>`;
            } else {
                // Если ссылка — кнопка ОТКРЫТЬ
                actionBtn = `<a href="${val}" target="_blank" class="copy-btn" style="text-decoration:none;" title="Открыть">🔗</a>`;
            }

            return `
                <div class="link-item">
                    <div class="link-info">
                        <span class="link-name">${name}</span>
                        <span class="link-url">${val}</span>
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
    try {
        const response = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party", {
            method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": "Token " + API_KEY },
            body: JSON.stringify({query: inn})
        });
        const result = await response.json();
        if (result.suggestions?.length > 0) {
            const d = result.suggestions[0].data;
            document.getElementById('rawData').innerText = JSON.stringify(result, null, 2);
            document.getElementById('rawContainer').style.display = 'block';
            const fields = [
                ["ИНН", d.inn], ["КПП", d.kpp], ["ОГРН", d.ogrn], ["ОКПО", d.okpo],
                ["Полное имя", d.name?.full_with_opf], ["Сокр. имя", d.name?.short_with_opf],
                ["Адрес", d.address?.value], ["ОКВЭД", d.okved],
                ["Руководитель", d.management?.name || result.suggestions[0].value],
                ["ИФНС Терр.", d.tax_authority?.name], ["ИФНС Рег.", d.registration_authority?.name],
                ["Код СФР", d.sfr_registration_number]
            ];
            body.innerHTML = fields.map(f => `<tr><td>${f[0]}</td><td>${f[1] || "—"}</td></tr>`).join("");
            document.getElementById('resTable').style.display = 'table';
        } else { errorBox.innerText = "Не найдено"; }
    } catch (e) { errorBox.innerText = "Ошибка API"; }
}

initAll();