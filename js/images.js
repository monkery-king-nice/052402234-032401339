(function () {
  'use strict';
  const M = window.LostFoundModel;

  async function compressImage(file) {
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('照片无法读取，请选择完整的 JPG、PNG 或 WebP 图片'));
        image.src = url;
      });
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) {
        throw new Error('照片分辨率过高或无效，请缩小后重新选择');
      }
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('当前浏览器无法处理照片，请使用最新版 Chrome');
      const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
      let width = Math.max(1, Math.round(image.naturalWidth * scale));
      let height = Math.max(1, Math.round(image.naturalHeight * scale));
      for (let attempt = 0; attempt < 8; attempt++) {
        canvas.width = width;
        canvas.height = height;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        for (const quality of [0.82, 0.68, 0.54]) {
          const data = canvas.toDataURL('image/jpeg', quality);
          if (M.isImageDataUrl(data)) return data;
        }
        width = Math.max(1, Math.round(width * 0.8));
        height = Math.max(1, Math.round(height * 0.8));
      }
      throw new Error('照片压缩失败，请缩小图片后重试');
    } finally { URL.revokeObjectURL(url); }
  }

  async function prepareFiles(files, existingCount = 0) {
    const list = Array.from(files);
    const error = M.validateImageFiles(list, existingCount);
    if (error) throw new Error(error);
    const images = [];
    // Sequential decoding keeps memory use low when several large photos are selected.
    for (const file of list) images.push(await compressImage(file));
    return images;
  }

  window.CampusImages = { prepareFiles };
})();
