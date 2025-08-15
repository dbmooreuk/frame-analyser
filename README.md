# Frame Analyser

> A comprehensive Figma plugin for analyzing HMI screen designs and extracting component, typography, and color information.

[![Figma Plugin](https://img.shields.io/badge/Figma-Plugin-orange?style=flat-square&logo=figma)](https://figma.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-1.0.0-blue?style=flat-square)](https://github.com/yourusername/frame-analyser)

Frame Analyser is a powerful Figma plugin specifically designed for analyzing HMI (Human Machine Interface) screen designs. It extracts detailed information about components, fonts, and colors, then creates a beautifully formatted analysis frame with visual references and organized data.

## ✨ Features

### 🎯 **Smart Component Analysis**
- **Master Component Detection**: Identifies component sets and variants
- **Instance Counting**: Shows usage count for each component variant
- **Hierarchical Display**: Groups variants under their master components
- **Design System Focus**: Prioritizes official components over one-offs

### 🎨 **Advanced Color Analysis**
- **Color Extraction**: Captures all solid colors from fills and strokes
- **Style Association**: Links colors to their named color styles
- **Prioritized Display**: Shows design system colors first, custom colors last
- **Visual Swatches**: Includes color previews with hex values

### 📝 **Typography Intelligence**
- **Font Detection**: Identifies all font families and styles used
- **Text Style Mapping**: Associates fonts with their named text styles
- **Design System Priority**: Highlights official text styles over custom fonts
- **Complete Coverage**: Captures all typography variations

### 🖼️ **Visual Reference**
- **Frame Preview**: Includes a scaled copy of the analyzed frame
- **Smart Scaling**: Automatically fits large frames within the analysis
- **Visual Context**: Provides immediate reference for developers

## 🚀 Quick Start

### Prerequisites
- Figma Desktop App (required - web version not supported)
- Basic understanding of Figma components and styles

### Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/frame-analyser.git
   cd frame-analyser
   ```

2. **Install in Figma**
   - Open Figma Desktop App
   - Go to `Plugins` → `Development` → `Import plugin from manifest...`
   - Navigate to the cloned repository folder
   - Select the `manifest.json` file
   - The plugin will appear in your plugins menu as "Frame Analyzer"

3. **Verify Installation**
   - Create a test frame with some components and text
   - Select the frame
   - Run `Plugins` → `Frame Analyzer` → `Analyze Selected Frame`
   - An analysis frame should be created next to your original frame

## Usage

1. **Select a Frame**: Click on any frame in your Figma design that you want to analyze
2. **Run the Plugin**: 
   - Go to `Plugins` → `Frame Analyzer` → `Analyze Selected Frame`
   - Or use the right-click context menu on a selected frame
3. **View Results**: A new analysis frame will be created next to your selected frame containing:
   - List of all components used
   - Font variations found
   - Color swatches with hex values
   - Color styles applied

## Plugin Structure

```
├── manifest.json     # Plugin configuration and metadata
├── code.js          # Main plugin logic and Figma API interactions
├── ui.html          # Plugin user interface
└── README.md        # This documentation file
```

## Technical Details

### Figma API Usage

The plugin uses the following Figma Plugin API features:

- **Node Traversal**: Uses `findAll()` to recursively search through frame contents
- **Component Analysis**: Identifies instances and retrieves main component information
- **Typography Extraction**: Reads `fontName` properties from text nodes
- **Color Analysis**: Extracts colors from `fills` and `strokes` properties
- **Style Detection**: Identifies applied color styles via `fillStyleId`

### Analysis Process

1. **Validation**: Ensures a single frame is selected
2. **Node Discovery**: Recursively finds all child nodes within the frame
3. **Data Extraction**: Categorizes and collects:
   - Component instances and their main components
   - Font families and styles from text nodes
   - Solid colors from fills and strokes
   - Applied color styles
4. **Frame Generation**: Creates a formatted analysis frame with:
   - Hierarchical information display
   - Color swatches for visual reference
   - Proper spacing and typography

### Error Handling

- Validates frame selection before analysis
- Handles missing or inaccessible components gracefully
- Provides user feedback for common error scenarios
- Manages asynchronous operations safely

## Best Practices Implemented

- **Asynchronous Operations**: Uses `async/await` for font loading and component access
- **Memory Efficiency**: Uses `Set` objects to avoid duplicate entries
- **User Experience**: Provides clear feedback and loading states
- **Code Organization**: Separates concerns between analysis, UI, and frame creation
- **Figma Guidelines**: Follows official Figma plugin development patterns

## Customization

### Styling the Analysis Frame

The analysis frame styling can be customized by modifying the `createAnalysisFrame()` function:

- **Colors**: Change background colors and text colors
- **Typography**: Modify font families and sizes (ensure fonts are loaded)
- **Layout**: Adjust spacing, padding, and positioning
- **Sections**: Add or remove information sections

### Adding New Analysis Features

To extend the plugin with additional analysis capabilities:

1. Add new data collection in the `analyzeFrame()` function
2. Create corresponding display functions (similar to `addSection()`)
3. Update the UI to reflect new features
4. Test with various frame types

## Troubleshooting

### Common Issues

- **"Please select a frame"**: Ensure you've selected exactly one frame before running the plugin
- **Missing components**: Some components may not be accessible if they're from external libraries
- **Font loading errors**: Ensure fonts are available in your Figma environment
- **Performance with large frames**: Very complex frames may take longer to analyze

### Performance Considerations

- The plugin processes all nodes within a frame, so very complex frames may take time
- Font loading is asynchronous and may add processing time
- Consider breaking down very large frames for better performance

## Development

### Local Development

1. Make changes to the plugin files
2. In Figma, go to `Plugins` → `Development` → `Hot reload plugin`
3. Test changes immediately in your Figma file

### Debugging

- Use `console.log()` statements in `code.js` for debugging
- Check the browser console in Figma for error messages
- Use Figma's plugin development tools for advanced debugging

## 🤝 Contributing

We welcome contributions to Frame Analyser! Here's how you can help:

### Development Setup

1. **Fork the Repository**
   ```bash
   git fork https://github.com/yourusername/frame-analyser.git
   cd frame-analyser
   ```

2. **Make Your Changes**
   - Edit the plugin files (`code.js`, `ui.html`, `manifest.json`)
   - Test your changes in Figma Desktop
   - Follow the existing code style and patterns

3. **Test Thoroughly**
   - Use the testing scenarios in `TESTING.md`
   - Test with various frame types and complexities
   - Ensure error handling works correctly

4. **Submit a Pull Request**
   - Create a descriptive commit message
   - Include details about what your changes do
   - Reference any related issues

### Reporting Issues

Found a bug or have a feature request? Please:

1. Check existing issues first
2. Create a detailed issue with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Figma version and OS
   - Screenshots if applicable

## 📋 Roadmap

### Planned Features
- [ ] Export analysis data to JSON/CSV
- [ ] Batch analysis of multiple frames
- [ ] Custom analysis templates
- [ ] Integration with design tokens
- [ ] Performance optimizations for very large frames
- [ ] Support for additional Figma node types

### Version History
- **v1.0.0** - Initial release with core analysis features

## 🙏 Acknowledgments

- Built for HMI design teams and developers
- Inspired by the need for better design-to-development handoff
- Thanks to the Figma Plugin API team for excellent documentation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

- **Documentation**: Check `INSTALLATION.md` and `TESTING.md`
- **Issues**: [GitHub Issues](https://github.com/yourusername/frame-analyser/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/frame-analyser/discussions)

---

**Made with ❤️ for HMI designers and developers**
