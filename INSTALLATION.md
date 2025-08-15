# Frame Analyzer Plugin - Installation Guide

## Prerequisites

- **Figma Desktop App**: This plugin requires the Figma Desktop application (not the web version)
- **Operating System**: Windows, macOS, or Linux
- **Figma Account**: Active Figma account with design file access

## Installation Steps

### Method 1: Development Installation (Recommended for Testing)

1. **Download Plugin Files**
   - Ensure you have all plugin files in a single directory:
     - `manifest.json`
     - `code.js`
     - `ui.html`
     - `README.md`
     - `package.json`

2. **Open Figma Desktop**
   - Launch the Figma Desktop application
   - Open any design file or create a new one

3. **Access Plugin Development Menu**
   - Go to `Plugins` in the top menu
   - Select `Development`
   - Click `Import plugin from manifest...`

4. **Import the Plugin**
   - Navigate to your plugin directory
   - Select the `manifest.json` file
   - Click `Open`

5. **Verify Installation**
   - The plugin should now appear in your `Plugins` menu
   - Look for "Frame Analyzer" in the plugins list

### Method 2: Community Plugin (Future)

*Note: This plugin is not yet published to the Figma Community. Use Method 1 for now.*

1. **Open Figma Desktop**
2. **Access Community Plugins**
   - Go to `Plugins` → `Browse all plugins`
3. **Search for Plugin**
   - Search for "Frame Analyzer"
4. **Install Plugin**
   - Click `Install` on the plugin page

## First Time Setup

### 1. Test the Installation

1. **Create a Test Frame**
   - Create a new frame in your design
   - Add some basic elements (rectangles, text, components)

2. **Run the Plugin**
   - Select your test frame
   - Go to `Plugins` → `Frame Analyzer` → `Analyze Selected Frame`
   - The plugin UI should appear

3. **Verify Functionality**
   - Click "Analyze Frame" in the plugin UI
   - An analysis frame should be created next to your original frame

### 2. Configure Your Environment

1. **Font Availability**
   - Ensure you have common fonts installed (Inter, Roboto, etc.)
   - The plugin works best with fonts available in your Figma environment

2. **Component Libraries**
   - If using team libraries, ensure they're properly linked
   - Local components work best for analysis

## Troubleshooting Installation

### Common Issues

#### Plugin Not Appearing in Menu
- **Cause**: Manifest file not found or corrupted
- **Solution**: 
  - Verify `manifest.json` is in the correct directory
  - Check JSON syntax using a validator
  - Re-import the plugin

#### Plugin Fails to Load
- **Cause**: Missing files or incorrect file paths
- **Solution**:
  - Ensure all files (`code.js`, `ui.html`, `manifest.json`) are present
  - Check file permissions
  - Restart Figma Desktop

#### UI Not Displaying
- **Cause**: HTML file issues or path problems
- **Solution**:
  - Verify `ui.html` exists and is readable
  - Check browser console in Figma for errors
  - Ensure HTML syntax is valid

#### Analysis Not Working
- **Cause**: JavaScript errors or API issues
- **Solution**:
  - Check browser console for error messages
  - Verify Figma API version compatibility
  - Test with a simple frame first

### Getting Help

1. **Check Console Errors**
   - Open browser developer tools in Figma
   - Look for error messages in the console
   - Note any specific error details

2. **Verify File Integrity**
   - Ensure all plugin files are complete
   - Check for any missing or corrupted files
   - Re-download if necessary

3. **Test Environment**
   - Try the plugin in a new, simple Figma file
   - Test with basic elements first
   - Gradually increase complexity

## Updating the Plugin

### Development Version Updates

1. **Replace Plugin Files**
   - Download updated plugin files
   - Replace existing files in your plugin directory

2. **Reload Plugin**
   - In Figma, go to `Plugins` → `Development`
   - Find your plugin and click the reload icon
   - Or re-import the manifest file

3. **Clear Cache** (if needed)
   - Restart Figma Desktop
   - This ensures all changes are loaded

### Version History

- **v1.0.0**: Initial release
  - Basic frame analysis
  - Component, font, and color extraction
  - Styled analysis frame output

## Uninstalling the Plugin

### Development Installation

1. **Remove from Figma**
   - Go to `Plugins` → `Development`
   - Find "Frame Analyzer" in the list
   - Click the remove/delete option

2. **Delete Files** (optional)
   - Remove plugin files from your computer
   - This step is optional as files don't affect Figma

### Community Installation

1. **Uninstall from Figma**
   - Go to `Plugins` → `Manage plugins`
   - Find "Frame Analyzer"
   - Click `Uninstall`

## Support

For installation issues or questions:

1. **Check Documentation**
   - Review `README.md` for usage instructions
   - Check `TESTING.md` for troubleshooting

2. **Report Issues**
   - Include your operating system
   - Specify Figma Desktop version
   - Describe the exact steps that led to the issue
   - Include any error messages

## Security Notes

- This plugin only accesses design file content
- No external network requests are made
- No personal data is collected or transmitted
- All analysis is performed locally in Figma
