// DOM 元素
const messageForm = document.getElementById('messageForm');
const fileForm = document.getElementById('fileForm');
const messagesContainer = document.getElementById('messagesContainer');
const filesContainer = document.getElementById('filesContainer');
const refreshBtn = document.getElementById('refreshBtn');
const clearBtn = document.getElementById('clearBtn');
const copyAllBtn = document.getElementById('copyAllBtn');
const fileInput = document.getElementById('fileInput');
const fileInputWrapper = document.querySelector('.file-input-wrapper');

// 防抖变量
let fileInputClickTimeout = null;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    loadMessages();
    loadFiles();
    
    // 设置自动刷新，静默更新消息和文件
    setInterval(() => {
        // 只在页面可见且没有用户交互时自动刷新
        if (!document.hidden && !isUserInteracting()) {
            // 静默更新，不显示任何加载提示
            loadMessagesSilently();
            loadFilesSilently();
        }
    }, 5000); // 每5秒刷新一次
    
    // 初始化标签页切换
    initTabs();
    
    // 初始化文件上传
    initFileUpload();
});

// 检查用户是否正在交互
function isUserInteracting() {
    // 检查是否有输入框获得焦点
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return true;
    }
    
    // 检查是否有按钮被禁用（表示正在处理）
    const disabledButtons = document.querySelectorAll('button:disabled');
    if (disabledButtons.length > 0) {
        return true;
    }
    
    return false;
}

// 初始化标签页切换
function initTabs() {
    // 表单标签页切换
    const formTabs = document.querySelectorAll('.tab-btn');
    const formTabContents = document.querySelectorAll('.tab-content');
    
    formTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');
            
            // 移除所有活动状态
            formTabs.forEach(t => t.classList.remove('active'));
            formTabContents.forEach(content => content.classList.remove('active'));
            
            // 添加活动状态
            tab.classList.add('active');
            document.getElementById(targetTab + 'Tab').classList.add('active');
        });
    });
    
    // 内容类型切换
    const contentTabs = document.querySelectorAll('.content-tab-btn');
    const contentContainers = document.querySelectorAll('.content-container');
    
    contentTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetContent = tab.getAttribute('data-content');
            
            // 移除所有活动状态
            contentTabs.forEach(t => t.classList.remove('active'));
            contentContainers.forEach(container => container.classList.remove('active'));
            
            // 添加活动状态
            tab.classList.add('active');
            if (targetContent === 'messages') {
                messagesContainer.classList.add('active');
            } else if (targetContent === 'files') {
                filesContainer.classList.add('active');
            }
        });
    });
}

// 初始化文件上传
function initFileUpload() {
    // 文件选择事件（使用once确保不会重复绑定）
    fileInput.addEventListener('change', handleFileSelect, { once: false });
    
    // 拖拽上传
    fileInputWrapper.addEventListener('dragover', handleDragOver);
    fileInputWrapper.addEventListener('dragleave', handleDragLeave);
    fileInputWrapper.addEventListener('drop', handleDrop);
    
    // 点击上传区域（避免重复触发）
    fileInputWrapper.addEventListener('click', (e) => {
        // 如果点击的是文件输入框本身，不处理
        if (e.target === fileInput) {
            return;
        }
        
        // 防止事件冒泡
        e.preventDefault();
        
        // 防抖处理，避免快速点击
        if (fileInputClickTimeout) {
            clearTimeout(fileInputClickTimeout);
        }
        
        fileInputClickTimeout = setTimeout(() => {
            fileInput.click();
        }, 100);
    });
    
    // 防止文件输入框的点击事件冒泡
    fileInput.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// 提交消息
messageForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData(messageForm);
    const data = {
        content: formData.get('content'),
        author: formData.get('author') || '匿名用户'
    };
    
    try {
        const response = await fetch('/api/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 清空表单
            messageForm.reset();
            
            // 显示成功消息
            showNotification('消息提交成功！', 'success');
            
            // 立即添加新消息到列表顶部，然后静默重新加载确保数据同步
            addNewMessageToTop(result.data);
            // 延迟静默重新加载，让用户看到新消息
            setTimeout(loadMessagesSilently, 1000);
        } else {
            showNotification(result.message || '提交失败', 'error');
        }
    } catch (error) {
        console.error('提交错误:', error);
        showNotification('网络错误，请稍后重试', 'error');
    }
});

// 文件上传表单提交
fileForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData(fileForm);
    
    try {
        const response = await fetch('/api/files', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 清空表单
            fileForm.reset();
            fileInputWrapper.classList.remove('file-selected');
            updateFileInputDisplay('点击选择文件或拖拽文件到此处');
            
            // 显示成功消息
            showNotification('文件上传成功！', 'success');
            
            // 重新加载文件列表
            loadFiles();
        } else {
            showNotification(result.message || '上传失败', 'error');
        }
    } catch (error) {
        console.error('上传错误:', error);
        showNotification('网络错误，请稍后重试', 'error');
    }
});

// 文件选择处理
function handleFileSelect(e) {
    // 防止重复处理
    if (e.target._processing) {
        return;
    }
    e.target._processing = true;
    
    const file = e.target.files[0];
    if (file) {
        fileInputWrapper.classList.add('file-selected');
        updateFileInputDisplay(`已选择: ${file.name} (${formatFileSize(file.size)})`);
    } else {
        // 如果没有选择文件，重置状态
        fileInputWrapper.classList.remove('file-selected');
        updateFileInputDisplay('点击选择文件或拖拽文件到此处');
    }
    
    // 重置处理标志
    setTimeout(() => {
        e.target._processing = false;
    }, 100);
}

// 拖拽处理
function handleDragOver(e) {
    e.preventDefault();
    fileInputWrapper.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    fileInputWrapper.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    fileInputWrapper.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        // 只处理第一个文件
        const file = files[0];
        // 创建新的FileList对象
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
        
        // 触发文件选择处理
        handleFileSelect({ target: { files: fileInput.files } });
    }
}

// 更新文件输入显示
function updateFileInputDisplay(text) {
    const textElement = fileInputWrapper.querySelector('.file-input-text');
    if (textElement) {
        textElement.textContent = text;
    }
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 复制全部消息
copyAllBtn.addEventListener('click', copyAllMessages);

// 刷新消息列表
refreshBtn.addEventListener('click', function() {
    loadMessages();
    loadFiles();
});

// 清空所有消息
clearBtn.addEventListener('click', async function() {
    if (confirm('确定要清空所有消息吗？此操作不可恢复！')) {
        try {
            const response = await fetch('/api/messages', {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('已清空所有消息', 'success');
                loadMessagesSilently();
            } else {
                showNotification('清空失败', 'error');
            }
        } catch (error) {
            console.error('清空错误:', error);
            showNotification('网络错误，请稍后重试', 'error');
        }
    }
});

// 加载消息列表
async function loadMessages() {
    try {
        // 只在没有消息时显示加载状态
        if (messagesContainer.children.length === 0 || 
            messagesContainer.querySelector('.empty') || 
            messagesContainer.querySelector('.loading')) {
            messagesContainer.innerHTML = '<div class="loading">正在加载消息...</div>';
        }
        
        const response = await fetch('/api/messages');
        const result = await response.json();
        
        if (result.success) {
            displayMessages(result.data);
        } else {
            // 只在没有消息时显示错误状态
            if (messagesContainer.children.length === 0 || 
                messagesContainer.querySelector('.loading')) {
                messagesContainer.innerHTML = '<div class="empty">加载失败，请刷新重试</div>';
            }
        }
    } catch (error) {
        console.error('加载错误:', error);
        // 只在没有消息时显示错误状态
        if (messagesContainer.children.length === 0 || 
            messagesContainer.querySelector('.loading')) {
            messagesContainer.innerHTML = '<div class="empty">网络错误，请检查连接</div>';
        }
    }
}

// 加载文件列表
async function loadFiles() {
    try {
        if (filesContainer.children.length === 0 || 
            filesContainer.querySelector('.empty') || 
            filesContainer.querySelector('.loading')) {
            filesContainer.innerHTML = '<div class="loading">正在加载文件...</div>';
        }
        
        const response = await fetch('/api/files');
        const result = await response.json();
        
        if (result.success) {
            displayFiles(result.data);
        } else {
            if (filesContainer.children.length === 0 || 
                filesContainer.querySelector('.loading')) {
                filesContainer.innerHTML = '<div class="empty">加载失败，请刷新重试</div>';
            }
        }
    } catch (error) {
        console.error('加载文件错误:', error);
        if (filesContainer.children.length === 0 || 
            filesContainer.querySelector('.loading')) {
            filesContainer.innerHTML = '<div class="empty">网络错误，请检查连接</div>';
        }
    }
}

// 静默加载文件列表
async function loadFilesSilently() {
    try {
        const response = await fetch('/api/files');
        const result = await response.json();
        
        if (result.success) {
            displayFiles(result.data);
        }
    } catch (error) {
        console.error('静默加载文件错误:', error);
    }
}

// 显示文件列表
function displayFiles(files) {
    if (files.length === 0) {
        filesContainer.innerHTML = '<div class="empty">暂无文件，快来上传第一个吧！</div>';
        return;
    }
    
    const filesHTML = files.map(file => `
        <div class="file-item">
            <div class="file-icon">${getFileIcon(file.mimetype)}</div>
            <div class="file-info">
                <div class="file-name">${escapeHtml(file.originalName)}</div>
                <div class="file-meta">
                    <span class="file-uploader">👤 ${escapeHtml(file.uploader)}</span>
                    <span class="file-size">📦 ${formatFileSize(file.size)}</span>
                    <span class="file-time">🕒 ${formatTime(file.timestamp)}</span>
                </div>
            </div>
            <div class="file-actions">
                <button class="download-btn" onclick="downloadFile(${file.id})" title="下载文件">⬇️ 下载</button>
                <button class="delete-btn" onclick="deleteFile(${file.id})" title="删除文件">删除</button>
            </div>
        </div>
    `).join('');
    
    filesContainer.innerHTML = filesHTML;
}

// 获取文件图标
function getFileIcon(mimetype) {
    if (mimetype.startsWith('image/')) return '🖼️';
    if (mimetype.startsWith('video/')) return '🎥';
    if (mimetype.startsWith('audio/')) return '🎵';
    if (mimetype.includes('pdf')) return '📄';
    if (mimetype.includes('word')) return '📝';
    if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return '📊';
    if (mimetype.includes('powerpoint') || mimetype.includes('presentation')) return '📽️';
    if (mimetype.includes('zip') || mimetype.includes('rar') || mimetype.includes('7z')) return '📦';
    if (mimetype.includes('text')) return '📄';
    return '📁';
}

// 下载文件
function downloadFile(fileId) {
    const downloadUrl = `/api/files/${fileId}/download`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 删除文件
async function deleteFile(fileId) {
    if (confirm('确定要删除这个文件吗？')) {
        try {
            const response = await fetch(`/api/files/${fileId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('文件已删除', 'success');
                loadFilesSilently();
            } else {
                showNotification('删除失败', 'error');
            }
        } catch (error) {
            console.error('删除文件错误:', error);
            showNotification('网络错误，请稍后重试', 'error');
        }
    }
}

// 静默加载消息（不显示任何加载提示）
async function loadMessagesSilently() {
    try {
        const response = await fetch('/api/messages');
        const result = await response.json();
        
        if (result.success) {
            // 静默更新消息列表，不显示任何提示
            displayMessages(result.data);
        }
    } catch (error) {
        // 静默处理错误，不显示任何提示
        console.error('静默加载错误:', error);
    }
}

// 立即添加新消息到列表顶部
function addNewMessageToTop(newMessage) {
    // 如果当前显示的是空状态，先清空
    if (messagesContainer.querySelector('.empty')) {
        messagesContainer.innerHTML = '';
    }
    
    // 创建新消息元素
    const messageElement = document.createElement('div');
    messageElement.className = 'message-item new-message';
    messageElement.innerHTML = `
        <div class="message-header">
            <span class="message-author">👤 ${escapeHtml(newMessage.author)}</span>
            <span class="message-time">刚刚</span>
        </div>
        <div class="message-content" onclick="copyMessageContent('${escapeHtml(newMessage.content).replace(/'/g, "\\'")}')" title="点击复制内容">${escapeHtml(newMessage.content)}</div>
        <div class="message-actions">
            <button class="copy-btn" onclick="copyMessageContent('${escapeHtml(newMessage.content).replace(/'/g, "\\'")}')" title="复制内容">📋 复制</button>
            <button class="delete-btn" onclick="deleteMessage(${newMessage.id})">删除</button>
        </div>
    `;
    
    // 添加到列表顶部
    messagesContainer.insertBefore(messageElement, messagesContainer.firstChild);
    
    // 添加新消息的动画效果
    messageElement.style.opacity = '0';
    messageElement.style.transform = 'translateY(-10px)';
    setTimeout(() => {
        messageElement.style.transition = 'all 0.3s ease';
        messageElement.style.opacity = '1';
        messageElement.style.transform = 'translateY(0)';
    }, 50);
    
    // 3秒后移除新消息的样式类
    setTimeout(() => {
        messageElement.classList.remove('new-message');
    }, 3000);
}

// 显示消息列表
function displayMessages(messages) {
    if (messages.length === 0) {
        messagesContainer.innerHTML = '<div class="empty">暂无消息，快来分享第一条吧！</div>';
        return;
    }
    
    const messagesHTML = messages.map(message => `
        <div class="message-item">
            <div class="message-header">
                <span class="message-author">👤 ${escapeHtml(message.author)}</span>
                <span class="message-time">${formatTime(message.timestamp)}</span>
            </div>
            <div class="message-content" onclick="copyMessageContent('${escapeHtml(message.content).replace(/'/g, "\\'")}')" title="点击复制内容">${escapeHtml(message.content)}</div>
            <div class="message-actions">
                <button class="copy-btn" onclick="copyMessageContent('${escapeHtml(message.content).replace(/'/g, "\\'")}')" title="复制内容">📋 复制</button>
                <button class="delete-btn" onclick="deleteMessage(${message.id})">删除</button>
            </div>
        </div>
    `).join('');
    
    messagesContainer.innerHTML = messagesHTML;
}

// 复制全部消息
async function copyAllMessages() {
    try {
        const response = await fetch('/api/messages');
        const result = await response.json();
        
        if (result.success && result.data.length > 0) {
            // 格式化所有消息
            const allMessages = result.data.map((message, index) => {
                const time = new Date(message.timestamp).toLocaleString('zh-CN');
                return `${index + 1}. [${message.author}] ${time}\n${message.content}`;
            }).join('\n\n');
            
            const formattedText = `LocalDrop 消息列表 (${result.data.length}条)\n${'='.repeat(30)}\n\n${allMessages}`;
            
            // 复制到剪贴板
            await copyMessageContent(formattedText);
        } else {
            showNotification('暂无消息可复制', 'info');
        }
    } catch (error) {
        console.error('复制全部消息错误:', error);
        showNotification('复制失败，请稍后重试', 'error');
    }
}

// 复制消息内容
async function copyMessageContent(content) {
    try {
        // 使用现代的 Clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(content);
            showNotification('内容已复制到剪贴板', 'success');
        } else {
            // 降级方案：使用传统的 document.execCommand
            const textArea = document.createElement('textarea');
            textArea.value = content;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            if (successful) {
                showNotification('内容已复制到剪贴板', 'success');
            } else {
                showNotification('复制失败，请手动选择复制', 'error');
            }
        }
    } catch (error) {
        console.error('复制错误:', error);
        showNotification('复制失败，请手动选择复制', 'error');
    }
}

// 删除消息
async function deleteMessage(messageId) {
    if (confirm('确定要删除这条消息吗？')) {
        try {
            const response = await fetch(`/api/messages/${messageId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('消息已删除', 'success');
                loadMessagesSilently();
            } else {
                showNotification('删除失败', 'error');
            }
        } catch (error) {
            console.error('删除错误:', error);
            showNotification('网络错误，请稍后重试', 'error');
        }
    }
}

// 格式化时间
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    // 小于1分钟
    if (diff < 60000) {
        return '刚刚';
    }
    
    // 小于1小时
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes}分钟前`;
    }
    
    // 小于1天
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours}小时前`;
    }
    
    // 超过1天，显示具体日期时间
    return date.toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 显示通知
function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // 添加样式
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 6px;
        color: white;
        font-weight: 500;
        z-index: 1000;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
        max-width: 300px;
        word-wrap: break-word;
    `;
    
    // 设置背景色
    if (type === 'success') {
        notification.style.backgroundColor = '#28a745';
    } else if (type === 'error') {
        notification.style.backgroundColor = '#dc3545';
    } else {
        notification.style.backgroundColor = '#17a2b8';
    }
    
    // 添加到页面
    document.body.appendChild(notification);
    
    // 显示动画
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // 3秒后自动隐藏
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// 键盘快捷键
document.addEventListener('keydown', function(e) {
    const activeElement = document.activeElement;
    const isInInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
    
    // Ctrl+R 或 F5 刷新消息列表（仅在非输入框时）
    if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
        if (!isInInput) {
            e.preventDefault();
            loadMessagesSilently();
        }
    }
    
    // Ctrl+A 复制全部消息（仅在非输入框时）
    if (e.ctrlKey && e.key === 'a') {
        if (!isInInput) {
            e.preventDefault();
            copyAllMessages();
        }
        // 如果在输入框中，让浏览器处理默认的全选行为
    }
    
    // Ctrl+Enter 提交表单（仅在文本域中时）
    if (e.ctrlKey && e.key === 'Enter') {
        const content = document.getElementById('content');
        if (activeElement === content) {
            e.preventDefault();
            messageForm.dispatchEvent(new Event('submit'));
        }
    }
});
