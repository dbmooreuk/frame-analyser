# Frame Analyzer Plugin - Testing Guide

This guide provides comprehensive testing scenarios for the Frame Analyzer plugin to ensure it works correctly with various frame types and edge cases.

## Test Setup

1. Install the plugin in Figma Desktop
2. Create a new Figma file for testing
3. Prepare test frames with different content types

## Test Scenarios

### 1. Basic Frame Analysis

**Test Case**: Simple frame with basic elements
- Create a frame with:
  - 2-3 rectangles with different colors
  - 1-2 text elements with different fonts
  - 1 component instance
- Expected: Plugin should extract all colors, fonts, and components correctly

### 2. Complex HMI Screen

**Test Case**: Realistic HMI screen design
- Create a frame representing a pump control interface:
  - Status indicators (components)
  - Control buttons (components)
  - Text labels with various fonts
  - Color-coded elements (red, green, yellow for status)
  - Numeric displays
- Expected: Comprehensive analysis with organized output

### 3. Component-Heavy Frame

**Test Case**: Frame with many component instances
- Create a frame with:
  - 10+ instances of the same component
  - 5+ instances of different components
  - Mix of local and library components (if available)
- Expected: Component count should be accurate, no duplicates in list

### 4. Typography-Rich Frame

**Test Case**: Frame with diverse typography
- Create a frame with:
  - Multiple font families (Inter, Roboto, etc.)
  - Various font weights (Regular, Bold, Light)
  - Different font sizes
  - Text styles applied
- Expected: All font variations should be listed, text styles identified

### 5. Color Palette Frame

**Test Case**: Frame with extensive color usage
- Create a frame with:
  - 15+ different solid colors
  - Gradient fills (should be ignored)
  - Stroke colors
  - Color styles applied
- Expected: All solid colors extracted, color styles listed

### 6. Edge Cases

#### 6.1 Empty Frame
- Create an empty frame
- Expected: Error message about empty frame

#### 6.2 No Selection
- Run plugin without selecting anything
- Expected: Error message requesting frame selection

#### 6.3 Multiple Selection
- Select multiple frames
- Expected: Error message requesting single frame selection

#### 6.4 Non-Frame Selection
- Select a rectangle, text, or other non-frame element
- Expected: Error message requesting frame selection

#### 6.5 Very Large Frame
- Create a frame with 100+ elements
- Expected: Warning about processing time, successful completion

#### 6.6 Nested Frames
- Create a frame containing other frames
- Expected: Analysis should include content from nested frames

### 7. Performance Tests

#### 7.1 Medium Complexity
- Frame with 50-100 elements
- Expected: Completion within 5-10 seconds

#### 7.2 High Complexity
- Frame with 200+ elements
- Expected: Progress updates, completion within 30 seconds

### 8. Output Validation

#### 8.1 Analysis Frame Creation
- Verify analysis frame is created next to original frame
- Check proper positioning (doesn't overlap)
- Verify frame naming convention

#### 8.2 Content Organization
- Verify sections are properly organized:
  - Components (with instance counts)
  - Font Variations
  - Text Styles
  - Colors (with swatches)
  - Color Styles
  - Effect Styles
  - Summary
- Check proper spacing and typography

#### 8.3 Visual Quality
- Verify color swatches display correctly
- Check text readability
- Verify proper alignment and spacing
- Check drop shadow effect

### 9. Error Recovery

#### 9.1 Font Loading Issues
- Use fonts not available in environment
- Expected: Graceful handling, analysis continues

#### 9.2 Component Access Issues
- Use components from external libraries
- Expected: Graceful handling of inaccessible components

#### 9.3 Memory/Performance Issues
- Test with extremely large frames (500+ elements)
- Expected: Plugin should handle gracefully or provide appropriate warnings

## Test Results Template

For each test case, document:

```
Test Case: [Name]
Date: [Date]
Figma Version: [Version]
Plugin Version: 1.0

Setup:
- [Description of test setup]

Steps:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Expected Result:
- [What should happen]

Actual Result:
- [What actually happened]

Status: [PASS/FAIL/PARTIAL]

Notes:
- [Any additional observations]
```

## Common Issues and Solutions

### Issue: Plugin doesn't start
- **Solution**: Check manifest.json syntax, ensure all files are present

### Issue: Analysis frame not created
- **Solution**: Check browser console for errors, verify frame selection

### Issue: Missing components in analysis
- **Solution**: Verify components are properly linked to main components

### Issue: Incorrect colors extracted
- **Solution**: Check if fills are visible and of type 'SOLID'

### Issue: Performance problems
- **Solution**: Test with smaller frames first, check for infinite loops

## Automated Testing Considerations

For future development, consider implementing:
- Unit tests for analysis functions
- Integration tests for UI interactions
- Performance benchmarks
- Regression tests for edge cases

## Reporting Issues

When reporting issues, include:
1. Figma version
2. Plugin version
3. Operating system
4. Detailed steps to reproduce
5. Expected vs actual behavior
6. Screenshots if applicable
7. Browser console errors (if any)
