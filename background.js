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
    if (request.useLocalOCR) {
      // 使用本地 Umi-OCR
      processLocalOCR(request.imageData)
        .then(text => {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: 'showOCRResult',
            success: true,
            text: text
          });
        })
        .catch(error => {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: 'showOCRResult',
            success: false,
            error: error.message
          });
        });
    } else {
      // 使用原有的 X.AI API
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
  
  // 修改在线OCR菜单
  chrome.contextMenus.create({
    id: "captureAndOnlineOCR",
    title: "📝 截图并使用在线OCR",
    contexts: ["page", "selection"]
  });

  // 添加本地OCR菜单
  chrome.contextMenus.create({
    id: "captureAndLocalOCR",
    title: "🔍 截图并使用本地OCR",
    contexts: ["page", "selection"]
  });
});

// 修改检查本地OCR服务是否可用的函数
async function checkLocalOCRService() {
  try {
    const response = await fetch('http://127.0.0.1:1224/api/version');
    if (!response.ok) {
      throw new Error('服务响应异常');
    }
    return true;
  } catch (error) {
    console.error('本地OCR服务检查失败:', error);
    return false;
  }
}

// 添加本地 Umi-OCR 处理函数
async function processLocalOCR(imageData) {
  try {
    const umiOCRUrl = 'http://127.0.0.1:1224/api/ocr';
    
    const response = await fetch(umiOCRUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        base64: imageData.split(',')[1],
        options: {
          cls: true,
          language: ["zh", "en"]
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Umi-OCR 服务响应错误: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.code !== 100) {
      throw new Error(`Umi-OCR 识别失败: ${data.message}`);
    }

    // 提取识别文本
    const extractedText = data.data.map(item => item.text).join('\n');
    return extractedText;
  } catch (error) {
    console.error('本地OCR处理错误:', error);
    throw error;
  }
}

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "captureArea") {
    chrome.tabs.sendMessage(tab.id, {
      action: "startScreenshotMode"
    });
  } else if (info.menuItemId === "captureAndOnlineOCR") {
    chrome.tabs.sendMessage(tab.id, {
      action: "startOnlineOCRMode"
    });
  } else if (info.menuItemId === "captureAndLocalOCR") {
    chrome.tabs.sendMessage(tab.id, {
      action: "startLocalOCRMode"
    });
  }
}); 