const API_BASE_URL = 'https://www.alphavantage.co/query';

// DOM Elements
const searchBtn = document.getElementById('search-btn');
const tickerInput = document.getElementById('ticker-input');
const resultsSection = document.getElementById('results-header');
const analystSection = document.getElementById('analyst-rating-section');
const newsGrid = document.getElementById('news-grid');
const loading = document.getElementById('loading');
const errorMsg = document.getElementById('error-msg');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeModal = document.getElementById('close-modal');
const saveKeyBtn = document.getElementById('save-key-btn');
const apiKeyInput = document.getElementById('api-key');

// Watchlist Elements
const watchlistSection = document.getElementById('watchlist-section');
const watchlistInput = document.getElementById('watchlist-input');
const addWatchlistBtn = document.getElementById('add-watchlist-btn');
const watchlistChips = document.getElementById('watchlist-chips');
const notificationBtn = document.getElementById('notification-btn');

// State
let apiKey = localStorage.getItem('alpha_vantage_key') || 'GEI8PUTUFSLRR8B3';
let watchlist = JSON.parse(localStorage.getItem('stock_watchlist') || '[]');
let notificationsEnabled = false;
let pollingInterval = null;
let notifiedNewsIds = new Set(); // To prevent duplicate notifications

// Initialize
if (!apiKey) {
    settingsModal.classList.remove('hidden');
} else {
    apiKeyInput.value = apiKey;
}

renderWatchlist();
checkNotificationPermission();

// Event Listeners
searchBtn.addEventListener('click', handleSearch);
tickerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
});

settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
});

closeModal.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
});

saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
        apiKey = key;
        localStorage.setItem('alpha_vantage_key', key);
        settingsModal.classList.add('hidden');
        alert('API Key saved!');
    }
});

// Watchlist Events
addWatchlistBtn.addEventListener('click', addToWatchlist);
watchlistInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addToWatchlist();
});

notificationBtn.addEventListener('click', toggleNotifications);

// Watchlist Logic
function addToWatchlist() {
    const ticker = watchlistInput.value.trim().toUpperCase();
    if (!ticker) return;

    if (watchlist.includes(ticker)) {
        alert('Ticker already in watchlist');
        return;
    }

    watchlist.push(ticker);
    saveWatchlist();
    renderWatchlist();
    watchlistInput.value = '';
}

function removeFromWatchlist(ticker) {
    watchlist = watchlist.filter(t => t !== ticker);
    saveWatchlist();
    renderWatchlist();
}

function saveWatchlist() {
    localStorage.setItem('stock_watchlist', JSON.stringify(watchlist));
}

function renderWatchlist() {
    watchlistChips.innerHTML = '';
    watchlist.forEach(ticker => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerHTML = `
            ${ticker}
            <span class="remove" onclick="removeFromWatchlist('${ticker}')">&times;</span>
        `;
        watchlistChips.appendChild(chip);
    });
}

// Notification Logic
function checkNotificationPermission() {
    if (Notification.permission === 'granted') {
        notificationsEnabled = true;
        updateNotificationBtn();
        startPolling();
    }
}

async function toggleNotifications() {
    if (notificationsEnabled) {
        // Disable
        notificationsEnabled = false;
        stopPolling();
        updateNotificationBtn();
    } else {
        // Enable
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            notificationsEnabled = true;
            startPolling();
            new Notification('Stock News Insider', { body: 'Notifications enabled! We will watch the market for you.' });
        }
        updateNotificationBtn();
    }
}

function updateNotificationBtn() {
    if (notificationsEnabled) {
        notificationBtn.classList.add('active');
        notificationBtn.innerHTML = '<span class="icon">🔕</span> Disable Alerts';
    } else {
        notificationBtn.classList.remove('active');
        notificationBtn.innerHTML = '<span class="icon">🔔</span> Enable Alerts';
    }
}

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    // Poll every 15 minutes to respect API limits (500 requests/day free tier usually)
    // But for demo purposes, let's say 60 seconds if user has key. 
    // Realistically, we should be careful. Let's do 5 minutes.
    checkWatchlistNews(); // Initial check
    pollingInterval = setInterval(checkWatchlistNews, 5 * 60 * 1000);
}

function stopPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = null;
}

async function checkWatchlistNews() {
    if (watchlist.length === 0 || !apiKey) return;
    console.log('Polling for watchlist news...');
    // Alpha Vantage allows comma separated tickers
    const tickers = watchlist.join(',');
    const url = `${API_BASE_URL}?function=NEWS_SENTIMENT&tickers=${tickers}&apikey=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.feed) {
            processNewsForNotifications(data.feed);
        }
    } catch (error) {
        console.error('Polling error:', error);
    }
}

function processNewsForNotifications(feed) {
    // Filter for positive news on watched tickers
    const relevantNews = feed.filter(item => {
        // Check if we already notified this item
        // Use URL or Title as ID if no ID provided
        const id = item.url;
        if (notifiedNewsIds.has(id)) return false;

        // Check sentiment
        const isPositive = item.overall_sentiment_score >= 0.15;

        // Double check it matches a watchlist ticker (API might return related news)
        const matchesWatchlist = item.ticker_sentiment.some(t => watchlist.includes(t.ticker));

        return isPositive && matchesWatchlist;
    });

    relevantNews.forEach(item => {
        sendNotification(item);
        notifiedNewsIds.add(item.url);
    });
}

function sendNotification(item) {
    try {
        const notif = new Notification(`Bullish News: ${item.title}`, {
            body: item.summary,
            icon: 'icon.png', // Use existing icon file
            tag: item.url // Use URL as tag to prevent duplicates (browser handled)
        });

        notif.onclick = () => {
            window.open(item.url, '_blank');
        };
    } catch (e) {
        console.error('Error sending notification:', e);
    }
}

// Main Search Logic (Existing)
async function handleSearch() {
    const ticker = tickerInput.value.trim().toUpperCase();
    if (!ticker) return;
    if (!apiKey) {
        settingsModal.classList.remove('hidden');
        return;
    }

    // Reset UI
    resultsSection.classList.remove('hidden');
    analystSection.classList.add('hidden'); // Hide until loaded
    newsGrid.innerHTML = '';
    loading.classList.remove('hidden');
    errorMsg.classList.add('hidden');

    try {
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // Sequentially fetch data with delays to avoid API rate limits
        let newsResult = { status: 'rejected', reason: null };
        try {
            const val = await fetchStockNews(ticker);
            newsResult = { status: 'fulfilled', value: val };
        } catch (e) { newsResult = { status: 'rejected', reason: e }; }

        await delay(1000);

        let historyResult = { status: 'rejected', reason: null };
        try {
            const val = await fetchStockHistory(ticker);
            historyResult = { status: 'fulfilled', value: val };
        } catch (e) { historyResult = { status: 'rejected', reason: e }; }

        await delay(1000);

        let overviewResult = { status: 'rejected', reason: null };
        try {
            const val = await fetchCompanyOverview(ticker);
            overviewResult = { status: 'fulfilled', value: val };
        } catch (e) { overviewResult = { status: 'rejected', reason: e }; }

        // Display Ratings (independent of news success)
        if (overviewResult.status === 'fulfilled') {
            let currentPrice = null;
            // Try to get latest price from history if available
            if (historyResult.status === 'fulfilled' && historyResult.value) {
                const dates = Object.keys(historyResult.value);
                if (dates.length > 0) {
                    currentPrice = historyResult.value[dates[0]]['4. close'];
                }
            }
            displayAnalystRatings(overviewResult.value, currentPrice);
        }

        // Display News
        if (newsResult.status === 'fulfilled') {
            const priceHistory = historyResult.status === 'fulfilled' ? historyResult.value : null;
            displayNews(newsResult.value, priceHistory);
        } else {
            showError(newsResult.reason?.message || 'Failed to fetch news');
        }
    } catch (err) {
        showError(err.message);
    } finally {
        loading.classList.add('hidden');
    }
}

async function fetchStockNews(ticker) {
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - 12);

    const url = `${API_BASE_URL}?function=NEWS_SENTIMENT&tickers=${ticker}&time_from=${formatToYYYYMMDDHHMMSS(fromDate)}&apikey=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data['Note']) {
            throw new Error('API limit reached. Please wait or use a premium key.');
        }
        if (data['Error Message']) {
            throw new Error('Invalid ticker or API key.');
        }
        if (!data.feed) {
            throw new Error('No news found for this ticker.');
        }

        return data.feed;
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}

async function fetchStockHistory(ticker) {
    const url = `${API_BASE_URL}?function=TIME_SERIES_DAILY&symbol=${ticker}&apikey=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        // It's okay if history fails (e.g. rate limit), we just won't show impact
        if (data['Time Series (Daily)']) {
            return data['Time Series (Daily)'];
        }
        return null;
    } catch (error) {
        console.warn('History fetch error:', error);
        return null;
    }
}

async function fetchCompanyOverview(ticker) {
    const url = `${API_BASE_URL}?function=OVERVIEW&symbol=${ticker}&apikey=${apiKey}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        return data; // Returns object with AnalystRating fields
    } catch (error) {
        console.warn('Overview fetch error:', error);
        return null;
    }
}

function displayAnalystRatings(data, currentPrice) {
    if (!data || !data.AnalystRatingBuy) {
        analystSection.classList.add('hidden');
        return;
    }

    analystSection.classList.remove('hidden');

    // Extract values (default to 0 if missing)
    const strongBuy = parseInt(data.AnalystRatingStrongBuy) || 0;
    const buy = parseInt(data.AnalystRatingBuy) || 0;
    const hold = parseInt(data.AnalystRatingHold) || 0;
    const sell = parseInt(data.AnalystRatingSell) || 0;
    const strongSell = parseInt(data.AnalystRatingStrongSell) || 0;
    const targetPrice = data.AnalystTargetPrice || '--';

    // Aggregate for simplified "Buy/Hold/Sell" view
    const totalBuy = strongBuy + buy;
    const totalHold = hold;
    const totalSell = sell + strongSell;
    const total = totalBuy + totalHold + totalSell;

    document.getElementById('analyst-target-price').textContent = `Target: $${targetPrice}`;

    // Update current price
    const priceEl = document.getElementById('analyst-current-price');
    if (currentPrice) {
        priceEl.textContent = `Price: $${parseFloat(currentPrice).toFixed(2)}`;
    } else {
        priceEl.textContent = 'Price: --';
    }

    // Update labels
    document.getElementById('val-buy').textContent = totalBuy;
    document.getElementById('val-hold').textContent = totalHold;
    document.getElementById('val-sell').textContent = totalSell;

    // Calculate percentages for bar widths
    if (total > 0) {
        const buyPct = (totalBuy / total) * 100;
        const holdPct = (totalHold / total) * 100;
        const sellPct = (totalSell / total) * 100;

        document.getElementById('bar-buy').style.width = `${buyPct}%`;
        document.getElementById('bar-hold').style.width = `${holdPct}%`;
        document.getElementById('bar-sell').style.width = `${sellPct}%`;
    } else {
        document.getElementById('bar-buy').style.width = '0%';
        document.getElementById('bar-hold').style.width = '0%';
        document.getElementById('bar-sell').style.width = '0%';
    }
}

function displayNews(feed, priceHistory) {
    // Filter for positive sentiment (Bullish)
    const positiveNews = feed.filter(item => {
        const tickerSentiment = item.ticker_sentiment.find(t => t.ticker === tickerInput.value.trim().toUpperCase());
        const score = tickerSentiment ? parseFloat(tickerSentiment.ticker_sentiment_score) : parseFloat(item.overall_sentiment_score);
        return score >= 0.15;
    });

    if (positiveNews.length === 0) {
        showError('No positive market-moving news found recently.');
        return;
    }

    positiveNews.forEach(item => {
        const card = createNewsCard(item, priceHistory);
        newsGrid.appendChild(card);
    });
}

function createNewsCard(item, priceHistory) {
    const div = document.createElement('div');
    div.className = 'news-card';

    // Determine sentiment label
    const score = parseFloat(item.overall_sentiment_score);
    let sentimentLabel = 'Bullish';
    let sentimentClass = 'bullish';

    if (score > 0.35) sentimentLabel = 'Very Bullish';

    // Format Date
    const dateStr = item.time_published;
    const dateObj = new Date(
        dateStr.slice(0, 4),
        dateStr.slice(4, 6) - 1,
        dateStr.slice(6, 8),
        dateStr.slice(9, 11),
        dateStr.slice(11, 13)
    );
    const formattedDate = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Calculate Price Impact
    let impactHtml = '';
    if (priceHistory) {
        // Format date as YYYY-MM-DD for Alpha Vantage lookup
        const dateKey = dateStr.slice(0, 4) + '-' + dateStr.slice(4, 6) + '-' + dateStr.slice(6, 8);
        const dayData = priceHistory[dateKey];

        if (dayData) {
            const open = parseFloat(dayData['1. open']);
            const close = parseFloat(dayData['4. close']);
            const change = ((close - open) / open) * 100;
            const sign = change >= 0 ? '+' : '';
            const impactClass = change >= 0 ? 'positive' : 'negative';

            impactHtml = `<span class="impact-badge ${impactClass}">Impact: ${sign}${change.toFixed(2)}%</span>`;
        }
    }

    div.innerHTML = `
        <div>
            <div class="card-header">
                <span class="source">${item.source}</span>
                <div class="badges">
                    ${impactHtml}
                    <span class="sentiment-badge ${sentimentClass}">${sentimentLabel}</span>
                </div>
            </div>
            <h3>${item.title}</h3>
            <p>${item.summary}</p>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto;">
            <span style="font-size: 0.8rem; color: #666;">${formattedDate}</span>
            <a href="${item.url}" target="_blank" class="read-more">
                Read Analysis <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
            </a>
        </div>
    `;
    return div;
}

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
}

// Tab Switching Logic
const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const activeTickersList = document.getElementById('active-tickers-list');
const refreshTickersBtn = document.getElementById('refresh-tickers-btn');
const prNewsGrid = document.getElementById('pr-news-grid');
const refreshPrBtn = document.getElementById('refresh-pr-btn');
let topTickersLoaded = false;
let prNewsLoaded = false;

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        // Remove active class from all tabs
        tabs.forEach(t => t.classList.remove('active'));
        // Add active class to clicked tab
        tab.classList.add('active');

        // Hide all contents
        tabContents.forEach(content => content.classList.add('hidden'));

        // Show target content
        const targetId = tab.dataset.tab;
        document.getElementById(targetId).classList.remove('hidden');

        // Load data if switching to active tickers tab
        if (targetId === 'active-tickers-section' && !topTickersLoaded) {
            fetchTopActiveTickers();
        }

        // Load PR News if switching to that tab
        if (targetId === 'pr-newswire-section' && !prNewsLoaded) {
            fetchPRNews();
        }
    });
});

if (refreshPrBtn) {
    refreshPrBtn.addEventListener('click', () => {
        refreshPrBtn.classList.add('spinning');
        fetchPRNews(true).finally(() => {
            refreshPrBtn.classList.remove('spinning');
        });
    });
}

async function fetchPRNews(isRefresh = false) {
    if (!isRefresh) {
        prNewsGrid.innerHTML = '<div class="loading-placeholder">Loading latest press releases...</div>';
    }

    // Using rss2json as a CORS proxy for the demo
    const RSS_URL = 'https://www.prnewswire.com/rss/news/all-news-8482.rss';
    const API_URL = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS_URL)}`;

    try {
        const response = await fetch(API_URL);
        const data = await response.json();

        if (data.status !== 'ok') {
            throw new Error('Failed to fetch RSS feed');
        }

        renderPRNews(data.items);
        prNewsLoaded = true;

    } catch (error) {
        console.error('PR News Fetch Error:', error);
        prNewsGrid.innerHTML = `<div class="error-msg">Failed to load press releases. <br> ${error.message}</div>`;
    }
}

function renderPRNews(items) {
    prNewsGrid.innerHTML = '';

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'news-card';

        // Date formatting
        const dateObj = new Date(item.pubDate);
        const formattedDate = dateObj.toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        div.innerHTML = `
            <div>
                <div class="card-header">
                    <span class="source">PR Newswire</span>
                    <span class="sentiment-badge" style="background: rgba(255,255,255,0.1);">Press Release</span>
                </div>
                <h3>${item.title}</h3>
                <p>${item.description ? item.description.replace(/<[^>]*>?/gm, '').slice(0, 150) + '...' : 'No description available.'}</p>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto;">
                <span style="font-size: 0.8rem; color: #666;">${formattedDate}</span>
                <a href="${item.link}" target="_blank" class="read-more">
                    Read Release <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
                </a>
            </div>
        `;
        prNewsGrid.appendChild(div);
    });
}

if (refreshTickersBtn) {
    refreshTickersBtn.addEventListener('click', () => {
        refreshTickersBtn.classList.add('spinning');
        fetchTopActiveTickers(true).finally(() => {
            refreshTickersBtn.classList.remove('spinning');
        });
    });
}

async function fetchTopActiveTickers(isRefresh = false) {
    if (!apiKey) {
        activeTickersList.innerHTML = '<div class="error-msg">Please save your API key in settings first.</div>';
        return;
    }

    if (!isRefresh) {
        activeTickersList.innerHTML = '<div class="loading-placeholder">Loading top Volume tickers...</div>';
    }

    const url = `${API_BASE_URL}?function=TOP_GAINERS_LOSERS&apikey=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data['Information']) {
            // Rate limit or other info
            throw new Error(data['Information']);
        }
        if (!data.most_actively_traded) {
            throw new Error('No data returned from API.');
        }

        const top10 = data.most_actively_traded.slice(0, 10);
        renderActiveTickers(top10);
        topTickersLoaded = true;

    } catch (error) {
        console.error('Error fetching top tickers:', error);
        if (!isRefresh) { // Keep old data if refresh fails, or show error? Let's show error for now
            activeTickersList.innerHTML = `<div class="error-msg">Error: ${error.message || 'Failed to load data'}</div>`;
        } else {
            alert(`Failed to refresh: ${error.message}`);
        }
    }
}

function renderActiveTickers(tickers) {
    activeTickersList.innerHTML = '';

    tickers.forEach(t => {
        const ticker = t.ticker;
        const price = parseFloat(t.price).toFixed(2);
        const change = parseFloat(t.change_percentage);
        const volume = parseInt(t.volume).toLocaleString();

        const changeClass = change >= 0 ? 'positive' : 'negative';
        const changeSign = change >= 0 ? '+' : '';

        const div = document.createElement('div');
        div.className = 'ticker-item';
        div.innerHTML = `
            <div class="ticker-info">
                <span class="ticker-symbol">${ticker}</span>
                <span class="ticker-price">$${price}</span>
            </div>
            <div class="ticker-info">
                <span class="ticker-change ${changeClass}">${changeSign}${change}%</span>
                <span class="ticker-volume">Vol: ${volume}</span>
            </div>
        `;

        // Add click event to search this ticker
        div.style.cursor = 'pointer';
        div.addEventListener('click', () => {
            // Switch to search tab
            document.querySelector('[data-tab="search-section"]').click();
            tickerInput.value = ticker;
            handleSearch();
        });

        activeTickersList.appendChild(div);
    });
}

function formatToYYYYMMDDHHMMSS(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}${month}${day}T${hours}${minutes}`;
}

// Expose removeFromWatchlist to global scope for onclick
window.removeFromWatchlist = removeFromWatchlist;
