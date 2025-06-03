// Background script for WhatsApp Contact Extractor
chrome.runtime.onInstalled.addListener(() => {
    console.log('WhatsApp Contact Extractor installed');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    if (tab.url.includes('web.whatsapp.com')) {
        chrome.action.openPopup();
    } else {
        chrome.tabs.create({url: 'https://web.whatsapp.com'});
    }
});

// Ensure content script is injected when needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('web.whatsapp.com')) {
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        }).catch(err => {
            console.log('Content script already injected or failed:', err);
        });
    }
});