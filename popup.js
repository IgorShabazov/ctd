const listNameInput = document.getElementById('listName');
const groupSelect = document.getElementById('groupSelect');
const resultContainer = document.getElementById('resultContainer');
const deleteBtn = document.getElementById('deleteBtn');
const editBtn = document.getElementById('editBtn');

document.addEventListener('DOMContentLoaded', loadGroups);

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
        document.getElementById('checkBtn').click();
    }
});



// 4. Кнопка "Редагувати"
editBtn.addEventListener('click', () => {
    const selectedGroupName = groupSelect.value;
    if (!selectedGroupName) return;

    chrome.windows.create({
        url: `edit.html?group=${encodeURIComponent(selectedGroupName)}`,
        type: "popup",
        width: 650,
        height: 500
    });
});

// 5. ЛОГІКА ПЕРЕВІРКИ
document.getElementById('checkBtn').addEventListener('click', async () => {
  const groupName = groupSelect.value;
  if (!groupName) return;

  chrome.storage.local.get(groupName, async (data) => {
    const savedTemplateObjects = data[groupName] || [];
    const nameMap = Object.fromEntries(savedTemplateObjects.map(obj => [obj.meetName, obj.fullName]));
    
    const meetNamesForMatching = savedTemplateObjects.map(obj => obj.meetName); 
    
    const response = await getParticipantsFromTab();
    if (!response) return alert("Помилка доступу до вкладки Meet.");

    const currentList = response.current;
    const historyList = response.history; 

    const present = meetNamesForMatching.filter(mName => currentList.includes(mName));
    const left = meetNamesForMatching.filter(mName => !currentList.includes(mName) && historyList.includes(mName));
    const absent = meetNamesForMatching.filter(mName => !currentList.includes(mName) && !historyList.includes(mName));
    const guests = currentList.filter(mName => !meetNamesForMatching.includes(mName));

    const displayPresent = present.map(mName => nameMap[mName] || mName);
    const displayLeft = left.map(mName => nameMap[mName] || mName);
    const displayAbsent = absent.map(mName => nameMap[mName] || mName);

    displayResults(displayPresent, displayLeft, displayAbsent, guests);
    
    deleteBtn.style.display = 'block';
    deleteBtn.onclick = () => deleteGroup(groupName);
  });
});

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
            document.getElementById('checkBtn').click(); 
        });
    });
}





function displayResults(present, left, absent, guests) {
  resultContainer.style.display = 'block';

  fillList('listPresent', 'countPresent', present, '👤');
  fillList('listLeft', 'countLeft', left, '⚠️');
  fillList('listAbsent', 'countAbsent', absent, '❌');
  
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
      <li data-meet-name="${escapedAttr}">
        🔵 ${escapedName} 
        <button class="add-guest-btn" data-meet-name="${escapedAttr}" 
                style="float:right; padding: 2px 5px; font-size:10px; border-radius:3px; background:#4CAF50; color:white;">
          Додати
        </button>
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

  document.getElementById('blockLeft').style.display = left.length > 0 ? 'block' : 'none';
}

// Функція для екранування HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function fillList(listId, countId, array, icon) {
  document.getElementById(listId).innerHTML = array.map(n => `<li>${icon} ${escapeHtml(n)}</li>`).join('');
  document.getElementById(countId).innerText = array.length;
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

