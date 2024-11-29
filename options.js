document.addEventListener('DOMContentLoaded', () => {
  let currentEditId = null;
  
  // 添加预设配置
  const API_PRESETS = {
    'baidu': {
      name: '百度通用文字识别（高精度版）',
      apiEndpoint: 'https://aip.baidubce.com',
      apiPath: '/rest/2.0/ocr/v1/accurate_basic',
      placeholder: {
        apiKey: '请输入百度 API Key',
        model: '请输入百度 Secret Key'
      },
      hint: {
        apiKey: 'API Key 是访问百度 AI 服务的授权码',
        model: 'Secret Key 是访问百度 AI 服务的安全码'
      }
    },
    'openai': {
      name: 'OpenAI 兼容接口',
      apiEndpoint: 'https://api.x.ai',
      apiPath: '/v1/chat/completions',
      placeholder: {
        apiKey: '输入你的 API 密钥',
        model: '例如: grok-vision-beta'
      },
      hint: {
        apiKey: '完整的API密钥，通常以特定前缀开头',
        model: '使用的AI模型名称'
      }
    }
  };

  // 加载所有配置
  loadApiConfigs();

  // 添加新配置按钮事件
  document.getElementById('newApiBtn').addEventListener('click', () => {
    currentEditId = null;
    showForm();
    clearForm();
  });

  // 类型切换处理
  document.getElementById('type').addEventListener('change', (e) => {
    const type = e.target.value;
    const preset = API_PRESETS[type];
    
    if (preset) {
      // 自动填充预设值
      document.getElementById('name').value = preset.name;
      document.getElementById('apiEndpoint').value = preset.apiEndpoint;
      document.getElementById('apiPath').value = preset.apiPath;
      
      // 更新输入框提示
      document.getElementById('apiKey').placeholder = preset.placeholder.apiKey;
      document.getElementById('model').placeholder = preset.placeholder.model;
      
      // 更新提示文本
      document.querySelector('[for="apiKey"] + .hint').textContent = preset.hint.apiKey;
      document.querySelector('[for="model"] + .hint').textContent = preset.hint.model;

      // 如果是百度OCR，清空 API Key 和 Secret Key 字段
      if (type === 'baidu') {
        document.getElementById('apiKey').value = '';
        document.getElementById('model').value = '';
        
        // 显示提示信息
        showStatus('请填写百度 API Key 和 Secret Key，其他配置已自动填充', true);
      }
    }
  });

  // 保存配置
  document.getElementById('apiForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const config = {
      id: currentEditId || Date.now().toString(),
      name: document.getElementById('name').value.trim(),
      apiEndpoint: document.getElementById('apiEndpoint').value.trim(),
      apiPath: document.getElementById('apiPath').value.trim(),
      apiKey: document.getElementById('apiKey').value.trim(),
      model: document.getElementById('model').value.trim(),
      type: document.getElementById('type').value
    };

    // 验证必填字段
    if (!config.apiEndpoint || !config.apiPath || !config.apiKey || !config.model) {
      showStatus('请填写所有必需的字段', false);
      return;
    }

    // 验证API域名格式
    if (!config.apiEndpoint.startsWith('http://') && !config.apiEndpoint.startsWith('https://')) {
      showStatus('API域名必须以 http:// 或 https:// 开头', false);
      return;
    }

    // 验证API路径格式
    if (!config.apiPath.startsWith('/')) {
      showStatus('API路径必须以 / 开头', false);
      return;
    }

    // 保存配置
    const { apiConfigs = [] } = await chrome.storage.sync.get('apiConfigs');
    const existingIndex = apiConfigs.findIndex(c => c.id === config.id);
    
    if (existingIndex >= 0) {
      apiConfigs[existingIndex] = config;
    } else {
      apiConfigs.push(config);
    }

    await chrome.storage.sync.set({ 
      apiConfigs,
      activeConfigId: config.id // 设置为当前活动配置
    });

    showStatus('配置已保存', true);
    loadApiConfigs();
    hideForm();
  });

  // 测试按钮功能
  document.getElementById('testBtn').addEventListener('click', async () => {
    const testBtn = document.getElementById('testBtn');
    const config = {
      name: document.getElementById('name').value.trim(),
      apiEndpoint: document.getElementById('apiEndpoint').value.trim(),
      apiPath: document.getElementById('apiPath').value.trim(),
      apiKey: document.getElementById('apiKey').value.trim(),
      model: document.getElementById('model').value.trim(),
      type: document.getElementById('type').value
    };

    // 验证输入
    if (!config.apiEndpoint || !config.apiPath || !config.apiKey || !config.model) {
      showStatus('请填写所有必需的字段后再测试', false);
      return;
    }

    if (!config.apiEndpoint.startsWith('http://') && !config.apiEndpoint.startsWith('https://')) {
      showStatus('API域名必须以 http:// 或 https:// 开头', false);
      return;
    }

    if (!config.apiPath.startsWith('/')) {
      showStatus('API路径必须以 / 开头', false);
      return;
    }

    // 开始测试
    testBtn.disabled = true;
    testBtn.classList.add('loading');
    testBtn.textContent = '测试中...';

    try {
      if (config.type === 'baidu') {
        await testBaiduOCR(config);
        showStatus('百度 OCR 连接测试成功！', true);
      } else {
        // 使用简单的文本请求进行测试
        const response = await fetch(`${config.apiEndpoint}${config.apiPath}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "这是一个API连接测试。请回复: OK"
                  }
                ]
              }
            ],
            model: config.model,
            max_tokens: 10
          })
        });

        let data;
        const responseText = await response.text();
        
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          if (response.ok) {
            showStatus('API连接成功！', true);
            return;
          }
          throw new Error('API响应格式错误');
        }

        if (response.ok) {
          showStatus('API连接成功！', true);
          console.log('API测试响应:', data);
          return;
        }

        if (data && data.error) {
          if (response.status === 401 || response.status === 403) {
            throw new Error('API密钥无效或未授权');
          }
          if (data.error.message && data.error.message.includes('model')) {
            throw new Error('模型名称无效或未授权使用此模型');
          }
          throw new Error(data.error.message || '未知API错误');
        }

        throw new Error(`HTTP错误: ${response.status}`);
      }
    } catch (error) {
      console.error('API测试失败:', error);
      
      let errorMessage = error.message;
      if (error.message.includes('Failed to fetch')) {
        errorMessage = '无法连接到API服务器，请检查网络或API域名';
      } else if (error.message.includes('NetworkError')) {
        errorMessage = '网络错误，请检查API域名是否正确';
      }
      
      showStatus(`API测试失败: ${errorMessage}`, false);
    } finally {
      testBtn.disabled = false;
      testBtn.classList.remove('loading');
      testBtn.textContent = '测试连接';
    }
  });

  // 百度 OCR 测试函数
  // 修改 testBaiduOCR 函数
async function testBaiduOCR(config) {
  try {
    // 获取 access_token
    const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${config.apiKey}&client_secret=${config.model}`;
    
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      throw new Error('获取百度 access_token 失败');
    }

    // 使用一个更大的测试图片（一个包含文字的简单图片的base64编码）
    const testImageBase64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/4QBmRXhpZgAATU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAAExAAIAAAAQAAAATgAAAAAAAABgAAAAAQAAAGAAAAABcGFpbnQubmV0IDUuMC4xAP/bAEMABgQFBgUEBgYFBgcHBggKEAoKCQkKFA4PDBAXFBgYFxQWFhodJR8aGyMcFhYgLCAjJicpKikZHy0wLSgwJSgpKP/bAEMBBwcHCggKEwoKEygaFhooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKP/AABEIADIAggMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APf6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//2Q==';

    const response = await fetch(`${config.apiEndpoint}${config.apiPath}?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `image=${encodeURIComponent(testImageBase64)}&language_type=CHN_ENG`
    });

    const data = await response.json();
    console.log('百度OCR响应:', data);  // 添加日志输出
    
    if (data.error_code) {
      throw new Error(`百度 OCR 错误: ${data.error_msg}`);
    }

    return true;
  } catch (error) {
    console.error('百度OCR测试错误:', error);  // 添加错误日志
    if (error.message.includes('access_token')) {
      throw new Error('API Key 或 Secret Key 无效');
    }
    throw error;
  }
}

  // 加载 API 配置列表
  async function loadApiConfigs() {
    const { apiConfigs = [], activeConfigId } = await chrome.storage.sync.get(['apiConfigs', 'activeConfigId']);
    const apiList = document.getElementById('apiList');
    apiList.innerHTML = '';

    apiConfigs.forEach(config => {
      const item = document.createElement('div');
      item.className = `api-item ${config.id === activeConfigId ? 'active' : ''}`;
      item.innerHTML = `
        <input type="radio" name="apiConfig" value="${config.id}" 
               ${config.id === activeConfigId ? 'checked' : ''}>
        <span class="api-name">${config.name}</span>
        <div class="api-actions">
          <button type="button" class="btn-edit">编辑</button>
          <button type="button" class="btn-delete">删除</button>
        </div>
      `;

      // 选择配置
      const radio = item.querySelector('input[type="radio"]');
      radio.addEventListener('change', async () => {
        await chrome.storage.sync.set({ activeConfigId: config.id });
        loadApiConfigs();
      });

      // 编辑配置
      item.querySelector('.btn-edit').addEventListener('click', () => {
        currentEditId = config.id;
        loadConfigToForm(config);
        showForm();
      });

      // 删除配置
      item.querySelector('.btn-delete').addEventListener('click', async () => {
        if (confirm('确定要删除这个配置吗？')) {
          const newConfigs = apiConfigs.filter(c => c.id !== config.id);
          await chrome.storage.sync.set({ 
            apiConfigs: newConfigs,
            activeConfigId: newConfigs.length > 0 ? newConfigs[0].id : null
          });
          loadApiConfigs();
        }
      });

      apiList.appendChild(item);
    });
  }

  // 辅助函数
  function showForm() {
    document.getElementById('apiForm').style.display = 'block';
  }

  function hideForm() {
    document.getElementById('apiForm').style.display = 'none';
  }

  function clearForm() {
    document.getElementById('name').value = '';
    document.getElementById('apiEndpoint').value = '';
    document.getElementById('apiPath').value = '';
    document.getElementById('apiKey').value = '';
    document.getElementById('model').value = '';
    document.getElementById('type').value = 'openai';
  }

  function loadConfigToForm(config) {
    document.getElementById('name').value = config.name;
    document.getElementById('apiEndpoint').value = config.apiEndpoint;
    document.getElementById('apiPath').value = config.apiPath;
    document.getElementById('apiKey').value = config.apiKey;
    document.getElementById('model').value = config.model;
    document.getElementById('type').value = config.type || 'openai';
  }

  function showStatus(message, isSuccess) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${isSuccess ? 'success' : 'error'}`;
    status.style.display = 'block';
    
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  }
});