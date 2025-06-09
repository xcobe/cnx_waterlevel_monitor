// Version: 1.0.1 - Added P.21 station
const CONFIG = {
    stationId: localStorage.getItem('selectedStationId') || 'P.93',  // 从 localStorage 获取保存的站点 ID，如果没有则使用默认值
    apiBaseUrl: 'https://www.hydro-1.net/Data/HD-06/map/json_highcharts.php'
};

// 确保 ChartDataLabels 插件已加载
let chartDataLabelsLoaded = false;

// 加载 ChartDataLabels 插件
function loadChartDataLabels() {
    return new Promise((resolve, reject) => {
        if (chartDataLabelsLoaded) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.0.0';
        script.onload = () => {
            chartDataLabelsLoaded = true;
            Chart.register(ChartDataLabels);
            resolve();
        };
        script.onerror = () => reject(new Error('Failed to load ChartDataLabels plugin'));
        document.head.appendChild(script);
    });
}

// 添加数据缓存
const dataCache = {
    // 缓存结构：{ 'stationId_date': { data: {...}, timestamp: number } }
    cache: new Map(),
    // 缓存有效期（毫秒）
    maxAge: 5 * 60 * 1000, // 5分钟
    
    // 生成缓存键
    getCacheKey(stationId, date) {
        return `${stationId}_${date}`;
    },
    
    // 获取缓存数据
    get(stationId, date) {
        const key = this.getCacheKey(stationId, date);
        const cached = this.cache.get(key);
        
        if (cached && (Date.now() - cached.timestamp) < this.maxAge) {
            console.log(`Cache hit for ${key}`);
            return cached.data;
        }
        
        console.log(`Cache miss for ${key}`);
        return null;
    },
    
    // 设置缓存数据
    set(stationId, date, data) {
        const key = this.getCacheKey(stationId, date);
        this.cache.set(key, {
            data: data,
            timestamp: Date.now()
        });
        console.log(`Cache set for ${key}`);
    },
    
    // 清除过期缓存
    clearExpired() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.maxAge) {
                this.cache.delete(key);
                console.log(`Cleared expired cache for ${key}`);
            }
        }
    }
};

// 定期清理过期缓存
setInterval(() => dataCache.clearExpired(), 60 * 1000); // 每分钟清理一次

function getApiUrl(customDate = null) {
    // 如果传入的是日期字符串（DD-MM-YYYY格式），直接使用
    if (customDate && typeof customDate === 'string' && customDate.includes('-')) {
        return `${CONFIG.apiBaseUrl}?station_id=${CONFIG.stationId}&select_time=&date=${customDate}`;
    }
    
    // 否则使用传入的日期对象或当前日期
    const date = customDate ? new Date(customDate) : new Date();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const dateStr = `${day}-${month}-${year}`;
    
    return `${CONFIG.apiBaseUrl}?station_id=${CONFIG.stationId}&select_time=&date=${dateStr}`;
}

// 更新站点ID的函数
function updateStationId(newStationId) {
    if (newStationId && newStationId !== CONFIG.stationId) {
        console.log('Updating station ID from', CONFIG.stationId, 'to', newStationId);
        CONFIG.stationId = newStationId;
        // 保存到 localStorage
        localStorage.setItem('selectedStationId', newStationId);
        // 清空当前数据
        dataList.innerHTML = '';
        // 显示加载指示器
        loadingIndicator.style.display = 'block';
        // 更新后立即刷新数据
        fetchData();
    }
}

// 更新日期的函数
function updateDate(newDate) {
    fetchData(newDate);
}

// 泰文到英文的翻译映射
const translations = {
    'บานสลวง': 'Ban Salung',
    'น้ำแม่ริม': 'Mae Rim River',
    'สลวง': 'Salung',
    'แม่ริม': 'Mae Rim',
    'เชียงใหม่': 'Chiang Mai',
    'ปิง': 'Ping',
    'ระดับน้ำ': 'Water Level',
    'ปริมาณน้ำ': 'Water Volume',
    'น.': 'hr',
    'พฤษภาคม': 'May',
    'ม.ค.': 'Jan',
    'ก.พ.': 'Feb',
    'มี.ค.': 'Mar',
    'เม.ย.': 'Apr',
    'พ.ค.': 'May',
    'มิ.ย.': 'Jun',
    'ก.ค.': 'Jul',
    'ส.ค.': 'Aug',
    'ก.ย.': 'Sep',
    'ต.ค.': 'Oct',
    'พ.ย.': 'Nov',
    'ธ.ค.': 'Dec',
    'ลบ.ม./ว.': 'm³/s',
    // 添加水文站名称的翻译
    'สถานีวัดน้ำ': 'Hydrological Station',
    'สถานี': 'Station',
    'วัดน้ำ': 'Water Measurement',
    'สถานีวัดน้ำแม่ริม': 'Mae Rim Hydrological Station',
    'สถานีวัดน้ำปิง': 'Ping River Hydrological Station',
    'สถานีวัดน้ำสลวง': 'Salung Hydrological Station',
    'สถานีวัดน้ำบานสลวง': 'Ban Salung Hydrological Station'
};

// 英文到中文的翻译映射
const englishToChinese = {
    'Station Name': '测站名称',
    'River Name': '河流名称',
    'Current Water Level': '当前水位',
    'Current Water Volume': '当前流量',
    'Water Level Alert': '水位警戒线',
    'Water Volume': '流量',
    'Volume Alert': '流量警戒线',
    'Measurement Time': '测量时间',
    'Water Status': '水位状态',
    'Reference Level': '基准点高度',
    'Unknown': '未知'
};

// 将佛历转换为公历
function convertBuddhistToGregorian(text) {
    if (!text) return text;
    
    // 匹配佛历年（例如：2567）
    return text.replace(/(\d{4})/, (match, year) => {
        const gregorianYear = parseInt(year) - 543;
        return gregorianYear.toString();
    });
}

// 翻译函数
function translateThaiToEnglish(text) {
    if (!text) return '';
    
    // 处理水位状态文本
    if (text.includes('ระดับน้ำ')) {
        return text.replace(/ระดับน้ำ (\d+\.?\d*) ม\.<br>ปริมาณน้ำ (\d+\.?\d*) ลบ\.ม\.\/ว\./,
            'Water Level: $1 m<br>Water Volume: $2 m³/s');
    }

    // 处理日期时间
    let translated = text;
    
    // 处理时间格式（将24小时制转换为12小时制）
    translated = translated.replace(/(\d{1,2})\.(\d{2})/, (match, hour, minute) => {
        const hourNum = parseInt(hour);
        const period = hourNum >= 12 ? 'PM' : 'AM';
        const hour12 = hourNum % 12 || 12;
        return `${hour12}:${minute} ${period}`;
    });

    // 处理水文站名称
    if (translated.includes('สถานีวัดน้ำ')) {
        // 先尝试完整匹配
        for (const [thai, english] of Object.entries(translations)) {
            if (translated === thai) {
                return english;
            }
        }
        
        // 如果完整匹配失败，尝试部分匹配
        for (const [thai, english] of Object.entries(translations)) {
            if (translated.includes(thai)) {
                return english;
            }
        }
    }

    // 处理其他翻译
    for (const [thai, english] of Object.entries(translations)) {
        translated = translated.replace(new RegExp(thai, 'g'), english);
    }
    
    // 转换佛历到公历
    translated = convertBuddhistToGregorian(translated);
    
    return translated;
}

// DOM 元素
const dataList = document.getElementById('dataList');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');
const refreshButton = document.getElementById('refreshButton');
const lastUpdateTime = document.getElementById('lastUpdateTime');
const stationSelect = document.getElementById('stationSelect');

// 格式化时间
function formatDateTime(date) {
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    }).format(date);
}

// 显示错误信息
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    loadingIndicator.style.display = 'none';
}

// 隐藏错误信息
function hideError() {
    errorMessage.style.display = 'none';
}

// 更新最后更新时间
function updateLastUpdateTime(time, date) {
    const timeElement = document.createElement('div');
    timeElement.className = 'last-update';
    
    let displayTime = 'Unknown';
    
    if (time && date) {
        try {
            // 解析日期字符串（格式：DD-MM-YYYY）
            const [day, month, year] = date.split('-').map(Number);
            // 解析时间字符串（格式：HH:MM）
            const [hours, minutes] = time.split(':').map(Number);
            
            // 创建日期对象（注意：月份要减1，因为 JavaScript 中月份从 0 开始）
            const dateObj = new Date(year, month - 1, day, hours, minutes);
            
            // 使用 Intl.DateTimeFormat 格式化日期和时间
            const formatter = new Intl.DateTimeFormat('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            
            displayTime = formatter.format(dateObj);
            console.log('Formatted time:', {
                original: { time, date },
                parsed: { hours, minutes, day, month, year },
                formatted: displayTime
            });
        } catch (error) {
            console.error('Error formatting time:', error);
            displayTime = `${time} ${date}`;
        }
    }
    
    timeElement.innerHTML = `
        <p>Last Update / ${displayTime}</p>
    `;
    lastUpdateTime.innerHTML = '';
    lastUpdateTime.appendChild(timeElement);
}

// 初始化函数
function initialize() {
    // 从 localStorage 获取保存的站点 ID，如果没有则使用默认值
    const savedStationId = localStorage.getItem('selectedStationId');
    if (savedStationId) {
        CONFIG.stationId = savedStationId;
    }
    console.log('Initializing with station ID:', CONFIG.stationId);
    
    // 设置标题
    const headerTitle = document.querySelector('.header-text h1');
    if (headerTitle) {
        headerTitle.innerHTML = 'CNX Water Level Monitoring';
    }
    
    // 初始化下拉菜单
    const stationSelect = document.getElementById('stationSelect');
    if (stationSelect) {
        stationSelect.value = CONFIG.stationId;
        console.log('Set initial station select value to:', CONFIG.stationId);
    }
    
    // 创建底部信息
    const footer = document.createElement('footer');
    footer.innerHTML = `
        <div class="footer-content">
            <p class="data-source">Data Source / 数据来源: <a href="https://www.hydro-1.net/Data/HD-06/map/json_highcharts.php" target="_blank">Hydro-1</a></p>
            <p class="visit-counter">Visits / 访问次数: ${visitCounter.formatNumber(visitCounter.increment())}</p>
        </div>
    `;
    document.body.appendChild(footer);
    
    // 获取初始数据
    fetchData();
}

// 获取过去几天的日期
function getPastDates(days) {
    const dates = [];
    const currentTime = getCurrentTimePlus7();
    console.log('getPastDates - Current time:', currentTime.toISOString());
    
    // 从当前日期开始，往前推 days 天
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(currentTime);
        // 减去天数，从当前日期开始往前推
        date.setDate(date.getDate() - i);
        // 设置时间为当天的 00:00:00
        date.setHours(0, 0, 0, 0);
        dates.push(date);
        console.log(`getPastDates - Added date: ${date.toISOString()}, formatted: ${formatDateForApi(date)}, fileName: ${generateDailyFileName(date)}`);
    }
    
    console.log('getPastDates - Final dates array:', dates.map(d => ({
        iso: d.toISOString(),
        formatted: formatDateForApi(d),
        fileName: generateDailyFileName(d)
    })));
    
    return dates;
}

// 获取 +7 时区的当前时间
function getCurrentTimePlus7() {
    const now = new Date();
    // 转换为 +7 时区
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const thaiTime = new Date(utc + (3600000 * 7));
    return thaiTime;
}

// 验证日期是否有效（不是未来日期）
function isValidDate(date) {
    const currentTime = getCurrentTimePlus7();
    return date <= currentTime;
}

// 格式化日期为 API 所需的格式（DD-MM-YYYY）
function formatDateForApi(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

// 生成文件名格式：YYYYMMDDHH
function generateFileName(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    
    // 如果是 0 点，使用前一天的 24 点
    if (hour === '00') {
        const prevDate = new Date(date);
        prevDate.setDate(prevDate.getDate() - 1);
        return `${prevDate.getFullYear()}${String(prevDate.getMonth() + 1).padStart(2, '0')}${String(prevDate.getDate()).padStart(2, '0')}24`;
    }
    
    return `${year}${month}${day}${hour}`; // 不带 .json 后缀
}

// 生成每日数据文件名格式：YYYYMMDD
function generateDailyFileName(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // 直接返回当前日期的文件名，不再进行日期调整
    return `${year}${month}${day}`; // 不带 .json 后缀
}

// 获取当前数据
async function fetchCurrentData() {
    try {
        const currentTime = getCurrentTimePlus7();
        const currentHour = currentTime.getHours();
        const fileName = generateFileName(currentTime);
        
        console.log('Fetching current data for:', {
            currentTime: currentTime.toISOString(),
            currentHour: currentHour,
            fileName: fileName,
            stationId: CONFIG.stationId
        });

        // 首先尝试从缓存文件获取数据
        let data = null;
        let shouldFetchFromApi = false;

        try {
            console.log(`Checking cache file: ${fileName}`);
            const response = await fetch(`/station-data/${fileName}`, {
                headers: {
                    'x-station-id': CONFIG.stationId
                }
            });

            if (response.ok) {
                data = await response.json();
                console.log(`Found cache file: ${fileName}`, {
                    level1: data.level1,
                    time: data.time,
                    date: data.date
                });

                // 检查 level1 是否为空或0
                if (!data.level1 || data.level1 === "" || data.level1 === "0" || data.level1 === 0) {
                    console.log(`Cache file ${fileName} has empty or zero level1, will fetch from API`);
                    shouldFetchFromApi = true;
                }
            } else {
                console.log(`Cache file not found: ${fileName}, will fetch from API`);
                shouldFetchFromApi = true;
            }
        } catch (error) {
            console.log(`Error reading cache file ${fileName}:`, error);
            shouldFetchFromApi = true;
        }

        // 如果需要从API获取数据
        if (shouldFetchFromApi) {
            // 尝试获取当前时间的数据
            let apiUrl;
            let apiDate = currentTime;

            // 修改：使用空的 select_time 参数来获取当天的所有数据
            apiUrl = `${CONFIG.apiBaseUrl}?station_id=${CONFIG.stationId}&select_time=&date=${formatDateForApi(apiDate)}`;
            console.log(`Fetching current data from API: ${apiUrl}`);

            try {
                const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const text = await response.text();
        if (!text || text.trim() === '') {
            throw new Error('Empty response from server');
        }
        
                data = JSON.parse(text);
                console.log('Received data from API:', {
                    level1: data.level1,
                    time: data.time,
                    date: data.date,
                    url: apiUrl
                });

                // 如果获取到有效数据，保存到缓存
                if (data && data.level1) {
                    try {
                        console.log(`Saving new data to cache: ${fileName}`);
                        await fetch(`/station-data/${fileName}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-station-id': CONFIG.stationId
                            },
                            body: JSON.stringify(data)
                        });
                        console.log(`Successfully saved data to cache: ${fileName}`);
                    } catch (error) {
                        console.warn(`Failed to save data to cache: ${fileName}`, error);
                    }
                }
            } catch (error) {
                console.warn(`Failed to fetch current data: ${error.message}`);
                data = null;
            }
        }

        // 如果当前数据获取失败，尝试获取前一天的数据
        if (!data || !data.level1) {
            console.log('No current data available, trying to fetch yesterday\'s data');
            const yesterday = new Date(currentTime);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = formatDateForApi(yesterday);
            
            // 修改：将 select_time 设置为空字符串，以获取昨天的所有数据
            const yesterdayUrl = `${CONFIG.apiBaseUrl}?station_id=${CONFIG.stationId}&select_time=&date=${yesterdayStr}`;
            console.log('Fetching yesterday\'s data from:', yesterdayUrl);
            
            try {
                const yesterdayResponse = await fetch(yesterdayUrl);
                if (!yesterdayResponse.ok) {
                    throw new Error(`HTTP error! status: ${yesterdayResponse.status}`);
                }
                
                const yesterdayText = await yesterdayResponse.text();
                if (!yesterdayText || yesterdayText.trim() === '') {
                    throw new Error('Empty response from server for yesterday\'s data');
                }
                
                const yesterdayData = JSON.parse(yesterdayText);
                console.log('Received yesterday\'s data:', {
                    level1: yesterdayData.level1,
                    time: yesterdayData.time,
                    date: yesterdayData.date,
                    url: yesterdayUrl
                });
                
                if (yesterdayData && yesterdayData.level1) {
                    // 保存昨天的数据到缓存
                    const yesterdayFileName = generateFileName(yesterday);
                    try {
                        console.log(`Saving yesterday's data to cache: ${yesterdayFileName}`);
                        await fetch(`/station-data/${yesterdayFileName}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-station-id': CONFIG.stationId
                            },
                            body: JSON.stringify(yesterdayData)
                        });
                        console.log(`Successfully saved yesterday's data to cache: ${yesterdayFileName}`);
                    } catch (error) {
                        console.warn(`Failed to save yesterday's data to cache: ${yesterdayFileName}`, error);
                    }
                    return yesterdayData;
                }
            } catch (error) {
                console.warn(`Failed to fetch yesterday's data: ${error.message}`);
            }
            
            // 如果昨天也没有数据，尝试获取最近的有效数据
            console.log('No data available for today or yesterday, trying to fetch recent data');
            const recentDates = getPastDates(7); // 获取最近7天的日期
            
            for (const date of recentDates) {
                if (date.toDateString() === currentTime.toDateString() || 
                    date.toDateString() === yesterday.toDateString()) {
                    continue; // 跳过今天和昨天，因为已经尝试过了
                }
                
                const dateStr = formatDateForApi(date);
                // 修改：这里也使用空的 select_time
                const recentUrl = `${CONFIG.apiBaseUrl}?station_id=${CONFIG.stationId}&select_time=&date=${dateStr}`;
                console.log(`Trying to fetch data for ${dateStr}:`, recentUrl);
                
                try {
                    const recentResponse = await fetch(recentUrl);
                    if (!recentResponse.ok) continue;
                    
                    const recentText = await recentResponse.text();
                    if (!recentText || recentText.trim() === '') continue;
                    
                    const recentData = JSON.parse(recentText);
                    if (recentData && recentData.level1) {
                        console.log(`Found recent data for ${dateStr}:`, {
                            level1: recentData.level1,
                            time: recentData.time,
                            date: recentData.date
                        });
                        return recentData;
                    }
                } catch (error) {
                    console.warn(`Failed to fetch data for ${dateStr}:`, error);
                    continue;
                }
            }
            
            console.log('No data available for the past 7 days');
            throw new Error('No data available for the past 7 days');
        }
        
        return data;
    } catch (error) {
        console.error('Error fetching current data:', error);
        throw error;
    }
}

// 获取历史数据
async function fetchHistoricalData(days = 5) {
    try {
        const dates = getPastDates(days);
        const historicalData = [];
        const currentTime = getCurrentTimePlus7();
        const isNearMidnight = currentTime.getHours() === 0 && currentTime.getMinutes() < 30;
        
        console.log('Current time (UTC+7):', currentTime.toISOString());
        console.log('Fetching historical data for dates:', dates.map(d => ({
            date: d.toISOString(),
            formatted: formatDateForApi(d),
            fileName: generateDailyFileName(d)
        })));
        
        for (const date of dates) {
            if (!isValidDate(date)) {
                console.log(`Skipping future date: ${date.toISOString()}`);
                continue;
            }
            
            try {
                // 生成文件名和日期字符串 - 确保它们对应同一天
                const fileName = generateDailyFileName(date);
                const dateStr = formatDateForApi(date);
                const isCurrentDate = date.toDateString() === currentTime.toDateString();
                
                // 验证文件名和日期字符串是否对应同一天
                const [day, month, year] = dateStr.split('-').map(Number);
                const expectedFileName = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
                
                if (fileName !== expectedFileName) {
                    console.error(`Date mismatch: fileName=${fileName}, dateStr=${dateStr}, expectedFileName=${expectedFileName}`);
                    continue;
                }
                
                console.log(`Processing date: ${dateStr} (fileName: ${fileName}, isCurrentDate: ${isCurrentDate})`);
                
                let data = null;
                let shouldFetchFromApi = false;
                
                // 检查文件是否存在
                try {
                    const filePath = `${CONFIG.stationId}.${fileName}`;
                    console.log(`Checking if file exists: ${filePath}`);
                    const response = await fetch(`/station-data/${fileName}`, {
                        headers: {
                            'x-station-id': CONFIG.stationId
                        }
                    });
                    
                    if (response.ok) {
                        data = await response.json();
                        console.log(`Read historical data from station_data: ${filePath}`, {
                            level1: data.level1,
                            price_pole: data.price_pole,
                            time: data.time,
                            isCurrentDate: isCurrentDate
                        });
                    } else if (response.status === 404) {
                        console.log(`File not found in cache: ${filePath}, will fetch from API using date=${dateStr}`);
                        shouldFetchFromApi = true;
                    } else {
                        console.warn(`Unexpected response status ${response.status} for ${filePath}`);
                        shouldFetchFromApi = true;
                    }
                } catch (error) {
                    console.log(`Error reading from cache for ${fileName}:`, error);
                    shouldFetchFromApi = true;
                }
                
                // 如果文件不存在，从 API 获取数据
                if (shouldFetchFromApi) {
                    // 使用与文件名对应的日期参数
                    let apiUrl;
                    let apiDate = date;  // 默认使用当前循环的日期
                    let apiDateStr = dateStr;  // 默认使用当前循环的日期字符串
                    
                    if (isCurrentDate && isNearMidnight) {
                        // 如果是当前日期且接近午夜，使用前一天的24点数据
                        apiDate = new Date(date);
                        apiDate.setDate(apiDate.getDate() - 1);
                        apiDateStr = formatDateForApi(apiDate);
                        apiUrl = `${CONFIG.apiBaseUrl}?station_id=${CONFIG.stationId}&select_time=24&date=${apiDateStr}`;
                        console.log(`Using previous day's 24:00 data for current date near midnight: ${apiUrl} (original fileName: ${fileName})`);
                    } else {
                        // 使用与文件名对应的日期参数
                        apiUrl = `${CONFIG.apiBaseUrl}?station_id=${CONFIG.stationId}&select_time=&date=${dateStr}`;
                        console.log(`Fetching historical data from API for date ${dateStr} (fileName: ${fileName}): ${apiUrl}`);
                    }
                    
                    try {
                        console.log(`Making API request to: ${apiUrl}`);
                        const response = await fetch(apiUrl);
                        if (!response.ok) {
                            console.warn(`Failed to fetch historical data for ${dateStr} (fileName: ${fileName}): HTTP ${response.status}`);
                            continue;
                        }
                        
                        const text = await response.text();
                        if (!text || text.trim() === '') {
                            console.warn(`Empty response for historical data ${dateStr} (fileName: ${fileName})`);
                            continue;
                        }
                        
                        try {
                            data = JSON.parse(text);
                            console.log(`Successfully parsed API response for ${dateStr} (fileName: ${fileName}):`, {
                                hasData: !!data,
                                level1: data.level1,
                                price_pole: data.price_pole,
                                time: data.time,
                                date: data.date,
                                isCurrentDate: isCurrentDate,
                                requestDate: dateStr,
                                fileName: fileName,
                                apiDate: apiDateStr
                            });
                            
                            // 保存数据到缓存，使用原始文件名
                            try {
                                const filePath = `${CONFIG.stationId}.${fileName}`;
                                console.log(`Saving data to cache: ${filePath} (API date: ${apiDateStr})`);
                                await fetch(`/station-data/${fileName}`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'x-station-id': CONFIG.stationId
                                    },
                                    body: JSON.stringify(data)
                                });
                                console.log(`Successfully saved data to cache: ${filePath}`);
                            } catch (error) {
                                console.warn(`Failed to save historical data to station_data: ${fileName}`, error);
                            }
                        } catch (error) {
                            console.warn(`Failed to parse historical data for ${dateStr} (fileName: ${fileName}):`, error);
                            continue;
                        }
                    } catch (error) {
                        console.warn(`Failed to fetch historical data for ${dateStr} (fileName: ${fileName}):`, error);
                        continue;
                    }
                }
                
                if (data) {
                    // 处理水位数据
                    let waterLevel;
                    const pricePole = parseFloat(data.price_pole) || 0;
                    
                    // 检查 level1 是否为空或为 0
                    if (!data.level1 || data.level1 === "") {
                        waterLevel = 0;  // 空值或0值直接显示为 0
                        console.log(`Empty or zero level1, setting to 0 for ${dateStr} (fileName: ${fileName})`);
                    } else {
                        const rawLevel = parseFloat(data.level1);
                        if (!isNaN(rawLevel)) {
                            // 只有当 level1 有有效值时才进行基准高度计算
                            waterLevel = Math.max(0, rawLevel - pricePole);
                            console.log(`Water level calculated: ${waterLevel} (raw: ${rawLevel}, price_pole: ${pricePole}) for ${dateStr} (fileName: ${fileName})`);
                        } else {
                            waterLevel = 0;  // 无效数据也显示为 0
                            console.log(`Invalid level1 value "${data.level1}", setting to 0 for ${dateStr} (fileName: ${fileName})`);
                        }
                    }
                    
                    historicalData.push({
                        date: date,
                        level: waterLevel,
                        dischg: parseFloat(data.dischg) || 0
                    });
                }
            } catch (error) {
                console.warn(`Error processing historical data for ${date.toISOString()}:`, error);
            }
        }
        
        return historicalData;
    } catch (error) {
        console.error('Error fetching historical data:', error);
        throw error;
    }
}

// 创建数据项元素
function createDataItem(title, value, unit = '', isAlert = false, isStation = false, isWaterLevel = false, chineseTitle = '') {
    const item = document.createElement('div');
    item.className = `data-item${isAlert ? ' alert-level' : ''}`;
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'data-title';
    
    const titleElement = document.createElement('h3');
    titleElement.textContent = title;
    titleDiv.appendChild(titleElement);
    
    const subtitleElement = document.createElement('h4');
    subtitleElement.textContent = chineseTitle || englishToChinese[title] || title;
    titleDiv.appendChild(subtitleElement);
    
    const valueDiv = document.createElement('div');
    valueDiv.className = 'data-value';
    
    if (isStation) {
        const select = document.createElement('select');
        select.className = 'station-select';
        select.innerHTML = `
            <option value="P.93">P.93</option>
            <option value="P.67">P.67</option>
            <option value="P.1">P.1</option>
            <option value="P.21">P.21</option>
        `;
        select.value = CONFIG.stationId;
        select.addEventListener('change', (e) => {
            const newStationId = e.target.value;
            if (newStationId !== CONFIG.stationId) {
                console.log('Station changed from', CONFIG.stationId, 'to', newStationId);
                localStorage.setItem('selectedStationId', newStationId);
                updateStationId(newStationId);
            }
        });
        valueDiv.appendChild(select);
    } else {
        const valueElement = document.createElement('p');
        valueElement.textContent = `${value} ${unit}`;
        valueDiv.appendChild(valueElement);
    }
    
    item.appendChild(titleDiv);
    item.appendChild(valueDiv);
    return item;
}

// 创建水位图表
async function createWaterLevelChart(container, data, alertLevel) {
    try {
        // 确保插件已加载
        await loadChartDataLabels();
        
        const ctx = container.querySelector('canvas').getContext('2d');
        
        if (container.chart) {
            container.chart.destroy();
        }
        
        const labels = data.map(item => {
            const date = new Date(item.date);
            return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        });
        
        // 处理数据，将 -1 值转换为 0 用于显示
        const values = data.map(item => item.level === -1 ? 0 : item.level);
        
        // 创建警戒线数据集
        const alertLineData = new Array(labels.length).fill(alertLevel);
        
        container.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '水位 (m)',
                        data: values,
                        backgroundColor: '#3498db',
                        borderColor: '#2980b9',
                        borderWidth: 1,
                        order: 2,
                        datalabels: {
                            display: true,
                            formatter: function(value, context) {
                                // 如果原始值是 -1，显示 "无数据"
                                if (data[context.dataIndex].level === -1) {
                                    return '无数据';
                                }
                                // 显示具体数值，保留两位小数
                                return value.toFixed(2) + ' m';
                            },
                            color: '#2c3e50',
                            font: {
                                weight: 'bold',
                                size: 11
                            },
                            padding: {
                                top: 4
                            },
                            align: 'top',
                            anchor: 'end'
                        }
                    },
                    {
                        label: `Alert Level / 警戒线 (${alertLevel.toFixed(2)} m)`,
                        data: alertLineData,
                        type: 'line',
                        borderColor: '#e74c3c',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false,
                        order: 1,
                        datalabels: {
                            display: false
                        }
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        title: {
                            display: true,
                            text: '水位 (m)'
                        },
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(2) + ' m';
                            }
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: '日期'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            filter: function(legendItem, data) {
                                return legendItem.text.includes('Alert Level');
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (context.dataset.label.includes('Alert Level')) {
                                    return `Alert Level / 警戒线: ${context.raw.toFixed(2)} m`;
                                }
                                // 如果原始值是 -1，在提示中显示 "无数据"
                                return data[context.dataIndex].level === -1 ? 
                                    '水位: 无数据' : 
                                    `水位: ${context.raw.toFixed(2)} m`;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating water level chart:', error);
        container.querySelector('.chart-title').textContent = '图表加载失败，请刷新页面重试';
    }
}

// 创建流量图表
async function createWaterVolumeChart(container, data, alertVolume) {
    try {
        // 确保插件已加载
        await loadChartDataLabels();
        
        const ctx = container.querySelector('canvas').getContext('2d');
        
        if (container.chart) {
            container.chart.destroy();
        }
        
        const labels = data.map(item => {
            const date = new Date(item.date);
            return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        });
        const values = data.map(item => item.dischg || 0);
        
        // 创建警戒线数据集
        const alertLineData = new Array(labels.length).fill(alertVolume);
        
        container.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '流量 (m³/s)',
                        data: values,
                        backgroundColor: '#2ecc71',
                        borderColor: '#27ae60',
                        borderWidth: 1,
                        order: 2,
                        datalabels: {
                            display: true,
                            formatter: function(value) {
                                // 显示具体数值，保留两位小数
                                return value.toFixed(2) + ' m³/s';
                            },
                            color: '#2c3e50',
                            font: {
                                weight: 'bold',
                                size: 11
                            },
                            padding: {
                                top: 4
                            },
                            align: 'top',
                            anchor: 'end'
                        }
                    },
                    {
                        label: `Alert Level / 警戒线 (${alertVolume.toFixed(2)} m³/s)`,
                        data: alertLineData,
                        type: 'line',
                        borderColor: '#e74c3c',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false,
                        order: 1,
                        datalabels: {
                            display: false
                        }
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        title: {
                            display: true,
                            text: '流量 (m³/s)'
                        },
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(2) + ' m³/s';
                            }
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: '日期'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            filter: function(legendItem, data) {
                                return legendItem.text.includes('Alert Level');
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (context.dataset.label.includes('Alert Level')) {
                                    return `Alert Level / 警戒线: ${context.raw.toFixed(2)} m³/s`;
                                }
                                return `流量: ${context.raw.toFixed(2)} m³/s`;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating water volume chart:', error);
        container.querySelector('.chart-title').textContent = '图表加载失败，请刷新页面重试';
    }
}

// 创建历史图表容器
function createChartContainer(title, subtitle) {
    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container active';
    chartContainer.innerHTML = `
        <div class="chart-header">
            <div class="data-title">
                <h3 class="chart-title">${title}</h3>
                <h4 class="chart-subtitle">${subtitle}</h4>
            </div>
        </div>
        <canvas></canvas>
    `;
    return chartContainer;
}

// 获取小时数据
async function fetchHourlyData(stationId, currentTime) {
    try {
        const hourlyData = [];
        // 使用 +7 时区的当前时间
        const currentTimePlus7 = getCurrentTimePlus7();
        console.log('Current time (UTC+7):', currentTimePlus7.toISOString());
        
        // 获取最近6小时的数据
        for (let i = 0; i < 6; i++) {
            // 计算目标时间
            const targetDate = new Date(currentTimePlus7);
            targetDate.setHours(currentTimePlus7.getHours() - i, 0, 0, 0);
            
            // 验证日期是否有效
            if (!isValidDate(targetDate)) {
                console.log(`Skipping future date: ${targetDate.toISOString()}`);
                continue;
            }
            
            // 生成文件名 - 使用小时格式的文件名
            const fileName = generateFileName(targetDate);
            const dateStr = formatDateForApi(targetDate);
            const targetHour = targetDate.getHours();
            
            console.log(`Processing hour ${i}:`, {
                targetDate: targetDate.toISOString(),
                fileName: fileName,
                dateStr: dateStr,
                targetHour: targetHour
            });
            
            let data = null;
            
            // 尝试从服务器获取缓存数据
            try {
                console.log(`Fetching hourly data from server cache: ${fileName} with station ID: ${stationId}`);
                const response = await fetch(`/station-data/${fileName}`, {
                    headers: {
                        'x-station-id': stationId
                    }
                });
                if (response.ok) {
                    data = await response.json();
                    console.log(`Read hourly data from server cache: ${fileName} (hour: ${targetHour})`, {
                        level1: data.level1,
                        time: data.time,
                        date: data.date
                    });
                } else {
                    console.log(`No data found in server cache for ${fileName} (hour: ${targetHour})`);
                }
            } catch (error) {
                console.log(`Error fetching hourly data from server cache for ${fileName} (hour: ${targetHour}):`, error);
            }
            
            // 如果缓存中没有数据，从水文站服务器获取
            if (!data) {
                // 如果是 0 点，使用前一天的 24 点
                let selectTime;
                let apiDate = targetDate;
                if (targetHour === 0) {
                    const prevDate = new Date(targetDate);
                    prevDate.setDate(prevDate.getDate() - 1);
                    selectTime = '24';
                    apiDate = prevDate;
                } else {
                    selectTime = String(targetHour).padStart(2, '0');
                }
                
                const apiUrl = `${CONFIG.apiBaseUrl}?station_id=${stationId}&select_time=${selectTime}&date=${formatDateForApi(apiDate)}`;
                console.log(`Fetching hourly data from API: ${apiUrl} (hour: ${targetHour}, select_time: ${selectTime})`);
                
                try {
                    const response = await fetch(apiUrl);
                    if (!response.ok) {
                        console.warn(`Failed to fetch hourly data for ${fileName}: HTTP ${response.status}`);
                        continue;
                    }
                    
                    const text = await response.text();
                    if (!text || text.trim() === '') {
                        console.warn(`Empty response for hourly data ${fileName}`);
                        continue;
                    }
                    
                    try {
                        data = JSON.parse(text);
                        console.log(`Successfully parsed API response for ${fileName}:`, {
                            level1: data.level1,
                            time: data.time,
                            date: data.date,
                            selectTime: selectTime,
                            apiDate: formatDateForApi(apiDate)
                        });
                        
                        // 保存数据到服务器缓存
                        try {
                            console.log(`Saving hourly data to server cache: ${fileName} with station ID: ${stationId}`);
                            await fetch(`/station-data/${fileName}`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-station-id': stationId
                                },
                                body: JSON.stringify(data)
                            });
                            console.log(`Saved hourly data to server cache: ${fileName} (hour: ${targetHour})`);
                        } catch (error) {
                            console.warn(`Failed to save hourly data to server cache: ${fileName}`, error);
                        }
                    } catch (error) {
                        console.warn(`Failed to parse hourly data for ${fileName}:`, error);
                        continue;
                    }
                } catch (error) {
                    console.warn(`Failed to fetch hourly data for ${fileName}:`, error);
                    continue;
                }
            }
            
            // 处理数据
            if (data) {
                const { level1, time, price_pole } = data;
                let currentWaterLevel;
                
                // 处理 level1 值
                if (level1 === "" || level1 === null || level1 === undefined || level1 === "0" || level1 === 0) {
                    currentWaterLevel = 0;  // 空值或0值直接显示为 0
                    console.log(`Empty or zero level1, setting to 0 for hour ${targetHour}`);
                } else if (typeof level1 === 'string') {
                    currentWaterLevel = parseFloat(level1.replace(/,/g, ''));
                    if (isNaN(currentWaterLevel)) {
                        currentWaterLevel = 0;  // 无效数据也设置为 0
                        console.log(`Invalid level1 string "${level1}", setting to 0 for hour ${targetHour}`);
                    }
                } else {
                    currentWaterLevel = Number(level1);
                    if (isNaN(currentWaterLevel)) {
                        currentWaterLevel = 0;  // 无效数据也设置为 0
                        console.log(`Invalid level1 value ${level1}, setting to 0 for hour ${targetHour}`);
                    }
                }
                
                const relativeLevel = currentWaterLevel === 0 ? 0 : Math.max(0, currentWaterLevel - (parseFloat(price_pole) || 0));
                
                    hourlyData.push({
                        hour: targetHour,
                        time: time,
                        level: relativeLevel,
                    date: new Date(targetDate)
                });
                
                console.log(`Processed hourly data for ${fileName}:`, {
                    hour: targetHour,
                    time: time,
                    level: relativeLevel,
                    waterLevel: currentWaterLevel,
                    pricePole: price_pole,
                    date: targetDate.toISOString()
                });
            }
        }
        
        // 按时间排序（从早到晚）
        hourlyData.sort((a, b) => a.date - b.date);
        
        console.log('Final hourly data array:', hourlyData.map(item => ({
            date: item.date.toISOString(),
            hour: item.hour,
            level: item.level,
            time: item.time
        })));
        
        return hourlyData;
    } catch (error) {
        console.error('Error fetching hourly data:', error);
        throw error;
    }
}

// 创建小时水位图表
async function createHourlyWaterLevelChart(container, data, alertLevel) {
    try {
        // 确保插件已加载
        await loadChartDataLabels();
        
        const ctx = container.querySelector('canvas').getContext('2d');
        
        if (container.chart) {
            container.chart.destroy();
        }
        
        // 格式化标签显示，包含日期信息
        const labels = data.map(item => {
            const date = item.date;
            const isToday = date.toDateString() === new Date().toDateString();
            const dateStr = isToday ? '' : `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} `;
            return `${dateStr}${String(date.getHours()).padStart(2, '0')}:00`;
        });
        
        // 处理数据，将 -1 值转换为 0 用于显示
        const values = data.map(item => item.level === -1 ? 0 : item.level);
        
        // 创建警戒线数据集
        const alertLineData = new Array(labels.length).fill(alertLevel);
        
        // 计算 Y 轴的范围
        const maxValue = Math.max(...values, alertLevel);
        // 找出最小非零值
        const nonZeroValues = values.filter(v => v > 0);
        const minNonZeroValue = nonZeroValues.length > 0 ? Math.min(...nonZeroValues) : 0;
        // 设置 Y 轴最小值为最小非零值减去 0.5
        const yAxisMin = minNonZeroValue > 0 ? Math.floor((minNonZeroValue - 0.5) * 2) / 2 : 0;
        const yAxisMax = Math.ceil(maxValue * 2) / 2; // 向上取整到最近的 0.5
        
        console.log('Y-axis range calculation:', {
            values: values,
            maxValue: maxValue,
            minNonZeroValue: minNonZeroValue,
            yAxisMin: yAxisMin,
            yAxisMax: yAxisMax
        });
        
        container.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                    label: '水位 (m)',
                    data: values,
                        backgroundColor: '#3498db',
                        borderColor: '#2980b9',
                        borderWidth: 1,
                        order: 2,
                        datalabels: {
                            display: true,
                            formatter: function(value, context) {
                                // 如果原始值是 -1，显示 "无数据"
                                return data[context.dataIndex].level === -1 ? '无数据' : value.toFixed(2) + ' m';
                            },
                            color: '#2c3e50',
                            font: {
                                weight: 'bold',
                                size: 11
                            },
                            padding: {
                                top: 4
                            },
                            align: 'top',  // 将标签对齐到顶部
                            anchor: 'end',  // 将标签锚点设置在数据点的顶部
                            offset: 4  // 添加一些偏移量，让标签离柱状图顶部有一定距离
                        }
                    },
                    {
                        label: `Alert Level / 警戒线 (${alertLevel.toFixed(2)} m)`,
                        data: alertLineData,
                        type: 'line',
                        borderColor: '#e74c3c',
                    borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false,
                        order: 1,
                        datalabels: {
                            display: false
                        }
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        min: yAxisMin,
                        max: yAxisMax,
                        ticks: {
                            stepSize: 0.5, // 设置刻度间隔为 0.5
                            callback: function(value) {
                                return value.toFixed(2) + ' m';
                            }
                        },
                        title: {
                            display: true,
                            text: '水位 (m)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: '时间'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            filter: function(legendItem, data) {
                                return legendItem.text.includes('Alert Level');
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (context.dataset.label.includes('Alert Level')) {
                                    return `Alert Level / 警戒线: ${context.raw.toFixed(2)} m`;
                            }
                                // 如果原始值是 -1，在提示中显示 "无数据"
                                return data[context.dataIndex].level === -1 ? 
                                    '水位: 无数据' : 
                                    `水位: ${context.raw.toFixed(2)} m`;
                        }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating hourly water level chart:', error);
        container.querySelector('.chart-title').textContent = '图表加载失败，请刷新页面重试';
    }
}

// 获取数据
async function fetchData(customDate = null) {
    try {
        hideError();
        if (loadingIndicator) {
        loadingIndicator.style.display = 'block';
        }
        if (dataList) {
        dataList.innerHTML = '';
        }
        
        // 使用新的获取当前数据的函数
        const data = await fetchCurrentData();
        await processData(data);
        
    } catch (error) {
        console.error('Error fetching data:', error);
        if (errorMessage) {
        showError(`Failed to get data: ${error.message}`);
        }
        if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
        }
    }
}

// 处理数据
async function processData(data) {
    try {
        if (!dataList) {
            console.error('dataList element not found');
            return;
        }
        
        dataList.innerHTML = '';
        
        console.log('Raw data received:', JSON.stringify(data, null, 2));
        
        if (!data) {
            if (errorMessage) {
            showError('No data received');
            }
            return;
        }

        // 检查数据格式
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
                console.log('Parsed string data:', JSON.stringify(data, null, 2));
            } catch (e) {
                console.error('JSON parsing error in processData:', e);
                showError('Data format error: Unable to parse JSON');
                return;
            }
        }

        // 检查数据是否为对象
        if (typeof data !== 'object' || Array.isArray(data)) {
            console.error('Invalid data format:', data);
            showError('Data format error: Expected object format');
            return;
        }

        // 提取并翻译数据
        const {
            station_name,
            water_name,
            level_water,
            level1,
            dischg,
            time,
            date,
            level_limit,
            dischg_limit,
            price_pole
        } = data;

        console.log('Extracted data values:', {
            station_name: `${station_name} (${typeof station_name})`,
            water_name: `${water_name} (${typeof water_name})`,
            level_water: `${level_water} (${typeof level_water})`,
            level1: `${level1} (${typeof level1})`,
            dischg: `${dischg} (${typeof dischg})`,
            time: `${time} (${typeof time})`,
            date: `${date} (${typeof date})`,
            level_limit: `${level_limit} (${typeof level_limit})`,
            dischg_limit: `${dischg_limit} (${typeof dischg_limit})`,
            price_pole: `${price_pole} (${typeof price_pole})`
        });

        // 处理 level1 值
        let numericLevel1;
        let displayLevel = '0.00';  // 默认显示为 0
        const pricePole = parseFloat(price_pole) || 0;
        
        // 检查 level1 是否为空或为 0
        if (level1 === "" || level1 === null || level1 === undefined || level1 === "0" || level1 === 0) {
            numericLevel1 = 0;  // 直接设置为 0
            console.log('level1 is empty or zero, setting to 0');
        } else if (typeof level1 === 'string') {
            numericLevel1 = parseFloat(level1.replace(/,/g, ''));
            if (isNaN(numericLevel1)) {
                numericLevel1 = 0;  // 无效数据也设置为 0
                console.log(`Invalid level1 string "${level1}", setting to 0`);
            } else {
                console.log(`Converted level1 from string "${level1}" to number: ${numericLevel1}`);
                // 只有当 level1 有有效值时才进行基准高度计算
                const relativeLevel = Math.max(0, numericLevel1 - pricePole);
                displayLevel = relativeLevel.toFixed(2);
                console.log(`Calculated relative level: ${displayLevel} (raw: ${numericLevel1}, price_pole: ${pricePole})`);
            }
        } else {
            numericLevel1 = Number(level1);
            if (isNaN(numericLevel1)) {
                numericLevel1 = 0;  // 无效数据也设置为 0
                console.log(`Invalid level1 value ${level1}, setting to 0`);
            } else {
                console.log(`Converted level1 from ${typeof level1} to number: ${numericLevel1}`);
                // 只有当 level1 有有效值时才进行基准高度计算
                const relativeLevel = Math.max(0, numericLevel1 - pricePole);
                displayLevel = relativeLevel.toFixed(2);
                console.log(`Calculated relative level: ${displayLevel} (raw: ${numericLevel1}, price_pole: ${pricePole})`);
            }
        }

        // 使用转换后的数值
        const relativeLevel = numericLevel1 === 0 ? 0 : Math.max(0, numericLevel1 - pricePole);
        const alertLevel = parseFloat(level_limit) || 0;
        // 当水位超过警戒值的80%时显示红色，且不为0
        const isAlert = numericLevel1 !== 0 && relativeLevel > (alertLevel * 0.8);

        // 更新最后更新时间（使用 API 返回的时间）
        updateLastUpdateTime(time, date);

        // 创建数据项
        const items = [
            createDataItem('Station Name', station_name || 'Unknown', '', false, true, false, station_name || 'Unknown'),
            createDataItem('River Name', translateThaiToEnglish(water_name) || 'Unknown', '', false, false, false),
            createDataItem('Current Water Level', numericLevel1 === -1 ? 'No Data' : relativeLevel.toFixed(2), 'm', isAlert, false, false)
        ];

        // 添加当前水位数据项
        items.forEach(item => dataList.appendChild(item));
        
        // 创建并显示小时水位图表
        const hourlyChartContainer = createChartContainer('Water Level Hourly', '近6小时水位变化');
        dataList.appendChild(hourlyChartContainer);
        
        try {
            // 获取小时数据
            const hourlyData = await fetchHourlyData(CONFIG.stationId, time);
            if (hourlyData && hourlyData.length > 0) {
                // 传入警戒水位值
                await createHourlyWaterLevelChart(hourlyChartContainer, hourlyData, parseFloat(level_limit) || 0);
            } else {
                hourlyChartContainer.querySelector('.chart-title').textContent = '无法获取小时数据';
            }
        } catch (error) {
            console.error('Error showing hourly chart:', error);
            hourlyChartContainer.querySelector('.chart-title').textContent = '获取小时数据失败，请稍后重试';
        }
        
        // 创建并显示水位历史图表
        const waterLevelChartContainer = createChartContainer('Water Level History', '近5天水位变化');
        dataList.appendChild(waterLevelChartContainer);
        
        // 添加其他数据项
        const otherItems = [
            createDataItem('Current Water Volume', dischg || 'Unknown', 'm³/s', false, false, false)
        ];
        
        otherItems.forEach(item => dataList.appendChild(item));
        
        // 创建并显示流量历史图表
        const waterVolumeChartContainer = createChartContainer('Water Volume History', '近5天流量变化');
        dataList.appendChild(waterVolumeChartContainer);
        
        // 添加剩余数据项
        const remainingItems = [
            createDataItem('Reference Level', (parseFloat(price_pole) || 0).toFixed(2), 'm', false, false, false)
        ];
        
        remainingItems.forEach(item => dataList.appendChild(item));
        
        try {
            // 获取历史数据
            const historicalData = await fetchHistoricalData(5);
            
            if (!historicalData || historicalData.length === 0) {
                throw new Error('无法获取历史数据');
            }
            
            // 创建水位图表，传入警戒值
            await createWaterLevelChart(waterLevelChartContainer, historicalData, parseFloat(level_limit) || 0);
            
            // 创建流量图表，传入警戒值
            await createWaterVolumeChart(waterVolumeChartContainer, historicalData, parseFloat(dischg_limit) || 0);
            
        } catch (error) {
            console.error('Error showing historical charts:', error);
            waterLevelChartContainer.querySelector('.chart-title').textContent = '获取历史数据失败，请稍后重试';
            waterVolumeChartContainer.querySelector('.chart-title').textContent = '获取历史数据失败，请稍后重试';
        }
        
        loadingIndicator.style.display = 'none';
    } catch (error) {
        console.error('Error processing data:', error);
        showError(`Error processing data: ${error.message}`);
        loadingIndicator.style.display = 'none';
    }
}

// 事件监听
refreshButton.addEventListener('click', () => fetchData());

// 每5分钟自动刷新一次
setInterval(() => fetchData(), 5 * 60 * 1000); 

// 导出初始化函数，供外部调用
window.initialize = initialize; 