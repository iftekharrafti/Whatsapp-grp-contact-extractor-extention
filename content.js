// Content script for WhatsApp Contact Extractor
console.log('WhatsApp Contact Extractor loaded');

// Remove any existing listeners to avoid duplicates
if (window.contactExtractorLoaded) {
    chrome.runtime.onMessage.removeListener(window.contactExtractorHandler);
}

window.contactExtractorHandler = function(request, sender, sendResponse) {
    console.log('Message received:', request);
    
    if (request.action === 'extractContacts') {
        extractContactsFromGroup()
            .then(contacts => {
                console.log('Extracted contacts:', contacts.length);
                sendResponse({success: true, contacts: contacts});
            })
            .catch(error => {
                console.error('Extraction error:', error);
                sendResponse({success: false, error: error.message});
            });
        return true; // Keep message channel open for async response
    }
};

chrome.runtime.onMessage.addListener(window.contactExtractorHandler);
window.contactExtractorLoaded = true;

async function extractContactsFromGroup() {
    try {
        console.log('Starting contact extraction...');
        
        // Check multiple possible locations for group member list
        let memberContainer = null;
        
        // Method 1: Check if we're in the search members modal
        const searchModal = document.querySelector('[role="dialog"]');
        if (searchModal && searchModal.textContent.includes('Search members')) {
            memberContainer = searchModal;
            console.log('Found search members modal');
        }
        
        // Method 2: Check for group info drawer
        if (!memberContainer) {
            const groupDrawer = document.querySelector('[data-testid="drawer-right"]');
            if (groupDrawer) {
                memberContainer = groupDrawer;
                console.log('Found group info drawer');
            }
        }
        
        // Method 3: Check for any container with contact info
        if (!memberContainer) {
            const contactContainers = document.querySelectorAll('[data-testid*="contact"], [title*="+880"], [href*="tel:"]');
            if (contactContainers.length > 0) {
                memberContainer = document.body;
                console.log('Found contact elements in page');
            }
        }

        if (!memberContainer) {
            throw new Error('Member list পাওয়া যায়নি। দয়া করে:\n1. Group info page এ যান\n2. অথবা "Search members" modal খুলুন\n3. সব member visible করুন');
        }

        // Wait for members to load
        await waitForMembers();

        // Scroll to load all members if needed
        await scrollToLoadAllMembers();

        // Extract contacts
        const contacts = await extractMemberContacts();

        if (contacts.length === 0) {
            throw new Error('কোন contact extract করা যায়নি। Phone number গুলো visible আছে কিনা check করুন।');
        }

        return contacts;
    } catch (error) {
        console.error('Extraction error:', error);
        throw error;
    }
}

function waitForMembers() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 10;
        
        const checkMembers = () => {
            // Look for various member indicators
            const memberElements = document.querySelectorAll(
                '[data-testid="cell-frame-container"], ' +
                '[title*="+880"], ' +
                '[href*="tel:"], ' +
                'div[role="listitem"], ' +
                'div[role="button"]:has([title*="+880"])'
            );
            
            console.log(`Found ${memberElements.length} potential member elements`);
            
            if (memberElements.length > 0) {
                resolve();
            } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(checkMembers, 1000);
            } else {
                resolve(); // Continue anyway, might find members differently
            }
        };
        
        checkMembers();
    });
}

async function scrollToLoadAllMembers() {
    console.log('Starting scroll to load all members...');
    
    let scrollContainer = document.querySelector('[role="dialog"]') || 
                         document.querySelector('[data-testid="drawer-right"]') || 
                         document.body;
    
    if (!scrollContainer) {
        console.log('No scrollable container found');
        return;
    }

    let previousContactCount = 0;
    let currentContactCount = 0;
    let stableCount = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 300; // Increased for 600 members
    const scrollDelay = 2500; // Increased delay for larger groups

    while (scrollAttempts < maxScrollAttempts) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: 3000, bubbles: true }));
        
        await new Promise(resolve => setTimeout(resolve, scrollDelay));
        
        const phoneElements = document.querySelectorAll('[title*="+"], [href*="tel:"], [data-testid*="contact"]');
        currentContactCount = phoneElements.length;
        
        console.log(`Scroll ${scrollAttempts + 1}: Found ${currentContactCount} contacts`);
        
        if (currentContactCount === previousContactCount) {
            stableCount++;
            if (stableCount >= 15) { // Higher stability threshold
                console.log('Contact count stable, finishing scroll');
                break;
            }
        } else {
            stableCount = 0;
        }
        
        previousContactCount = currentContactCount;
        scrollAttempts++;
    }
    
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
    await new Promise(resolve => setTimeout(resolve, scrollDelay));
    
    console.log(`Scroll completed. Total attempts: ${scrollAttempts}, Final count: ${currentContactCount}`);
}

async function extractMemberContacts() {
    const contacts = [];
    
    const phoneElements = document.querySelectorAll(
        '[title*="+"], [href*="tel:"], [data-testid*="contact"], ' +
        'span:not([dir="auto"]):not([title*="Hey"]), [title*="01"]'
    );
    console.log(`Found ${phoneElements.length} phone elements`);
    
    for (let phoneEl of phoneElements) {
        try {
            let phone = phoneEl.getAttribute('title') || 
                       phoneEl.getAttribute('href') || 
                       phoneEl.textContent || '';
            if (phone.startsWith('tel:')) phone = phone.replace('tel:', '');
            phone = cleanPhoneNumber(phone);
            if (!phone || !/^\+?\d{10,15}$/.test(phone.replace(/[^\d]/g, ''))) continue;
            
            let name = '';
            let parentEl = phoneEl.closest('div[role="listitem"], [data-testid="cell-frame-container"]');
            if (parentEl) {
                const nameEl = parentEl.querySelector('span[dir="auto"]:not([title*="+"]), .copyable-text span');
                if (nameEl && !nameEl.textContent.includes('+')) {
                    name = nameEl.textContent.trim();
                }
            }
            
            if (!name) {
                const siblings = phoneEl.parentElement?.querySelectorAll('span') || [];
                for (let span of siblings) {
                    if (span.textContent && !span.textContent.includes('+') && span.textContent.length > 1) {
                        name = span.textContent.trim();
                        break;
                    }
                }
            }
            
            contacts.push({ name: name || 'Unknown', phone });
        } catch (error) {
            console.log('Error processing phone element:', error);
        }
    }
    
    if (contacts.length < 50) {
        console.log('Trying text extraction...');
        const textContent = document.body.textContent || '';
        const phoneMatches = textContent.match(/\+?\d{1,3}\s*-?\d{3,4}\s*-?\d{6,7}/g) || [];
        for (let phone of phoneMatches) {
            phone = cleanPhoneNumber(phone);
            if (/^\+?\d{10,15}$/.test(phone.replace(/[^\d]/g, ''))) {
                contacts.push({ name: 'Extracted Number', phone });
            }
        }
    }
    
    const uniqueContacts = contacts.filter((contact, index, self) => 
        index === self.findIndex(c => c.phone === contact.phone)
    );
    
    console.log(`Extracted ${uniqueContacts.length} unique contacts`);
    return uniqueContacts;
}

async function extractSingleContact(memberElement) {
    try {
        // Get name from the element
        const nameElement = memberElement.querySelector('[dir="auto"]') || 
                           memberElement.querySelector('span[title]') ||
                           memberElement.querySelector('.copyable-text span');
        
        if (!nameElement) return null;

        const name = nameElement.textContent || nameElement.title || '';
        if (!name || name.trim() === '') return null;

        // Skip if it's an admin indicator or other non-member text
        if (name.includes('admin') || name.includes('Group Admin') || name.length < 2) {
            return null;
        }

        // Try to click on the member to get their info
        let phone = '';
        try {
            // Click on the member
            memberElement.click();
            
            // Wait for contact info to load
            await new Promise(resolve => setTimeout(resolve, 800));
            
            // Look for phone number in contact info
            const phoneElements = document.querySelectorAll('[data-testid="contact"] span, .copyable-text span');
            for (let phoneEl of phoneElements) {
                const text = phoneEl.textContent;
                if (text && /^\+?\d{10,15}$/.test(text.replace(/[\s-()]/g, ''))) {
                    phone = text;
                    break;
                }
            }

            // Close the contact info by pressing escape or clicking back
            document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
            await new Promise(resolve => setTimeout(resolve, 300));
            
        } catch (clickError) {
            console.log('Could not get phone for:', name);
        }

        return {
            name: name.trim(),
            phone: phone.trim()
        };

    } catch (error) {
        console.log('Error processing member element:', error);
        return null;
    }
}

// Helper function to clean phone numbers
function cleanPhoneNumber(phone) {
    if (!phone) return '';
    
    // Remove tel: prefix if present
    phone = phone.replace('tel:', '');
    
    // Remove all non-digit characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');
    
    // Ensure it starts with + if it's an international number
    if (cleaned.length > 10 && !cleaned.startsWith('+')) {
        cleaned = '+' + cleaned;
    }
    
    return cleaned;
}

// Simple phone number validation for Bangladesh
function isValidBangladeshPhone(phone) {
    if (!phone) return false;
    const cleaned = phone.replace(/[^\d]/g, '');
    return cleaned.length >= 10 && (cleaned.startsWith('880') || cleaned.startsWith('01'));
}