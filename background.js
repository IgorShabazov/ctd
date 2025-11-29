// Обробник кліку на іконку розширення
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // Відкриваємо side panel
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (error) {
    console.error('Помилка відкриття side panel:', error);
  }
});


