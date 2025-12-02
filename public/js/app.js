// 聊天应用JavaScript代码 - 支持群聊和私聊

// DOM元素引用
const nameModal = document.getElementById('name-modal');
const nicknameInput = document.getElementById('nickname-input');
const confirmNameBtn = document.getElementById('confirm-name-btn');
const currentUserElement = document.getElementById('current-user');
const changeNameBtn = document.getElementById('change-name-btn');
const chatMessages = document.getElementById('chat-messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const userList = document.getElementById('user-list');
const chatModeSelector = document.createElement('select');
const chatWithSelector = document.createElement('select');
const chatModeLabel = document.createElement('span');
const chatWithLabel = document.createElement('span');

// 全局变量
let currentUser = null;
let socket = null;
let currentChatMode = 'group'; // 'group' 或 'private'
let currentChatWith = null;
let privateMessages = {}; // 存储私聊消息 { receiverNickname: [messages] }
const STORAGE_KEYS = {
    CURRENT_USER: 'chat_room_current_user'
};

// 连接状态处理函数
function updateConnectionStatus(isConnected) {
    // 创建或更新连接状态指示器
    let statusIndicator = document.getElementById('connection-status');
    if (!statusIndicator) {
        statusIndicator = document.createElement('div');
        statusIndicator.id = 'connection-status';
        statusIndicator.style.cssText = 'position: fixed; bottom: 20px; right: 20px; padding: 8px 15px; border-radius: 20px; font-size: 0.9rem; z-index: 1000;';
        document.body.appendChild(statusIndicator);
    }
    
    if (isConnected) {
        statusIndicator.textContent = '已连接';
        statusIndicator.style.backgroundColor = '#27ae60';
        statusIndicator.style.color = 'white';
    } else {
        statusIndicator.textContent = '连接已断开';
        statusIndicator.style.backgroundColor = '#e74c3c';
        statusIndicator.style.color = 'white';
    }
}

// 禁用聊天输入
function disableChatInput() {
    messageInput.disabled = true;
    sendBtn.disabled = true;
    messageInput.placeholder = '连接已断开，无法发送消息';
}

// 启用聊天输入
function enableChatInput() {
    if (currentUser) {
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.placeholder = '输入消息...';
    }
}

// 更新聊天标题
function updateChatTitle(title) {
    const chatHeader = document.querySelector('.chat-header');
    if (!chatHeader) return;
    
    let chatTitle = document.querySelector('.chat-title');
    if (!chatTitle) {
        chatTitle = document.createElement('h2');
        chatTitle.className = 'chat-title';
        chatHeader.insertBefore(chatTitle, chatHeader.firstChild);
    }
    chatTitle.textContent = title;
}

// 初始化Socket连接
function initSocket() {
    try {
        // 创建socket连接
        socket = io();
        
        // 连接成功事件
        socket.on('connect', () => {
            console.log('Socket连接成功:', socket.id);
            if (currentUser) {
                socket.emit('user-join', { nickname: currentUser });
            }
            updateConnectionStatus(true);
            enableChatInput();
        });
        
        // 接收新消息
        socket.on('new-message', (message) => {
            // 只有在群聊模式下才显示群聊消息
            if (currentChatMode === 'group') {
                addMessage(message);
            }
        });
        
        // 接收新的私聊消息
        socket.on('new-private-message', (message) => {
            // 保存私聊消息
            if (!privateMessages[message.sender]) {
                privateMessages[message.sender] = [];
            }
            if (!privateMessages[message.receiver]) {
                privateMessages[message.receiver] = [];
            }
            
            // 根据消息方向保存到对应的聊天记录中
            if (message.sender === currentUser) {
                privateMessages[message.receiver].push(message);
            } else if (message.receiver === currentUser) {
                privateMessages[message.sender].push(message);
                
                // 如果当前不是与该用户的私聊，添加通知
                if (currentChatMode !== 'private' || currentChatWith !== message.sender) {
                    const userElement = Array.from(userList.querySelectorAll('li'))
                        .find(el => el.textContent.includes(message.sender));
                    if (userElement) {
                        userElement.style.fontWeight = 'bold';
                        userElement.style.backgroundColor = '#f0f8ff';
                        // 3秒后恢复正常样式
                        setTimeout(() => {
                            if (userElement.textContent.includes(message.sender)) {
                                userElement.style.fontWeight = '';
                                userElement.style.backgroundColor = '';
                            }
                        }, 3000);
                    }
                }
            }
            
            // 如果当前正在与消息发送者或接收者私聊，则显示消息
            if (currentChatMode === 'private' && 
                (currentChatWith === message.sender || currentChatWith === message.receiver)) {
                addMessage(message, true);
            }
        });
        
        // 接收私聊消息错误
        socket.on('private-message-error', (error) => {
            addSystemMessage(`发送私聊消息失败: ${error.error || '接收者可能离线'}`);
        });
        
        // 更新用户列表
        socket.on('update-users', (users) => {
            updateUserList(users);
            updateChatWithSelector(users);
        });
        
        // 用户加入消息
        socket.on('user-joined', (data) => {
            // 只在群聊模式下显示系统消息
            if (currentChatMode === 'group') {
                addSystemMessage(`${data.nickname} 加入了聊天室`);
            }
        });
        
        // 用户离开消息
        socket.on('user-left', (data) => {
            // 只在群聊模式下显示系统消息
            if (currentChatMode === 'group') {
                addSystemMessage(`${data.nickname} 离开了聊天室`);
            }
        });
        
        // 连接断开事件
        socket.on('disconnect', () => {
            console.log('Socket连接断开');
            addSystemMessage('连接已断开，请刷新页面重试');
            updateConnectionStatus(false);
            disableChatInput();
        });
        
        // 连接错误
        socket.on('connect_error', (error) => {
            console.error('Socket连接错误:', error);
            addSystemMessage(`连接失败: ${error.message || '无法连接到服务器'}`);
            updateConnectionStatus(false);
            disableChatInput();
        });
        
        // 重连尝试
        socket.on('reconnect_attempt', (attemptNumber) => {
            console.log(`正在尝试重连 (${attemptNumber})...`);
        });
        
        // 重连成功
        socket.on('reconnect', (attemptNumber) => {
            console.log(`重连成功 (尝试次数: ${attemptNumber})`);
            addSystemMessage('连接已恢复');
            updateConnectionStatus(true);
            enableChatInput();
            // 重新发送用户信息
            if (currentUser) {
                socket.emit('user-join', { nickname: currentUser });
            }
        });
        
        return true;
    } catch (error) {
        console.error('Socket初始化失败:', error);
        addSystemMessage('初始化聊天连接失败，请刷新页面重试');
        disableChatInput();
        return false;
    }
}

// 初始化应用
function initApp() {
    // 初始化Socket连接
    if (!initSocket()) {
        alert('WebSocket连接失败，无法使用实时聊天功能！');
    }
    
    // 添加聊天模式选择器和私聊对象选择器
    addChatModeControls();
    
    // 尝试从localStorage恢复当前用户
    try {
        const savedUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        if (savedUser) {
            currentUser = savedUser;
            currentUserElement.textContent = `当前用户: ${currentUser}`;
            hideNameModal();
            messageInput.disabled = false;
            sendBtn.disabled = false;
            
            // 如果socket已连接，发送用户加入信息
            if (socket && socket.connected) {
                socket.emit('user-join', { nickname: currentUser });
            }
            
            // 添加系统消息
            addSystemMessage('您已成功加入聊天室');
        } else {
            // 显示昵称设置模态框
            showNameModal();
        }
    } catch (error) {
        console.error('初始化应用失败:', error);
        showNameModal();
    }
    
    // 绑定事件监听器
    bindEventListeners();
    
    // 添加清除聊天记录按钮
    addClearChatButton();
    
    // 为输入框添加自动调整高度的事件监听器
    messageInput.addEventListener('input', autoResizeTextarea);
    messageInput.addEventListener('keydown', (e) => {
        // 允许Shift+Enter换行，Enter发送消息
        if (e.key === 'Enter' && !e.shiftKey) {
            // 不阻止默认行为，让form的submit处理
        } else if (e.key === 'Enter' && e.shiftKey) {
            // 允许Shift+Enter插入换行
            setTimeout(autoResizeTextarea.bind(messageInput), 0);
        }
    });
    
    // 初始化输入框样式
    messageInput.style.minHeight = '40px';
    messageInput.style.maxHeight = '120px';
    messageInput.style.overflowY = 'hidden';
    messageInput.style.resize = 'none';
}

// 添加聊天模式控制元素
function addChatModeControls() {
    const chatHeader = document.querySelector('.chat-header');
    
    // 聊天模式选择器
    chatModeLabel.textContent = '聊天模式: ';
    chatModeLabel.style.marginRight = '5px';
    
    chatModeSelector.innerHTML = `
        <option value="group">群聊</option>
        <option value="private">私聊</option>
    `;
    chatModeSelector.style.marginRight = '20px';
    chatModeSelector.addEventListener('change', handleChatModeChange);
    
    // 私聊对象选择器
    chatWithLabel.textContent = '私聊对象: ';
    chatWithLabel.style.marginRight = '5px';
    chatWithLabel.style.display = 'none'; // 默认隐藏
    
    chatWithSelector.style.marginRight = '20px';
    chatWithSelector.style.display = 'none'; // 默认隐藏
    chatWithSelector.addEventListener('change', handleChatWithChange);
    
    // 将控制元素添加到标题栏
    chatHeader.appendChild(chatModeLabel);
    chatHeader.appendChild(chatModeSelector);
    chatHeader.appendChild(chatWithLabel);
    chatHeader.appendChild(chatWithSelector);
}

// 处理聊天模式切换
function handleChatModeChange() {
    const newMode = chatModeSelector.value;
    currentChatMode = newMode;
    
    // 清空消息区域
    chatMessages.innerHTML = '';
    
    // 显示或隐藏私聊对象选择器
    if (newMode === 'private') {
        chatWithLabel.style.display = 'inline-block';
        chatWithSelector.style.display = 'inline-block';
        
        // 如果有选择的聊天对象，加载私聊记录
        if (currentChatWith) {
            loadPrivateMessages(currentChatWith);
        }
    } else {
        chatWithLabel.style.display = 'none';
        chatWithSelector.style.display = 'none';
        currentChatWith = null;
        addSystemMessage('您正在群聊模式');
    }
    
    // 更新聊天标题
    if (newMode === 'private') {
        updateChatTitle(`私聊 - ${currentChatWith || '请选择用户'}`);
    } else {
        updateChatTitle('群聊');
    }

// 处理私聊对象切换
function handleChatWithChange() {
    currentChatWith = chatWithSelector.value;
    
    // 更新聊天标题
    updateChatTitle(`私聊 - ${currentChatWith || '请选择用户'}`);
    
    if (currentChatWith) {
        loadPrivateMessages(currentChatWith);
    } else {
        chatMessages.innerHTML = '';
    }
}

// 更新私聊对象选择器
function updateChatWithSelector(users) {
    const wasEmpty = chatWithSelector.innerHTML === '';
    const prevSelection = chatWithSelector.value;
    
    // 清空现有选项
    chatWithSelector.innerHTML = '<option value="">请选择私聊对象</option>';
    
    // 添加除了自己之外的用户选项
    users.forEach(user => {
        if (user !== currentUser) {
            const option = document.createElement('option');
            option.value = user;
            option.textContent = user;
            
            // 检查是否有未读消息
            const hasUnread = privateMessages[user] && privateMessages[user].some(msg => 
                msg.sender === user && currentChatMode !== 'private' || 
                (currentChatMode === 'private' && currentChatWith !== user)
            );
            
            if (hasUnread) {
                option.textContent += ' (新消息)';
                option.style.fontWeight = 'bold';
            }
            
            chatWithSelector.appendChild(option);
        }
    });
    
    // 如果之前有选择，尝试恢复选择
    if (prevSelection && users.includes(prevSelection)) {
        chatWithSelector.value = prevSelection;
        // 如果选择改变了，触发change事件
        if (currentChatWith !== prevSelection) {
            handleChatWithChange();
        }
    } else if (wasEmpty && currentChatWith && users.includes(currentChatWith)) {
        // 如果是首次加载且有默认选择，设置选择
        chatWithSelector.value = currentChatWith;
    } else if (!chatWithSelector.value) {
        // 如果之前选择的用户不在列表中，清空选择
        currentChatWith = '';
    }
}

// 加载私聊消息记录
function loadPrivateMessages(user) {
    // 清空消息区域
    chatMessages.innerHTML = '';
    addSystemMessage(`您正在与 ${user} 私聊`);
    
    // 显示之前的聊天记录
    if (privateMessages[user] && privateMessages[user].length > 0) {
        privateMessages[user].forEach(message => {
            addMessage(message, true);
        });
    }
}

// 显示昵称设置模态框
function showNameModal() {
    nameModal.style.display = 'flex';
    nicknameInput.focus();
}

// 隐藏昵称设置模态框
function hideNameModal() {
    nameModal.style.display = 'none';
}

// 绑定事件监听器
function bindEventListeners() {
    // 确认昵称
    confirmNameBtn.addEventListener('click', handleNameConfirmation);
    nicknameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleNameConfirmation();
        }
    });
    
    // 更改昵称按钮
    changeNameBtn.addEventListener('click', showNameModal);
    
    // 发送消息表单
    messageForm.addEventListener('submit', handleMessageSubmit);
    
    // 消息输入框自动调整高度
    messageInput.addEventListener('input', autoResizeTextarea);
    
    // ESC键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && nameModal.style.display === 'flex' && currentUser) {
            hideNameModal();
        }
    });
}

// 处理昵称确认
function handleNameConfirmation() {
    const nickname = nicknameInput.value.trim();
    
    if (!nickname) {
        alert('请输入有效的昵称');
        return;
    }
    
    if (nickname.length > 20) {
        alert('昵称不能超过20个字符');
        return;
    }
    
    currentUser = nickname;
    currentUserElement.textContent = `当前用户: ${currentUser}`;
    
    // 保存当前用户到localStorage
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, currentUser);
    
    // 通过socket发送用户加入信息
    if (socket && socket.connected) {
        socket.emit('user-join', { nickname: currentUser });
    }
    
    hideNameModal();
    nicknameInput.value = '';
    
    // 启用消息输入和发送按钮
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();
    
    // 清空消息区域并添加系统消息
    chatMessages.innerHTML = '';
    addSystemMessage('您已成功加入聊天室');
}

// Supabase相关函数已移除，使用WebSocket实现聊天功能

// 处理消息提交
function handleMessageSubmit(e) {
    e.preventDefault();
    
    const messageText = messageInput.value.trim();
    
    if (!messageText || !currentUser) {
        return;
    }
    
    // 根据当前聊天模式发送不同类型的消息
    if (currentChatMode === 'private' && currentChatWith) {
        // 发送私聊消息
        const privateMessage = {
            sender: currentUser,
            receiver: currentChatWith,
            text: messageText,
            timestamp: new Date().toISOString()
        };
        
        if (socket && socket.connected) {
            socket.emit('send-private-message', privateMessage);
            
            // 清空输入框并重置高度
            messageInput.value = '';
            messageInput.style.height = 'auto';
            messageInput.focus();
        } else {
            addSystemMessage('发送消息失败：连接已断开');
        }
    } else {
        // 发送群聊消息
        const message = {
            nickname: currentUser,
            text: messageText,
            timestamp: new Date().toISOString()
        };
        
        if (socket && socket.connected) {
            socket.emit('send-message', message);
            
            // 清空输入框并重置高度
            messageInput.value = '';
            messageInput.style.height = 'auto';
            messageInput.focus();
        } else {
            addSystemMessage('发送消息失败：连接已断开');
        }
    }
}

// WebSocket相关的实时监听已在initSocket中实现

// 获取聊天键（用于私聊消息存储）
function getChatKey(user) {
    return user === currentUser ? currentUser : user;
}

// 添加消息到聊天窗口
function addMessage(data) {
    // 确定消息类型和是否为当前用户发送
    const isPrivateMessage = data.type === 'private' || data.sender || data.receiver;
    const isCurrentUser = data.nickname === currentUser || data.sender === currentUser;
    
    // 检查消息是否应该在当前聊天模式下显示
    if (isPrivateMessage) {
        // 私聊消息只在对应的私聊模式下显示
        const messageFrom = data.sender || data.nickname;
        const messageTo = data.receiver || (isCurrentUser ? data.nickname : currentUser);
        
        if (currentChatMode !== 'private' || 
            (currentChatWith !== messageFrom && currentChatWith !== messageTo)) {
            return;
        }
        
        // 标记消息为已读
        const chatKey = getChatKey(messageFrom);
        if (privateMessages[chatKey]) {
            const msgIndex = privateMessages[chatKey].findIndex(msg => 
                msg.timestamp === data.timestamp && msg.sender === messageFrom
            );
            if (msgIndex !== -1) {
                privateMessages[chatKey][msgIndex].read = true;
            }
        }
    } else {
        // 群聊消息只在群聊模式下显示
        if (currentChatMode !== 'group') {
            return;
        }
    }
    
    const messageDiv = document.createElement('div');
    
    // 设置消息样式
    const baseClass = isPrivateMessage ? 
        `message private-message ${isCurrentUser ? 'user-message' : 'other-message'}` :
        `message ${isCurrentUser ? 'user-message' : 'other-message'}`;
    messageDiv.className = baseClass;
    
    const formattedTime = formatTime(data.timestamp);
    let headerText = data.nickname || data.sender;
    
    // 如果是私聊消息，显示发送者和接收者
    if (isPrivateMessage) {
        const sender = data.sender || data.nickname;
        const receiver = data.receiver || (isCurrentUser ? '您' : currentUser);
        headerText = isCurrentUser ? `${sender} → ${receiver}` : `${sender} → 您`;
    }
    
    messageDiv.innerHTML = `
        <div class="message-header">
            ${headerText} <span style="font-weight: normal; color: #888; font-size: 0.8em;">${formattedTime}</span>
        </div>
        <div class="message-content">${escapeHtml(data.text || data.content)}</div>
    `;
    
    // 平滑滚动到底部
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 添加系统消息
function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message';
    messageDiv.textContent = text;
    
    chatMessages.appendChild(messageDiv);
    
    // 自动滚动到底部
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 更新用户列表
async function updateUserList() {
    try {
        if (!supabaseClient) {
            // 如果Supabase不可用，至少显示当前用户
            userList.innerHTML = '';
            const li = document.createElement('li');
            li.textContent = currentUser ? `${currentUser} (您)` : '未登录';
            if (currentUser) {
                li.style.fontWeight = 'bold';
                li.style.color = '#4a6fa5';
            }
            userList.appendChild(li);
            return;
        }
        
        // 从Supabase获取最近活动的用户（过去5分钟内活跃）
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data, error } = await supabaseClient
            .from('users')
            .select('nickname')
            .gte('last_active', fiveMinutesAgo);
        
        if (error) {
            throw error;
        }
        
        // 更新UI
        userList.innerHTML = '';
        const users = data.map(item => item.nickname);
        
        // 确保当前用户在列表中
        if (currentUser && !users.includes(currentUser)) {
            users.push(currentUser);
        }
        
        users.forEach(user => {
            const li = document.createElement('li');
            li.textContent = user === currentUser ? `${user} (您)` : user;
            
            // 为当前用户添加特殊样式
            if (user === currentUser) {
                li.style.fontWeight = 'bold';
                li.style.color = '#4a6fa5';
            }
            
            userList.appendChild(li);
        });
    } catch (error) {
        console.error('更新用户列表失败:', error);
        // 出错时至少显示当前用户
        userList.innerHTML = '';
        const li = document.createElement('li');
        li.textContent = currentUser ? `${currentUser} (您)` : '未登录';
        if (currentUser) {
            li.style.fontWeight = 'bold';
            li.style.color = '#4a6fa5';
        }
        userList.appendChild(li);
    }
}

// 格式化时间
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// HTML转义
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 设置用户活动跟踪器 - 使用WebSocket实时更新
function setupUserActivityTracker() {
    // 用户列表现在由服务器通过socket.io实时更新
    console.log('用户活动跟踪器已设置');
}

// 添加清除聊天记录按钮
function addClearChatButton() {
    const chatHeader = document.querySelector('.chat-header');
    const clearBtn = document.createElement('button');
    clearBtn.id = 'clear-chat-btn';
    clearBtn.textContent = '清除本地记录';
    clearBtn.style.cssText = `
        padding: 5px 15px;
        background-color: #e74c3c;
        color: white;
        border: none;
        border-radius: 20px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.3s ease;
        margin-left: 10px;
    `;
    
    clearBtn.addEventListener('click', () => {
        if (confirm('确定要清除本地显示的聊天记录吗？这不会影响其他用户看到的消息。')) {
            // 清空UI
            chatMessages.innerHTML = '<div class="system-message">本地聊天记录已清除</div>';
        }
    });
    
    chatHeader.appendChild(clearBtn);
}

// 清除聊天历史（仅本地显示）
function clearChatHistory() {
    // 清空UI
    chatMessages.innerHTML = '<div class="system-message">本地聊天记录已清除</div>';
}

// 自动调整输入框高度
function autoResizeTextarea() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    
    // 设置最大高度限制
    const maxHeight = 120; // 最大高度120px
    if (this.scrollHeight > maxHeight) {
        this.style.height = maxHeight + 'px';
        this.style.overflowY = 'auto';
    } else {
        this.style.overflowY = 'hidden';
    }
}

// 清理不活跃用户
function cleanupInactiveUsers() {
    // 页面关闭时通知服务器用户离开
    if (socket && socket.connected) {
        socket.emit('user-leave', { nickname: currentUser });
    }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupUserActivityTracker();
});