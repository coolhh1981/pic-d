chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadImage') {
    // 处理普通图片下载
    let fileName = request.fileName
      .split('?')[0]
      .replace(/[#%&{}\\<>*?/$!'":@+`|=]/g, '')
      || 'image.png';

    if (!fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)) {
      fileName += '.png';
    }

    if (fileName.length > 200) {
      const ext = fileName.split('.').pop();
      fileName = fileName.substring(0, 200) + '.' + ext;
    }

    chrome.downloads.download({
      url: request.imageUrl,
      filename: fileName,
      saveAs: false
    });
  }
  else if (request.action === 'captureTab') {
    // 处理截图请求
    chrome.tabs.captureVisibleTab(
      sender.tab.windowId,
      { format: 'png', quality: 100 },
      dataUrl => {
        // 发送图片数据回content script进行处理
        chrome.tabs.sendMessage(sender.tab.id, {
          action: 'processScreenshot',
          imageData: dataUrl,
          area: request.area
        });
      }
    );
  }
  else if (request.action === 'downloadScreenshot') {
    // 处理截图下载
    const timestamp = new Date().getTime();
    chrome.downloads.download({
      url: request.imageData,
      filename: `screenshot_${timestamp}.png`,
      saveAs: false
    });
  }
  else if (request.action === 'processOCR') {
    // 处理OCR请求
    const imageData = request.imageData;
    const apiKey = 'xai-ZRh3tXNviM4WaGSwPLg6Ta44V5OzVxG6GO3OsEKKHkAFL5i0KRzu2H0jEt802bPYpth1Vx5nNWYnbkXy';
    
    // 调用X.AI API
    fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "你是一位OCR识别专家，请识别这张图片中的所有文字内容，并尽可能按照原格式输出，注意保持原文内容，不要自己添加任何内容。"
              },
              {
                type: "image_url",
                image_url: {
                  "url": imageData
                }
              }
            ]
          }
        ],
        model: "grok-vision-beta"
      })
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          console.error('API错误详情:', text);
          throw new Error(`API请求失败: ${response.status}, ${text}`);
        });
      }
      return response.json();
    })
    .then(data => {
      console.log('API响应:', data);
      
      if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('API响应格式不正确');
      }

      const extractedText = data.choices[0].message.content;
      
      if (!extractedText) {
        throw new Error('未能提取到文字内容');
      }

      // 发送提取的文本回content script显示
      chrome.tabs.sendMessage(sender.tab.id, {
        action: 'showOCRResult',
        success: true,
        text: extractedText
      });
    })
    .catch(error => {
      console.error('OCR处理失败:', error);
      chrome.tabs.sendMessage(sender.tab.id, {
        action: 'showOCRResult',
        success: false,
        error: error.message || '文字识别失败'
      });
    });
  }
  return true;
});

// 监听下载错误
chrome.downloads.onErased.addListener((downloadId) => {
  console.error(`下载被取消，ID: ${downloadId}`);
});

// 监听安装/更新事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('插件已安装/更新');
});

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "captureArea",
    title: "📷 页面截屏",
    contexts: ["page", "selection"]
  });
  
  // 新增的OCR菜单
  chrome.contextMenus.create({
    id: "captureAndOCR",
    title: "📝 截图并提取文字",
    contexts: ["page", "selection"]
  });
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "captureArea") {
    chrome.tabs.sendMessage(tab.id, {
      action: "startScreenshotMode"
    });
  } else if (info.menuItemId === "captureAndOCR") {
    chrome.tabs.sendMessage(tab.id, {
      action: "startOCRMode"
    });
  }
}); 