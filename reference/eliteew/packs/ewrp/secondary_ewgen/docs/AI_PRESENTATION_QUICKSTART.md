# AI Presentation Generation - Quick Start Guide

Get started with AI-powered presentation generation in 5 minutes.

## Prerequisites

Before you begin, ensure you have:

1. **Ollama** running and accessible
   ```bash
   # Check if Ollama is running
   curl http://localhost:11434/api/tags

   # If not installed, install Ollama
   # Visit: https://ollama.ai/download

   # Pull a model (e.g., codellama)
   ollama pull codellama
   ```

2. **ComfyUI** (Optional - for image generation)
   ```bash
   # Check if ComfyUI is running
   curl http://localhost:31003/system_stats

   # If not running, start ComfyUI
   # Visit: https://github.com/comfyanonymous/ComfyUI
   ```

3. **Environment Variables**
   ```bash
   # Create .env file or add to existing one
   VITE_OLLAMA_URL=http://localhost:11434
   VITE_OLLAMA_MODEL=codellama
   VITE_COMFYUI_URL=http://localhost:31003  # Optional
   ```

## Quick Start

### Option 1: Use the AI Assistant Panel (Recommended)

The easiest way to get started:

```typescript
import { AIAssistantPanel } from '@/components/Presentation/AIAssistantPanel';

function App() {
  return (
    <div className="h-screen">
      <AIAssistantPanel
        onSlidesGenerated={(slides) => {
          console.log('Generated slides:', slides);
        }}
      />
    </div>
  );
}
```

That's it! The panel provides a complete UI for:
- Configuring presentation settings
- Generating content
- Refining slides
- Generating images (if ComfyUI is available)

### Option 2: Use the React Hook

For more control, use the `usePresentationAI` hook:

```typescript
import { usePresentationAI } from '@/hooks/usePresentationAI';

function PresentationGenerator() {
  const { slides, isGenerating, generatePresentation } = usePresentationAI();

  const handleGenerate = async () => {
    await generatePresentation({
      topic: 'Introduction to React',
      slideCount: 8,
      type: 'educational',
      tone: 'casual',
      audience: 'developers',
      generateImages: false, // Set to true if ComfyUI is available
    });
  };

  return (
    <div>
      <button onClick={handleGenerate} disabled={isGenerating}>
        Generate Presentation
      </button>

      {slides.map(slide => (
        <div key={slide.slideNumber}>
          <h2>{slide.title}</h2>
          <ul>
            {Array.isArray(slide.content) && slide.content.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

### Option 3: Direct Service Usage

For headless usage or custom integration:

```typescript
import { presentationContentGenerator } from '@/services/ai/presentationContentGenerator';

async function generatePresentation() {
  const result = await presentationContentGenerator.generatePresentation({
    topic: 'AI in Healthcare',
    slideCount: 10,
    type: 'conference',
    tone: 'technical',
    audience: 'healthcare professionals',
  });

  console.log(`Generated ${result.slides.length} slides`);

  return result.slides;
}
```

## Basic Examples

### Example 1: Pitch Deck

```typescript
const { generatePresentation } = usePresentationAI();

await generatePresentation({
  topic: 'Revolutionary AI-Powered Analytics Platform',
  slideCount: 10,
  type: 'pitchDeck',
  tone: 'professional',
  audience: 'investors',
  generateImages: false,
});
```

### Example 2: Educational Presentation

```typescript
await generatePresentation({
  topic: 'Understanding Quantum Computing',
  slideCount: 12,
  type: 'educational',
  tone: 'casual',
  audience: 'students',
  generateImages: false,
});
```

### Example 3: Technical Conference

```typescript
await generatePresentation({
  topic: 'Microservices Architecture Patterns',
  slideCount: 15,
  type: 'conference',
  tone: 'technical',
  audience: 'software engineers',
  generateImages: false,
});
```

### Example 4: With Image Generation

```typescript
// Requires ComfyUI to be running
await generatePresentation({
  topic: 'Digital Marketing Strategy 2024',
  slideCount: 10,
  type: 'marketing',
  tone: 'creative',
  audience: 'marketing teams',
  generateImages: true,
  imageStyle: 'modern',
  imageTheme: 'creative',
  aspectRatio: '16:9',
});
```

## Configuration Options

### Presentation Types

- `pitchDeck`: Investor presentations with problem/solution/market focus
- `educational`: Teaching presentations with learning objectives
- `conference`: Technical talks with deep dives and code examples
- `portfolio`: Showcase work and projects
- `businessReport`: Data-driven reports with analysis
- `marketing`: Sales and marketing presentations
- `workshop`: Interactive training with activities

### Tone Options

- `professional`: Formal business language
- `casual`: Friendly, conversational style
- `technical`: Precise, technical terminology
- `creative`: Engaging, storytelling approach

### Image Options (Requires ComfyUI)

**Image Styles:**
- `professional`: Corporate, clean
- `modern`: Contemporary design
- `minimalist`: Simple, clean lines
- `creative`: Artistic, colorful
- `technical`: Diagrams, schematics
- `illustrative`: Drawn, stylized
- `photographic`: Realistic photos
- `abstract`: Conceptual art

**Image Themes:**
- `corporate`: Business professional
- `tech`: High-tech, futuristic
- `creative`: Vibrant, artistic
- `educational`: Learning focused
- `dark`: Dark mode aesthetic
- `light`: Light, airy
- `gradient`: Smooth color flows
- `minimal`: Minimalist design

## Refining Generated Content

### Improve a Specific Slide

```typescript
const { improveSlide } = usePresentationAI();

await improveSlide(
  slideNumber,
  'Add more specific examples and real-world data'
);
```

### Expand Content

```typescript
const { expandSlideContent } = usePresentationAI();

await expandSlideContent(slideNumber);
```

### Simplify Content

```typescript
const { simplifySlideContent } = usePresentationAI();

await simplifySlideContent(slideNumber);
```

### Adjust Tone

```typescript
const { adjustPresentationTone } = usePresentationAI();

// Change entire presentation tone
await adjustPresentationTone('casual');
```

### Regenerate a Slide

```typescript
const { regenerateSlide } = usePresentationAI();

await regenerateSlide(slideNumber);
```

## Progress Tracking

Monitor generation progress:

```typescript
const { progress, isGenerating } = usePresentationAI();

// Progress object contains:
{
  stage: 'generating_content' | 'generating_images' | 'complete',
  message: 'Generating slide content...',
  progress: 45, // 0-100
  currentSlide: 3,
  totalSlides: 10
}

// Display progress bar
{isGenerating && (
  <div>
    <p>{progress.message}</p>
    <progress value={progress.progress} max={100} />
    {progress.currentSlide && (
      <span>Slide {progress.currentSlide} of {progress.totalSlides}</span>
    )}
  </div>
)}
```

## Error Handling

Handle errors gracefully:

```typescript
const { error, generatePresentation } = usePresentationAI();

const handleGenerate = async () => {
  try {
    await generatePresentation(config);
  } catch (err) {
    console.error('Generation failed:', err);
    // Show error notification
  }
};

// Display error
{error && (
  <div className="error">
    <p>Error: {error}</p>
    <button onClick={handleGenerate}>Retry</button>
  </div>
)}
```

## Performance Tips

1. **Start without images** for faster generation:
   ```typescript
   generateImages: false
   ```

2. **Use lower slide count** for testing:
   ```typescript
   slideCount: 5  // Instead of 15
   ```

3. **Generate images separately** after content:
   ```typescript
   // First generate content
   await generatePresentation({ ...config, generateImages: false });

   // Then generate images for selected slides
   await generateImages([1, 2, 5], {
     style: 'professional',
     theme: 'corporate'
   });
   ```

4. **Sequential image generation** to avoid overwhelming ComfyUI:
   ```typescript
   await presentationImageGenerator.generateMultipleImages(slides, {
     parallel: false  // Generate one at a time
   });
   ```

## Troubleshooting

### Ollama Not Connected

```bash
Error: Cannot connect to Ollama AI. Please check if the service is running.
```

**Solution:**
```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Start Ollama if not running
# Check your Ollama installation

# Verify environment variable
echo $VITE_OLLAMA_URL
```

### ComfyUI Not Available

```bash
Error: Cannot connect to ComfyUI
```

**Solution:**
```bash
# Check ComfyUI status
curl http://localhost:31003/system_stats

# If not needed, disable image generation
generateImages: false
```

### Generation Timeout

```bash
Error: AI request timeout
```

**Solution:**
- Reduce slide count
- Check Ollama model is loaded
- Increase timeout in service configuration

### Invalid Response Format

```bash
Error: Invalid response format from AI
```

**Solution:**
- Ensure Ollama model is compatible (use codellama, mistral, or llama2)
- Check Ollama version is up to date

## Next Steps

1. **Explore Examples**: Check `/src/examples/PresentationAIExample.tsx`
2. **Read Full Documentation**: See `/docs/AI_PRESENTATION_GENERATION.md`
3. **Customize Prompts**: Modify `/src/services/ai/presentationPrompts.ts`
4. **Test Services**: Run health checks on Ollama and ComfyUI
5. **Experiment**: Try different presentation types and configurations

## API Reference

For detailed API documentation:
- [Full Documentation](/docs/AI_PRESENTATION_GENERATION.md)
- [Service APIs](/src/services/ai/)
- [React Hook API](/src/hooks/usePresentationAI.ts)
- [Component API](/src/components/Presentation/AIAssistantPanel.tsx)

## Support

If you encounter issues:
1. Check service availability (Ollama, ComfyUI)
2. Verify environment variables
3. Review error messages
4. Check browser console for detailed logs
5. Review the full documentation

## Quick Reference

```typescript
// Import
import { usePresentationAI } from '@/hooks/usePresentationAI';
import { AIAssistantPanel } from '@/components/Presentation/AIAssistantPanel';

// Generate
const { generatePresentation } = usePresentationAI();
await generatePresentation({
  topic: 'Your Topic',
  slideCount: 10,
  type: 'educational',
  tone: 'professional'
});

// Refine
await improveSlide(slideNumber, 'Add more details');
await expandSlideContent(slideNumber);
await simplifySlideContent(slideNumber);
await adjustPresentationTone('casual');

// Images (optional)
await generateImages([1, 2, 3], {
  style: 'professional',
  theme: 'corporate'
});
```

Happy presenting!
