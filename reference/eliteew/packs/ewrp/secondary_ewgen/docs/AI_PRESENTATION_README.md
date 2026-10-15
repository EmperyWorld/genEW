# AI-Powered Presentation Generation for EWGen

**Status**: ✅ Complete and Ready to Use

Generate complete presentations automatically using AI - from content to images!

## What's New?

EWGen now includes a comprehensive AI-powered presentation generation system that can:
- 🤖 Generate complete presentations from just a topic
- 📊 Create 7 different types of presentations (pitch decks, educational, conference, etc.)
- 🎨 Generate images for slides using ComfyUI
- ✨ Refine and improve content with AI
- 🎯 Customize tone, audience, and style
- 📝 Generate speaker notes automatically

## Quick Links

- 📖 [Quick Start Guide](./docs/AI_PRESENTATION_QUICKSTART.md) - Get started in 5 minutes
- 📚 [Complete Documentation](./docs/AI_PRESENTATION_GENERATION.md) - Full API reference and guides
- 📋 [Implementation Summary](./docs/AI_PRESENTATION_SUMMARY.md) - Technical details
- 💡 [Examples](./src/examples/PresentationAIExample.tsx) - Copy-paste ready code

## Quick Start

### 1. Prerequisites

```bash
# Ensure Ollama is running
curl http://localhost:11434/api/tags

# Optional: Ensure ComfyUI is running (for images)
curl http://localhost:31003/system_stats
```

### 2. Use the AI Assistant Panel

```typescript
import { AIAssistantPanel } from '@/components/Presentation/AIAssistantPanel';

function App() {
  return (
    <AIAssistantPanel
      onSlidesGenerated={(slides) => {
        console.log('Generated slides:', slides);
      }}
    />
  );
}
```

### 3. Or Use the React Hook

```typescript
import { usePresentationAI } from '@/hooks/usePresentationAI';

function PresentationGenerator() {
  const { generatePresentation, slides } = usePresentationAI();

  const handleGenerate = async () => {
    await generatePresentation({
      topic: 'Introduction to React',
      slideCount: 10,
      type: 'educational',
      tone: 'casual',
    });
  };

  return (
    <div>
      <button onClick={handleGenerate}>Generate</button>
      {slides.map(slide => (
        <div key={slide.slideNumber}>
          <h2>{slide.title}</h2>
          {/* Render slide content */}
        </div>
      ))}
    </div>
  );
}
```

## Features

### Presentation Types
- **Pitch Deck**: Investor presentations with problem/solution/market focus
- **Educational**: Teaching presentations with learning objectives
- **Conference**: Technical talks with code examples and deep dives
- **Portfolio**: Showcase work and projects
- **Business Report**: Data-driven reports with analysis
- **Marketing**: Sales and marketing presentations
- **Workshop**: Interactive training with activities

### Content Generation
- ✅ Automatic slide structure generation
- ✅ Content for each slide
- ✅ Speaker notes
- ✅ Image prompts
- ✅ Multiple tone options (professional, casual, technical, creative)
- ✅ Audience customization

### Image Generation (Optional)
- ✅ AI-generated images via ComfyUI
- ✅ 8 visual styles (professional, modern, minimalist, creative, etc.)
- ✅ 8 presentation themes (corporate, tech, creative, etc.)
- ✅ Background and icon generation
- ✅ Batch processing

### Content Refinement
- ✅ Improve individual slides with custom instructions
- ✅ Expand or simplify content
- ✅ Adjust tone across all slides
- ✅ Regenerate specific slides
- ✅ Enhance clarity and engagement

## Architecture

```
React App
    ↓
usePresentationAI Hook
    ↓
┌─────────────────────┬─────────────────────┐
│ Content Generator   │  Image Generator    │
│ (Ollama)            │  (ComfyUI)          │
└─────────────────────┴─────────────────────┘
```

## Files Created

### Services (2,188 lines of code)
- `src/services/ai/presentationPrompts.ts` - Prompt templates
- `src/services/ai/presentationContentGenerator.ts` - Content generation
- `src/services/ai/comfyuiService.ts` - ComfyUI integration
- `src/services/ai/presentationImageGenerator.ts` - Image generation
- `src/services/ai/presentationRefinement.ts` - Content refinement
- `src/services/ai/index.ts` - Service exports

### React Integration (1,195 lines of code)
- `src/hooks/usePresentationAI.ts` - React hook (526 lines)
- `src/components/Presentation/AIAssistantPanel.tsx` - UI component (669 lines)

### Documentation (1,826 lines)
- `docs/AI_PRESENTATION_GENERATION.md` - Complete documentation (889 lines)
- `docs/AI_PRESENTATION_QUICKSTART.md` - Quick start guide (471 lines)
- `docs/AI_PRESENTATION_SUMMARY.md` - Implementation summary (466 lines)

### Examples
- `src/examples/PresentationAIExample.tsx` - 4 complete examples

**Total**: ~5,200 lines of production-ready code and documentation

## Configuration

### Environment Variables

```bash
# Required: Ollama
VITE_OLLAMA_URL=http://localhost:11434
VITE_OLLAMA_MODEL=codellama

# Optional: ComfyUI (for images)
VITE_COMFYUI_URL=http://localhost:31003
```

## Example: Generate a Pitch Deck

```typescript
import { usePresentationAI } from '@/hooks/usePresentationAI';

function PitchDeckGenerator() {
  const { generatePresentation, slides, progress } = usePresentationAI();

  const generate = async () => {
    await generatePresentation({
      topic: 'AI-Powered Analytics Platform',
      slideCount: 10,
      type: 'pitchDeck',
      tone: 'professional',
      audience: 'investors',
      generateImages: true,
      imageStyle: 'professional',
      imageTheme: 'corporate',
    });
  };

  return (
    <div>
      <button onClick={generate}>Generate Pitch Deck</button>

      {/* Progress */}
      <div>
        <p>{progress.message}</p>
        <progress value={progress.progress} max={100} />
      </div>

      {/* Slides */}
      <div>
        {slides.map(slide => (
          <div key={slide.slideNumber}>
            <h2>{slide.title}</h2>
            {slide.generatedImageUrl && (
              <img src={slide.generatedImageUrl} alt={slide.title} />
            )}
            <ul>
              {Array.isArray(slide.content) && slide.content.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
            {slide.speakerNotes && (
              <details>
                <summary>Speaker Notes</summary>
                <p>{slide.speakerNotes}</p>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Performance

| Operation | Time |
|-----------|------|
| Generate 10 slides (content only) | 30-60s |
| Generate 1 image | 30-60s |
| Generate 10 images (sequential) | 5-10 min |
| Improve single slide | 5-10s |
| Adjust tone (10 slides) | 1-2 min |

## Error Handling

The system handles errors gracefully:
- ✅ Service unavailable detection
- ✅ Timeout handling
- ✅ Fallback mechanisms
- ✅ Clear error messages
- ✅ Retry support

## API Reference

### usePresentationAI Hook

```typescript
const {
  // State
  slides,              // Generated slides
  isGenerating,        // Generation in progress
  progress,            // Progress tracking
  error,               // Error message

  // Generation
  generatePresentation,
  generateSlide,
  regenerateSlide,

  // Refinement
  improveSlide,
  expandSlideContent,
  simplifySlideContent,
  adjustPresentationTone,

  // Images
  generateImages,

  // Utilities
  cancelGeneration,
  clearPresentation,
  updateSlide,
  deleteSlide,
} = usePresentationAI();
```

### Services

```typescript
// Content Generation
import { presentationContentGenerator } from '@/services/ai';

const result = await presentationContentGenerator.generatePresentation({
  topic: 'Your Topic',
  slideCount: 10,
  type: 'educational',
  tone: 'casual',
});

// Image Generation
import { presentationImageGenerator } from '@/services/ai';

const imageUrl = await presentationImageGenerator.generateSlideImage({
  slideTitle: 'Market Analysis',
  slideContent: 'Revenue growth data',
  style: 'professional',
});

// Refinement
import { refineSlideContent, adjustTone } from '@/services/ai/presentationRefinement';

const improved = await refineSlideContent(slide, 'Add more examples');
const adjusted = await adjustTone(slides, 'casual');
```

## Testing

### Health Checks

```typescript
import { ollamaService } from '@/services/ollamaService';
import { comfyuiService } from '@/services/ai/comfyuiService';

// Check services
const ollamaOk = await ollamaService.healthCheck();
const comfyuiOk = await comfyuiService.healthCheck();

console.log('Ollama:', ollamaOk ? '✓' : '✗');
console.log('ComfyUI:', comfyuiOk ? '✓' : '✗');
```

### Test Generation

```bash
# Run example app
npm run dev

# Navigate to examples
# /examples/presentation-ai
```

## Troubleshooting

### Ollama Not Connected
```bash
# Check Ollama
curl http://localhost:11434/api/tags

# If not running, start Ollama
# Visit: https://ollama.ai/download
```

### ComfyUI Not Available
```bash
# Check ComfyUI
curl http://localhost:31003/system_stats

# If not needed, disable image generation
generateImages: false
```

### Generation Fails
- Check service logs
- Verify environment variables
- Test with smaller slide counts
- Check browser console for errors

## Best Practices

1. **Start Simple**: Generate content only, add images later
2. **Validate Input**: Check topic is not empty
3. **Handle Progress**: Show progress to users
4. **Allow Cancellation**: Let users cancel long operations
5. **Provide Editing**: Let users edit AI-generated content
6. **Save Work**: Persist generated content
7. **Test Services**: Check availability before generation

## Next Steps

1. **Get Started**: Follow the [Quick Start Guide](./docs/AI_PRESENTATION_QUICKSTART.md)
2. **Read Docs**: Check [Complete Documentation](./docs/AI_PRESENTATION_GENERATION.md)
3. **Try Examples**: Run examples from `/src/examples/PresentationAIExample.tsx`
4. **Customize**: Modify prompts and styles for your needs
5. **Integrate**: Add to your application workflow

## Support

- 📖 Documentation: `/docs/AI_PRESENTATION_*.md`
- 💡 Examples: `/src/examples/PresentationAIExample.tsx`
- 🔧 Services: `/src/services/ai/`
- 🎣 Hooks: `/src/hooks/usePresentationAI.ts`
- 🎨 Components: `/src/components/Presentation/AIAssistantPanel.tsx`

## Contributing

To extend the system:

1. **Add Presentation Type**: Edit `presentationPrompts.ts`
2. **Add Image Style**: Edit `presentationImageGenerator.ts`
3. **Add Refinement Function**: Edit `presentationRefinement.ts`
4. **Customize UI**: Edit `AIAssistantPanel.tsx`

## License

Part of EWGen - Empery World Generator

---

**🎉 Ready to Use!**

Start generating presentations with AI today!

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Import and use
import { usePresentationAI } from '@/hooks/usePresentationAI';
```

For questions or issues, check the documentation in `/docs/`.
