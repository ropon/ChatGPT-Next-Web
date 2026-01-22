// 图片生成提示词工具

export interface ImagePromptTemplate {
  id: string;
  title: string;
  prompt: string;
  category: string;
}

export const IMAGE_PROMPT_TEMPLATES: ImagePromptTemplate[] = [
  // 艺术风格
  {
    id: "realistic-portrait",
    title: "写实人像",
    prompt:
      "A realistic portrait of [subject], professional photography, studio lighting, high detail, 8K resolution",
    category: "portrait",
  },
  {
    id: "anime-style",
    title: "动漫风格",
    prompt:
      "Anime style illustration of [subject], vibrant colors, detailed, high quality artwork",
    category: "anime",
  },
  {
    id: "oil-painting",
    title: "油画风格",
    prompt:
      "Oil painting of [subject], classical art style, rich textures, masterpiece quality",
    category: "art",
  },

  // 场景类型
  {
    id: "fantasy-landscape",
    title: "奇幻风景",
    prompt:
      "Fantasy landscape with [description], magical atmosphere, ethereal lighting, highly detailed",
    category: "landscape",
  },
  {
    id: "cyberpunk-city",
    title: "赛博朋克城市",
    prompt:
      "Cyberpunk cityscape, neon lights, futuristic architecture, night scene, high tech atmosphere",
    category: "sci-fi",
  },
  {
    id: "cozy-interior",
    title: "温馨室内",
    prompt:
      "Cozy interior design, warm lighting, comfortable furniture, inviting atmosphere, detailed textures",
    category: "interior",
  },

  // 概念设计
  {
    id: "logo-design",
    title: "Logo设计",
    prompt:
      "Modern logo design for [brand/concept], clean, minimalist, professional, vector style",
    category: "design",
  },
  {
    id: "product-concept",
    title: "产品概念",
    prompt:
      "Product concept design of [product], sleek modern design, industrial design, high quality render",
    category: "design",
  },
];

export const IMAGE_GENERATION_MODELS = [
  {
    id: "dall-e-3",
    name: "DALL-E 3",
    provider: "OpenAI",
    description: "OpenAI的最新图片生成模型，质量最高",
    features: ["高质量", "多种风格", "精确控制"],
    sizes: ["1024x1024", "1792x1024", "1024x1792"],
    qualities: ["standard", "hd"],
    styles: ["vivid", "natural"],
  },
  {
    id: "cogview-3-plus",
    name: "CogView-3 Plus",
    provider: "ChatGLM",
    description: "智谱AI的高质量图片生成模型",
    features: ["中文友好", "快速生成", "多样化风格"],
    sizes: ["1024x1024", "768x1344", "1344x768"],
    qualities: ["standard"],
    styles: [],
  },
  {
    id: "cogview-3",
    name: "CogView-3",
    provider: "ChatGLM",
    description: "智谱AI的标准图片生成模型",
    features: ["中文友好", "快速生成"],
    sizes: ["1024x1024"],
    qualities: ["standard"],
    styles: [],
  },
  {
    id: "gemini-3-pro-image-preview",
    name: "Gemini 3.0 Pro Image",
    provider: "Google",
    description: "Google的实验性图片生成模型",
    features: ["实验性功能", "多模态", "创新风格"],
    sizes: ["1024x1024"],
    qualities: ["standard"],
    styles: [],
  },
  {
    id: "grok-2-image-1212",
    name: "Grok-2 Image",
    provider: "XAI",
    description: "xAI的图片生成模型，基于Grok-2技术",
    features: ["高质量", "快速生成", "创新AI"],
    sizes: ["1024x1024", "1792x1024", "1024x1792"],
    qualities: ["standard"],
    styles: [],
  },
];

export const IMAGE_CATEGORIES = [
  { id: "portrait", name: "人像", icon: "👤" },
  { id: "anime", name: "动漫", icon: "🎨" },
  { id: "art", name: "艺术", icon: "🖼️" },
  { id: "landscape", name: "风景", icon: "🏞️" },
  { id: "sci-fi", name: "科幻", icon: "🚀" },
  { id: "interior", name: "室内", icon: "🏠" },
  { id: "design", name: "设计", icon: "✨" },
];

/**
 * 获取推荐的图片生成模型
 */
export function getRecommendedImageModel(): (typeof IMAGE_GENERATION_MODELS)[0] {
  // 默认推荐DALL-E 3，因为它支持最全面
  return IMAGE_GENERATION_MODELS[0];
}

/**
 * 检测模型是否支持图片生成
 */
export function supportsImageGeneration(model: string): boolean {
  const lowerModel = model.toLowerCase();

  // DALL-E 系列
  if (lowerModel.includes("dall-e") || lowerModel.includes("dalle")) {
    return true;
  }

  // ChatGLM CogView 系列
  if (lowerModel.startsWith("cogview-")) {
    return true;
  }

  // Gemini 图片生成模型
  if (
    lowerModel.includes("image-generation") ||
    lowerModel.includes("flash-image") ||
    lowerModel.includes("pro-image")
  ) {
    return true;
  }

  // Grok 图片生成模型
  if (lowerModel.includes("grok") && lowerModel.includes("image")) {
    return true;
  }

  // 其他支持图片生成的模型可以在这里添加

  return false;
}

/**
 * 获取模型的图片生成类型
 */
export function getImageGenerationType(
  model: string,
): "openai" | "glm" | "gemini" | "xai" | "unknown" {
  const lowerModel = model.toLowerCase();

  if (lowerModel.includes("dall-e") || lowerModel.includes("dalle")) {
    return "openai";
  }

  if (lowerModel.startsWith("cogview-")) {
    return "glm";
  }

  if (
    lowerModel.includes("gemini") &&
    (lowerModel.includes("image-generation") ||
      lowerModel.includes("flash-image") ||
      lowerModel.includes("pro-image"))
  ) {
    return "gemini";
  }

  if (lowerModel.includes("grok") && lowerModel.includes("image")) {
    return "xai";
  }

  return "unknown";
}

/**
 * 检测用户输入是否包含图片生成意图
 */
export function detectImageGenerationIntent(input: string): boolean {
  const imageKeywords = [
    // 中文关键词
    "生成图片",
    "画一张",
    "画个",
    "生成一张图",
    "帮我画",
    "创建图片",
    "制作图片",
    "绘制",
    "画出",
    "生成图像",
    "创作图片",
    "设计图片",
    "画一个",
    "做一张图",
    "生成照片",
    "创建图像",
    "制作海报",

    // 英文关键词
    "generate image",
    "create image",
    "draw",
    "make image",
    "paint",
    "generate picture",
    "create picture",
    "design image",
    "make picture",
    "draw me",
    "create art",
    "generate art",
    "make art",
  ];

  const lowerInput = input.toLowerCase();
  return imageKeywords.some((keyword) =>
    lowerInput.includes(keyword.toLowerCase()),
  );
}

/**
 * 从用户输入中提取图片描述
 */
export function extractImageDescription(input: string): string {
  const imageKeywords = [
    "生成图片",
    "画一张",
    "画个",
    "生成一张图",
    "帮我画",
    "创建图片",
    "制作图片",
    "绘制",
    "画出",
    "生成图像",
    "创作图片",
    "设计图片",
    "画一个",
    "做一张图",
    "生成照片",
    "创建图像",
    "制作海报",
    "generate image",
    "create image",
    "draw",
    "make image",
    "paint",
    "generate picture",
    "create picture",
    "design image",
    "make picture",
    "draw me",
    "create art",
    "generate art",
    "make art",
  ];

  let description = input;

  // 移除图片生成关键词
  imageKeywords.forEach((keyword) => {
    const regex = new RegExp(keyword, "gi");
    description = description.replace(regex, "").trim();
  });

  // 清理常见的标点符号和连接词
  description = description
    .replace(/^[：:，,。.！!？?的了一个一张]*/, "")
    .trim();
  description = description.replace(/^(of|about|with|for)\s+/i, "").trim();

  return description || input;
}

/**
 * 优化图片生成提示词
 */
export function optimizeImagePrompt(description: string): string {
  // 如果描述很短，添加一些通用的质量提升词
  if (description.length < 20) {
    return `${description}, high quality, detailed, professional, 8K resolution`;
  }

  // 如果没有质量相关词汇，添加一些
  const qualityKeywords = [
    "high quality",
    "detailed",
    "8k",
    "4k",
    "professional",
    "masterpiece",
  ];
  const hasQualityKeywords = qualityKeywords.some((keyword) =>
    description.toLowerCase().includes(keyword),
  );

  if (!hasQualityKeywords) {
    return `${description}, high quality, detailed`;
  }

  return description;
}
