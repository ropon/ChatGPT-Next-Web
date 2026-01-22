import { 
  supportsImageGeneration, 
  getImageGenerationType, 
  detectImageGenerationIntent,
  extractImageDescription,
  optimizeImagePrompt
} from '../app/utils/image-prompts';

describe('Image Generation Utils', () => {
  describe('supportsImageGeneration', () => {
    test('should detect DALL-E models', () => {
      expect(supportsImageGeneration('dall-e-3')).toBe(true);
      expect(supportsImageGeneration('dalle-3')).toBe(true);
    });

    test('should detect CogView models', () => {
      expect(supportsImageGeneration('cogview-3-plus')).toBe(true);
      expect(supportsImageGeneration('cogview-3')).toBe(true);
    });

    test('should detect Gemini image models', () => {
      expect(supportsImageGeneration('gemini-2.0-flash-exp-image-generation')).toBe(true);
      expect(supportsImageGeneration('gemini-2.5-flash-image')).toBe(true);
    });

    test('should detect Grok image models', () => {
      expect(supportsImageGeneration('grok-2-image-1212')).toBe(true);
      expect(supportsImageGeneration('grok-image')).toBe(true);
    });

    test('should not detect non-image models', () => {
      expect(supportsImageGeneration('gpt-4')).toBe(false);
      expect(supportsImageGeneration('claude-3')).toBe(false);
    });
  });

  describe('getImageGenerationType', () => {
    test('should return correct types', () => {
      expect(getImageGenerationType('dall-e-3')).toBe('openai');
      expect(getImageGenerationType('cogview-3-plus')).toBe('glm');
      expect(getImageGenerationType('gemini-2.0-flash-exp-image-generation')).toBe('gemini');
      expect(getImageGenerationType('grok-2-image-1212')).toBe('xai');
      expect(getImageGenerationType('gpt-4')).toBe('unknown');
    });
  });

  describe('detectImageGenerationIntent', () => {
    test('should detect Chinese keywords', () => {
      expect(detectImageGenerationIntent('生成图片：一只猫')).toBe(true);
      expect(detectImageGenerationIntent('画一张风景画')).toBe(true);
      expect(detectImageGenerationIntent('帮我画个logo')).toBe(true);
    });

    test('should detect English keywords', () => {
      expect(detectImageGenerationIntent('generate image of a cat')).toBe(true);
      expect(detectImageGenerationIntent('create image: sunset')).toBe(true);
      expect(detectImageGenerationIntent('draw me a picture')).toBe(true);
    });

    test('should not detect non-image intents', () => {
      expect(detectImageGenerationIntent('Hello, how are you?')).toBe(false);
      expect(detectImageGenerationIntent('What is the weather today?')).toBe(false);
    });
  });

  describe('extractImageDescription', () => {
    test('should extract description from Chinese input', () => {
      expect(extractImageDescription('生成图片：一只可爱的小猫')).toBe('一只可爱的小猫');
      expect(extractImageDescription('画一张赛博朋克城市')).toBe('赛博朋克城市');
    });

    test('should extract description from English input', () => {
      expect(extractImageDescription('generate image: a beautiful sunset')).toBe('a beautiful sunset');
      expect(extractImageDescription('create image of a mountain')).toBe('of a mountain');
    });
  });

  describe('optimizeImagePrompt', () => {
    test('should add quality keywords to short descriptions', () => {
      const result = optimizeImagePrompt('cat');
      expect(result).toContain('high quality');
      expect(result).toContain('detailed');
    });

    test('should not modify descriptions with quality keywords', () => {
      const input = 'a cat, high quality, detailed artwork';
      expect(optimizeImagePrompt(input)).toBe(input);
    });
  });
});