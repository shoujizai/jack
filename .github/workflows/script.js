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
    { id: 10, name: "火焰纹章：风花雪月", size: 11000 }
];

// DOM 元素
const gameTableBody = document.querySelector('#game-table tbody');
const selectAllCheckbox = document.querySelector('#select-all');
const selectedCountElement = document.querySelector('#selected-count');
const selectedSizeElement = document.querySelector('#selected-size');
const selectedIdsElement = document.querySelector('#selected-ids');
const copyButton = document.querySelector('#copy-button');

// 格式化序号为3位数
function formatId(id) {
    return id.toString().padStart(3, '0');
}

// 初始化游戏表格
function initGameTable() {
    games.forEach(game => {
        const sizeInGB = (game.size / 1024).toFixed(2);
        const formattedId = formatId(game.id);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="game-checkbox" data-id="${game.id}" data-size="${game.size}"></td>
            <td>${formattedId}</td>
            <td>${game.name}</td>
            <td>${sizeInGB}</td>
        `;
        gameTableBody.appendChild(row);
    });
}

// 更新统计信息
function updateStats() {
    const checkedCheckboxes = document.querySelectorAll('.game-checkbox:checked');
    const selectedCount = checkedCheckboxes.length;
    const selectedSize = Array.from(checkedCheckboxes).reduce((total, checkbox) => {
        return total + parseInt(checkbox.dataset.size);
    }, 0);
    
    const sizeInGB = (selectedSize / 1024).toFixed(2);
    
    selectedCountElement.textContent = selectedCount;
    selectedSizeElement.textContent = `${sizeInGB} GB`;
    
    // 更新选中的游戏序号
    updateSelectedIds();
}

// 更新选中的游戏序号
function updateSelectedIds() {
    const checkedCheckboxes = document.querySelectorAll('.game-checkbox:checked');
    const selectedIds = Array.from(checkedCheckboxes).map(checkbox => {
        return parseInt(checkbox.dataset.id);
    }).sort((a, b) => a - b);
    
    selectedIdsElement.innerHTML = '';
    selectedIds.forEach(id => {
        const li = document.createElement('li');
        li.textContent = formatId(id);
        selectedIdsElement.appendChild(li);
    });
}

// 全选/取消全选功能
function setupSelectAll() {
    selectAllCheckbox.addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('.game-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
        });
        updateStats();
    });
}

// 设置游戏复选框事件监听器
function setupGameCheckboxes() {
    gameTableBody.addEventListener('change', function(e) {
        if (e.target.classList.contains('game-checkbox')) {
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
        const checkedCheckboxes = document.querySelectorAll('.game-checkbox:checked');
        const selectedIds = Array.from(checkedCheckboxes).map(checkbox => {
            return parseInt(checkbox.dataset.id);
        }).sort((a, b) => a - b);
        
        const formattedIds = selectedIds.map(id => formatId(id));
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

// 初始化应用
function initApp() {
    initGameTable();
    setupSelectAll();
    setupGameCheckboxes();
    setupCopyButton();
    updateStats();
}

// 启动应用
initApp();