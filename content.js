// 更新消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request.action);
  if (request.action === "startScreenshotMode") {
    isOCRMode = false;
    startScreenshotMode();
  } else if (request.action === "startOnlineOCRMode") {
    isOCRMode = true;
    useLocalOCR = false;
    startScreenshotMode();
  } else if (request.action === "startLocalOCRMode") {
    isOCRMode = true;
    useLocalOCR = true;
    startScreenshotMode();
  } else if (request.action === "processScreenshot") {
    console.log('开始处理截图，区域信息:', request.area);
    processScreenshot(request.imageData, request.area);
  } else if (request.action === "showOCRResult") {
    console.log('显示OCR结果');
    showOCRResult(request);
  }
});

// 创建自定义光标元素
const cursor = document.createElement('div');
cursor.className = 'custom-cursor-dot';
document.body.appendChild(cursor);

// 创建提示框元素
const tooltip = document.createElement('div');
tooltip.className = 'download-tooltip';
document.body.appendChild(tooltip);

// 创建截图菜单元素
const screenshotMenu = document.createElement('div');
screenshotMenu.className = 'screenshot-menu';
screenshotMenu.innerHTML = `
  <div class="screenshot-option">
    <svg class="screenshot-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 16.5C13.6569 16.5 15 15.1569 15 13.5C15 11.8431 13.6569 10.5 12 10.5C10.3431 10.5 9 11.8431 9 13.5C9 15.1569 10.3431 16.5 12 16.5Z" fill="currentColor"/>
      <path d="M20 7.5H17.5L16.2 5.4C16.0429 5.14819 15.8199 4.94027 15.5555 4.79621C15.2911 4.65215 14.9937 4.57699 14.691 4.578H9.309C9.00633 4.57699 8.70893 4.65215 8.44452 4.79621C8.18011 4.94027 7.95714 5.14819 7.8 5.4L6.5 7.5H4C3.20435 7.5 2.44129 7.81607 1.87868 8.37868C1.31607 8.94129 1 9.70435 1 10.5V18C1 18.7956 1.31607 19.5587 1.87868 20.1213C2.44129 20.6839 3.20435 21 4 21H20C20.7956 21 21.5587 20.6839 22.1213 20.1213C22.6839 19.5587 23 18.7956 23 18V10.5C23 9.70435 22.6839 8.94129 22.1213 8.37868C21.5587 7.81607 20.7956 7.5 20 7.5ZM12 18C11.0111 18 10.0444 17.7068 9.22215 17.1573C8.39991 16.6079 7.75904 15.8271 7.38058 14.9134C7.00212 13.9998 6.90315 12.9945 7.09608 12.0245C7.289 11.0546 7.76521 10.1637 8.46447 9.46447C9.16373 8.76521 10.0546 8.289 11.0245 8.09608C11.9945 7.90315 12.9998 8.00212 13.9134 8.38058C14.8271 8.75904 15.6079 9.39991 16.1573 10.2222C16.7068 11.0444 17 12.0111 17 13C17 14.3261 16.4732 15.5979 15.5355 16.5355C14.5979 17.4732 13.3261 18 12 18Z" fill="currentColor"/>
    </svg>
    <span>截取页面区域</span>
  </div>
`;
document.body.appendChild(screenshotMenu);

// 创截图选择框
const selectionBox = document.createElement('div');
selectionBox.className = 'selection-box';
document.body.appendChild(selectionBox);

// 截图状态变量
let isScreenshotMode = false;
let startX = 0;
let startY = 0;
let isSelecting = false;

// 添加OCR模式标志和本地OCR标志
let isOCRMode = false;
let useLocalOCR = false;

// 在文件开头添加一个变量来跟踪当前的canvas元素
let currentCanvas = null;

// 显示提示信息的函数
function showTooltip(message, isError = false, showScreenshotOption = false, x, y) {
  tooltip.textContent = message;
  tooltip.className = `download-tooltip ${isError ? 'error' : 'success'}`;
  
  // 设置提示框位置（固定在右键点击位置）
  if (x && y) {
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }
  
  tooltip.style.display = 'block';
  
  if (showScreenshotOption) {
    screenshotMenu.style.display = 'block';
    // 将菜单作为提示框的一部分
    tooltip.appendChild(screenshotMenu);
  } else {
    if (screenshotMenu.parentElement === tooltip) {
      tooltip.removeChild(screenshotMenu);
    }
    screenshotMenu.style.display = 'none';
    
    // 非截图选项的提示3秒后自动隐藏
    setTimeout(() => {
      tooltip.style.display = 'none';
    }, 3000);
  }
}

// 隐藏提示和菜单
function hideTooltipAndMenu() {
  tooltip.style.display = 'none';
  screenshotMenu.style.display = 'none';
  if (screenshotMenu.parentElement === tooltip) {
    tooltip.removeChild(screenshotMenu);
  }
}

// 开始截图模式
function startScreenshotMode() {
  isScreenshotMode = true;
  screenshotMenu.style.display = 'none';
  tooltip.style.display = 'none';
  document.body.style.cursor = 'crosshair';

  // 创建遮罩层
  const overlay = document.createElement('div');
  overlay.className = 'screenshot-overlay';
  document.body.appendChild(overlay);

  // 确保选择框存在
  if (!document.querySelector('.selection-box')) {
    const selectionBox = document.createElement('div');
    selectionBox.className = 'selection-box';
    document.body.appendChild(selectionBox);
  }
}

// 修改processScreenshot函数
function processScreenshot(imageData, area) {
  console.log('进入processScreenshot函数', area);
  const img = new Image();
  
  img.onload = function() {
    console.log('图片加载完成，开始处理');
    
    // 如果存在旧的canvas，先移除它
    if (currentCanvas) {
      currentCanvas.remove();
    }
    
    // 创建新的canvas
    const canvas = document.createElement('canvas');
    currentCanvas = canvas;
    const dpr = window.devicePixelRatio || 1;
    
    // 确保使用正确的尺寸
    canvas.width = area.width * dpr;
    canvas.height = area.height * dpr;
    const ctx = canvas.getContext('2d');
    
    // 清空canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 设置正确的缩放
    ctx.scale(dpr, dpr);

    // 绘制选中区域
    ctx.drawImage(
      img,
      area.x * dpr,
      area.y * dpr,
      area.width * dpr,
      area.height * dpr,
      0,
      0,
      area.width,
      area.height
    );

    const croppedImageData = canvas.toDataURL('image/png');
    console.log('图片处理完成，准备发送OCR请求');

    // 在发送OCR请求前添加
    console.log('截图数据大小:', croppedImageData.length);
    console.log('截图预览:', croppedImageData.substring(0, 100));

    // 如果是OCR模式，发送OCR请求
    if (area.isOCR) {
      console.log('发送OCR请求，使用本地服务:', useLocalOCR);
      chrome.runtime.sendMessage({
        action: 'processOCR',
        imageData: croppedImageData,
        useLocalOCR: useLocalOCR
      }, response => {
        console.log('收到OCR请求的响应:', response);
      });
    } else {
      // 原有的截图保存逻辑
      chrome.runtime.sendMessage({
        action: 'downloadScreenshot',
        imageData: croppedImageData
      });
    }

    // 清理截图模式
    exitScreenshotMode();
    showTooltip('处理中...', false);
  };

  img.onerror = function(error) {
    console.error('图片加载失败:', error);
    showTooltip('截图失败，请重试', true);
    exitScreenshotMode();
  };

  console.log('开始加载图片');
  img.src = imageData;
}

// 修改handleScreenshot函数
async function handleScreenshot(x1, y1, x2, y2) {
  try {
    console.log('处理截图选择');
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);

    if (width < 5 || height < 5) {
      showTooltip('请选择更大的区域进行截图', true);
      exitScreenshotMode();
      return;
    }

    showTooltip('正在处理截图...', false);

    // 计算实际的滚动位置
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;

    console.log('发送截图请求，模式:', isOCRMode ? 'OCR' : '普通截图');
    // 请求截图
    chrome.runtime.sendMessage({
      action: 'captureTab',
      area: {
        x: left + scrollX,
        y: top + scrollY,
        width: width,
        height: height,
        devicePixelRatio: window.devicePixelRatio || 1,
        isOCR: isOCRMode
      }
    }, response => {
      console.log('收到captureTab响应:', response);
    });

  } catch (error) {
    console.error('截图失败:', error);
    showTooltip('截图失败，请重试', true);
    exitScreenshotMode();
  }
}

// 退出截图模式的函数也需要更新
function exitScreenshotMode() {
  isScreenshotMode = false;
  
  // 移除遮罩层
  const overlay = document.querySelector('.screenshot-overlay');
  if (overlay) {
    overlay.remove();
  }
  
  // 隐藏选择框而不是移除它
  const selectionBox = document.querySelector('.selection-box');
  if (selectionBox) {
    selectionBox.style.display = 'none';
  }
  
  // 清理canvas
  if (currentCanvas) {
    currentCanvas.remove();
    currentCanvas = null;
  }
  
  // 重置其他UI元素
  document.body.style.cursor = 'default';
  if (screenshotMenu) {
    screenshotMenu.style.display = 'none';
  }
}

// 更新选择框
function updateSelectionBox(e) {
  if (!isSelecting) return;
  
  const currentX = e.clientX;
  const currentY = e.clientY;
  
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  const left = Math.min(currentX, startX);
  const top = Math.min(currentY, startY);
  
  const selectionBox = document.querySelector('.selection-box');
  if (selectionBox) {
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
    selectionBox.style.display = 'block';
  }
}

// 添加截图相关事件监听
screenshotMenu.addEventListener('click', (e) => {
  if (e.target.closest('.screenshot-option')) {
    startScreenshotMode();
  }
});

document.addEventListener('mousedown', (e) => {
  if (isScreenshotMode) {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    updateSelectionBox(e);
  }
});

document.addEventListener('mousemove', (e) => {
  if (isScreenshotMode && isSelecting) {
    updateSelectionBox(e);
  }
});

document.addEventListener('mouseup', (e) => {
  if (isScreenshotMode && isSelecting) {
    isSelecting = false;
    handleScreenshot(startX, startY, e.clientX, e.clientY);
  }
});

// ESC 键退出截图模式
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isScreenshotMode) {
    exitScreenshotMode();
  }
});

// 更新光标位置（移除提示框位置更新）
document.addEventListener('mousemove', (e) => {
  cursor.style.left = e.clientX - 5 + 'px';
  cursor.style.top = e.clientY - 5 + 'px';
});

// 检查元素是否为有效的图片
function isValidImage(element) {
  return (
    element.tagName === 'IMG' && 
    element.src && 
    element.width > 0 && 
    element.height > 0 &&
    !element.closest('button') && // 排除按钮内的图片
    !element.closest('[role="button"]') && // 排除具有按钮角色的元素内的图片
    getComputedStyle(element).display !== 'none' && // 排除隐藏的图片
    getComputedStyle(element).visibility !== 'hidden' && // 排除不可见的图片
    element.getAttribute('role') !== 'presentation' // 排除装饰性图片
  );
}

// 处理图片相关事件
document.addEventListener('mouseover', (e) => {
  if (isValidImage(e.target)) {
    e.target.classList.add('custom-cursor');
    cursor.style.display = 'block';
  } else {
    cursor.style.display = 'none';
  }
});

document.addEventListener('mouseout', (e) => {
  if (isValidImage(e.target)) {
    e.target.classList.remove('custom-cursor');
    cursor.style.display = 'none';
  }
});

// 修改处理图片右键点击下载的部分
document.addEventListener('contextmenu', async (e) => {
  if (tooltip.style.display === 'block') {
    hideTooltipAndMenu();
    e.preventDefault();
    return;
  }

  if (isValidImage(e.target)) {
    e.preventDefault();
    
    try {
      let imgUrl = e.target.src;
      
      // 检查是否是本地 Stable Diffusion 的图片
      const isLocalSD = imgUrl.includes('127.0.0.1') || 
                       imgUrl.includes('localhost') || 
                       imgUrl.includes('192.168.');

      if (isLocalSD) {
        // 对于本地 SD 的图片，直接使用 img 标签的 src 数据
        const img = e.target;
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        try {
          const imageData = canvas.toDataURL('image/png');
          const fileName = imgUrl.split('/').pop().split('?')[0] || 'image.png';
          sendDownloadRequest(imageData, fileName);
        } catch (error) {
          console.error('Canvas 转换失败:', error);
          showTooltip('图片处理失败，请使用截图功能', true, true, e.clientX + 10, e.clientY + 10);
        }
        return;
      }

      // 处理其他图片的下载逻辑保持不变
      if (imgUrl.startsWith('http:')) {
        imgUrl = imgUrl.replace('http:', 'https:');
      }
      
      if (imgUrl.startsWith('data:')) {
        const fileName = 'image.png';
        sendDownloadRequest(imgUrl, fileName);
      } else {
        try {
          const response = await fetch(imgUrl, {
            mode: 'cors',
            credentials: 'omit'
          });
          
          if (response.ok) {
            const fileName = imgUrl.split('/').pop().split('?')[0] || 'image.png';
            sendDownloadRequest(imgUrl, fileName);
          } else {
            showTooltip('图片链接不安全，请使用截图功能下载', true, true, e.clientX + 10, e.clientY + 10);
          }
        } catch (error) {
          let errorMessage = '无法下载图片';
          if (error.message.includes('Mixed Content')) {
            errorMessage = '图片链接不安全，请使用截图功能';
          } else if (error.message.includes('CORS')) {
            errorMessage = '无法直接下载，请使用截图功能';
          } else {
            errorMessage = '请使用截图功能下载';
          }
          showTooltip(errorMessage, true, true, e.clientX + 10, e.clientY + 10);
        }
      }
    } catch (error) {
      showTooltip('无法下载该图片，请使用截图功能', true, true, e.clientX + 10, e.clientY + 10);
      console.error('下载图片时出错:', error);
    }
  }
});

// 点击页面其他地方时隐藏提示和菜单
document.addEventListener('click', (e) => {
  if (!tooltip.contains(e.target) && !screenshotMenu.contains(e.target)) {
    hideTooltipAndMenu();
  }
});

// 发送下载请求的辅助函数
function sendDownloadRequest(imageUrl, fileName) {
  try {
    chrome.runtime.sendMessage({
      action: 'downloadImage',
      imageUrl: imageUrl,
      fileName: fileName
    });
  } catch (error) {
    console.error('下载请求发送失败:', error);
  }
}

// 初始隐藏光标
cursor.style.display = 'none';

// 在文件开头添加错误处理
window.onerror = function(message, source, lineno, colno, error) {
  // 忽略非插件相关的错误
  if (source && source.includes('chrome-extension://')) {
    console.error('插件错误:', {message, source, lineno, colno, error});
  }
  return false;
};

// 修改startOCRMode函数
function startOCRMode() {
  console.log('启动OCR模式');
  isOCRMode = true;
  startScreenshotMode(); // 复用现有的截图模式
}

// 处理OCR完成
function handleOCRComplete(result) {
  if (result.success) {
    showTooltip(`文字已提取并保存到: ${result.filePath}`, false);
  } else {
    showTooltip(`文字提取失败: ${result.error}`, true);
  }
}

// 创建OCR结果弹窗
const ocrModal = document.createElement('div');
ocrModal.className = 'ocr-result-modal';
ocrModal.innerHTML = `
  <div class="ocr-result-content"></div>
  <div class="ocr-result-actions">
    <button class="ocr-result-button ocr-result-save">保存为文本文件</button>
    <button class="ocr-result-button ocr-result-close">关闭</button>
  </div>
`;
document.body.appendChild(ocrModal);

// 处理OCR结果显示
function showOCRResult(result) {
  const contentDiv = ocrModal.querySelector('.ocr-result-content');
  if (result.success) {
    contentDiv.textContent = result.text;
    ocrModal.style.display = 'flex';
  } else {
    showTooltip(`文字提取失败: ${result.error}`, true);
  }
}

// 添加事件监听器
ocrModal.querySelector('.ocr-result-save').addEventListener('click', () => {
  const text = ocrModal.querySelector('.ocr-result-content').textContent;
  const timestamp = new Date().getTime();
  
  // 创建文本文件并下载
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  chrome.runtime.sendMessage({
    action: 'downloadScreenshot',
    imageData: url,
    filename: `OCR_Result_${timestamp}.txt`
  });
  
  URL.revokeObjectURL(url);
  ocrModal.style.display = 'none';
  showTooltip('文本已保存', false);
});

ocrModal.querySelector('.ocr-result-close').addEventListener('click', () => {
  ocrModal.style.display = 'none';
});
 