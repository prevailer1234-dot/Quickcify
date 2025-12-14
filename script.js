let currentChat = [];

function displayMessage(text, type, skipSave = false) {
    let messages = document.getElementById("messages");
    let div = document.createElement("div");
    div.className = "message " + type;
    div.innerText = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    if (!skipSave) currentChat.push({ type: type, content: text, html: false, ts: Date.now() });
}

function newChat() {
    // Save current chat if it has messages
    try {
        if (currentChat && currentChat.length) {
            let saved = JSON.parse(localStorage.getItem('quickcify_chats') || '[]');
            let title = new Date().toLocaleString();
            const firstUser = currentChat.find(m => m.type === 'user');
            if (firstUser) title = firstUser.content.substring(0, 60);
            saved.unshift({ id: Date.now(), title: title, createdAt: Date.now(), messages: currentChat });
            if (saved.length > 20) saved = saved.slice(0, 20);
            localStorage.setItem('quickcify_chats', JSON.stringify(saved));
            renderSavedChats();
        }
    } catch (e) {
        console.error('Failed to save chat', e);
    }
    document.getElementById("messages").innerHTML = "";
    currentChat = [];
    // set placeholder to default and send greeting as first bot message
    const inp = document.getElementById('userInput');
    if (inp) {
        inp.placeholder = 'Type your message...';
        inp.focus();
    }
    const auto = (localStorage.getItem('quickcify_auto_send_greeting') !== 'false');
    if (auto) displayMessage(formatGreeting(), 'bot');
    else if (inp) inp.placeholder = formatGreeting();
}

function clearChat() {
    document.getElementById("messages").innerHTML = "";
    currentChat = [];
    const inp = document.getElementById('userInput');
    if (inp) inp.placeholder = 'Type your message...';
    const auto = (localStorage.getItem('quickcify_auto_send_greeting') !== 'false');
    if (auto) displayMessage(formatGreeting(), 'bot');
    else if (inp) inp.placeholder = formatGreeting();
}

function toggleOptions() {
    let opt = document.getElementById("options");
    opt.classList.toggle("hidden");
}

function displayHTMLMessage(html, type, skipSave = false) {
    let messages = document.getElementById("messages");
    let div = document.createElement("div");
    div.className = "message " + type;
    div.innerHTML = html;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    if (!skipSave) currentChat.push({ type: type, content: html, html: true, ts: Date.now() });
}

function createThinkingElem() {
    let messages = document.getElementById("messages");
    let div = document.createElement("div");
    div.className = "message bot thinking";
    div.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
}

function removeElem(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
}

// Helper to safely parse JSON responses and provide useful errors when non-JSON or non-OK
async function parseJSONorThrow(res) {
    if (res.ok) {
        const ctype = res.headers.get('content-type') || '';
        if (ctype.includes('application/json')) {
            return res.json();
        }
        const txt = await res.text();
        throw new Error('Expected JSON but received HTML/text (server returned): ' + txt.slice(0, 500));
    } else {
        const txt = await res.text();
        throw new Error('HTTP ' + res.status + ' ' + res.statusText + ': ' + txt.slice(0, 500));
    }
}


async function sendMessage() {
    let input = document.getElementById("userInput");
    let message = input.value.trim();
    if (!message) return;

    displayMessage(message, "user");
    // if user requests a web search with a command, handle locally
    const searchCmd = message.trim();
    if (searchCmd.toLowerCase().startsWith('/search ') || searchCmd.toLowerCase().startsWith('search:')) {
        const query = searchCmd.replace(/^\/search\s+/i, '').replace(/^search:\s*/i, '');
        if (!query) {
            displayMessage('Usage: /search your query', 'bot');
            return;
        }
        const thinking = createThinkingElem();
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await parseJSONorThrow(res);
            removeElem(thinking);
            if (data.error) {
                displayMessage('Search error: ' + (data.error || 'unknown'), 'bot');
                return;
            }
            let html = `<strong>Search results for "${escapeHtml(query)}"</strong>`;
            if (data.abstract) html += `<div class="search-abstract">${escapeHtml(data.abstract)} <a href="${data.abstract_url}" target="_blank">source</a></div>`;
            if (data.related && data.related.length) {
                html += '<ul class="search-results">';
                data.related.slice(0,6).forEach(r => {
                    html += `<li><a href="${r.url}" target="_blank">${escapeHtml(r.text)}</a></li>`;
                });
                html += '</ul>';
            }
            displayHTMLMessage(html, 'bot');
        } catch (err) {
            removeElem(thinking);
            console.error(err);
            displayMessage('Search failed.', 'bot');
        }
        input.value = '';
        return;
    }
    // local shortcut: respond to name queries without contacting server
    const l = message.toLowerCase();
    const nameRegex = /(^|\b)(what(?:'|\s)?s your name|what is your name|who are you|what are you called|your name)(\b|\?|!|$)/i;
    if (nameRegex.test(l)) {
        displayMessage("I am Quickcify, an AI assistant created by Prevailer.", "bot");
        input.value = "";
        return;
    }
    // local shortcut: answer date/time queries using server /api/time
    const timeRegex = /\b(what(?:'s|\s+is)? the time|what time is it|current time|date and time|what(?:'s|\s+is)? the date|today(?:'s)? date|current date|time now)\b/i;
    if (timeRegex.test(message)) {
        const thinkingTime = createThinkingElem();
        try {
            // Use client (browser) local time instead of server time
            const now = new Date();
            const localDate = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            const localTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            // Determine timezone name and offset
            const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
            const tzOffsetMin = now.getTimezoneOffset(); // minutes difference from UTC (negative if ahead)
            const offsetTotalMin = -tzOffsetMin; // convert to UTC+ offset minutes
            const sign = offsetTotalMin >= 0 ? '+' : '-';
            const absMin = Math.abs(offsetTotalMin);
            const hh = String(Math.floor(absMin / 60)).padStart(2, '0');
            const mm = String(absMin % 60).padStart(2, '0');
            const offsetStr = `${sign}${hh}:${mm}`;

            removeElem(thinkingTime);

            const dateText = `Today's date is ${localDate}.`;
            const timeText = `The current time is ${localTime}${tzName ? ' — ' + tzName + ' (UTC' + offsetStr + ')' : ' (UTC' + offsetStr + ')'}.`;
            displayMessage(`${dateText} ${timeText}`, 'bot');
        } catch (err) {
            removeElem(thinkingTime);
            console.error(err);
            displayMessage('Error: Could not determine local time.', 'bot');
        }
        input.value = '';
        return;
    }
    input.value = "";

    let model = document.getElementById("modelSelect").value;
    const thinking = createThinkingElem();

    try {
        // include recent conversation history so the model has context
        const historyToSend = currentChat.slice(-20); // last 20 entries
        let response = await fetch(`/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, model, history: historyToSend })
        });

        let data = await parseJSONorThrow(response);
        removeElem(thinking);
        displayMessage(data.reply, "bot");
    } catch (err) {
        removeElem(thinking);
        console.error(err);
        displayMessage("Error: Could not reach server: " + (err.message || err), "bot");
    }
}

async function fetchLeague(comp, name) {
    displayMessage(`Requesting ${name}...`, "user");
    const thinking = createThinkingElem();

    try {
        let res = await fetch(`/api/league?comp=${comp}`);
        let data = await parseJSONorThrow(res);
        removeElem(thinking);

        if (data.error) {
            displayMessage(`Error fetching ${name}: ${data.error}`, "bot");
            return;
        }

        // build HTML summary: top 5 table and next 3 matches
        let html = `<strong>${name} — ${data.competition?.name || ''}</strong>`;

        // standings: find first table of type 'TOTAL'
        let standingsList = data.standings || [];
        let table = standingsList.find(s => s.type === 'TOTAL') || standingsList[0] || null;
        if (table && table.table) {
            html += '<div class="league-standings"><ol>';
            table.table.slice(0, 5).forEach(row => {
                html += `<li>${row.position}. ${row.team.name} — ${row.points} pts</li>`;
            });
            html += '</ol></div>';
        }

        // upcoming matches
        let matches = data.upcoming_matches || [];
        if (matches.length) {
            html += '<div class="league-matches"><strong>Upcoming:</strong><ul>';
            matches.slice(0, 3).forEach(m => {
                let d = new Date(m.utcDate);
                html += `<li>${d.toLocaleString()} — ${m.homeTeam.name} vs ${m.awayTeam.name}</li>`;
            });
            html += '</ul></div>';
        }

        displayHTMLMessage(html, 'bot');
    } catch (err) {
        removeElem(thinking);
        displayMessage(`Error: Could not fetch ${name}.`, "bot");
        console.error(err);
    }
}

async function fetchLiveScores(comp) {
    const label = comp ? (comp === 'PL' ? 'Live EPL' : (comp === 'PD' ? 'Live LaLiga' : `Live ${comp}`)) : 'Live Matches';
    displayMessage(`Requesting ${label}...`, "user");
    const thinking = createThinkingElem();
    try {
        const url = comp ? `/api/live-scores?comp=${comp}` : `/api/live-scores`;
        let res = await fetch(url);
        let data = await parseJSONorThrow(res);
        removeElem(thinking);

        if (data.error) {
            displayMessage(`Error fetching live scores: ${data.error}`, "bot");
            return;
        }

        const matches = data.matches || [];
        if (!matches.length) {
            displayMessage('No live matches right now.', 'bot');
            return;
        }

        let html = `<strong>${label} — ${matches.length} match(es) live</strong><ul>`;
        matches.forEach(m => {
            let when;
            try { when = new Date(m.utcDate).toLocaleString(); } catch (e) { when = m.utcDate || '' }
            const home = (m.score && m.score.fullTime && (m.score.fullTime.homeTeam != null)) ? m.score.fullTime.homeTeam : (m.score && m.score.homeTeam) || '';
            const away = (m.score && m.score.fullTime && (m.score.fullTime.awayTeam != null)) ? m.score.fullTime.awayTeam : (m.score && m.score.awayTeam) || '';
            const scoreStr = (home !== '' || away !== '') ? `${home} - ${away}` : '';
            html += `<li><strong>${escapeHtml(m.homeTeam || '')}</strong> ${escapeHtml(scoreStr)} <strong>${escapeHtml(m.awayTeam || '')}</strong><div class="muted">${escapeHtml(m.competition || '')} • ${escapeHtml(m.status || '')} • ${escapeHtml(when)}</div></li>`;
        });
        html += '</ul>';

        displayHTMLMessage(html, 'bot');
    } catch (err) {
        removeElem(thinking);
        console.error(err);
        displayMessage('Error: Could not fetch live scores: ' + (err.message || err), 'bot');
    }
}

// Saved chats functions
function renderSavedChats() {
    const list = document.getElementById('chatsList');
    if (!list) return;
    let saved = JSON.parse(localStorage.getItem('quickcify_chats') || '[]');
    list.innerHTML = '';
    if (!saved.length) {
        list.innerHTML = '<div class="no-chats">No saved chats</div>';
        return;
    }
    saved.forEach(c => {
        let div = document.createElement('div');
        div.className = 'chat-item';
        div.innerHTML = `<button class="restore" onclick="restoreChat(${c.id})">Open</button>
                         <span class="chat-title">${escapeHtml(c.title)}</span>
                         <button class="del" onclick="deleteSavedChat(${c.id})">✕</button>`;
        list.appendChild(div);
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function restoreChat(id) {
    let saved = JSON.parse(localStorage.getItem('quickcify_chats') || '[]');
    const chat = saved.find(c => c.id === id);
    if (!chat) return;
    const messagesElem = document.getElementById('messages');
    messagesElem.innerHTML = '';
    currentChat = [];
    chat.messages.forEach(m => {
        if (m.html) displayHTMLMessage(m.content, m.type, true);
        else displayMessage(m.content, m.type, true);
        currentChat.push(m);
    });
}

function deleteSavedChat(id) {
    let saved = JSON.parse(localStorage.getItem('quickcify_chats') || '[]');
    saved = saved.filter(c => c.id !== id);
    localStorage.setItem('quickcify_chats', JSON.stringify(saved));
    renderSavedChats();
}

function clearAllSavedChats() {
    if (!confirm('Clear all saved chats?')) return;
    localStorage.removeItem('quickcify_chats');
    renderSavedChats();
}

// initialize
window.addEventListener('DOMContentLoaded', (e) => {
    renderSavedChats();
    const inp = document.getElementById('userInput');
    if (inp) inp.placeholder = 'Type your message...';
    // if no messages currently, auto-send greeting
    const messagesElem = document.getElementById('messages');
    // load auto-send setting
    const autoCheckbox = document.getElementById('autoSendGreeting');
    const autoSaved = localStorage.getItem('quickcify_auto_send_greeting');
    const autoSend = autoSaved === null ? true : (autoSaved === 'true');
    if (autoCheckbox) {
        autoCheckbox.checked = autoSend;
        autoCheckbox.addEventListener('change', () => {
            localStorage.setItem('quickcify_auto_send_greeting', autoCheckbox.checked);
            // update placeholder/greeting immediately when toggled
            if (!autoCheckbox.checked) {
                const inp2 = document.getElementById('userInput');
                if (inp2) inp2.placeholder = formatGreeting();
            } else {
                const inp2 = document.getElementById('userInput');
                if (inp2) inp2.placeholder = 'Type your message...';
            }
        });
    }

    // initialize greeting selector
    const sel = document.getElementById('greetingCase');
    if (sel) {
        // load saved preference
        const saved = localStorage.getItem('quickcify_greeting_case') || 'sentence';
        sel.value = saved;
        sel.addEventListener('change', () => {
            localStorage.setItem('quickcify_greeting_case', sel.value);
            // if auto-send is off, update the placeholder to match new style
            const auto = (localStorage.getItem('quickcify_auto_send_greeting') !== 'false');
            if (!auto) {
                const inp3 = document.getElementById('userInput');
                if (inp3) inp3.placeholder = formatGreeting();
            }
        });
    }

    if (messagesElem && messagesElem.children.length === 0 && currentChat.length === 0) {
        const shouldAuto = (localStorage.getItem('quickcify_auto_send_greeting') !== 'false');
        if (shouldAuto) displayMessage(formatGreeting(), 'bot');
        else {
            const inp4 = document.getElementById('userInput');
            if (inp4) inp4.placeholder = formatGreeting();
        }
    }
});

function formatGreeting() {
    const base = 'Hello, I am Quickcify, what are we doing today';
    const sel = document.getElementById('greetingCase');
    const style = (sel && sel.value) || localStorage.getItem('quickcify_greeting_case') || 'sentence';
    switch (style) {
        case 'title':
            return toTitleCase(base);
        case 'lower':
            return base.toLowerCase();
        case 'upper':
            return base.toUpperCase();
        case 'sentence':
        default:
            return base;
    }
}

function toTitleCase(str) {
    return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
}
