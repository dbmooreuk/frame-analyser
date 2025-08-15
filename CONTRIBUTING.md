# Contributing to Frame Analyser

Thank you for your interest in contributing to Frame Analyser! This document provides guidelines and information for contributors.

## 🤝 How to Contribute

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected behavior** vs **actual behavior**
- **Environment details**:
  - Figma Desktop version
  - Operating system
  - Plugin version
- **Screenshots** if applicable
- **Console errors** (if any)

### Suggesting Features

Feature requests are welcome! Please:

1. Check existing issues and discussions first
2. Clearly describe the feature and its benefits
3. Explain how it fits with the plugin's HMI analysis focus
4. Provide examples or mockups if helpful

### Code Contributions

#### Development Setup

1. **Fork and Clone**
   ```bash
   git fork https://github.com/yourusername/frame-analyser.git
   cd frame-analyser
   ```

2. **Install in Figma**
   - Import `manifest.json` in Figma Desktop
   - Test the current functionality

3. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```

#### Code Standards

- **JavaScript**: Follow existing code style and patterns
- **Comments**: Add clear comments for complex logic
- **Error Handling**: Include proper error handling and user feedback
- **Performance**: Consider performance impact, especially for large frames
- **Async Operations**: Use async/await for Figma API calls

#### File Structure

```
├── manifest.json          # Plugin configuration
├── code.js               # Main plugin logic
├── ui.html               # Plugin user interface
├── README.md             # Main documentation
├── INSTALLATION.md       # Installation guide
├── TESTING.md           # Testing procedures
├── CHANGELOG.md         # Version history
├── CONTRIBUTING.md      # This file
├── LICENSE              # MIT license
├── package.json         # Project metadata
└── .gitignore          # Git ignore rules
```

#### Testing Your Changes

1. **Manual Testing**
   - Follow scenarios in `TESTING.md`
   - Test with various frame types and sizes
   - Verify error handling works correctly

2. **Edge Cases**
   - Empty frames
   - Very large frames (100+ elements)
   - Frames with no components/styles
   - Missing fonts or inaccessible components

3. **Cross-Platform**
   - Test on different operating systems if possible
   - Verify font loading works across environments

#### Submitting Changes

1. **Commit Guidelines**
   ```bash
   # Good commit messages:
   git commit -m "feat: add export to JSON functionality"
   git commit -m "fix: handle missing font gracefully"
   git commit -m "docs: update installation instructions"
   ```

2. **Pull Request Process**
   - Create a descriptive PR title and description
   - Reference related issues with `Fixes #123` or `Closes #123`
   - Include screenshots for UI changes
   - Ensure all tests pass
   - Update documentation if needed

## 🎯 Development Focus

Frame Analyser is specifically designed for HMI (Human Machine Interface) analysis. When contributing, consider:

- **HMI Design Patterns**: Features should support common HMI design workflows
- **Developer Handoff**: Improvements should help designers communicate with developers
- **Design System Support**: Prioritize features that encourage design system usage
- **Performance**: HMI screens can be complex - optimize for large frame analysis

## 📋 Areas for Contribution

### High Priority
- **Performance optimizations** for very large frames
- **Export functionality** (JSON, CSV formats)
- **Batch analysis** for multiple frames
- **Error handling improvements**

### Medium Priority
- **Additional node type support** (groups, auto-layout)
- **Custom analysis templates**
- **Design token integration**
- **Accessibility analysis features**

### Documentation
- **Usage examples** for different HMI scenarios
- **Video tutorials** for complex workflows
- **API documentation** for developers
- **Troubleshooting guides**

## 🔧 Technical Guidelines

### Figma Plugin API
- Use async/await for all Figma API calls
- Handle API errors gracefully
- Follow Figma's plugin development best practices
- Respect API rate limits and performance guidelines

### Code Organization
- Keep functions focused and single-purpose
- Use descriptive variable and function names
- Separate UI logic from analysis logic
- Maintain consistent error handling patterns

### Performance Considerations
- Use efficient data structures (Map, Set)
- Avoid unnecessary DOM manipulations
- Batch similar operations when possible
- Provide progress feedback for long operations

## 🚀 Release Process

1. **Version Numbering**: Follow [Semantic Versioning](https://semver.org/)
   - `MAJOR.MINOR.PATCH` (e.g., 1.2.3)
   - Major: Breaking changes
   - Minor: New features (backward compatible)
   - Patch: Bug fixes

2. **Release Steps**:
   - Update `CHANGELOG.md`
   - Update version in `package.json` and `manifest.json`
   - Create release tag
   - Update documentation if needed

## 📞 Getting Help

- **Questions**: Use [GitHub Discussions](https://github.com/yourusername/frame-analyser/discussions)
- **Issues**: Create a [GitHub Issue](https://github.com/yourusername/frame-analyser/issues)
- **Documentation**: Check existing docs in the repository

## 🙏 Recognition

Contributors will be recognized in:
- Repository contributors list
- Release notes for significant contributions
- README acknowledgments section

Thank you for helping make Frame Analyser better for the HMI design community!
