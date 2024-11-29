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
    console.log('显示OCR结果:', request);
    showOCRResult(request);
  }
});

// 创建截图相关的 DOM 元素
const overlay = document.createElement('div');
overlay.className = 'screenshot-overlay';
overlay.style.display = 'none';
document.body.appendChild(overlay);

const selectionBox = document.createElement('div');
selectionBox.className = 'selection-box';
selectionBox.style.display = 'none';
document.body.appendChild(selectionBox);

// 截图状态变量
let isScreenshotMode = false;
let isSelecting = false;
let startX = 0;
let startY = 0;
let isOCRMode = false;
let useLocalOCR = false;
let lastMousePosition = { x: 0, y: 0 };

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
  <div class="screenshot-option" id="startScreenshot">
    <svg class="screenshot-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 16.5C13.6569 16.5 15 15.1569 15 13.5C15 11.8431 13.6569 10.5 12 10.5C10.3431 10.5 9 11.8431 9 13.5C9 15.1569 10.3431 16.5 12 16.5Z" fill="currentColor"/>
      <path d="M20 7.5H17.5L16.2 5.4C16.0429 5.14819 15.8199 4.94027 15.5555 4.79621C15.2911 4.65215 14.9937 4.57699 14.691 4.578H9.309C9.00633 4.57699 8.70893 4.65215 8.44452 4.79621C8.18011 4.94027 7.95714 5.14819 7.8 5.4L6.5 7.5H4C3.20435 7.5 2.44129 7.81607 1.87868 8.37868C1.31607 8.94129 1 9.70435 1 10.5V18C1 18.7956 1.31607 19.5587 1.87868 20.1213C2.44129 20.6839 3.20435 21 4 21H20C20.7956 21 21.5587 20.6839 22.1213 20.1213C22.6839 19.5587 23 18.7956 23 18V10.5C23 9.70435 22.6839 8.94129 22.1213 8.37868C21.5587 7.81607 20.7956 7.5 20 7.5ZM12 18C11.0111 18 10.0444 17.7068 9.22215 17.1573C8.39991 16.6079 7.75904 15.8271 7.38058 14.9134C7.00212 13.9998 6.90315 12.9945 7.09608 12.0245C7.289 11.0546 7.76521 10.1637 8.46447 9.46447C9.16373 8.76521 10.0546 8.289 11.0245 8.09608C11.9945 7.90315 12.9998 8.00212 13.9134 8.38058C14.8271 8.75904 15.6079 9.39991 16.1573 10.2222C16.7068 11.0444 17 12.0111 17 13C17 14.3261 16.4732 15.5979 15.5355 16.5355C14.5979 17.4732 13.3261 18 12 18Z" fill="currentColor"/>
    </svg>
    <span>截图下载</span>
  </div>
`;
document.body.appendChild(screenshotMenu);

// 添加截图菜单点击事件
document.getElementById('startScreenshot')?.addEventListener('click', () => {
  hideTooltipAndMenu(); // 隐藏提示和菜单
  isOCRMode = false;    // 确保是普通截图模式
  startScreenshotMode();
});

// 添加样式
const style = document.createElement('style');
style.textContent = `
  .screenshot-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.3);
    z-index: 999999;
    pointer-events: auto;
  }
  
  .selection-box {
    position: fixed;
    border: 2px solid #0095ff;
    background: none;
    z-index: 1000000;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.3);
    -webkit-mask: none;
    mask: none;
  }

  .custom-cursor-dot {
    position: fixed;
    width: 10px;
    height: 10px;
    background: #0095ff;
    border-radius: 50%;
    pointer-events: none;
    z-index: 1000000;
    display: none;
  }

  .download-tooltip {
    position: fixed;
    background: white;
    padding: 8px 12px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    font-size: 14px;
    z-index: 1000001;
    display: none;
  }

  .screenshot-menu {
    margin-top: 8px;
    background: white;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    display: none;
  }

  .screenshot-option {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    cursor: pointer;
    color: #333;
  }

  .screenshot-option:hover {
    background: #f5f5f5;
  }

  .screenshot-icon {
    margin-right: 8px;
  }

  .custom-cursor {
    cursor: none !important;
  }
`;
document.head.appendChild(style);

// 添加阻止默认行为的函数
function preventDefault(e) {
  e.preventDefault();
  return false;
}

// 辅助函数：移除已存在的结果框
function removeExistingResultBox() {
  const existingBox = document.querySelector('.ocr-result-box');
  if (existingBox) {
    existingBox.remove();
  }
}

function showOCRResult(result) {
  // 移除任何已存在的结果框
  removeExistingResultBox();

  const resultBox = document.createElement('div');
  resultBox.className = 'ocr-result-box';
  resultBox.style.position = 'fixed';
  resultBox.style.zIndex = '10000000';
  
  // 设置基本样式
  resultBox.style.backgroundColor = 'white';
  resultBox.style.padding = '15px';
  resultBox.style.borderRadius = '8px';
  resultBox.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
  resultBox.style.maxWidth = '400px';
  resultBox.style.maxHeight = '300px';
  resultBox.style.overflow = 'auto';
  resultBox.style.fontSize = '14px';
  resultBox.style.lineHeight = '1.4';
  resultBox.style.border = '1px solid #ddd';

  // 添加配置名称显示
  const configInfo = document.createElement('div');
  configInfo.style.fontSize = '12px';
  configInfo.style.color = '#666';
  configInfo.style.marginBottom = '10px';
  configInfo.style.padding = '4px 8px';
  configInfo.style.backgroundColor = '#f5f5f5';
  configInfo.style.borderRadius = '4px';
  configInfo.style.display = 'flex';
  configInfo.style.alignItems = 'center';
  configInfo.innerHTML = `
    <span style="margin-right: 5px;">🔍</span>
    <span>使用配置: ${result.configName || '未知配置'}</span>
  `;
  resultBox.appendChild(configInfo);

  // 添加内容容器
  const content = document.createElement('div');
  content.style.marginTop = '5px';
  content.style.marginBottom = '10px';
  content.style.paddingRight = '20px';

  if (result.success) {
    content.textContent = result.text;
    
    // 添加按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.marginTop = '15px';
    buttonContainer.style.width = '100%';

    // 复制按钮
    const copyButton = document.createElement('button');
    copyButton.textContent = '复制文本';
    copyButton.style.flex = '1';
    copyButton.style.padding = '6px 12px';
    copyButton.style.border = 'none';
    copyButton.style.borderRadius = '4px';
    copyButton.style.backgroundColor = '#4CAF50';
    copyButton.style.color = 'white';
    copyButton.style.cursor = 'pointer';
    copyButton.style.fontSize = '13px';
    copyButton.style.minWidth = '80px';
    copyButton.style.width = '100px';
    copyButton.onclick = () => {
      navigator.clipboard.writeText(result.text)
        .then(() => {
          copyButton.textContent = '已复制';
          setTimeout(() => copyButton.textContent = '复制文本', 2000);
        });
    };

    // 保存按钮
    const saveButton = document.createElement('button');
    saveButton.textContent = '保存文本';
    saveButton.style.flex = '1';
    saveButton.style.padding = '6px 12px';
    saveButton.style.border = 'none';
    saveButton.style.borderRadius = '4px';
    saveButton.style.backgroundColor = '#2196F3';
    saveButton.style.color = 'white';
    saveButton.style.cursor = 'pointer';
    saveButton.style.fontSize = '13px';
    saveButton.style.minWidth = '80px';
    saveButton.style.width = '100px';
    saveButton.onclick = () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const blob = new Blob([result.text], { type: 'text/plain;charset=utf-8' });
      
      // 使用 chrome.downloads.download 直接下载
      const url = URL.createObjectURL(blob);
      chrome.runtime.sendMessage({
        action: 'downloadImage', // 使用现有的下载处理函数
        imageUrl: url,
        fileName: `OCR_Result_${timestamp}.txt`
      });

      // 清理 URL 对象
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);

      saveButton.textContent = '已保存';
      setTimeout(() => saveButton.textContent = '保存文本', 2000);
    };

    buttonContainer.appendChild(copyButton);
    buttonContainer.appendChild(saveButton);
    content.appendChild(buttonContainer);
  } else {
    // 美化错误信息显示
    let errorMessage = result.error;
    if (errorMessage.includes('No text found in image')) {
      content.innerHTML = `
        <div style="color: #666;">
          <div style="margin-bottom: 10px;">未识别到文字</div>
          <div style="font-size: 12px;">可能原因：</div>
          <ul style="font-size: 12px; margin: 5px 0; padding-left: 20px;">
            <li>选择的区域没有文字</li>
            <li>文字太模糊或太小</li>
            <li>背景干扰太多</li>
          </ul>
        </div>
      `;
    } else {
      content.textContent = `识别失败: ${errorMessage}`;
      content.style.color = '#ff4444';
    }
  }

  resultBox.appendChild(content);
  document.body.appendChild(resultBox);

  // 计算位置，确保结果框在视口内
  const boxWidth = resultBox.offsetWidth;
  const boxHeight = resultBox.offsetHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // 初始位置设置在鼠标位置右下方
  let left = lastMousePosition.x + 10;
  let top = lastMousePosition.y + 10;

  // 确保不超出右边界
  if (left + boxWidth > viewportWidth) {
    left = lastMousePosition.x - boxWidth - 10;
  }

  // 确保不超出下边界
  if (top + boxHeight > viewportHeight) {
    top = lastMousePosition.y - boxHeight - 10;
  }

  // 确保不超出左边界和上边界
  left = Math.max(10, left);
  top = Math.max(10, top);

  resultBox.style.left = `${left}px`;
  resultBox.style.top = `${top}px`;

  // 添加点击空白区域关闭功能
  function handleClickOutside(event) {
    if (!resultBox.contains(event.target)) {
      resultBox.remove();
      document.removeEventListener('mousedown', handleClickOutside);
    }
  }

  // 延迟添加事件监听，避免立即触发
  setTimeout(() => {
    document.addEventListener('mousedown', handleClickOutside);
  }, 100);
}

// 开始截图模式
function startScreenshotMode() {
  isScreenshotMode = true;
  overlay.style.display = 'block';
  document.body.style.cursor = 'crosshair';
  
  // 添加事件监听器来阻止文本选择
  overlay.addEventListener('selectstart', preventDefault);
  overlay.addEventListener('mousedown', preventDefault);
  
  console.log('进入截图模式');
}

// 处理截图选择
function handleScreenshot(x1, y1, x2, y2) {
  try {
    // 更新最后的鼠标位置为结束点
    lastMousePosition.x = x2;
    lastMousePosition.y = y2;
    
    console.log('处理截图选择');
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);

    if (width < 5 || height < 5) {
      console.log('选择区域太小');
      exitScreenshotMode();
      return;
    }

    // 计算实际的滚动位置
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;

    console.log('发送截图请求，模式:', isOCRMode ? 'OCR' : '普通截图');
    chrome.runtime.sendMessage({
      action: 'captureTab',
      area: {
        x: Math.round(left), // 不需要加上滚动位置，因为 captureVisibleTab 已经考虑了可见区域
        y: Math.round(top),
        width: Math.round(width),
        height: Math.round(height),
        devicePixelRatio: window.devicePixelRatio || 1,
        isOCR: isOCRMode
      }
    });

  } catch (error) {
    console.error('截图失败:', error);
    exitScreenshotMode();
  }
}

// 处理截图
function processScreenshot(imageData, area) {
  console.log('进入processScreenshot函数');
  const img = new Image();
  
  img.onload = function() {
    console.log('图片加载完成，开始处理');
    const canvas = document.createElement('canvas');
    const dpr = area.devicePixelRatio || 1;
    canvas.width = Math.round(area.width * dpr);
    canvas.height = Math.round(area.height * dpr);
    const ctx = canvas.getContext('2d');
    
    // 临时移除遮罩层背景色
    const originalOverlayBg = overlay.style.background;
    overlay.style.background = 'none';
    
    const sx = Math.round(area.x * dpr);
    const sy = Math.round(area.y * dpr);
    const sw = Math.round(area.width * dpr);
    const sh = Math.round(area.height * dpr);
    
    ctx.drawImage(
      img,
      sx, sy, sw, sh,
      0, 0, area.width, area.height
    );

    // 恢复遮罩层背景色
    overlay.style.background = originalOverlayBg;

    const croppedImageData = canvas.toDataURL('image/png');

    if (area.isOCR) {
      console.log('发送OCR请求');
      chrome.runtime.sendMessage({
        action: 'processOCR',
        imageData: croppedImageData,
        useLocalOCR: useLocalOCR
      });
    } else {
      chrome.runtime.sendMessage({
        action: 'downloadScreenshot',
        imageData: croppedImageData
      });
    }

    exitScreenshotMode();
  };

  img.onerror = function(error) {
    console.error('图片加载失败:', error);
    exitScreenshotMode();
  };

  img.src = imageData;
}

// 退出截图模式
function exitScreenshotMode() {
  isScreenshotMode = false;
  isSelecting = false;
  overlay.style.display = 'none';
  overlay.style.background = 'rgba(0, 0, 0, 0.3)';
  selectionBox.style.display = 'none';
  document.body.style.cursor = '';
  
  // 移除事件监听器
  overlay.removeEventListener('selectstart', preventDefault);
  overlay.removeEventListener('mousedown', preventDefault);
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
  
  selectionBox.style.left = left + 'px';
  selectionBox.style.top = top + 'px';
  selectionBox.style.width = width + 'px';
  selectionBox.style.height = height + 'px';
  selectionBox.style.display = 'block';
  
  // 移除原始遮罩层
  overlay.style.background = 'none';
}

// 添加事件监听器
document.addEventListener('mousedown', (e) => {
  if (isScreenshotMode && !isSelecting) {
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
    handleScreenshot(startX, startY, e.clientX, e.clientY);
  }
});

// ESC 键退出截图模式
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isScreenshotMode) {
    exitScreenshotMode();
  }
});

// 显示提示信息的函数
function showTooltip(message, isError = false, showScreenshotOption = false, x, y) {
  tooltip.textContent = message;
  tooltip.className = `download-tooltip ${isError ? 'error' : 'success'}`;
  
  if (x && y) {
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }
  
  tooltip.style.display = 'block';
  
  if (showScreenshotOption) {
    screenshotMenu.style.display = 'block';
    // 确保 screenshotMenu 在 tooltip 内部
    if (!tooltip.contains(screenshotMenu)) {
      tooltip.appendChild(screenshotMenu);
    }
  } else {
    if (screenshotMenu.parentElement === tooltip) {
      tooltip.removeChild(screenshotMenu);
    }
    screenshotMenu.style.display = 'none';
    
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

// 更新光标位置
document.addEventListener('mousemove', (e) => {
  cursor.style.left = e.clientX - 5 + 'px';
  cursor.style.top = e.clientY - 5 + 'px';
});

// 处理图片右键点击下载
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

      // 处理其他图片的下载逻辑
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
 