# Logo Setup Guide

## Current Logo Implementation

The application uses a **Logo component** (`src/renderer/src/components/Logo.tsx`) that displays:
- A gradient green message icon (MessageCircle from Lucide React)
- A small red heart icon overlay
- "ClinicMessenger" text with gradient styling

## App Icon Files

For the actual application icon files (`.ico`, `.icns`, `.png`), you'll need to create or replace the existing files in the `build/` directory:

### Required Icon Files

1. **`build/icon.ico`** - Windows icon (256x256 recommended)
2. **`build/icon.icns`** - macOS icon (512x512 recommended)
3. **`build/icon.png`** - Linux/fallback icon (512x512 recommended)

### Icon Design Recommendations

- **Primary Color**: Green (#10B981 or similar) - represents healthcare/communication
- **Secondary Color**: Blue (#3B82F6) - represents technology/trust
- **Icon Elements**: 
  - Message/Chat bubble
  - Medical cross or heart symbol
  - Modern, clean design

### Tools for Creating Icons

1. **Online Tools**:
   - [Favicon.io](https://favicon.io/) - Generate icons from text/images
   - [IconGenerator](https://icongenerator.app/) - Create app icons
   - [AppIcon.co](https://www.appicon.co/) - Generate all icon sizes

2. **Design Software**:
   - Figma (free)
   - Adobe Illustrator
   - Sketch (macOS)

3. **Conversion Tools**:
   - [CloudConvert](https://cloudconvert.com/) - Convert between formats
   - [Image2icon](http://www.img2icnsapp.com/) - macOS icon converter

### Quick Setup Steps

1. **Create a 512x512 PNG logo** with your design
2. **Convert to required formats**:
   - Windows: Use online converter or ImageMagick to create `.ico`
   - macOS: Use `iconutil` or online converter to create `.icns`
   - Linux: Use the PNG directly
3. **Replace files** in `build/` directory:
   ```
   build/
   ├── icon.ico    (Windows)
   ├── icon.icns   (macOS)
   └── icon.png    (Linux/fallback)
   ```
4. **Rebuild the application**:
   ```bash
   npm run build:win  # or build:mac, build:linux
   ```

### Logo Component Usage

The Logo component is already integrated in the Navbar. You can also use it elsewhere:

```tsx
import Logo from '@renderer/components/Logo'

// Small logo
<Logo size="sm" showText={false} />

// Medium logo with text (default)
<Logo size="md" showText={true} />

// Large logo
<Logo size="lg" showText={true} />
```

### Current Logo Design

The current logo uses:
- **MessageCircle icon** (green gradient background)
- **Heart icon** (red, small overlay)
- **Gradient text** (green to blue)

This creates a professional, healthcare-focused appearance that clearly communicates the app's purpose.

