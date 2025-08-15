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

// Main function to analyze the selected frame
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

    const selectedNode = selection[0];

    // Check if frame has content
    if (selectedNode.children.length === 0) {
      figma.ui.postMessage({
        type: 'error',
        message: 'The selected frame appears to be empty. Please select a frame with content to analyze.'
      });
      return;
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

    figma.ui.postMessage({
      type: 'progress',
      message: 'Starting analysis...'
    });

    // Analyze the frame
    const analysisData = await analyzeFrame(selectedNode);

    figma.ui.postMessage({
      type: 'progress',
      message: 'Creating analysis frame...'
    });

    // Create or update the analysis frame
    const wasUpdated = await createAnalysisFrame(selectedNode, analysisData);
    const actionText = wasUpdated ? 'updated' : 'completed';

    figma.ui.postMessage({
      type: 'success',
      message: `Analysis ${actionText}! Found ${analysisData.components.length} components, ${analysisData.fonts.length} fonts, and ${analysisData.colors.length} colors.`
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
      message: 'Please select a frame to analyze. Click on a frame in your design and try again.'
    };
  }

  if (selection.length > 1) {
    return {
      isValid: false,
      message: 'Please select only one frame at a time. Multiple frame analysis is not currently supported.'
    };
  }

  const selectedNode = selection[0];

  if (selectedNode.type !== 'FRAME') {
    const nodeType = selectedNode.type.toLowerCase().replace('_', ' ');
    return {
      isValid: false,
      message: `Selected element is a ${nodeType}, not a frame. Please select a frame to analyze.`
    };
  }

  return { isValid: true };
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
    message: `Analyzing ${allNodes.length} elements...`
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

  // Convert fonts Map to array with font and style info
  const fontArray = Array.from(fonts.entries()).map(([fontString, info]) => ({
    fontString: fontString,
    styleName: info.styleName
  })).sort((a, b) => a.fontString.localeCompare(b.fontString));

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
          const fontString = `${node.fontName.family} - ${node.fontName.style}`;

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
                  fontSize: node.fontSize || 'Unknown'
                });
              }
            } catch (error) {
              // Silently handle inaccessible text styles
            }
          }

          // Store font with its associated style (if any)
          if (!fonts.has(fontString)) {
            fonts.set(fontString, { styleName: styleName });
          } else if (styleName && !fonts.get(fontString).styleName) {
            // Update with style name if we didn't have one before
            fonts.get(fontString).styleName = styleName;
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

      // Position the frame safely
      const safeX = Math.max(0, originalFrame.x + originalFrame.width + 100);
      const safeY = Math.max(0, originalFrame.y);
      analysisFrame.x = safeX;
      analysisFrame.y = safeY;

      figma.ui.postMessage({
        type: 'progress',
        message: 'Creating new analysis...'
      });
    }

    analysisFrame.fills = [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.98 } }];
    analysisFrame.cornerRadius = 8;
    analysisFrame.effects = [{
      type: 'DROP_SHADOW',
      color: { r: 0, g: 0, b: 0, a: 0.1 },
      offset: { x: 0, y: 2 },
      radius: 8,
      visible: true,
      blendMode: 'NORMAL'
    }];

  let currentY = 24;
  const padding = 24;
  const sectionSpacing = 32;

    // Add title
    const title = figma.createText();
    const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
    title.fontName = titleFont;
    title.fontSize = 20;
    title.characters = `Frame Analysis`;
    title.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
    title.x = padding;
    title.y = currentY;
    analysisFrame.appendChild(title);
    currentY += title.height + 8;

    // Add frame info subtitle
    const subtitle = figma.createText();
    const subtitleFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    subtitle.fontName = subtitleFont;
    subtitle.fontSize = 14;
    subtitle.characters = `${analysisData.frameInfo.name} (${analysisData.frameInfo.elementCount} elements)`;
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

    // Set frame size with minimum dimensions
    const minWidth = 450;
    const minHeight = 200;
    const finalWidth = Math.max(minWidth, 450);
    const finalHeight = Math.max(minHeight, currentY + padding);

    analysisFrame.resize(finalWidth, finalHeight);

    // Add to current page
    figma.currentPage.appendChild(analysisFrame);

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

  // Search through all frames on the current page
  const allFrames = figma.currentPage.findAll(node => node.type === 'FRAME');

  for (const frame of allFrames) {
    if (frame.name === expectedAnalysisName) {
      // More lenient position check - just needs to be to the right of the original frame
      const isPositionedCorrectly = frame.x >= originalFrame.x + originalFrame.width;

      if (isPositionedCorrectly) {
        return frame;
      }
    }
  }
  return null;
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

  // Calculate scale to fit within analysis frame width (max 350px wide)
  const maxWidth = 350;
  const maxHeight = 200;
  const scaleX = maxWidth / originalFrame.width;
  const scaleY = maxHeight / originalFrame.height;
  const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down

  // Resize the clone
  frameClone.resize(originalFrame.width * scale, originalFrame.height * scale);

  // Position the clone
  frameClone.x = padding;
  frameClone.y = currentY;

  // Add a subtle border around the reference frame
  frameClone.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
  frameClone.strokeWeight = 1;
  frameClone.cornerRadius = 4;

  // Add the clone to the analysis frame
  analysisFrame.appendChild(frameClone);

  // Add a scale indicator if the frame was scaled down
  if (scale < 1) {
    const scaleLabel = figma.createText();
    const scaleLabelFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    scaleLabel.fontName = scaleLabelFont;
    scaleLabel.fontSize = 10;
    scaleLabel.characters = `Scaled to ${Math.round(scale * 100)}%`;
    scaleLabel.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
    scaleLabel.x = padding;
    scaleLabel.y = currentY + frameClone.height + 4;
    analysisFrame.appendChild(scaleLabel);

    return currentY + frameClone.height + scaleLabel.height + 8;
  }

  return currentY + frameClone.height + 8;
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

  // Add text styles with their font information
  if (textStyles.length > 0) {
    for (const textStyle of textStyles) {
      const fontKey = `${textStyle.fontFamily} - ${textStyle.fontStyle}`;
      if (!allFonts.has(fontKey)) {
        allFonts.set(fontKey, {
          fontString: fontKey,
          styleName: textStyle.styleName,
          fontSize: textStyle.fontSize
        });
      }
    }
  }

  // Add any fonts that don't have text styles
  if (fonts.length > 0) {
    for (const font of fonts) {
      const fontKey = font.fontString || font; // Handle both old and new format
      if (!allFonts.has(fontKey)) {
        allFonts.set(fontKey, {
          fontString: fontKey,
          styleName: font.styleName || null,
          fontSize: null
        });
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

    // Display fonts with text styles first
    for (const fontInfo of fontsWithStyles) {
      const fontText = figma.createText();
      const fontFont = await loadFontSafely({ family: "Inter", style: "Regular" });
      fontText.fontName = fontFont;
      fontText.fontSize = 12;

      const displayText = `${fontInfo.fontString} - ${fontInfo.styleName}`;
      fontText.characters = `• ${displayText}`;
      fontText.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];
      fontText.x = padding + 12;
      fontText.y = currentY;
      frame.appendChild(fontText);
      currentY += fontText.height + 6;
    }

    // Display fonts without text styles at the end
    for (const fontInfo of fontsWithoutStyles) {
      const fontText = figma.createText();
      const fontFont = await loadFontSafely({ family: "Inter", style: "Regular" });
      fontText.fontName = fontFont;
      fontText.fontSize = 12;

      fontText.characters = `• ${fontInfo.fontString}`;
      fontText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }]; // Slightly lighter color
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

// Initialize plugin
if (figma.command === 'analyze') {
  analyzeSelectedFrame();
}
