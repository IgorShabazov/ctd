let allSeenParticipants = new Set();

// Допоміжна функція: просто читає список прямо зараз
function getCurrentList() {
  const items = document.querySelectorAll('div[role="listitem"]');
  const currentNames = [];
  
  if (items.length > 0) {
    items.forEach((item) => {
      const text = item.innerText;
      if (text) {
        const cleanName = text.split('\n')[0].trim();
        if (cleanName) currentNames.push(cleanName);
      }
    });
  }
  return [...new Set(currentNames)];
}

// Функція для оновлення історії (працює по таймеру)
function updateHistory() {
  const current = getCurrentList();
  current.forEach(name => allSeenParticipants.add(name));
}

// Запускаємо сканування кожні 2 секунди
setInterval(updateHistory, 2000);

// Слухаємо запит від Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "get_names") {
    if (allSeenParticipants.size === 0) updateHistory();

    sendResponse({
      history: Array.from(allSeenParticipants), // Хто був взагалі
      current: getCurrentList()                 // Хто є прямо зараз
    });
    return true; // Потрібно для асинхронних відповідей в Manifest V3
  }
});

