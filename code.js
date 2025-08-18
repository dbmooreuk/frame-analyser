// Frame Analyzer Plugin for Figma
// Analyzes selected frames and extracts components, fonts, and colors

// Show the plugin UI
figma.showUI(__html__, { width: 320, height: 480 });

// Handle messages from the UI
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'analyze-frame') {
    await analyzeSelectedFrame();
  } else if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};

// Main function to analyze the selected frame(s)
async function analyzeSelectedFrame() {
  try {
    const selection = figma.currentPage.selection;

    // Validate selection
    const validationResult = validateSelection(selection);
    if (!validationResult.isValid) {
      figma.ui.postMessage({
        type: 'error',
        message: validationResult.message
      });
      return;
    }

    const selectedFrames = validationResult.frames;
    const frameCount = selectedFrames.length;
    const isMultiple = frameCount > 1;

    figma.ui.postMessage({
      type: 'progress',
      message: `Analyzing ${frameCount} frame${isMultiple ? 's' : ''}...`,
      details: `Starting analysis of ${frameCount} frame${isMultiple ? 's' : ''}`
    });

    // Analyze each frame
    for (let i = 0; i < selectedFrames.length; i++) {
      const selectedNode = selectedFrames[i];
      const frameNumber = i + 1;

      figma.ui.postMessage({
        type: 'progress',
        message: `Analyzing frame ${frameNumber}/${frameCount}...`,
        details: `Analyzing frame: ${selectedNode.name} (${frameNumber}/${frameCount})`
      });

      // Check if frame has content
      if (selectedNode.children.length === 0) {
        figma.ui.postMessage({
          type: 'progress',
          message: `Skipping empty frame ${frameNumber}/${frameCount}`,
          details: `Frame "${selectedNode.name}" is empty - skipping`
        });
        continue;
      }

      // Check if frame is too large (performance consideration)
      const allNodes = selectedNode.findAll();
      if (allNodes.length > 1000) {
        const proceed = await showLargeFrameWarning(allNodes.length);
        if (!proceed) {
          figma.ui.postMessage({
            type: 'error',
            message: 'Analysis cancelled by user.'
          });
          return;
        }
      }

      // Analyze the frame
      const analysisData = await analyzeFrame(selectedNode);

      // Store analysis data for summary
      storeAnalysisData(selectedNode.name, analysisData);

      // Create or update the analysis frame
      const wasUpdated = await createAnalysisFrame(selectedNode, analysisData);

      figma.ui.postMessage({
        type: 'progress',
        message: `Completed frame ${frameNumber}/${frameCount}`,
        details: `${selectedNode.name}: ${analysisData.components.length} components, ${analysisData.fonts.length} fonts, ${analysisData.colors.length} colors`
      });
    }

    // Create or update the summary analysis
    figma.ui.postMessage({
      type: 'progress',
      message: 'Creating summary...',
      details: 'Aggregating data from all analyzed frames'
    });

    await createOrUpdateSummaryAnalysis();

    figma.ui.postMessage({
      type: 'success',
      message: `Analysis complete! Analyzed ${frameCount} frame${isMultiple ? 's' : ''} and created summary.`
    });

  } catch (error) {
    console.error('Error in analyzeSelectedFrame:', error);
    figma.ui.postMessage({
      type: 'error',
      message: `Unexpected error: ${error.message}. Please try again or contact support if the issue persists.`
    });
  }
}

// Validate user selection
function validateSelection(selection) {
  if (selection.length === 0) {
    return {
      isValid: false,
      message: 'Please select one or more frames to analyze. Click on frames in your design and try again.'
    };
  }

  // Filter selection to only include frames
  const frameNodes = selection.filter(node => node.type === 'FRAME');

  if (frameNodes.length === 0) {
    const nodeTypes = [...new Set(selection.map(node => node.type.toLowerCase().replace('_', ' ')))];
    return {
      isValid: false,
      message: `Selected elements are ${nodeTypes.join(', ')}, not frames. Please select one or more frames to analyze.`
    };
  }

  // Check if some nodes are not frames (mixed selection)
  if (frameNodes.length < selection.length) {
    const nonFrameCount = selection.length - frameNodes.length;
    return {
      isValid: false,
      message: `Selection includes ${nonFrameCount} non-frame element(s). Please select only frames for analysis.`
    };
  }

  return {
    isValid: true,
    frames: frameNodes
  };
}

// Show warning for large frames
async function showLargeFrameWarning(elementCount) {
  figma.ui.postMessage({
    type: 'warning',
    message: `This frame contains ${elementCount} elements. Analysis may take longer than usual. Continue?`
  });

  // For now, we'll proceed automatically. In a full implementation,
  // you might want to add a confirmation dialog
  return true;
}

// Analyze a frame and extract components, fonts, and colors
async function analyzeFrame(frame) {
  const components = new Map(); // Use Map to store unique components with details
  const fonts = new Map(); // Change to Map to store font with associated style
  const colors = new Map(); // Change to Map to store color with associated style
  const colorStyles = new Set();
  const textStyles = new Map(); // Change to Map to store text style with font info
  const effectStyles = new Set();

  // Find all nodes within the frame
  const allNodes = frame.findAll();

  // Send progress update
  figma.ui.postMessage({
    type: 'progress',
    message: `Analyzing ${allNodes.length} elements...`,
    details: `Found ${allNodes.length} elements to analyze`
  });

  // First, analyze the selected frame itself
  await analyzeNode(frame, components, fonts, colors, colorStyles, textStyles, effectStyles);

  // Then analyze all child nodes within the frame
  for (let i = 0; i < allNodes.length; i++) {
    const node = allNodes[i];

    try {
      await analyzeNode(node, components, fonts, colors, colorStyles, textStyles, effectStyles);
    } catch (error) {
      // Silently handle node processing errors
    }

    // Update progress periodically
    if (i % 50 === 0) {
      figma.ui.postMessage({
        type: 'progress',
        message: `Processed ${i + 1}/${allNodes.length} elements...`
      });
    }
  }

  // Convert colors Map to array with hex and style info
  const colorArray = Array.from(colors.entries()).map(([hex, info]) => ({
    hex: hex,
    styleName: info.styleName,
    type: info.type
  })).sort((a, b) => a.hex.localeCompare(b.hex));

  // Convert fonts Map to array with complete font info
  const fontArray = Array.from(fonts.entries()).map(([fontKey, info]) => ({
    fontKey: fontKey,
    fontFamily: info.fontFamily,
    fontStyle: info.fontStyle,
    fontSize: info.fontSize,
    styleName: info.styleName,
    displayString: `${info.fontFamily} ${info.fontStyle} ${info.fontSize}px`,
    hasStyle: !!info.styleName
  })).sort((a, b) => {
    // Sort by font family, then style, then size
    const familyCompare = a.fontFamily.localeCompare(b.fontFamily);
    if (familyCompare !== 0) return familyCompare;

    const styleCompare = a.fontStyle.localeCompare(b.fontStyle);
    if (styleCompare !== 0) return styleCompare;

    return parseFloat(a.fontSize) - parseFloat(b.fontSize);
  });

  // Convert textStyles Map to array with style and font info
  const textStyleArray = Array.from(textStyles.entries()).map(([styleName, fontInfo]) => ({
    styleName: styleName,
    fontFamily: fontInfo.fontFamily,
    fontStyle: fontInfo.fontStyle,
    fontSize: fontInfo.fontSize
  })).sort((a, b) => a.styleName.localeCompare(b.styleName));

  // console.log(`Analysis complete: Found ${colorArray.length} colors, ${textStyleArray.length} text styles, ${Array.from(components.values()).length} components`);

  return {
    components: Array.from(components.values()),
    fonts: fontArray,
    colors: colorArray,
    colorStyles: Array.from(colorStyles).sort(),
    textStyles: textStyleArray,
    effectStyles: Array.from(effectStyles).sort(),
    frameInfo: {
      name: frame.name,
      width: frame.width,
      height: frame.height,
      elementCount: allNodes.length
    }
  };
}

// Analyze a single node for components, fonts, colors, and styles
async function analyzeNode(node, components, fonts, colors, colorStyles, textStyles, effectStyles) {
  try {
    // Extract components
    if (node.type === 'INSTANCE') {
      try {
        const mainComponent = await node.getMainComponentAsync();
        if (mainComponent) {
          // Get the master component (parent of variants)
          const masterComponent = mainComponent.parent && mainComponent.parent.type === 'COMPONENT_SET'
            ? mainComponent.parent
            : mainComponent;

          // Create a unique key for this specific variant
          const variantKey = mainComponent.key || mainComponent.id;

          if (!components.has(variantKey)) {
            // Determine if this is a variant or standalone component
            const isVariant = mainComponent.parent && mainComponent.parent.type === 'COMPONENT_SET';

            components.set(variantKey, {
              masterName: isVariant ? masterComponent.name : mainComponent.name,
              variantName: isVariant ? mainComponent.name : null,
              fullName: mainComponent.name,
              key: mainComponent.key,
              id: mainComponent.id,
              isVariant: isVariant,
              instanceCount: 1
            });
          } else {
            components.get(variantKey).instanceCount++;
          }
        }
      } catch (error) {
        // Silently handle inaccessible components
      }
    }

    // Extract fonts and text styles
    if ('fontName' in node && node.fontName) {
      try {
        if (typeof node.fontName === 'object' && 'family' in node.fontName) {
          // Handle different font size scenarios
          let fontSize = 'Unknown';

          if (node.fontSize && typeof node.fontSize === 'number') {
            fontSize = node.fontSize;
          } else if (node.fontSize && typeof node.fontSize === 'object') {
            // Mixed font sizes - use "Mixed" as indicator
            fontSize = 'Mixed';
          } else if (node.textStyleId) {
            // Try to get font size from text style
            try {
              const style = await figma.getStyleByIdAsync(node.textStyleId);
              if (style && style.fontSize) {
                fontSize = style.fontSize;
              }
            } catch (error) {
              // Keep as 'Unknown'
            }
          }

          const fontDetail = `${node.fontName.family} ${node.fontName.style} ${fontSize}px`;
          console.log(`Font detected: ${fontDetail} on node: ${node.name || node.type}`);

          // Send progress update for font detection
          figma.ui.postMessage({
            type: 'progress',
            message: 'Analyzing fonts and text...',
            details: `Found font: ${fontDetail}`
          });

          const fontKey = `${node.fontName.family} - ${node.fontName.style} - ${fontSize}px`;

          // Check for text styles and associate with font
          let styleName = null;
          if (node.textStyleId) {
            try {
              const style = await figma.getStyleByIdAsync(node.textStyleId);
              if (style) {
                styleName = style.name;
                // Store text style with its font information
                textStyles.set(style.name, {
                  fontFamily: node.fontName.family,
                  fontStyle: node.fontName.style,
                  fontSize: fontSize
                });
              }
            } catch (error) {
              // Silently handle inaccessible text styles
            }
          }

          // Store font with complete information including size
          if (!fonts.has(fontKey)) {
            fonts.set(fontKey, {
              fontFamily: node.fontName.family,
              fontStyle: node.fontName.style,
              fontSize: fontSize,
              styleName: styleName
            });
          } else if (styleName && !fonts.get(fontKey).styleName) {
            // Update with style name if we didn't have one before
            fonts.get(fontKey).styleName = styleName;
          }
        }
      } catch (error) {
        // Silently handle font processing errors
      }
    }

    // Extract colors and color styles from fills
    if ('fills' in node && node.fills && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        // Check for solid fills that are visible
        if (fill.type === 'SOLID' && fill.color && fill.visible !== false && fill.opacity !== 0) {
          const color = fill.color;
          const hex = rgbToHex(color.r, color.g, color.b);

          // Send progress update for color detection
          figma.ui.postMessage({
            type: 'progress',
            message: 'Analyzing colors...',
            details: `Found fill color: ${hex}`
          });

          // Check for fill styles and associate with color
          let styleName = null;
          if (node.fillStyleId) {
            try {
              const style = await figma.getStyleByIdAsync(node.fillStyleId);
              if (style) {
                styleName = style.name;
                colorStyles.add(style.name);
              }
            } catch (error) {
              // Silently handle inaccessible fill styles
            }
          }

          // Store color with its associated style (if any)
          if (!colors.has(hex)) {
            colors.set(hex, { styleName: styleName, type: 'fill' });
          } else if (styleName && !colors.get(hex).styleName) {
            // Update with style name if we didn't have one before
            colors.get(hex).styleName = styleName;
          }
        }
      }
    }

    // Extract stroke colors and styles
    if ('strokes' in node && node.strokes && Array.isArray(node.strokes)) {
      for (const stroke of node.strokes) {
        if (stroke.type === 'SOLID' && stroke.color && stroke.visible !== false && stroke.opacity !== 0) {
          const color = stroke.color;
          const hex = rgbToHex(color.r, color.g, color.b);

          // Send progress update for stroke color detection
          figma.ui.postMessage({
            type: 'progress',
            message: 'Analyzing colors...',
            details: `Found stroke color: ${hex}`
          });

          // Check for stroke styles and associate with color
          let styleName = null;
          if (node.strokeStyleId) {
            try {
              const style = await figma.getStyleByIdAsync(node.strokeStyleId);
              if (style) {
                styleName = style.name;
                colorStyles.add(style.name);
              }
            } catch (error) {
              // Silently handle inaccessible stroke styles
            }
          }

          // Store color with its associated style (if any)
          if (!colors.has(hex)) {
            colors.set(hex, { styleName: styleName, type: 'stroke' });
          } else if (styleName && !colors.get(hex).styleName) {
            // Update with style name if we didn't have one before
            colors.get(hex).styleName = styleName;
          }
        }
      }
    }

    // Extract effect styles
    if (node.effectStyleId) {
      try {
        const style = await figma.getStyleByIdAsync(node.effectStyleId);
        if (style) {
          effectStyles.add(style.name);
        }
      } catch (error) {
        // Silently handle inaccessible effect styles
      }
    }

  } catch (error) {
    // Silently handle node processing errors
  }
}

// Convert RGB to Hex
function rgbToHex(r, g, b) {
  const toHex = (c) => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

// Safe font loading with fallbacks
async function loadFontSafely(fontName) {
  try {
    await figma.loadFontAsync(fontName);
    return fontName;
  } catch (error) {
    // Try fallbacks silently

    // Try common fallbacks
    const fallbacks = [
      { family: "Inter", style: "Regular" },
      { family: "Roboto", style: "Regular" },
      { family: "Arial", style: "Regular" },
      { family: "Helvetica", style: "Regular" }
    ];

    for (const fallback of fallbacks) {
      try {
        await figma.loadFontAsync(fallback);
        return fallback;
      } catch (fallbackError) {
        continue;
      }
    }

    // If all else fails, use the default font
    throw new Error('No suitable font could be loaded');
  }
}

// Create the analysis frame with extracted information
async function createAnalysisFrame(originalFrame, analysisData) {
  try {
    // Check if an analysis frame already exists for this original frame
    const existingAnalysisFrame = findExistingAnalysisFrame(originalFrame);

    let analysisFrame;
    let wasUpdated = false;

    if (existingAnalysisFrame) {
      // Replace existing analysis frame
      analysisFrame = existingAnalysisFrame;
      // Clear existing content
      analysisFrame.children.forEach(child => child.remove());
      wasUpdated = true;

      figma.ui.postMessage({
        type: 'progress',
        message: 'Updating existing analysis...'
      });
    } else {
      // Create new analysis frame
      analysisFrame = figma.createFrame();
      analysisFrame.name = `Analysis: ${analysisData.frameInfo.name}`;

      // Find the best position for the new analysis frame
      const position = findBestAnalysisPosition(originalFrame);
      analysisFrame.x = position.x;
      analysisFrame.y = position.y;

      figma.ui.postMessage({
        type: 'progress',
        message: 'Creating new analysis...'
      });
    }

    analysisFrame.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
    analysisFrame.cornerRadius = 12;
    analysisFrame.effects = [{
      type: 'DROP_SHADOW',
      color: { r: 0, g: 0, b: 0, a: 0.1 },
      offset: { x: 0, y: 4 },
      radius: 12,
      visible: true,
      blendMode: 'NORMAL'
    }];

  let currentY = 50;
  const padding = 50;
  const sectionSpacing = 32;

    // Add frame name as the first item (32px Bold #000000)
    const frameName = figma.createText();
    const frameNameFont = await loadFontSafely({ family: "Inter", style: "Bold" });
    frameName.fontName = frameNameFont;
    frameName.fontSize = 32;
    frameName.characters = analysisData.frameInfo.name;
    frameName.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }]; // #000000
    frameName.x = padding;
    frameName.y = currentY;
    analysisFrame.appendChild(frameName);
    currentY += frameName.height + 16;

    // Add element count subtitle
    const subtitle = figma.createText();
    const subtitleFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    subtitle.fontName = subtitleFont;
    subtitle.fontSize = 14;
    subtitle.characters = `${analysisData.frameInfo.elementCount} elements`;
    subtitle.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    subtitle.x = padding;
    subtitle.y = currentY;
    analysisFrame.appendChild(subtitle);
    currentY += subtitle.height + 16;

    // Add visual reference of the analyzed frame
    currentY = await addFrameReference(analysisFrame, originalFrame, currentY, padding);
    currentY += sectionSpacing;

  // Add components section
  if (analysisData.components.length > 0) {
    figma.ui.postMessage({
      type: 'progress',
      message: 'Building analysis frame...',
      details: `Adding ${analysisData.components.length} components`
    });
    currentY = await addComponentSection(analysisFrame, "Components Used", analysisData.components, currentY, padding);
  }

  // Add combined fonts and text styles section
  if (analysisData.fonts.length > 0 || analysisData.textStyles.length > 0) {
    currentY = await addCombinedFontSection(analysisFrame, "Fonts & Text Styles", analysisData.fonts, analysisData.textStyles, currentY, padding);
  }

  // Add combined colors and color styles section
  if (analysisData.colors.length > 0 || analysisData.colorStyles.length > 0) {
    currentY = await addCombinedColorSection(analysisFrame, "Colors & Styles", analysisData.colors, analysisData.colorStyles, currentY, padding);
  }

  // Add effect styles section
  if (analysisData.effectStyles.length > 0) {
    currentY = await addSection(analysisFrame, "Effect Styles", analysisData.effectStyles, currentY, padding);
  }

  // Add summary section
  currentY = await addSummarySection(analysisFrame, analysisData, currentY, padding);

    // Calculate required width by checking all child elements
    let maxWidth = 0;
    for (const child of analysisFrame.children) {
      const childRight = child.x + child.width;
      maxWidth = Math.max(maxWidth, childRight);
    }

    // Set frame size with minimum dimensions and content-based width
    // Minimum width needs to accommodate the 968px frame reference plus padding
    const minWidth = 968 + (padding * 2); // 968px + 100px padding = 1068px minimum
    const minHeight = 200;
    const contentWidth = maxWidth + (padding * 2); // Add extra padding to the right
    const finalWidth = Math.max(minWidth, contentWidth);
    const finalHeight = Math.max(minHeight, currentY + padding);

    analysisFrame.resize(finalWidth, finalHeight);

    // Add to current page if it's a new frame
    if (!wasUpdated) {
      figma.currentPage.appendChild(analysisFrame);
    }

    // Select the analysis frame
    figma.currentPage.selection = [analysisFrame];
    figma.viewport.scrollAndZoomIntoView([analysisFrame]);

    return wasUpdated;

  } catch (error) {
    console.error('Error creating analysis frame:', error);
    throw new Error(`Failed to create analysis frame: ${error.message}`);
  }
}

// Find existing analysis frame for the given original frame
function findExistingAnalysisFrame(originalFrame) {
  const expectedAnalysisName = `Analysis: ${originalFrame.name}`;

  // Search through all frames on the current page, including nested frames
  const allFrames = figma.currentPage.findAll(node => node.type === 'FRAME');

  for (const frame of allFrames) {
    if (frame.name === expectedAnalysisName) {
      // Found a matching analysis frame - return it regardless of position
      // This ensures we always replace existing analyses for the same frame
      return frame;
    }
  }

  return null;
}

// Find the best position for a new analysis frame
function findBestAnalysisPosition(originalFrame) {
  // Get all existing analysis frames
  const allFrames = figma.currentPage.findAll(node => node.type === 'FRAME');
  const analysisFrames = allFrames.filter(frame => frame.name.startsWith('Analysis: '));

  if (analysisFrames.length === 0) {
    // First analysis frame - position to the right of the original frame
    return {
      x: Math.max(0, originalFrame.x + originalFrame.width + 100),
      y: Math.max(0, originalFrame.y)
    };
  }

  // Find the rightmost analysis frame
  let rightmostFrame = analysisFrames[0];
  for (const frame of analysisFrames) {
    if (frame.x + frame.width > rightmostFrame.x + rightmostFrame.width) {
      rightmostFrame = frame;
    }
  }

  // Position the new analysis frame to the right of the rightmost one
  return {
    x: rightmostFrame.x + rightmostFrame.width + 50, // 50px gap between analysis frames
    y: rightmostFrame.y // Same Y position as the rightmost frame
  };
}

// Add a visual reference of the analyzed frame
async function addFrameReference(analysisFrame, originalFrame, startY, padding) {
  // Create a label for the reference
  const referenceLabel = figma.createText();
  const labelFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  referenceLabel.fontName = labelFont;
  referenceLabel.fontSize = 14;
  referenceLabel.characters = "Visual Reference:";
  referenceLabel.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];
  referenceLabel.x = padding;
  referenceLabel.y = startY;
  analysisFrame.appendChild(referenceLabel);

  let currentY = startY + referenceLabel.height + 8;

  // Clone the original frame
  const frameClone = originalFrame.clone();

  // Set the clone to the specified size (968 x 649)
  const targetWidth = 968;
  const targetHeight = 649;
  frameClone.resize(targetWidth, targetHeight);

  // Position the clone
  frameClone.x = padding;
  frameClone.y = currentY;

  // Add a subtle border around the reference frame
  frameClone.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
  frameClone.strokeWeight = 1;
  frameClone.cornerRadius = 4;

  // Add the clone to the analysis frame
  analysisFrame.appendChild(frameClone);

  // Add a size indicator
  const sizeLabel = figma.createText();
  const sizeLabelFont = await loadFontSafely({ family: "Inter", style: "Regular" });
  sizeLabel.fontName = sizeLabelFont;
  sizeLabel.fontSize = 10;
  sizeLabel.characters = `Displayed at ${targetWidth} x ${targetHeight}px`;
  sizeLabel.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
  sizeLabel.x = padding;
  sizeLabel.y = currentY + frameClone.height + 4;
  analysisFrame.appendChild(sizeLabel);

  return currentY + frameClone.height + sizeLabel.height + 8;
}

// Create or update the summary analysis frame
async function createOrUpdateSummaryAnalysis() {
  // Find existing summary frame
  const allFrames = figma.currentPage.findAll(node => node.type === 'FRAME');
  let summaryFrame = allFrames.find(frame => frame.name === 'Summary Analysis');

  // Collect data from all analysis frames
  const summaryData = await collectSummaryData();

  if (summaryFrame) {
    // Clear existing content
    summaryFrame.children.forEach(child => child.remove());
  } else {
    // Create new summary frame
    summaryFrame = figma.createFrame();
    summaryFrame.name = 'Summary Analysis';

    // Position at the top-left of all analysis frames
    const position = findSummaryPosition();
    summaryFrame.x = position.x;
    summaryFrame.y = position.y;

    // Add to page
    figma.currentPage.appendChild(summaryFrame);
  }

  // Style the summary frame
  summaryFrame.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.95, b: 1.0 } }]; // Light blue tint
  summaryFrame.cornerRadius = 12;
  summaryFrame.effects = [{
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.15 },
    offset: { x: 0, y: 4 },
    radius: 12,
    visible: true,
    blendMode: 'NORMAL'
  }];

  // Populate summary content
  await populateSummaryContent(summaryFrame, summaryData);
}

// Store analysis data globally to avoid re-analysis
const globalAnalysisData = new Map();

// Store analysis data for summary
function storeAnalysisData(frameName, analysisData) {
  globalAnalysisData.set(frameName, analysisData);
  console.log(`Stored analysis data for: ${frameName}`);
  console.log(`Components: ${analysisData.components ? analysisData.components.length : 0}`);
  console.log(`Fonts: ${analysisData.fonts ? analysisData.fonts.length : 0}`);
  console.log(`Colors: ${analysisData.colors ? analysisData.colors.length : 0}`);

  // Debug: Show actual color data structure
  if (analysisData.colors && analysisData.colors.length > 0) {
    console.log('Color data structure:', analysisData.colors.slice(0, 3)); // Show first 3 colors
  }
}

// Collect aggregated data from stored analysis data
async function collectSummaryData() {
  const allFrames = figma.currentPage.findAll(node => node.type === 'FRAME');
  const analysisFrames = allFrames.filter(frame => frame.name.startsWith('Analysis: '));

  const aggregatedComponents = new Map();
  const aggregatedFonts = new Map();
  const aggregatedColors = new Map();
  const frameCount = analysisFrames.length;

  console.log(`Collecting summary data from ${globalAnalysisData.size} stored analyses`);
  console.log(`Found ${frameCount} analysis frames on page`);

  // Always re-analyze existing frames to ensure we have complete data
  console.log('Re-analyzing all existing frames to ensure complete summary...');

  for (const analysisFrame of analysisFrames) {
    const originalFrameName = analysisFrame.name.replace('Analysis: ', '');
    const originalFrame = allFrames.find(frame =>
      frame.name === originalFrameName && !frame.name.startsWith('Analysis:') && !frame.name.startsWith('Summary')
    );

    if (originalFrame) {
      try {
        console.log(`Re-analyzing frame: ${originalFrameName}`);
        const frameData = await analyzeFrame(originalFrame);
        globalAnalysisData.set(originalFrameName, frameData);
      } catch (error) {
        console.warn(`Could not re-analyze frame: ${originalFrameName}`, error);
      }
    }
  }

  // Aggregate data from stored analysis results
  for (const [frameName, analysisData] of globalAnalysisData.entries()) {
    console.log(`Processing stored data for: ${frameName}`);
    console.log(`  Components: ${analysisData.components ? analysisData.components.length : 0}`);
    console.log(`  Fonts: ${analysisData.fonts ? analysisData.fonts.length : 0}`);
    console.log(`  Colors: ${analysisData.colors ? analysisData.colors.length : 0}`);

    // Aggregate components (unique by master name + variant name)
    if (analysisData.components) {
      analysisData.components.forEach(comp => {
        const key = comp.isVariant ? `${comp.masterName}:${comp.variantName}` : comp.masterName;
        if (!aggregatedComponents.has(key)) {
          aggregatedComponents.set(key, comp);
          console.log(`  Added component: ${key}`);
        }
      });
    }

    // Aggregate fonts (unique by font key which includes size)
    if (analysisData.fonts) {
      analysisData.fonts.forEach(font => {
        const fontKey = font.fontKey || font.displayString || font.fontString || font;
        if (!aggregatedFonts.has(fontKey)) {
          aggregatedFonts.set(fontKey, font);
          console.log(`  Added font: ${fontKey}`);
        }
      });
    }

    // Aggregate colors (unique by hex value)
    if (analysisData.colors) {
      console.log(`  Processing ${analysisData.colors.length} colors from ${frameName}`);
      analysisData.colors.forEach((color, index) => {
        console.log(`    Color ${index + 1}:`, color);
        const colorKey = color.hex || color;
        if (!aggregatedColors.has(colorKey)) {
          aggregatedColors.set(colorKey, color);
          console.log(`  Added color: ${colorKey}`);
        } else {
          console.log(`  Color ${colorKey} already exists, skipping`);
        }
      });
    }
  }

  const result = {
    frameCount: frameCount,
    totalComponents: aggregatedComponents.size,
    totalFonts: aggregatedFonts.size,
    totalColors: aggregatedColors.size,
    components: Array.from(aggregatedComponents.values()),
    fonts: Array.from(aggregatedFonts.values()),
    colors: Array.from(aggregatedColors.values())
  };

  console.log(`Summary result: ${result.totalComponents} components, ${result.totalFonts} fonts, ${result.totalColors} colors`);
  console.log('Summary colors:', result.colors.map(c => c.hex || c).join(', '));

  return result;
}

// Find the best position for the summary frame
function findSummaryPosition() {
  const allFrames = figma.currentPage.findAll(node => node.type === 'FRAME');
  const analysisFrames = allFrames.filter(frame => frame.name.startsWith('Analysis: '));

  if (analysisFrames.length === 0) {
    return { x: 100, y: 100 };
  }

  // Position above the first analysis frame
  const firstFrame = analysisFrames[0];
  return {
    x: firstFrame.x,
    y: firstFrame.y - 800 // 800px above the first analysis frame
  };
}

// Populate the summary frame with content
async function populateSummaryContent(summaryFrame, summaryData) {
  const padding = 50;
  let currentY = padding;

  // Summary title
  const title = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  title.fontName = titleFont;
  title.fontSize = 32;
  title.characters = 'Summary Analysis';
  title.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
  title.x = Number(padding);
  title.y = Number(currentY);
  summaryFrame.appendChild(title);
  currentY = Number(currentY) + Number(title.height) + 16;

  // Frame count subtitle
  const subtitle = figma.createText();
  const subtitleFont = await loadFontSafely({ family: "Inter", style: "Regular" });
  subtitle.fontName = subtitleFont;
  subtitle.fontSize = 14;
  subtitle.characters = `${summaryData.frameCount} frames analyzed`;
  subtitle.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
  subtitle.x = Number(padding);
  subtitle.y = Number(currentY);
  summaryFrame.appendChild(subtitle);
  currentY = Number(currentY) + Number(subtitle.height) + 32;

  // Components section
  if (summaryData.totalComponents > 0) {
    currentY = await addSummaryComponentsSection(summaryFrame, summaryData.components, currentY, padding);
  }

  // Fonts section
  if (summaryData.totalFonts > 0) {
    currentY = await addSummaryFontsSection(summaryFrame, summaryData.fonts, currentY, padding);
  }

  // Colors section
  if (summaryData.totalColors > 0) {
    currentY = await addSummaryColorsSection(summaryFrame, summaryData.colors, currentY, padding);
  }

  // Summary stats
  const statsText = figma.createText();
  const statsFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  statsText.fontName = statsFont;
  statsText.fontSize = 16;
  statsText.characters = `Total: ${summaryData.totalComponents} Components • ${summaryData.totalFonts} Fonts • ${summaryData.totalColors} Colors`;
  statsText.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  statsText.x = Number(padding);
  statsText.y = Number(currentY);
  summaryFrame.appendChild(statsText);
  currentY = Number(currentY) + Number(statsText.height) + 16;

  // Note about detailed analysis
  const noteText = figma.createText();
  const noteFont = await loadFontSafely({ family: "Inter", style: "Regular" });
  noteText.fontName = noteFont;
  noteText.fontSize = 12;
  noteText.characters = 'This summary updates automatically when you analyze new frames.\nDetailed breakdowns are available in individual frame analyses.';
  noteText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
  noteText.x = Number(padding);
  noteText.y = Number(currentY);
  summaryFrame.appendChild(noteText);
  currentY = Number(currentY) + Number(noteText.height) + Number(padding);

  // Calculate required width by checking all child elements
  let maxWidth = 0;
  for (const child of summaryFrame.children) {
    const childRight = child.x + child.width;
    maxWidth = Math.max(maxWidth, childRight);
  }

  // Resize summary frame with content-based width
  const minWidth = 600;
  const contentWidth = maxWidth + (padding * 2); // Add extra padding to the right
  const finalWidth = Math.max(minWidth, contentWidth);
  const finalHeight = currentY;
  summaryFrame.resize(finalWidth, finalHeight);
}

// Add a summary section with items
async function addSummarySection(frame, title, items, startY, padding) {
  // Ensure all parameters are numbers
  const safeStartY = Array.isArray(startY) ? startY[0] : Number(startY);
  const safePadding = Array.isArray(padding) ? padding[0] : Number(padding);

  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = title;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  sectionTitle.x = safePadding;
  sectionTitle.y = safeStartY;
  frame.appendChild(sectionTitle);

  let currentY = safeStartY + sectionTitle.height + 12;

  // List items (max 10 to keep summary concise)
  const displayItems = items.slice(0, 10);
  for (const item of displayItems) {
    const itemText = figma.createText();
    const itemFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    itemText.fontName = itemFont;
    itemText.fontSize = 12;
    itemText.characters = `• ${item}`;
    itemText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    itemText.x = safePadding + 12;
    itemText.y = currentY;
    frame.appendChild(itemText);
    currentY = currentY + itemText.height + 4;
  }

  // Show "and X more" if there are more items
  if (items.length > 10) {
    const moreText = figma.createText();
    const moreFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    moreText.fontName = moreFont;
    moreText.fontSize = 12;
    moreText.characters = `• and ${items.length - 10} more...`;
    moreText.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
    moreText.x = safePadding + 12;
    moreText.y = currentY;
    frame.appendChild(moreText);
    currentY = currentY + moreText.height + 4;
  }

  return currentY + 20;
}

// Add summary components section
async function addSummaryComponentsSection(frame, components, startY, padding) {
  const safeStartY = Array.isArray(startY) ? startY[0] : Number(startY);
  const safePadding = Array.isArray(padding) ? padding[0] : Number(padding);

  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = `Components Used (${components.length})`;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  sectionTitle.x = safePadding;
  sectionTitle.y = safeStartY;
  frame.appendChild(sectionTitle);

  let currentY = safeStartY + sectionTitle.height + 12;

  // List components
  for (const comp of components) {
    const compText = figma.createText();
    const compFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    compText.fontName = compFont;
    compText.fontSize = 12;
    compText.characters = `• ${comp.masterName}${comp.isVariant ? ` (${comp.variantName})` : ''}`;
    compText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    compText.x = safePadding + 12;
    compText.y = currentY;
    frame.appendChild(compText);
    currentY = currentY + compText.height + 4;
  }

  return currentY + 20;
}

// Add summary fonts section
async function addSummaryFontsSection(frame, fonts, startY, padding) {
  const safeStartY = Array.isArray(startY) ? startY[0] : Number(startY);
  const safePadding = Array.isArray(padding) ? padding[0] : Number(padding);

  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = `Fonts & Text Styles (${fonts.length})`;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  sectionTitle.x = safePadding;
  sectionTitle.y = safeStartY;
  frame.appendChild(sectionTitle);

  let currentY = safeStartY + sectionTitle.height + 12;

  // List fonts with complete information
  for (const font of fonts) {
    const fontText = figma.createText();
    const fontFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    fontText.fontName = fontFont;
    fontText.fontSize = 12;

    // Clean display format
    let displayString;
    if (font.fontFamily && font.fontStyle && font.fontSize) {
      // Use structured data if available
      displayString = font.hasStyle
        ? `${font.fontFamily} ${font.fontStyle} ${font.fontSize}px (${font.styleName})`
        : `${font.fontFamily} ${font.fontStyle} ${font.fontSize}px`;
    } else {
      // Fallback to string format, cleaned up
      displayString = (font.displayString || font.fontString || font).replace(/px.*$/, 'px');
    }

    fontText.characters = `• ${displayString}`;

    // Red text if no style, black if has style
    const hasStyle = font.hasStyle || font.styleName;
    fontText.fills = hasStyle
      ? [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }] // Black
      : [{ type: 'SOLID', color: { r: 0.8, g: 0.2, b: 0.2 } }]; // Red

    fontText.x = safePadding + 12;
    fontText.y = currentY;
    frame.appendChild(fontText);
    currentY = currentY + fontText.height + 4;
  }

  return currentY + 20;
}

// Add summary colors section
async function addSummaryColorsSection(frame, colors, startY, padding) {
  const safeStartY = Array.isArray(startY) ? startY[0] : Number(startY);
  const safePadding = Array.isArray(padding) ? padding[0] : Number(padding);

  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = `Colors & Styles (${colors.length})`;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  sectionTitle.x = safePadding;
  sectionTitle.y = safeStartY;
  frame.appendChild(sectionTitle);

  let currentY = safeStartY + sectionTitle.height + 12;

  // List colors with swatches
  for (const color of colors) {
    const colorHex = color.hex || color;
    const rgb = hexToRgb(colorHex);

    // Color swatch
    const swatch = figma.createRectangle();
    swatch.resize(16, 16);
    swatch.x = safePadding + 12;
    swatch.y = currentY + 2;
    swatch.fills = [{ type: 'SOLID', color: rgb }];
    swatch.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
    swatch.strokeWeight = 1;
    frame.appendChild(swatch);

    // Color text
    const colorText = figma.createText();
    const colorFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    colorText.fontName = colorFont;
    colorText.fontSize = 12;
    const styleName = color.styleName ? ` (${color.styleName})` : '';
    colorText.characters = `${colorHex}${styleName}`;
    colorText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    colorText.x = safePadding + 36;
    colorText.y = currentY;
    frame.appendChild(colorText);
    currentY = currentY + Math.max(colorText.height, 20) + 4;
  }

  return currentY + 20;
}

// Add a component section with instance counts
async function addComponentSection(frame, title, components, startY, padding) {
  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = title;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  sectionTitle.x = padding;
  sectionTitle.y = startY;
  frame.appendChild(sectionTitle);

  let currentY = startY + sectionTitle.height + 12;

  // Group components by master component
  const groupedComponents = new Map();

  for (const component of components) {
    const masterName = component.masterName;
    if (!groupedComponents.has(masterName)) {
      groupedComponents.set(masterName, []);
    }
    groupedComponents.get(masterName).push(component);
  }

  // Display grouped components
  for (const [masterName, variants] of groupedComponents) {
    // Master component header
    const masterText = figma.createText();
    const masterFont = await loadFontSafely({ family: "Inter", style: "Bold" });
    masterText.fontName = masterFont;
    masterText.fontSize = 12;
    masterText.characters = `• ${masterName}`;
    masterText.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
    masterText.x = padding + 12;
    masterText.y = currentY;
    frame.appendChild(masterText);
    currentY += masterText.height + 4;

    // List variants under the master component
    for (const variant of variants) {
      const variantText = figma.createText();
      const variantFont = await loadFontSafely({ family: "Inter", style: "Regular" });
      variantText.fontName = variantFont;
      variantText.fontSize = 11;

      let displayText;
      if (variant.isVariant && variant.variantName) {
        // Show variant name and instance count
        const countText = variant.instanceCount > 1 ? ` (${variant.instanceCount} instances)` : ` (${variant.instanceCount} instance)`;
        displayText = `  ↳ ${variant.variantName}${countText}`;
      } else {
        // Standalone component
        const countText = variant.instanceCount > 1 ? ` (${variant.instanceCount} instances)` : ` (${variant.instanceCount} instance)`;
        displayText = `  ${countText}`;
      }

      variantText.characters = displayText;
      variantText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
      variantText.x = padding + 24;
      variantText.y = currentY;
      frame.appendChild(variantText);
      currentY += variantText.height + 3;
    }

    // Add spacing between master components
    currentY += 6;
  }

  return currentY + 20;
}

// Add a text section to the analysis frame
async function addSection(frame, title, items, startY, padding) {
  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = title;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  sectionTitle.x = padding;
  sectionTitle.y = startY;
  frame.appendChild(sectionTitle);

  let currentY = startY + sectionTitle.height + 12;

  // Section items
  for (const item of items) {
    const itemText = figma.createText();
    const itemFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    itemText.fontName = itemFont;
    itemText.fontSize = 12;
    itemText.characters = `• ${item}`;
    itemText.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];
    itemText.x = padding + 12;
    itemText.y = currentY;
    frame.appendChild(itemText);
    currentY += itemText.height + 6;
  }

  return currentY + 20;
}

// Add a combined font section with font variations and text styles
async function addCombinedFontSection(frame, title, fonts, textStyles, startY, padding) {
  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = title;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  sectionTitle.x = padding;
  sectionTitle.y = startY;
  frame.appendChild(sectionTitle);

  let currentY = startY + sectionTitle.height + 12;

  // Create a combined list of fonts with their associated styles
  const allFonts = new Map();

  // Add text styles with their font information (these have style names)
  if (textStyles.length > 0) {
    for (const textStyle of textStyles) {
      // Use the same format as direct fonts for proper deduplication
      const fontKey = `${textStyle.fontFamily} ${textStyle.fontStyle} ${textStyle.fontSize}px`;
      allFonts.set(fontKey, {
        fontString: fontKey,
        styleName: textStyle.styleName,
        fontSize: textStyle.fontSize,
        fontFamily: textStyle.fontFamily,
        fontStyle: textStyle.fontStyle,
        hasCompleteInfo: true
      });
    }
  }

  // Add fonts from direct analysis (these have complete info including size)
  if (fonts.length > 0) {
    for (const font of fonts) {
      // Create a proper font key based on family, style, and size
      const fontKey = `${font.fontFamily} ${font.fontStyle} ${font.fontSize}px`;

      // Only add if we don't already have this exact font, or if this one has more complete info
      if (!allFonts.has(fontKey)) {
        allFonts.set(fontKey, {
          fontString: `${font.fontFamily} ${font.fontStyle} ${font.fontSize}px`,
          styleName: font.styleName || null,
          fontSize: font.fontSize,
          fontFamily: font.fontFamily,
          fontStyle: font.fontStyle,
          hasCompleteInfo: true
        });
      } else {
        // If we already have this font, update it with style name if this one has it
        const existing = allFonts.get(fontKey);
        if (font.styleName && !existing.styleName) {
          existing.styleName = font.styleName;
        }
      }
    }
  }

  // Display combined font list - fonts with styles first, then fonts without styles
  if (allFonts.size > 0) {
    // Separate fonts with and without text styles
    const fontsWithStyles = [];
    const fontsWithoutStyles = [];

    for (const [fontKey, fontInfo] of allFonts) {
      if (fontInfo.styleName) {
        fontsWithStyles.push(fontInfo);
      } else {
        fontsWithoutStyles.push(fontInfo);
      }
    }

    // Sort each group alphabetically
    fontsWithStyles.sort((a, b) => a.fontString.localeCompare(b.fontString));
    fontsWithoutStyles.sort((a, b) => a.fontString.localeCompare(b.fontString));

    // Display fonts with text styles first (black text)
    for (const fontInfo of fontsWithStyles) {
      const fontText = figma.createText();
      const fontFont = await loadFontSafely({ family: "Inter", style: "Regular" });
      fontText.fontName = fontFont;
      fontText.fontSize = 12;

      // Clean format: FontFamily FontWeight FontSize (StyleName)
      // Extract clean font info from fontString
      const cleanFontString = fontInfo.fontString.replace(/px.*$/, 'px'); // Remove any extra text after px
      const displayText = `${cleanFontString} (${fontInfo.styleName})`;
      fontText.characters = `• ${displayText}`;
      fontText.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }]; // Black text
      fontText.x = padding + 12;
      fontText.y = currentY;
      frame.appendChild(fontText);
      currentY += fontText.height + 6;
    }

    // Display fonts without text styles (red text)
    for (const fontInfo of fontsWithoutStyles) {
      const fontText = figma.createText();
      const fontFont = await loadFontSafely({ family: "Inter", style: "Regular" });
      fontText.fontName = fontFont;
      fontText.fontSize = 12;

      // Clean format: FontFamily FontWeight FontSize
      const cleanFontString = fontInfo.fontString.replace(/px.*$/, 'px'); // Remove any extra text after px
      fontText.characters = `• ${cleanFontString}`;
      fontText.fills = [{ type: 'SOLID', color: { r: 0.8, g: 0.2, b: 0.2 } }]; // Red text for no style
      fontText.x = padding + 12;
      fontText.y = currentY;
      frame.appendChild(fontText);
      currentY += fontText.height + 6;
    }
  }

  return currentY + 10;
}

// Add a combined color section with color swatches and styles
async function addCombinedColorSection(frame, title, colors, colorStyles, startY, padding) {
  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = title;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  sectionTitle.x = padding;
  sectionTitle.y = startY;
  frame.appendChild(sectionTitle);

  let currentY = startY + sectionTitle.height + 12;

  // Display colors with swatches, hex values, and style names - colors with styles first, then colors without styles
  if (colors.length > 0) {
    // Separate colors with and without color styles
    const colorsWithStyles = [];
    const colorsWithoutStyles = [];

    for (const colorInfo of colors) {
      const hex = colorInfo.hex || colorInfo; // Handle both old and new format
      const styleName = colorInfo.styleName;

      if (styleName) {
        colorsWithStyles.push({ hex, styleName });
      } else {
        colorsWithoutStyles.push({ hex, styleName: null });
      }
    }

    // Sort each group alphabetically by hex value
    colorsWithStyles.sort((a, b) => a.hex.localeCompare(b.hex));
    colorsWithoutStyles.sort((a, b) => a.hex.localeCompare(b.hex));

    // Display colors with color styles first
    for (const colorInfo of colorsWithStyles) {
      const rgb = hexToRgb(colorInfo.hex);

      // Color swatch with border
      const swatch = figma.createRectangle();
      swatch.resize(20, 20);
      swatch.x = padding + 12;
      swatch.y = currentY;
      swatch.fills = [{ type: 'SOLID', color: rgb }];
      swatch.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
      swatch.strokeWeight = 1;
      swatch.cornerRadius = 3;
      frame.appendChild(swatch);

      // Color text with hex and style name
      const colorText = figma.createText();
      const colorFont = await loadFontSafely({ family: "Inter", style: "Regular" });
      colorText.fontName = colorFont;
      colorText.fontSize = 12;

      const displayText = `${colorInfo.hex} - ${colorInfo.styleName}`;
      colorText.characters = displayText;
      colorText.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];
      colorText.x = padding + 40;
      colorText.y = currentY + 2;
      frame.appendChild(colorText);

      currentY += 28;
    }

    // Display colors without color styles at the end
    for (const colorInfo of colorsWithoutStyles) {
      const rgb = hexToRgb(colorInfo.hex);

      // Color swatch with border
      const swatch = figma.createRectangle();
      swatch.resize(20, 20);
      swatch.x = padding + 12;
      swatch.y = currentY;
      swatch.fills = [{ type: 'SOLID', color: rgb }];
      swatch.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
      swatch.strokeWeight = 1;
      swatch.cornerRadius = 3;
      frame.appendChild(swatch);

      // Color text with just hex value
      const colorText = figma.createText();
      const colorFont = await loadFontSafely({ family: "Inter", style: "Regular" });
      colorText.fontName = colorFont;
      colorText.fontSize = 12;

      colorText.characters = colorInfo.hex;
      colorText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }]; // Slightly lighter color
      colorText.x = padding + 40;
      colorText.y = currentY + 2;
      frame.appendChild(colorText);

      currentY += 28;
    }
  }

  return currentY + 10;
}

// Keep the original color section function for backward compatibility
async function addColorSection(frame, title, colors, startY, padding) {
  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = title;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  sectionTitle.x = padding;
  sectionTitle.y = startY;
  frame.appendChild(sectionTitle);

  let currentY = startY + sectionTitle.height + 12;

  // Color swatches
  for (let i = 0; i < colors.length; i++) {
    const color = colors[i];
    const rgb = hexToRgb(color);

    // Color swatch with border
    const swatch = figma.createRectangle();
    swatch.resize(24, 24);
    swatch.x = padding + 12;
    swatch.y = currentY;
    swatch.fills = [{ type: 'SOLID', color: rgb }];
    swatch.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
    swatch.strokeWeight = 1;
    swatch.cornerRadius = 4;
    frame.appendChild(swatch);

    // Color text
    const colorText = figma.createText();
    const colorFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    colorText.fontName = colorFont;
    colorText.fontSize = 12;
    colorText.characters = color;
    colorText.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];
    colorText.x = padding + 48;
    colorText.y = currentY + 6;
    frame.appendChild(colorText);

    currentY += 32;
  }

  return currentY + 10;
}

// Add a summary section
async function addSummarySection(frame, analysisData, startY, padding) {
  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = "Summary";
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  sectionTitle.x = padding;
  sectionTitle.y = startY;
  frame.appendChild(sectionTitle);

  let currentY = startY + sectionTitle.height + 12;

  // Summary items
  const summaryItems = [
    `Total Elements: ${analysisData.frameInfo.elementCount}`,
    `Components: ${analysisData.components.length}`,
    `Fonts: ${analysisData.fonts.length}`,
    `Colors: ${analysisData.colors.length}`,
    `Text Styles: ${analysisData.textStyles.length}`,
    `Color Styles: ${analysisData.colorStyles.length}`,
    `Effect Styles: ${analysisData.effectStyles.length}`
  ];

  for (const item of summaryItems) {
    const itemText = figma.createText();
    const itemFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    itemText.fontName = itemFont;
    itemText.fontSize = 12;
    itemText.characters = `• ${item}`;
    itemText.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];
    itemText.x = padding + 12;
    itemText.y = currentY;
    frame.appendChild(itemText);
    currentY += itemText.height + 6;
  }

  return currentY + 20;
}

// Convert hex to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 0, g: 0, b: 0 };
}

// Plugin is ready - waiting for user interaction
