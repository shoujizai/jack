// 游戏数据
const games = [
    { id: 1, name: "超级马里奥奥德赛", size: 5200 },
    { id: 2, name: "塞尔达传说：旷野之息", size: 14000 },
    { id: 3, name: "超级 Smash Bros. Ultimate", size: 16000 },
    { id: 4, name: "动物森友会", size: 7100 },
    { id: 5, name: "异度之刃2", size: 13000 },
    { id: 6, name: "马里奥赛车8豪华版", size: 7000 },
    { id: 7, name: "塞尔达传说：王国之泪", size: 18000 },
    { id: 8, name: "超级马里奥3D世界+狂怒世界", size: 6300 },
    { id: 9, name: "喷射战士3", size: 15000 },
    { id: 10, name: "火焰纹章：风花雪月", size: 11000 },
    { id: 11, name: "星露谷物语", size: 200 },
    { id: 12, name: "我的世界", size: 1000 },
    { id: 13, name: "堡垒之夜", size: 30000 },
    { id: 14, name: "英雄联盟", size: 15000 },
    { id: 15, name: "守望先锋", size: 25000 },
    { id: 16, name: "CS:GO", size: 15000 },
    { id: 17, name: "GTA5", size: 90000 },
    { id: 18, name: "荒野大镖客2", size: 150000 },
    { id: 19, name: "赛博朋克2077", size: 70000 },
    { id: 20, name: "艾尔登法环", size: 50000 },
    { id: 21, name: "战神4", size: 70000 },
    { id: 22, name: "最后生还者重制版", size: 80000 },
    { id: 23, name: " Horizon Forbidden West", size: 90000 },
    { id: 24, name: "死亡搁浅", size: 80000 },
    { id: 25, name: "刺客信条：英灵殿", size: 100000 },
    { id: 26, name: "孤岛惊魂6", size: 60000 },
    { id: 27, name: "使命召唤：现代战争2", size: 120000 },
    { id: 28, name: "战地2042", size: 100000 },
    { id: 29, name: "彩虹六号：围攻", size: 60000 },
    { id: 30, name: " Apex Legends", size: 50000 }
];

// DOM 元素
const gameTableBody = document.querySelector('#game-table tbody');
const selectAllCheckbox = document.querySelector('#select-all');
const selectedCountElement = document.querySelector('#selected-count');
const selectedSizeElement = document.querySelector('#selected-size');
const selectedIdsElement = document.querySelector('#selected-ids');
const copyButton = document.querySelector('#copy-button');
const searchInput = document.querySelector('#search-input');
const searchButton = document.querySelector('#search-button');

// 全局变量存储选中的游戏ID
let selectedGameIds = [];

// 格式化序号为3位数
function formatId(id) {
    return id.toString().padStart(3, '0');
}

// 初始化游戏表格
function initGameTable(searchTerm = '') {
    // 清空表格
    gameTableBody.innerHTML = '';
    
    // 过滤游戏
    const filteredGames = games.filter(game => {
        return game.name.toLowerCase().includes(searchTerm.toLowerCase());
    });
    
    // 添加过滤后的游戏
    filteredGames.forEach(game => {
        const sizeInGB = (game.size / 1024).toFixed(2);
        const formattedId = formatId(game.id);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formattedId}</td>
            <td>${game.name}</td>
            <td>${sizeInGB}</td>
            <td><input type="checkbox" class="game-checkbox" data-id="${game.id}" data-size="${game.size}"></td>
        `;
        gameTableBody.appendChild(row);
    });
}

// 更新统计信息
function updateStats() {
    // 使用全局selectedGameIds变量
    const selectedCount = selectedGameIds.length;
    const selectedSize = selectedGameIds.reduce((total, id) => {
        const game = games.find(game => game.id === id);
        return total + (game ? game.size : 0);
    }, 0);
    
    const sizeInGB = (selectedSize / 1024).toFixed(2);
    
    selectedCountElement.textContent = selectedCount;
    selectedSizeElement.textContent = `${sizeInGB} GB`;
    
    // 更新选中的游戏序号
    updateSelectedIds();
}

// 更新选中的游戏名字
function updateSelectedIds() {
    // 使用全局selectedGameIds变量
    const sortedIds = [...selectedGameIds].sort((a, b) => a - b);
    
    selectedIdsElement.innerHTML = '';
    sortedIds.forEach(id => {
        const game = games.find(game => game.id === id);
        if (game) {
            const li = document.createElement('li');
            li.textContent = game.name;
            li.style.cursor = 'pointer';
            li.style.position = 'relative';
            li.style.padding = '4px 25px 4px 8px';
            li.style.marginBottom = '4px';
            
            // 添加取消按钮
            const cancelBtn = document.createElement('span');
            cancelBtn.textContent = '×';
            cancelBtn.style.position = 'absolute';
            cancelBtn.style.right = '6px';
            cancelBtn.style.top = '50%';
            cancelBtn.style.transform = 'translateY(-50%)';
            cancelBtn.style.fontSize = '14px';
            cancelBtn.style.fontWeight = 'bold';
            cancelBtn.style.color = 'rgba(0,0,0,0.7)';
            cancelBtn.style.cursor = 'pointer';
            cancelBtn.style.userSelect = 'none';
            cancelBtn.style.width = '16px';
            cancelBtn.style.height = '16px';
            cancelBtn.style.display = 'flex';
            cancelBtn.style.alignItems = 'center';
            cancelBtn.style.justifyContent = 'center';
            cancelBtn.style.borderRadius = '50%';
            cancelBtn.style.backgroundColor = 'rgba(255,255,255,0.7)';
            
            // 添加点击事件监听器
            cancelBtn.addEventListener('click', function(e) {
                e.stopPropagation(); // 阻止事件冒泡
                // 从selectedGameIds中移除该游戏
                selectedGameIds = selectedGameIds.filter(gameId => gameId !== id);
                // 更新复选框状态
                const checkbox = document.querySelector(`.game-checkbox[data-id="${id}"]`);
                if (checkbox) {
                    checkbox.checked = false;
                }
                // 更新统计信息和显示
                updateStats();
            });
            
            li.appendChild(cancelBtn);
            selectedIdsElement.appendChild(li);
        }
    });
}

// 全选/取消全选功能
function setupSelectAll() {
    selectAllCheckbox.addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('.game-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
        });
        // 更新全局选中游戏ID列表
        updateSelectedGameIds();
        updateStats();
    });
}

// 设置游戏复选框事件监听器
function setupGameCheckboxes() {
    gameTableBody.addEventListener('change', function(e) {
        if (e.target.classList.contains('game-checkbox')) {
            // 更新全局选中游戏ID列表
            updateSelectedGameIds();
            updateStats();
            
            // 更新全选复选框状态
            const allCheckboxes = document.querySelectorAll('.game-checkbox');
            const checkedCheckboxes = document.querySelectorAll('.game-checkbox:checked');
            selectAllCheckbox.checked = allCheckboxes.length === checkedCheckboxes.length;
        }
    });
}

// 设置复制按钮功能
function setupCopyButton() {
    copyButton.addEventListener('click', function() {
        // 使用全局selectedGameIds变量
        const sortedIds = [...selectedGameIds].sort((a, b) => a - b);
        const formattedIds = sortedIds.map(id => formatId(id));
        const idsText = formattedIds.join(' ');
        
        navigator.clipboard.writeText(idsText).then(() => {
            // 显示复制成功的提示
            const originalText = copyButton.textContent;
            copyButton.textContent = '复制成功！';
            copyButton.style.backgroundColor = '#2196F3';
            
            setTimeout(() => {
                copyButton.textContent = originalText;
                copyButton.style.backgroundColor = '#4CAF50';
            }, 2000);
        }).catch(err => {
            console.error('复制失败:', err);
        });
    });
}

// 更新全局选中游戏ID列表
function updateSelectedGameIds() {
    const checkboxes = document.querySelectorAll('.game-checkbox');
    const currentSelectedIds = new Set(selectedGameIds);
    
    checkboxes.forEach(checkbox => {
        const id = parseInt(checkbox.dataset.id);
        if (checkbox.checked) {
            currentSelectedIds.add(id);
        } else {
            currentSelectedIds.delete(id);
        }
    });
    
    selectedGameIds = Array.from(currentSelectedIds);
}

// 恢复选择状态
function restoreSelectionState() {
    const checkboxes = document.querySelectorAll('.game-checkbox');
    checkboxes.forEach(checkbox => {
        const id = parseInt(checkbox.dataset.id);
        checkbox.checked = selectedGameIds.includes(id);
    });
}

// 执行搜索
function performSearch() {
    // 保存当前选择状态
    const currentSelectedIds = [...selectedGameIds];
    
    const searchTerm = searchInput.value;
    initGameTable(searchTerm);
    setupGameCheckboxes(); // 重新绑定事件监听器
    
    // 恢复选择状态
    selectedGameIds = currentSelectedIds;
    restoreSelectionState();
    
    updateStats(); // 更新统计信息
    
    // 滚动到表格容器
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer) {
        tableContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// 设置搜索功能
function setupSearch() {
    // 实时搜索
    searchInput.addEventListener('input', function() {
        performSearch();
    });
    
    // 点击搜索按钮
    searchButton.addEventListener('click', function() {
        performSearch();
    });
    
    // 按回车键搜索
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
}

// 初始化应用
function initApp() {
    initGameTable();
    setupSelectAll();
    setupGameCheckboxes();
    setupCopyButton();
    setupSearch();
    // 初始化全局选中游戏ID列表
    updateSelectedGameIds();
    updateStats();
}

// 启动应用
initApp();