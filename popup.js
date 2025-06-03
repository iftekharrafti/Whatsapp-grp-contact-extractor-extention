let extractedContacts = [];

document.addEventListener('DOMContentLoaded', function() {
    const extractBtn = document.getElementById('extractBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const status = document.getElementById('status');
    const contactCount = document.getElementById('contactCount');

    // Check if we're on WhatsApp Web
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs[0].url.includes('web.whatsapp.com')) {
            showStatus('দয়া করে WhatsApp Web এ যান', 'error');
            extractBtn.disabled = true;
        }
    });

    extractBtn.addEventListener('click', async function() {
        extractBtn.disabled = true;
        extractBtn.textContent = '⏳ Loading...';
        showStatus('Contact extract করা হচ্ছে... Scroll করা হচ্ছে সব member load করার জন্য', 'info');

        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            
            // First inject the content script
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });

            // Wait a bit for script to load
            await new Promise(resolve => setTimeout(resolve, 500));

            // Start extraction with progress updates
            showStatus('🔄 Scrolling করে সব member load করা হচ্ছে...', 'info');
            extractBtn.textContent = '🔄 Scrolling...';
            
            // Start extraction
            const response = await chrome.tabs.sendMessage(tab.id, {action: 'extractContacts'});
            
            if (response && response.success) {
                extractedContacts = response.contacts;
                showStatus(`✅ সফলভাবে ${response.contacts.length} টি contact extract হয়েছে`, 'success');
                contactCount.textContent = `Total Contacts: ${response.contacts.length}`;
                contactCount.style.display = 'block';
                downloadBtn.style.display = 'block';
                
                if (response.contacts.length >= 500) {
                    showStatus(`🎉 ${response.contacts.length} টি contact extract হয়েছে! সব member load হয়েছে।`, 'success');
                } else if (response.contacts.length < 50) {
                    showStatus(`⚠️ ${response.contacts.length} টি contact পাওয়া গেছে। আরো থাকলে page এ আরো scroll করুন।`, 'info');
                }
            } else {
                showStatus(response ? response.error : 'Contact extract করতে পারেনি। Group info page এ আছেন কিনা check করুন।', 'error');
            }
        } catch (error) {
            console.error('Extension error:', error);
            showStatus('Error: দয়া করে WhatsApp Web এ group info page এ যান', 'error');
        }
        
        resetButton();
    });

    downloadBtn.addEventListener('click', function() {
        if (extractedContacts.length === 0) {
            showStatus('কোন contact পাওয়া যায়নি', 'error');
            return;
        }

        downloadCSV(extractedContacts);
    });

    function showStatus(message, type) {
        status.textContent = message;
        status.className = type;
        status.style.display = 'block';
    }

    function resetButton() {
        extractBtn.disabled = false;
        extractBtn.textContent = '🔍 Extract Contacts';
    }

    function downloadCSV(contacts) {
        let csvContent = 'Name,Phone Number\n';
        
        contacts.forEach(contact => {
            const name = contact.name.replace(/"/g, '""');
            const phone = contact.phone || '';
            csvContent += `"${name}","${phone}"\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `whatsapp_contacts_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showStatus('CSV file download হয়েছে', 'success');
    }
});