const listNameInput = document.getElementById('listName');
const groupSelect = document.getElementById('groupSelect');
const resultContainer = document.getElementById('resultContainer');
const deleteBtn = document.getElementById('deleteBtn');
const editBtn = document.getElementById('editBtn');

// Змінна для зберігання інтервалу автоматичної перевірки
let autoCheckInterval = null;

document.addEventListener('DOMContentLoaded', loadGroups);

// Очищаємо інтервал при закритті вікна
window.addEventListener('beforeunload', () => {
    if (autoCheckInterval) {
        clearInterval(autoCheckInterval);
        autoCheckInterval = null;
    }
});

function loadGroups() {
  chrome.storage.local.get(null, (items) => {
    groupSelect.innerHTML = '<option value="" disabled selected>Оберіть групу...</option>';
    for (let key in items) {
        if (Array.isArray(items[key])) { 
            let option = document.createElement('option');
            option.value = key;
            option.innerText = key + ` (${items[key].length} чол.)`;
            groupSelect.appendChild(option);
        }
    }
    editBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
  });
}

// 2. Логіка кнопки "Зберегти" (Створення шаблону)
document.getElementById('saveBtn').addEventListener('click', async () => {
  const name = listNameInput.value.trim();
  if (!name) return alert("Введіть назву для групи!");

  const response = await getParticipantsFromTab();
  
  if (response && response.current.length > 0) {
    const participantsData = response.current.map(pName => ({
      meetName: pName,   
      fullName: pName,   
      note: "",          
      subGroup: ""       
    }));

    let data = {};
    data[name] = participantsData;
    
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        alert("Помилка збереження: " + chrome.runtime.lastError.message);
        return;
      }
      alert(`Група "${name}" збережена!`);
      listNameInput.value = '';
      loadGroups();
    });
  } else {
    alert("Список порожній або панель 'Люди' закрита.");
  }
});

// 3. Зміна обраної групи
groupSelect.addEventListener('change', (e) => {
    if (e.target.value) {
        editBtn.style.display = 'block';
        deleteBtn.style.display = 'none';
        // Зупиняємо попередній інтервал, якщо він існує
        if (autoCheckInterval) {
            clearInterval(autoCheckInterval);
        }
        // Запускаємо перевірку одразу
        performCheck();
        // Запускаємо автоматичну перевірку кожні 3 секунди
        autoCheckInterval = setInterval(performCheck, 3000);
    } else {
        // Якщо група не обрана, зупиняємо автоматичну перевірку
        if (autoCheckInterval) {
            clearInterval(autoCheckInterval);
            autoCheckInterval = null;
        }
    }
});



// 4. Кнопка "Редагувати"
editBtn.addEventListener('click', async () => {
    const selectedGroupName = groupSelect.value;
    if (!selectedGroupName) return;

    try {
        // Отримуємо поточне вікно
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs[0]) return;
        
        const windowId = tabs[0].windowId;
        
        // Встановлюємо шлях для side panel з параметром групи
        await chrome.sidePanel.setOptions({
            path: `edit.html?group=${encodeURIComponent(selectedGroupName)}`,
            enabled: true
        });
        
        // Відкриваємо side panel
        await chrome.sidePanel.open({ windowId: windowId });
    } catch (error) {
        console.error('Помилка відкриття side panel:', error);
    }
});

// 5. ЛОГІКА ПЕРЕВІРКИ (автоматична)
async function performCheck() {
  const groupName = groupSelect.value;
  if (!groupName) {
    // Якщо група не обрана, зупиняємо автоматичну перевірку
    if (autoCheckInterval) {
      clearInterval(autoCheckInterval);
      autoCheckInterval = null;
    }
    return;
  }

  chrome.storage.local.get(groupName, async (data) => {
    const savedTemplateObjects = data[groupName] || [];
    
    // Створюємо мапу для швидкого пошуку об'єктів за meetName
    const participantsMap = Object.fromEntries(
      savedTemplateObjects.map(obj => [obj.meetName, obj])
    );
    
    const meetNamesForMatching = savedTemplateObjects.map(obj => obj.meetName); 
    
    const response = await getParticipantsFromTab();
    if (!response) {
      // Не показуємо помилку при автоматичній перевірці, щоб не заважати
      return;
    }

    const currentList = response.current;
    const historyList = response.history; 

    // Фільтруємо об'єкти за статусом
    const present = savedTemplateObjects.filter(obj => currentList.includes(obj.meetName));
    const left = savedTemplateObjects.filter(obj => !currentList.includes(obj.meetName) && historyList.includes(obj.meetName));
    const absent = savedTemplateObjects.filter(obj => !currentList.includes(obj.meetName) && !historyList.includes(obj.meetName));
    const guests = currentList.filter(mName => !meetNamesForMatching.includes(mName));

    displayResults(present, left, absent, guests);
    
    deleteBtn.style.display = 'block';
    deleteBtn.onclick = () => deleteGroup(groupName);
  });
}

async function getParticipantsFromTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('meet.google.com')) {
      return null;
    }
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { action: "get_names" }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(response || null);
        }
      });
    });
  } catch (error) {
    return null;
  }
}

// Функція для додавання гостя
function addGuestToGroup(guestMeetName, groupName, buttonElement) {
    if (!groupName) {
        alert("Помилка: Не обрано групу для додавання.");
        return;
    }

    chrome.storage.local.get(groupName, (data) => {
        const currentGroupData = data[groupName] || [];

        if (currentGroupData.some(item => item.meetName === guestMeetName)) {
            alert(`"${guestMeetName}" вже існує у списку.`);
            return;
        }

        const newParticipant = {
            meetName: guestMeetName,
            fullName: guestMeetName, 
            note: "Додано як Гість", 
            subGroup: ""
        };

        currentGroupData.push(newParticipant);

        let newData = {};
        newData[groupName] = currentGroupData;

        chrome.storage.local.set(newData, () => {
            if (chrome.runtime.lastError) {
                alert("Помилка збереження: " + chrome.runtime.lastError.message);
                return;
            }
            if (buttonElement) {
                buttonElement.innerText = "✅ Додано!";
                buttonElement.disabled = true;
                buttonElement.style.background = "#4CAF50"; 
            }
            performCheck(); 
        });
    });
}





function displayResults(present, left, absent, guests) {
  resultContainer.style.display = 'block';

  // Об'єднуємо всіх учасників в один список зі статусами
  const allParticipants = [
    ...present.map(p => ({ ...p, status: 'present', statusText: 'ВКЗ', icon: '🟢', color: '#2e7d32' })),
    ...left.map(p => ({ ...p, status: 'left', statusText: 'Вийшли', icon: '🟡', color: '#f57c00' })),
    ...absent.map(p => ({ ...p, status: 'absent', statusText: 'Відсутні', icon: '🔴', color: '#c62828' }))
  ];
  
  fillUnifiedList('listAll', 'totalCount', allParticipants);
  
  // ЛОГІКА ВІДОБРАЖЕННЯ ГОСТЕЙ З КНОПКОЮ
  const ulGuests = document.getElementById('listGuests');
  const countGuests = document.getElementById('countGuests');
  const blockGuests = document.getElementById('blockGuests');
  const selectedGroupName = groupSelect.value;

  countGuests.innerText = guests.length;

  if (guests.length > 0) {
    ulGuests.innerHTML = guests.map(mName => {
      const escapedName = escapeHtml(mName);
      const escapedAttr = escapeHtml(mName).replace(/"/g, '&quot;');
      return `
      <li data-meet-name="${escapedAttr}" class="participant-item guest-item">
        <div class="participant-main">
          <span class="participant-icon">🔵</span>
          <span class="participant-name">${escapedName}</span>
          <button class="add-guest-btn" data-meet-name="${escapedAttr}" 
                  style="float:right; padding: 2px 5px; font-size:10px; border-radius:3px; background:#4CAF50; color:white;">
            Додати
          </button>
        </div>
        <div class="participant-details">
          <span class="participant-status">Гість</span>
        </div>
      </li>
    `;
    }).join('');
    blockGuests.style.display = 'block';

    ulGuests.querySelectorAll('.add-guest-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const guestName = e.target.dataset.meetName;
            addGuestToGroup(guestName, selectedGroupName, e.target);
        });
    });

  } else {
    blockGuests.style.display = 'none';
    ulGuests.innerHTML = '';
  }
}

// Функція для екранування HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Функція для відображення об'єднаного списку зі статусами
function fillUnifiedList(listId, countId, array) {
  const listElement = document.getElementById(listId);
  const countElement = document.getElementById(countId);
  
  if (array.length === 0) {
    listElement.innerHTML = '';
    countElement.innerText = 0;
    return;
  }
  
  // Групуємо учасників за підгрупами
  const groupedBySubGroup = {};
  
  array.forEach(participant => {
    const subGroup = (participant.subGroup || '').trim();
    const groupKey = subGroup || '_no_subgroup';
    
    if (!groupedBySubGroup[groupKey]) {
      groupedBySubGroup[groupKey] = [];
    }
    groupedBySubGroup[groupKey].push(participant);
  });
  
  // Створюємо HTML з блоками для кожної підгрупи
  let html = '';
  
  // Спочатку показуємо підгрупи (сортуємо за назвою)
  const subGroupKeys = Object.keys(groupedBySubGroup).filter(k => k !== '_no_subgroup').sort();
  
  subGroupKeys.forEach(subGroupKey => {
    const subGroupName = subGroupKey;
    const participants = groupedBySubGroup[subGroupKey];
    
    html += `<li class="subgroup-block">
      <div class="subgroup-header">📁 ${escapeHtml(subGroupName)} (${participants.length})</div>
      <ul class="subgroup-participants">`;
    
    participants.forEach(participant => {
      const fullName = escapeHtml(participant.fullName || participant.meetName || '');
      const meetName = escapeHtml(participant.meetName || '');
      const note = escapeHtml(participant.note || '');
      const statusText = participant.statusText || '';
      const icon = participant.icon || '👤';
      const color = participant.color || '#666';
      
      let details = [];
      if (note) details.push(`Примітка: ${note}`);
      if (meetName && meetName !== fullName) details.push(`Логін: ${meetName}`);
      
      html += `
        <li class="participant-item" style="border-left: 3px solid ${color};">
          <div class="participant-main">
            <span class="participant-icon">${icon}</span>
            <span class="participant-name" style="color: ${color}; font-weight: bold;">${fullName}</span>
            <span class="participant-status-badge" style="background: ${color}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 8px;">${statusText}</span>
          </div>
          ${details.length > 0 ? `
          <div class="participant-details">
            ${details.map(d => `<span class="detail-item">${d}</span>`).join('')}
          </div>
          ` : ''}
        </li>
      `;
    });
    
    html += `</ul></li>`;
  });
  
  // Потім показуємо учасників без підгрупи
  if (groupedBySubGroup['_no_subgroup']) {
    const participants = groupedBySubGroup['_no_subgroup'];
    
    participants.forEach(participant => {
      const fullName = escapeHtml(participant.fullName || participant.meetName || '');
      const meetName = escapeHtml(participant.meetName || '');
      const note = escapeHtml(participant.note || '');
      const statusText = participant.statusText || '';
      const icon = participant.icon || '👤';
      const color = participant.color || '#666';
      
      let details = [];
      if (note) details.push(`Примітка: ${note}`);
      if (meetName && meetName !== fullName) details.push(`Логін: ${meetName}`);
      
      html += `
        <li class="participant-item" style="border-left: 3px solid ${color};">
          <div class="participant-main">
            <span class="participant-icon">${icon}</span>
            <span class="participant-name" style="color: ${color}; font-weight: bold;">${fullName}</span>
            <span class="participant-status-badge" style="background: ${color}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 8px;">${statusText}</span>
          </div>
          ${details.length > 0 ? `
          <div class="participant-details">
            ${details.map(d => `<span class="detail-item">${d}</span>`).join('')}
          </div>
          ` : ''}
        </li>
      `;
    });
  }
  
  listElement.innerHTML = html;
  countElement.innerText = array.length;
}

function fillList(listId, countId, array, icon, statusText) {
  const listElement = document.getElementById(listId);
  const countElement = document.getElementById(countId);
  
  if (array.length === 0) {
    listElement.innerHTML = '';
    countElement.innerText = 0;
    return;
  }
  
  // Перевіряємо, чи це масив об'єктів чи рядків
  const isObjectArray = array.length > 0 && typeof array[0] === 'object';
  
  // Групуємо учасників за підгрупами
  const groupedBySubGroup = {};
  
  array.forEach(item => {
    let participant;
    if (isObjectArray) {
      participant = item;
    } else {
      // Якщо це рядок (для зворотної сумісності)
      participant = { fullName: item, meetName: item, subGroup: '', note: '' };
    }
    
    const subGroup = (participant.subGroup || '').trim();
    const groupKey = subGroup || '_no_subgroup';
    
    if (!groupedBySubGroup[groupKey]) {
      groupedBySubGroup[groupKey] = [];
    }
    groupedBySubGroup[groupKey].push(participant);
  });
  
  // Створюємо HTML з блоками для кожної підгрупи
  let html = '';
  
  // Спочатку показуємо підгрупи (сортуємо за назвою)
  const subGroupKeys = Object.keys(groupedBySubGroup).filter(k => k !== '_no_subgroup').sort();
  
  subGroupKeys.forEach(subGroupKey => {
    const subGroupName = subGroupKey;
    const participants = groupedBySubGroup[subGroupKey];
    
    html += `<li class="subgroup-block">
      <div class="subgroup-header">📁 ${escapeHtml(subGroupName)} (${participants.length})</div>
      <ul class="subgroup-participants">`;
    
    participants.forEach(participant => {
      const fullName = escapeHtml(participant.fullName || participant.meetName || '');
      const meetName = escapeHtml(participant.meetName || '');
      const note = escapeHtml(participant.note || '');
      
      let details = [];
      if (note) details.push(`Примітка: ${note}`);
      if (meetName && meetName !== fullName) details.push(`Логін: ${meetName}`);
      
      html += `
        <li class="participant-item">
          <div class="participant-main">
            <span class="participant-icon">${icon}</span>
            <span class="participant-name">${fullName}</span>
          </div>
          ${details.length > 0 ? `
          <div class="participant-details">
            ${details.map(d => `<span class="detail-item">${d}</span>`).join('')}
            <span class="participant-status">${statusText}</span>
          </div>
          ` : `<div class="participant-details"><span class="participant-status">${statusText}</span></div>`}
        </li>
      `;
    });
    
    html += `</ul></li>`;
  });
  
  // Потім показуємо учасників без підгрупи
  if (groupedBySubGroup['_no_subgroup']) {
    const participants = groupedBySubGroup['_no_subgroup'];
    
    participants.forEach(participant => {
      const fullName = escapeHtml(participant.fullName || participant.meetName || '');
      const meetName = escapeHtml(participant.meetName || '');
      const note = escapeHtml(participant.note || '');
      
      let details = [];
      if (note) details.push(`Примітка: ${note}`);
      if (meetName && meetName !== fullName) details.push(`Логін: ${meetName}`);
      
      html += `
        <li class="participant-item">
          <div class="participant-main">
            <span class="participant-icon">${icon}</span>
            <span class="participant-name">${fullName}</span>
          </div>
          ${details.length > 0 ? `
          <div class="participant-details">
            ${details.map(d => `<span class="detail-item">${d}</span>`).join('')}
            <span class="participant-status">${statusText}</span>
          </div>
          ` : `<div class="participant-details"><span class="participant-status">${statusText}</span></div>`}
        </li>
      `;
    });
  }
  
  listElement.innerHTML = html;
  countElement.innerText = array.length;
}

function deleteGroup(name) {
  if(confirm(`Видалити "${name}"?`)) {
    chrome.storage.local.remove(name, () => {
      if (chrome.runtime.lastError) {
        alert("Помилка видалення: " + chrome.runtime.lastError.message);
        return;
      }
      loadGroups();
      resultContainer.style.display = 'none';
      deleteBtn.style.display = 'none';
    });
  }
}

// Експорт списків
document.getElementById('exportBtn').addEventListener('click', () => {
  chrome.storage.local.get(null, (items) => {
    // Фільтруємо тільки масиви (групи)
    const groups = {};
    for (let key in items) {
      if (Array.isArray(items[key])) {
        groups[key] = items[key];
      }
    }
    
    if (Object.keys(groups).length === 0) {
      alert("Немає груп для експорту.");
      return;
    }
    
    // Створюємо JSON з метаданими
    const exportData = {
      version: "3.0",
      exportDate: new Date().toISOString(),
      groups: groups
    };
    
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `meet_attendance_export_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
    alert(`Експортовано ${Object.keys(groups).length} груп(и).`);
  });
});

// Імпорт списків
document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const importData = JSON.parse(event.target.result);
      
      // Підтримка старого формату (просто об'єкт з групами)
      let groups;
      if (importData.groups) {
        groups = importData.groups;
      } else {
        // Старий формат - весь об'єкт є групами
        groups = importData;
      }
      
      if (!groups || typeof groups !== 'object') {
        alert("Помилка: Невірний формат файлу.");
        return;
      }
      
      // Підраховуємо кількість груп та учасників
      let groupCount = 0;
      let participantCount = 0;
      
      for (let key in groups) {
        if (Array.isArray(groups[key])) {
          groupCount++;
          participantCount += groups[key].length;
        }
      }
      
      if (groupCount === 0) {
        alert("У файлі не знайдено груп.");
        return;
      }
      
      // Питаємо підтвердження
      const confirmMessage = `Знайдено ${groupCount} груп(и) з ${participantCount} учасниками.\n\n` +
                            `Оберіть дію:\n` +
                            `OK - Додати/Оновити групи\n` +
                            `Скасувати - Скасувати імпорт`;
      
      if (!confirm(confirmMessage)) {
        e.target.value = ''; // Очищаємо input
        return;
      }
      
      // Завантажуємо групи
      chrome.storage.local.get(null, (existingData) => {
        let updatedCount = 0;
        let newCount = 0;
        
        for (let groupName in groups) {
          if (Array.isArray(groups[groupName])) {
            if (existingData[groupName]) {
              updatedCount++;
            } else {
              newCount++;
            }
          }
        }
        
        // Зберігаємо групи
        chrome.storage.local.set(groups, () => {
          if (chrome.runtime.lastError) {
            alert("Помилка імпорту: " + chrome.runtime.lastError.message);
            return;
          }
          
          let message = `Імпорт завершено!\n\n`;
          if (newCount > 0) message += `Додано нових груп: ${newCount}\n`;
          if (updatedCount > 0) message += `Оновлено існуючих груп: ${updatedCount}\n`;
          message += `Всього учасників: ${participantCount}`;
          
          alert(message);
          loadGroups();
          e.target.value = ''; // Очищаємо input
        });
      });
      
    } catch (error) {
      alert("Помилка читання файлу: " + error.message);
      e.target.value = ''; // Очищаємо input
    }
  };
  
  reader.onerror = () => {
    alert("Помилка читання файлу.");
    e.target.value = ''; // Очищаємо input
  };
  
  reader.readAsText(file);
});

