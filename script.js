function getEl(id) {
  const el = document.getElementById(id);
  if (!el) {
    return {
      addEventListener: () => {},
      value: null,
      checked: true,
      style: {},
      classList: { add: () => {}, remove: () => {} },
      click: () => {},
      id: null,
      getContext: () => ({ clearRect: () => {}, drawImage: () => {} }) };

  }
  return el;
}
const imageUpload = getEl('imageUpload');
const contentImg = getEl('contentImage');
const uploadArea = getEl('uploadArea');
const uploadPlaceholder = getEl('uploadPlaceholder');
const downloadPngButton = getEl('downloadPng');
const downloadJpgButton = getEl('downloadJpg');
const downloadSvgButton = getEl('downloadSvg');
const resetSettingsButton = getEl('resetSettings');
const thresholdSlider = getEl('threshold');
const thresholdValue = getEl('thresholdValue');
const edgeSlider = getEl('edgeStrength');
const edgeValue = getEl('edgeValue');
const smoothnessSlider = getEl('smoothness');
const smoothnessValue = getEl('smoothnessValue');
const detailSlider = getEl('detailLevel');
const detailValue = getEl('detailValue');
const backgroundColorInput = getEl('backgroundColor');
const foregroundColorInput = getEl('foregroundColor');
const styledCanvas = getEl('styledCanvas');
const originalCanvas = getEl('originalCanvas');
const colorPaletteSelect = getEl('colorPalette');
const stylePresetSelect = getEl('stylePreset');
const canvasStage = getEl('canvasStage');
const ratioButtons = document.querySelectorAll('.ratio-btn');
const colorSwatches = document.querySelectorAll('.color-swatch');
// 默认值常量
const DEFAULT_BG = '#ffffff';
const DEFAULT_FG = '#53565c';
const DEFAULT_PALETTE = 'classic';
const DEFAULT_STYLE = 'graphic';
// 存储用户选择的颜色，而不是自定义拾色器的值
let selectedBgColor = DEFAULT_BG;
let selectedFgColor = DEFAULT_FG;
let originalImageData = null;
let maskData = null;
let updateScheduled = false;
let currentAspectRatio = '3:4';
let fullImageSrc = '';
const MAX_PREVIEW_SIDE = 1024;
// --- 【拖曳状态变量】 ---
let isDragging = false;
let startX = 0;
let startY = 0;
let imageOffsetX = 0;
let imageOffsetY = 0;
// ----------------------------
const colorPalettes = {
  classic: { bg: '#ffffff', fg: '#53565c' },
  'red-black': { bg: '#f5e6d3', fg: '#8b0000' },
  'blue-ochre': { bg: '#e8d5b7', fg: '#1e3a5f' },
  'green-sepia': { bg: '#ede5d8', fg: '#3a5f3a' },
  'chinese-red': { bg: '#f0e7d8', fg: '#c8102e' },
  'prussian-blue': { bg: '#e8e4d9', fg: '#003153' },
  'earth-tones': { bg: '#e9dcc9', fg: '#5d4e37' },
  'japanese-indigo': { bg: '#f0ece2', fg: '#264348' } };

const stylePresets = {
  graphic: { threshold: 128, edge: 3.0, smoothness: 30, detail: 50 },
  'vans-style': { threshold: 140, edge: 4.0, smoothness: 20, detail: 60 },
  'roche-style': { threshold: 120, edge: 2.5, smoothness: 40, detail: 45 },
  'minimal': { threshold: 160, edge: 1.0, smoothness: 60, detail: 20 } };

let offscreenCanvas = document.createElement('canvas');
let offscreenCtx = offscreenCanvas.getContext('2d');
let worker = null;
let currentUpdateId = 0;
// Worker 初始化 (已修复变量名错误)
function initWorker() {
  const workerCode = `
        function applyGaussianBlur(sourceData, width, height, radius) {
            if (radius < 1) return new Uint8ClampedArray(sourceData);
            const outputData = new Uint8ClampedArray(sourceData.length);
            const size = radius * 2 + 1;
            const kernel = [];
            let sum = 0;
            for (let i = 0; i < size; i++) {
                const x = i - radius;
                kernel[i] = Math.exp(-(x * x) / (2 * radius * radius));
                sum += kernel[i];
            }
            for (let i = 0; i < size; i++) kernel[i] /= sum;
            const tempData = new Uint8ClampedArray(sourceData.length);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    let r = 0, g = 0, b = 0;
                    for (let kx = -radius; kx <= radius; kx++) {
                        const px = Math.min(width - 1, Math.max(0, x + kx));
                        const idx = (y * width + px) * 4;
                        const w = kernel[kx + radius];
                        r += sourceData[idx] * w;
                        g += sourceData[idx + 1] * w;
                        b += sourceData[idx + 2] * w;
                    }
                    const i = (y * width + x) * 4;
                    tempData[i] = r;
                    tempData[i + 1] = g;
                    tempData[i + 2] = b;
                    tempData[i + 3] = sourceData[i + 3];
                }
            }
            for (let x = 0; x < width; x++) {
                for (let y = 0; y < height; y++) {
                    let r = 0, g = 0, b = 0;
                    for (let ky = -radius; ky <= radius; ky++) {
                        const py = Math.min(height - 1, Math.max(0, y + ky));
                        const idx = (py * width + x) * 4;
                        const w = kernel[ky + radius];
                        r += tempData[idx] * w;
                        g += tempData[idx + 1] * w;
                        b += tempData[idx + 2] * w;
                    }
                    const i = (y * width + x) * 4;
                    outputData[i] = r;
                    outputData[i + 1] = g;
                    outputData[i + 2] = b;
                    outputData[i + 3] = tempData[i + 3];
                }
            }
            return outputData;
        }
        function applySobel(sourceData, width, height, strength) {
            const outputData = new Uint8ClampedArray(sourceData.length);
            const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
            const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    let px = 0, py = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const idx = ((y + ky) * width + (x + kx)) * 4;
                            const val = sourceData[idx] * 0.3 + sourceData[idx + 1] * 0.59 + sourceData[idx + 2] * 0.11;
                            const k = (ky + 1) * 3 + (kx + 1);
                            px += gx[k] * val;
                            py += gy[k] * val;
                        }
                    }
                    let edge = Math.sqrt(px * px + py * py) * strength;
                    edge = Math.min(255, Math.max(0, edge));
                    const val = edge > 80 ? 255 : 0;
                    const i = (y * width + x) * 4;
                    outputData[i] = outputData[i + 1] = outputData[i + 2] = val;
                    outputData[i + 3] = sourceData[i + 3];
                }
            }
            return outputData;
        }
        function applyAdaptiveThreshold(sourceData, width, height, threshold, detailLevel) {
            const outputData = new Uint8ClampedArray(sourceData.length);
            let normalizedDetail = detailLevel;
            if (detailLevel > 10) normalizedDetail = Math.ceil(detailLevel / 20);
            normalizedDetail = Math.max(1, Math.min(5, normalizedDetail));
            const blockSize = Math.max(3, 7 - normalizedDetail);
            const integral = new Float64Array(width * height);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    const gray = sourceData[idx];
                    let val = gray;
                    if (x > 0) val += integral[y * width + x - 1];
                    integral[y * width + x] = val;
                }
            }
            for (let y = 1; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    integral[y * width + x] += integral[(y - 1) * width + x];
                }
            }
            function getSum(x1, y1, x2, y2) {
                x1 = Math.max(0, x1); y1 = Math.max(0, y1);
                x2 = Math.min(width - 1, x2); y2 = Math.min(height - 1, y2);
                let a = integral[y2 * width + x2];
                let b = y1 > 0 ? integral[(y1 - 1) * width + x2] : 0;
                let c = x1 > 0 ? integral[y2 * width + x1 - 1] : 0;
                let d = (y1 > 0 && x1 > 0) ? integral[(y1 - 1) * width + x1 - 1] : 0;
                return a - b - c + d;
            }
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const x1 = x - blockSize; const y1 = y - blockSize;
                    const x2 = x + blockSize; const y2 = y + blockSize;
                    const sum = getSum(x1, y1, x2, y2);
                    const w = (Math.min(width - 1, x2) - Math.max(0, x1) + 1);
                    const h = (Math.min(height - 1, y2) - Math.max(0, y1) + 1);
                    const count = w * h;
                    const localMean = sum / count;
                    const localThreshold = localMean * (threshold / 128);
                    const idx = (y * width + x) * 4;
                    const luminance = sourceData[idx];
                    const val = luminance >= localThreshold * 0.9 ? 255 : 0;
                    outputData[idx] = outputData[idx + 1] = outputData[idx + 2] = val;
                    outputData[idx + 3] = sourceData[idx + 3];
                }
            }
            return outputData;
        }
        function applyMorphology(sourceData, width, height, operation = 'open', size = 1) {
            function erode(data, w, h, s) {
                const out = new Uint8ClampedArray(data.length);
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        let minVal = 255;
                        for (let ky = -s; ky <= s; ky++) {
                            for (let kx = -s; kx <= s; kx++) {
                                const px = Math.min(w - 1, Math.max(0, x + kx));
                                const py = Math.min(h - 1, Math.max(0, y + ky));
                                const idx = (py * w + px) * 4;
                                minVal = Math.min(minVal, data[idx]);
                            }
                        }
                        const i = (y * w + x) * 4;
                        out[i] = out[i + 1] = out[i + 2] = minVal;
                        out[i + 3] = data[i + 3];
                    }
                }
                return out;
            }
            function dilate(data, w, h, s) {
                const out = new Uint8ClampedArray(data.length);
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        let maxVal = 0;
                        for (let ky = -s; ky <= s; ky++) {
                            for (let kx = -s; kx <= s; kx++) {
                                const px = Math.min(w - 1, Math.max(0, x + kx));
                                const py = Math.min(h - 1, Math.max(0, y + ky));
                                const idx = (py * w + px) * 4;
                                maxVal = Math.max(maxVal, data[idx]);
                            }
                        }
                        const i = (y * w + x) * 4;
                        out[i] = out[i + 1] = out[i + 2] = maxVal;
                        out[i + 3] = data[i + 3];
                    }
                }
                return out;
            }
            if (operation === 'open') {
                const eroded = erode(sourceData, width, height, size);
                return dilate(eroded, width, height, size);
            } else if (operation === 'close') {
                const dilated = dilate(sourceData, width, height, size);
                return erode(dilated, width, height, size);
            }
            return sourceData;
        }
        self.onmessage = function(e) {
            const { data, width, height, smoothness, edgeStrength, threshold, detailLevel, id } = e.data;
            let processedData = applyGaussianBlur(data, width, height, Math.floor(smoothness / 10));
            processedData = applySobel(processedData, width, height, edgeStrength);
            processedData = applyAdaptiveThreshold(processedData, width, height, threshold, detailLevel);
            const maskData = applyMorphology(processedData, width, height, 'open', 1);
            self.postMessage({buffer: maskData.buffer, id: id}, [maskData.buffer]);
        };
    `;
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  worker = new Worker(URL.createObjectURL(blob));
  worker.onmessage = function (e) {
    if (e.data.id !== currentUpdateId) return;
    maskData = new Uint8ClampedArray(e.data.buffer);
    applyColorsAndUpdate();
  };
}
initWorker();
// UI 更新函数
function updateUIValues() {
  if (thresholdSlider.id) thresholdValue.textContent = thresholdSlider.value;
  if (edgeSlider.id) edgeValue.textContent = edgeSlider.value;
  if (smoothnessSlider.id) smoothnessValue.textContent = smoothnessSlider.value;
  if (detailSlider.id) detailValue.textContent = detailSlider.value;
}
function updateCanvasBackground() {
  if (canvasStage.id) {
    canvasStage.style.backgroundColor = selectedBgColor;
  }
}
// 处理画布比例
function updateCanvasRatio() {
  if (!canvasStage.id) return;
  const ratio = currentAspectRatio;
  if (ratio === '4:3') {
    canvasStage.style.aspectRatio = '4 / 3';
    canvasStage.style.maxHeight = '65vh';
    canvasStage.style.maxWidth = 'calc(65vh * 1.333)';
  } else if (ratio === '1:1') {
    canvasStage.style.aspectRatio = '1 / 1';
    canvasStage.style.maxHeight = '80vh';
    canvasStage.style.maxWidth = '80vh';
  } else {
    canvasStage.style.aspectRatio = '3 / 4';
    canvasStage.style.maxHeight = '90vh';
    canvasStage.style.maxWidth = 'calc(90vh * 0.75)';
  }
  // 比例改变后，立即更新显示，重新计算fit
  updateDisplay();
}
/**
 * 核心重置函数：恢复到初始页面加载时的状态
 */
function resetParametersToDefault() {
  // --- 1. 重置参数和颜色 ---
  selectedBgColor = DEFAULT_BG;
  selectedFgColor = DEFAULT_FG;
  if (backgroundColorInput.id) backgroundColorInput.value = DEFAULT_BG;
  if (foregroundColorInput.id) foregroundColorInput.value = DEFAULT_FG;

  if (colorPaletteSelect.id) colorPaletteSelect.value = DEFAULT_PALETTE;
  if (stylePresetSelect.id) stylePresetSelect.value = DEFAULT_STYLE;

  const defaultPreset = stylePresets[DEFAULT_STYLE];
  if (defaultPreset) {
    thresholdSlider.value = defaultPreset.threshold;
    edgeSlider.value = defaultPreset.edge;
    smoothnessSlider.value = defaultPreset.smoothness;
    detailSlider.value = defaultPreset.detail;
  }
  // --- 2. 清除图片数据和预览 ---
  originalImageData = null;
  maskData = null;

  // 重置拖曳偏移量
  imageOffsetX = 0;
  imageOffsetY = 0;

  if (contentImg.id) contentImg.src = '';
  if (contentImg.id) contentImg.style.display = 'none';
  if (uploadPlaceholder.id) uploadPlaceholder.style.display = 'flex'; // 显示上传占位符
  if (uploadArea.id) uploadArea.classList.add('empty');
  if (imageUpload.id) imageUpload.value = ''; // 清空文件输入框，允许重新上传同一文件
  // --- 3. 更新 UI 和画布 ---
  updateUIValues();
  updateCanvasBackground();

  // 清空画布 (调用 updateDisplay 来确保背景色正确绘制)
  updateDisplay();
}
function scheduleUpdate(recomputeMask = false) {
  if (updateScheduled) return;
  updateScheduled = true;
  requestAnimationFrame(() => {
    updateScheduled = false;
    if (originalImageData) {
      applyWoodcutEffect(recomputeMask);
    } else {
      // 如果没有原图，但触发了更新（例如参数滑动），则只更新显示背景
      applyColorsAndUpdate();
    }
  });
}
function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized, 16);
  return {
    r: bigint >> 16 & 255,
    g: bigint >> 8 & 255,
    b: bigint & 255 };

}
// 核心逻辑：应用木刻效果 (发送给 Worker)
function applyWoodcutEffect(recomputeMask) {
  if (!originalImageData) return;

  if (recomputeMask) {
    currentUpdateId++;
    worker.postMessage({
      data: originalImageData.data,
      width: originalImageData.width,
      height: originalImageData.height,
      smoothness: parseInt(smoothnessSlider.value),
      edgeStrength: parseFloat(edgeSlider.value),
      threshold: parseInt(thresholdSlider.value),
      detailLevel: parseInt(detailSlider.value),
      id: currentUpdateId });

  } else {
    applyColorsAndUpdate();
  }
}
// 核心逻辑：应用颜色到 Offscreen Canvas
function applyColorsAndUpdate() {
  // 【优化】只有当有掩码数据和原图数据时才进行完整的图像处理
  if (maskData && originalImageData) {
    const width = originalImageData.width;
    const height = originalImageData.height;

    // 确保 offscreen canvas 尺寸匹配
    if (offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
      offscreenCanvas.width = width;
      offscreenCanvas.height = height;
    }
    const imgData = offscreenCtx.createImageData(width, height);
    const data = imgData.data;

    const bg = hexToRgb(selectedBgColor);
    const fg = hexToRgb(selectedFgColor);
    for (let i = 0; i < data.length; i += 4) {
      // 根据原始Worker逻辑：255(白)为亮部/背景，0(黑)为暗部/前景
      const isBackground = maskData[i] > 128;

      if (isBackground) {
        data[i] = bg.r;
        data[i + 1] = bg.g;
        data[i + 2] = bg.b;
        data[i + 3] = 255;
      } else {
        data[i] = fg.r;
        data[i + 1] = fg.g;
        data[i + 2] = fg.b;
        data[i + 3] = 255;
      }
    }

    offscreenCtx.putImageData(imgData, 0, 0);
  }

  // 【关键优化】无论是否有图像数据，都必须调用 updateDisplay() 来绘制 styledCanvas 的背景色
  updateDisplay();
}
// 核心优化：始终适配画布比例，不可溢出，完整显示
function updateDisplay() {
  const stageW = canvasStage.clientWidth;
  const stageH = canvasStage.clientHeight;
  styledCanvas.width = stageW;
  styledCanvas.height = stageH;
  const ctx = styledCanvas.getContext('2d');
  // 清空并填充背景色 (这是在没有图像数据时显示背景的关键)
  ctx.clearRect(0, 0, stageW, stageH);
  ctx.fillStyle = selectedBgColor;
  ctx.fillRect(0, 0, stageW, stageH);
  // 如果没有图片数据，则只绘制背景，然后返回
  if (!offscreenCanvas.width || !offscreenCanvas.height || !originalImageData) {
    return;
  }
  // 以下逻辑只在有图片数据时执行
  // 计算缩放比例 (Contain 逻辑)
  const imgW = offscreenCanvas.width;
  const imgH = offscreenCanvas.height;

  const scaleX = stageW / imgW;
  const scaleY = stageH / imgH;
  const scaleToFit = Math.min(scaleX, scaleY); // 取最小值确保不溢出
  const drawW = imgW * scaleToFit;
  const drawH = imgH * scaleToFit;
  // 计算绘制位置时，引入拖曳偏移量
  const centerX = (stageW - drawW) / 2;
  const centerY = (stageH - drawH) / 2;

  const drawX = centerX + imageOffsetX;
  const drawY = centerY + imageOffsetY;

  // 禁用图像平滑以保持像素风格
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(offscreenCanvas, drawX, drawY, drawW, drawH);
}
// 事件监听与初始化逻辑
if (uploadArea.id) {
  uploadArea.addEventListener('click', () => {
    imageUpload.click();
  });
}
if (imageUpload.id) {
  imageUpload.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = event => {
        const img = new Image();
        img.onload = () => {
          if (contentImg.id) {
            contentImg.src = event.target.result;
            contentImg.style.display = 'block';
          }
          if (uploadPlaceholder.id) uploadPlaceholder.style.display = 'none';
          if (uploadArea.id) uploadArea.classList.remove('empty');

          // 处理图片尺寸，避免过大
          let w = img.width;
          let h = img.height;
          if (w > MAX_PREVIEW_SIDE || h > MAX_PREVIEW_SIDE) {
            const ratio = Math.min(MAX_PREVIEW_SIDE / w, MAX_PREVIEW_SIDE / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }

          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = w;
          tempCanvas.height = h;
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.drawImage(img, 0, 0, w, h);

          originalImageData = tempCtx.getImageData(0, 0, w, h);

          // 上传新图片时，重置拖曳位置
          imageOffsetX = 0;
          imageOffsetY = 0;

          scheduleUpdate(true);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  });
}
// 控件事件监听
// 参数滑动时，即使没有图片数据，也会触发 scheduleUpdate -> applyColorsAndUpdate -> updateDisplay，确保背景更新。
[thresholdSlider, edgeSlider, smoothnessSlider, detailSlider].forEach(slider => {
  if (slider.id) {
    slider.addEventListener('input', () => {
      updateUIValues();
      scheduleUpdate(true);
    });
  }
});
// 颜色事件：只有用户直接操作拾色器时，才更新 selectedColor
if (backgroundColorInput.id) {
  // 调用 applyColorsAndUpdate 来触发 updateDisplay
  backgroundColorInput.addEventListener('input', e => {
    selectedBgColor = e.target.value;
    updateCanvasBackground();
    applyColorsAndUpdate();
  });
}
if (foregroundColorInput.id) {
  // 调用 applyColorsAndUpdate 来触发 updateDisplay
  foregroundColorInput.addEventListener('input', e => {
    selectedFgColor = e.target.value;
    applyColorsAndUpdate();
  });
}
// 预设色板
if (colorPaletteSelect.id) {
  colorPaletteSelect.addEventListener('change', e => {
    const palette = colorPalettes[e.target.value];
    if (palette) {
      selectedBgColor = palette.bg;
      selectedFgColor = palette.fg;
      // 不修改自定义拾色器的 value
      updateCanvasBackground();
      applyColorsAndUpdate();
    }
  });
}
// 颜色样本点击
colorSwatches.forEach(swatch => {
  swatch.addEventListener('click', () => {
    const color = swatch.getAttribute('data-color');
    const type = swatch.getAttribute('data-for');
    if (type === 'bg') {
      selectedBgColor = color;
      // 不修改自定义拾色器的 value
      updateCanvasBackground();
    } else {
      selectedFgColor = color;
      // 不修改自定义拾色器的 value
    }
    applyColorsAndUpdate();
  });
});
// 风格预设
if (stylePresetSelect.id) {
  stylePresetSelect.addEventListener('change', e => {
    const preset = stylePresets[e.target.value];
    if (preset) {
      thresholdSlider.value = preset.threshold;
      edgeSlider.value = preset.edge;
      smoothnessSlider.value = preset.smoothness;
      detailSlider.value = preset.detail;
      updateUIValues();
      scheduleUpdate(true);
    }
  });
}
// 画布比例切换
ratioButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    ratioButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentAspectRatio = btn.getAttribute('data-ratio');
    updateCanvasRatio();
  });
});
// 重置按钮
if (resetSettingsButton.id) {
  resetSettingsButton.addEventListener('click', resetParametersToDefault);
}
// --- 拖曳功能的核心逻辑 ---
if (styledCanvas.id) {
  // 1. 开始拖曳 (按下鼠标)
  styledCanvas.addEventListener('mousedown', e => {
    // 只有当有图片数据时才能拖曳
    if (!originalImageData) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    styledCanvas.style.cursor = 'grabbing';
  });
  // 2. 拖曳中 (移动鼠标)
  document.addEventListener('mousemove', e => {
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    imageOffsetX += dx;
    imageOffsetY += dy;

    startX = e.clientX;
    startY = e.clientY;
    updateDisplay();
  });
  // 3. 结束拖曳 (松开鼠标)
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      styledCanvas.style.cursor = 'grab';
    }
  });
  // 初始化光标样式
  styledCanvas.style.cursor = 'grab';
}
// ----------------------------------
// 下载功能 (已修改)
function downloadCanvas(format) {
  if (!styledCanvas) return;
  const link = document.createElement('a');
  // 确定文件扩展名和 MIME 类型
  let mimeType = `image/${format}`;
  let extension = format;
  // 如果是 jpeg 格式，将扩展名强制设为 .jpg
  if (format === 'jpeg') {
    extension = 'jpg';
    // mimeType 保持 image/jpeg
  }
  link.download = `woodcut-export.${extension}`;
  link.href = styledCanvas.toDataURL(mimeType, 0.9);
  link.click();
}
function downloadSVG() {
  if (!maskData || !originalImageData) return;
  const width = originalImageData.width;
  const height = originalImageData.height;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="background-color: ${selectedBgColor};">\n`;
  const fg = selectedFgColor;
  for (let y = 0; y < height; y++) {
    let inRun = false;
    let startX = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const isFg = maskData[i] <= 128; // 0 is fg
      if (isFg) {
        if (!inRun) {
          inRun = true;
          startX = x;
        }
      } else {
        if (inRun) {
          inRun = false;
          const runWidth = x - startX;
          svg += `<rect x="${startX}" y="${y}" width="${runWidth}" height="1" fill="${fg}"/>\n`;
        }
      }
    }
    if (inRun) {
      const runWidth = width - startX;
      svg += `<rect x="${startX}" y="${y}" width="${runWidth}" height="1" fill="${fg}"/>\n`;
    }
  }
  svg += '</svg>';
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = 'woodcut-export.svg';
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
if (downloadPngButton.id) downloadPngButton.addEventListener('click', () => downloadCanvas('png'));
// 传递 'jpeg' 给 toDataURL，但在 downloadCanvas 内部处理为 .jpg 扩展名
if (downloadJpgButton.id) downloadJpgButton.addEventListener('click', () => downloadCanvas('jpeg'));
if (downloadSvgButton.id) downloadSvgButton.addEventListener('click', downloadSVG);
// 窗口大小改变时自适应
window.addEventListener('resize', () => {
  updateDisplay();
});
// 初始化调用
updateUIValues();
updateCanvasRatio();
updateCanvasBackground();
// 确保页面加载时绘制默认背景色
applyColorsAndUpdate();