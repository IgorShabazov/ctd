let currentGroupName = '';
let currentGroupData = []; // Масив об'єктів {meetName, fullName, note, subGroup}

document.addEventListener('DOMContentLoaded', initEditor);

function initEditor() {
    const urlParams = new URLSearchParams(window.location.search);
    currentGroupName = urlParams.get('group');

    if (!currentGroupName) {
        document.getElementById('editTitle').innerText = 'Помилка: Група не знайдена.';
        return;
    }

    document.getElementById('editTitle').innerText = `Редагування групи: ${currentGroupName}`;

    chrome.storage.local.get(currentGroupName, (data) => {
        currentGroupData = data[currentGroupName] || [];
        renderTable();
    });
    
    document.getElementById('saveEditBtn').addEventListener('click', saveChanges);
}

// Функція для екранування HTML
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// 4. Відображення таблиці
function renderTable() {
    const tbody = document.getElementById('groupTableBody');
    tbody.innerHTML = '';

    currentGroupData.forEach((item, index) => {
        const row = tbody.insertRow();
        
        // 1. Поле Логін (Meet Name) - READONLY
        let cellMeetName = row.insertCell();
        const meetNameInput = document.createElement('input');
        meetNameInput.type = 'text';
        meetNameInput.value = item.meetName || '';
        meetNameInput.setAttribute('readonly', 'readonly');
        meetNameInput.setAttribute('data-index', index);
        meetNameInput.setAttribute('data-field', 'meetName');
        cellMeetName.appendChild(meetNameInput);
        
        // 2. Поле ФІО (Full Name)
        let cellFullName = row.insertCell();
        const fullNameInput = document.createElement('input');
        fullNameInput.type = 'text';
        fullNameInput.value = item.fullName || '';
        fullNameInput.setAttribute('data-index', index);
        fullNameInput.setAttribute('data-field', 'fullName');
        cellFullName.appendChild(fullNameInput);

        // 3. Поле Підгрупа (SubGroup)
        let cellSubGroup = row.insertCell();
        const subGroupInput = document.createElement('input');
        subGroupInput.type = 'text';
        subGroupInput.value = item.subGroup || '';
        subGroupInput.setAttribute('data-index', index);
        subGroupInput.setAttribute('data-field', 'subGroup');
        subGroupInput.placeholder = 'Група 1, Фізика, і т.д.';
        cellSubGroup.appendChild(subGroupInput);

        // 4. Поле Примітка (Note)
        let cellNote = row.insertCell();
        const noteInput = document.createElement('input');
        noteInput.type = 'text';
        noteInput.value = item.note || '';
        noteInput.setAttribute('data-index', index);
        noteInput.setAttribute('data-field', 'note');
        cellNote.appendChild(noteInput);

        // Кнопка Видалити
        let cellAction = row.insertCell();
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-row';
        deleteBtn.textContent = 'Видалити';
        deleteBtn.setAttribute('data-index', index);
        cellAction.appendChild(deleteBtn);
    });

    // Додаємо порожній рядок для додавання нового учасника
    addEmptyRow(tbody);
    
    // Додаємо слухачів
    tbody.querySelectorAll('.delete-row').forEach(button => {
        button.addEventListener('click', (e) => deleteRow(e.target.dataset.index));
    });
    
    // Слухаємо input для editable полів
    tbody.querySelectorAll('input:not([readonly])').forEach(input => {
        input.addEventListener('input', updateData);
    });
}

// Додавання порожнього рядка для додавання
function addEmptyRow(tbody) {
    // Видаляємо старий рядок, якщо він існує
    const oldRow = document.getElementById('new-row');
    if (oldRow) {
        oldRow.remove();
    }
    
    const newIndex = currentGroupData.length;
    const row = tbody.insertRow();
    row.id = 'new-row'; 
    
    let cellMeetName = row.insertCell();
    const meetNameInput = document.createElement('input');
    meetNameInput.type = 'text';
    meetNameInput.placeholder = 'Логін Meet';
    meetNameInput.setAttribute('data-index', newIndex);
    meetNameInput.setAttribute('data-field', 'meetName');
    cellMeetName.appendChild(meetNameInput);
    
    let cellFullName = row.insertCell();
    const fullNameInput = document.createElement('input');
    fullNameInput.type = 'text';
    fullNameInput.placeholder = 'ФІО';
    fullNameInput.setAttribute('data-index', newIndex);
    fullNameInput.setAttribute('data-field', 'fullName');
    cellFullName.appendChild(fullNameInput); 

    let cellSubGroup = row.insertCell(); 
    const subGroupInput = document.createElement('input');
    subGroupInput.type = 'text';
    subGroupInput.placeholder = 'Підгрупа';
    subGroupInput.setAttribute('data-index', newIndex);
    subGroupInput.setAttribute('data-field', 'subGroup');
    cellSubGroup.appendChild(subGroupInput); 

    let cellNote = row.insertCell();
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.placeholder = 'Примітка';
    noteInput.setAttribute('data-index', newIndex);
    noteInput.setAttribute('data-field', 'note');
    cellNote.appendChild(noteInput);

    let cellAction = row.insertCell();
    const addBtn = document.createElement('button');
    addBtn.id = 'addGroupBtn';
    addBtn.textContent = 'Додати';
    cellAction.appendChild(addBtn);

    addBtn.addEventListener('click', addNewParticipant);
}

// 5. Оновлення даних в об'єкті
function updateData(e) {
    const index = parseInt(e.target.dataset.index);
    const field = e.target.dataset.field; 
    const value = e.target.value;
    
    if (index < currentGroupData.length) {
        currentGroupData[index][field] = value;
    } 
}

// 6. Додати нового учасника
function addNewParticipant() {
    const newRow = document.getElementById('new-row');
    if (!newRow) return;
    
    const newMeetInput = newRow.querySelector('input[data-field="meetName"]');
    const newFullNameInput = newRow.querySelector('input[data-field="fullName"]');
    const newSubGroupInput = newRow.querySelector('input[data-field="subGroup"]');
    const newNoteInput = newRow.querySelector('input[data-field="note"]');
    
    if (!newMeetInput || !newFullNameInput || !newSubGroupInput || !newNoteInput) return;
    
    const newMeetName = newMeetInput.value.trim();
    const newFullName = newFullNameInput.value.trim();
    const newSubGroup = newSubGroupInput.value.trim();
    const newNote = newNoteInput.value.trim();

    if (newMeetName) {
        // Перевірка на дублікати
        if (currentGroupData.some(item => item.meetName === newMeetName)) {
            alert(`"${newMeetName}" вже існує у списку.`);
            return;
        }
        
        currentGroupData.push({ 
            meetName: newMeetName, 
            fullName: newFullName || newMeetName,
            note: newNote,
            subGroup: newSubGroup 
        });
        saveChanges(false);
    } else {
        alert("Поле 'Логін (у Meet)' не може бути порожнім.");
    }
}

// 7. Видалити рядок
function deleteRow(index) {
    currentGroupData.splice(index, 1); 
    saveChanges(false); 
}





// 8. Збереження змін у Chrome Storage
function saveChanges(closeWindow = true) {
    const filteredData = currentGroupData.filter(item => item.meetName && item.meetName.trim() !== "");
    currentGroupData = filteredData;
    
    let data = {};
    data[currentGroupName] = currentGroupData;

    chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
            alert("Помилка збереження: " + chrome.runtime.lastError.message);
            return;
        }
        if (closeWindow) {
            alert("Зміни успішно збережено!");
            window.close();
        } else {
            renderTable(); 
        }
    });
}

