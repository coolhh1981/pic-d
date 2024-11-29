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
    const filename = request.filename || `screenshot_${timestamp}.png`;
    
    chrome.downloads.download({
      url: request.imageData,
      filename: filename,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('下载失败:', chrome.runtime.lastError);
      }
    });
  }
  else if (request.action === 'processOCR') {
    if (request.useLocalOCR) {
      // 使用本地 Umi-OCR
      processLocalOCR(request.imageData)
        .then(text => {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: 'showOCRResult',
            success: true,
            text: text,
            configName: 'Umi-OCR'
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
      // 获取当前活动的配置
      chrome.storage.sync.get(['apiConfigs', 'activeConfigId'], async (result) => {
        const activeConfig = result.apiConfigs?.find(c => c.id === result.activeConfigId);
        
        if (!activeConfig) {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: 'showOCRResult',
            success: false,
            error: '未找到有效的 API 配置'
          });
          return;
        }

        try {
          if (activeConfig.type === 'baidu') {
            // 百度 OCR 处理
            // 1. 获取 access_token
            const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${activeConfig.apiKey}&client_secret=${activeConfig.model}`;
            const tokenResponse = await fetch(tokenUrl);
            const tokenData = await tokenResponse.json();

            if (!tokenData.access_token) {
              throw new Error('获取百度 access_token 失败');
            }

            // 2. 调用百度 OCR API
            const response = await fetch(`${activeConfig.apiEndpoint}${activeConfig.apiPath}?access_token=${tokenData.access_token}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: `image=${encodeURIComponent(request.imageData.split(',')[1])}&language_type=CHN_ENG`
            });

            const data = await response.json();
            
            if (data.error_code) {
              throw new Error(data.error_msg);
            }

            // 处理百度 OCR 的识别结果
            const extractedText = data.words_result?.map(item => item.words).join('\n') || '';
            
            chrome.tabs.sendMessage(sender.tab.id, {
              action: 'showOCRResult',
              success: true,
              text: extractedText,
              configName: activeConfig.name
            });
          } else {
            // OpenAI 兼容接口处理（原有代码）
            const response = await fetch(`${activeConfig.apiEndpoint}${activeConfig.apiPath}`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${activeConfig.apiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                messages: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: "你是一位OCR识别专家，请识别这张图片中的所有文字内容，并尽可能按照原格式输出。"
                      },
                      {
                        type: "image_url",
                        image_url: {
                          "url": request.imageData
                        }
                      }
                    ]
                  }
                ],
                model: activeConfig.model
              })
            });

            if (!response.ok) {
              throw new Error(`API请求失败: ${response.status}`);
            }

            const data = await response.json();
            const extractedText = data.choices[0].message.content;

            chrome.tabs.sendMessage(sender.tab.id, {
              action: 'showOCRResult',
              success: true,
              text: extractedText,
              configName: activeConfig.name
            });
          }
        } catch (error) {
          console.error('OCR处理失败:', error);
          chrome.tabs.sendMessage(sender.tab.id, {
            action: 'showOCRResult',
            success: false,
            error: error.message || '文字识别失败'
          });
        }
      });
    }
    return true;
  }
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
  
  chrome.contextMenus.create({
    id: "captureAndOnlineOCR",
    title: "📝 截图并使用在线OCR",
    contexts: ["page", "selection"]
  });

  chrome.contextMenus.create({
    id: "captureAndLocalOCR",
    title: "🔍 截图并使用本地OCR",
    contexts: ["page", "selection"]
  });
});

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

// 添加本地 OCR 相关函数
async function checkLocalOCRService() {
  try {
    const response = await fetch('http://127.0.0.1:1224/api/ocr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        base64: '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k='
      })
    });

    console.log('服务检查响应状态:', response.status);
    const data = await response.text();
    console.log('服务检查响应:', data);

    return response.ok;
  } catch (error) {
    console.error('服务检查错误:', error);
    return false;
  }
}

async function processLocalOCR(imageData) {
  try {
    // 检查图片数据
    if (!imageData || !imageData.includes('base64')) {
      throw new Error('无效的图片数据');
    }

    // 检查服务状态
    const isServiceRunning = await checkLocalOCRService();
    console.log('OCR服务状态检查结果:', isServiceRunning);
    
    if (!isServiceRunning) {
      throw new Error('本地OCR服务连接失败，请确保Umi-OCR正在运行且HTTP接口已开启');
    }

    const umiOCRUrl = 'http://127.0.0.1:1224/api/ocr';
    
    // 从 base64 数据中提取实际的图片数据
    const base64Data = imageData.split(',')[1];

    // 构建请求数据
    const requestData = {
      base64: base64Data,
      options: {
        cls: true,
        language: ["ch", "en"]
      }
    };
    
    console.log('正在发送OCR请求...');

    const response = await fetch(umiOCRUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    console.log('OCR服务响应状态:', response.status);
    const responseText = await response.text();
    console.log('OCR服务原始响应:', responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('JSON解析错误:', e);
      throw new Error(`OCR服务返回的数据格式无效: ${responseText}`);
    }

    console.log('OCR服务返回数据:', data);
    
    if (!data) {
      throw new Error('OCR服务返回空数据');
    }

    // 检查错误信息
    if (data.code !== 100 && data.code !== 200) {
      const errorDetails = {
        code: data.code,
        message: data.message || data.error || data.msg || '未知错误',
        rawData: data
      };
      console.error('OCR错误详情:', errorDetails);
      throw new Error(`Umi-OCR 识别失败: ${errorDetails.message}`);
    }

    const results = data.data || data.results;
    if (!results || !Array.isArray(results)) {
      throw new Error('OCR返回数据格式错误');
    }

    // 提取识别文本
    const extractedText = results.map(item => item.text).join('\n');
    
    if (!extractedText) {
      throw new Error('未能识别出任何文字');
    }

    return extractedText;

  } catch (error) {
    console.error('本地OCR处理详细错误:', error);
    console.error('错误堆栈:', error.stack);
    throw error;
  }
} 