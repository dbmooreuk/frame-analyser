// Frame Analyzer Plugin for Figma
// Analyzes selected frames and extracts components, fonts, and colors

// Show the plugin UI with larger default size for frame history
figma.showUI(__html__, {
  width: 360,
  height: 600
});

// Handle messages from the UI
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'analyze-frame') {
    try {
      // Update button state to show analyzing
      figma.ui.postMessage({
        type: 'updateButtonState',
        buttonType: 'analyze',
        state: 'analyzing'
      });

      await analyzeSelectedFrame();

      // Reset button state after completion
      figma.ui.postMessage({
        type: 'updateButtonState',
        buttonType: 'analyze',
        state: 'complete'
      });
    } catch (error) {
      // Reset button state on error
      figma.ui.postMessage({
        type: 'updateButtonState',
        buttonType: 'analyze',
        state: 'error'
      });
      throw error; // Re-throw to maintain existing error handling
    }
  } else if (msg.type === 'cancel') {
    figma.closePlugin();
  } else if (msg.type === 'getFramesList') {
    // Send current frames list to UI
    await cleanupAnalyzedFrames(); // Clean up first
    const framesList = await getFilteredAnalyzedFramesList();
    figma.ui.postMessage({
      type: 'framesListUpdated',
      framesList: Object.values(framesList)
    });
  } else if (msg.type === 'reAnalyzeFrame') {
    // Re-analyze a specific frame
    try {
      // Update button state to show analyzing
      figma.ui.postMessage({
        type: 'updateButtonState',
        frameId: msg.frameId,
        state: 'analyzing'
      });

      const frame = figma.getNodeById(msg.frameId);
      if (frame && (frame.type === 'FRAME' || frame.type === 'COMPONENT')) {
        // Select the frame and analyze it
        console.log(`Re-analyzing frame: ${frame.name}`);
        figma.currentPage.selection = [frame];
        await analyzeSelectedFrame();

        // Reset button state after completion
        figma.ui.postMessage({
          type: 'updateButtonState',
          frameId: msg.frameId,
          state: 'complete'
        });
      } else {
        // Reset button state on error
        figma.ui.postMessage({
          type: 'updateButtonState',
          frameId: msg.frameId,
          state: 'error'
        });

        figma.ui.postMessage({
          type: 'error',
          message: 'Frame no longer exists or is not accessible.'
        });
      }
    } catch (error) {
      console.log(`Could not re-analyze frame: ${msg.frameId}`, error);

      // Reset button state on error
      figma.ui.postMessage({
        type: 'updateButtonState',
        frameId: msg.frameId,
        state: 'error'
      });

      figma.ui.postMessage({
        type: 'error',
        message: 'Failed to re-analyze frame: ' + error.message
      });
    }
  } else if (msg.type === 'reAnalyzeAll') {
    // Re-analyze all frames in the list
    try {
      // Update button state to show analyzing
      figma.ui.postMessage({
        type: 'updateButtonState',
        buttonType: 'reAnalyzeAll',
        state: 'analyzing'
      });

      const framesList = await getFilteredAnalyzedFramesList();
      const frameIds = Object.keys(framesList);
      const validFrames = [];

      // Collect valid frames
      for (const frameId of frameIds) {
        try {
          const frame = figma.getNodeById(frameId);
          if (frame && (frame.type === 'FRAME' || frame.type === 'COMPONENT')) {
            validFrames.push(frame);
          }
        } catch (error) {
          // Frame no longer exists, will be cleaned up
        }
      }

      if (validFrames.length > 0) {
        // Select all valid frames and analyze them
        console.log(`Re-analyzing ${validFrames.length} frames`);
        figma.currentPage.selection = validFrames;
        await analyzeSelectedFrame();

        // Reset button state after completion
        figma.ui.postMessage({
          type: 'updateButtonState',
          buttonType: 'reAnalyzeAll',
          state: 'complete'
        });
      } else {
        // Reset button state on error
        figma.ui.postMessage({
          type: 'updateButtonState',
          buttonType: 'reAnalyzeAll',
          state: 'error'
        });

        figma.ui.postMessage({
          type: 'error',
          message: 'No valid frames found to re-analyze.'
        });
      }
    } catch (error) {
      console.log('Bulk re-analysis error:', error);

      // Reset button state on error
      figma.ui.postMessage({
        type: 'updateButtonState',
        buttonType: 'reAnalyzeAll',
        state: 'error'
      });

      figma.ui.postMessage({
        type: 'error',
        message: 'Failed to re-analyze frames: ' + error.message
      });
    }
  } else if (msg.type === 'clearFramesList') {
    // Clear the analyzed frames list
    try {
      await figma.clientStorage.setAsync('analyzedFrames', {});
      figma.ui.postMessage({
        type: 'framesListUpdated',
        framesList: []
      });
    } catch (error) {
      figma.ui.postMessage({
        type: 'error',
        message: 'Failed to clear frames list: ' + error.message
      });
    }
  } else if (msg.type === 'exportJson') {
    // Export LVGL JSON data
    try {
      console.log('Exporting JSON data...');
      console.log('Available cached data:', globalAnalysisData.size, 'frames');

      const jsonData = generateLVGLJson();

      if (Object.keys(jsonData.typography).length === 0 && Object.keys(jsonData.colors).length === 0) {
        figma.ui.postMessage({
          type: 'warning',
          message: 'No data available for export. Please analyze some frames first or click "Re-analyze All" to populate the cache.'
        });
        return;
      }

      figma.ui.postMessage({
        type: 'jsonExport',
        data: jsonData,
        filename: `lvgl_stylesheet_${new Date().toISOString().split('T')[0]}.json`
      });

      figma.ui.postMessage({
        type: 'success',
        message: `LVGL stylesheet exported! ${Object.keys(jsonData.typography).length} typography styles, ${Object.keys(jsonData.colors).length} colors.`,
        autoDismiss: true,
        dismissAfter: 4000
      });
    } catch (error) {
      figma.ui.postMessage({
        type: 'error',
        message: 'Failed to export JSON: ' + error.message
      });
    }
  }
};

// Main function to analyze the selected frame(s)
async function analyzeSelectedFrame() {
  try {
    console.log('Starting analysis...');
    figma.ui.postMessage({
      type: 'progress',
      message: 'Starting analysis...',
      details: 'Initializing frame analysis'
    });

    const selection = figma.currentPage.selection;
    console.log('Selection:', selection.length, 'items');

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
      if (allNodes.length > 800) {
        // Calculate estimated time
        const estimatedSeconds = Math.ceil(allNodes.length / 50); // ~50 elements per second
        figma.ui.postMessage({
          type: 'warning',
          message: `Large frame detected: ${allNodes.length} elements. Estimated time: ${estimatedSeconds}s. Consider analyzing smaller sections for better performance.`
        });

        // Continue anyway but warn user
        console.log(`Processing large frame: ${selectedNode.name} with ${allNodes.length} elements`);
      }

      // Analyze the frame
      console.log(`Analyzing frame: ${selectedNode.name}`);
      figma.ui.postMessage({
        type: 'progress',
        message: `Analyzing frame content...`,
        details: `Processing ${selectedNode.name}`
      });

      let analysisData = await analyzeFrame(selectedNode);
      console.log('Analysis data (raw):', analysisData);

      // Normalize component/icon classification
      analysisData = normalizeComponentIconClassification(analysisData);

      // Store analysis data for summary
      storeAnalysisData(selectedNode.name, analysisData);

      // Create or update the analysis frame
      console.log('Creating analysis frame...');
      figma.ui.postMessage({
        type: 'progress',
        message: `Creating analysis frame...`,
        details: `Building visual analysis for ${selectedNode.name}`
      });

      const analysisFrame = await createAnalysisFrame(selectedNode, analysisData);
      console.log('Analysis frame created:', analysisFrame ? 'success' : 'failed');

      // Save to analyzed frames list
      if (analysisFrame) {
        console.log('Saving to frame history...');
        await saveAnalyzedFrame(selectedNode.id, {
          name: selectedNode.name,
          elementCount: allNodes.length,
          analysisFrameId: analysisFrame.id
        });
      }

      figma.ui.postMessage({
        type: 'progress',
        message: `Completed frame ${frameNumber}/${frameCount}`,
        details: `${selectedNode.name}: ${analysisData.components.length} components, ${analysisData.icons ? analysisData.icons.length : 0} icons, ${analysisData.fonts.length} fonts, ${analysisData.colors.length} colors`
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
      message: `Analysis complete! Analyzed ${frameCount} frame${isMultiple ? 's' : ''} and created summary.`,
      autoDismiss: true,
      dismissAfter: 4000 // 4 seconds
    });

  } catch (error) {
    console.error('Error in analyzeSelectedFrame:', error);
    figma.ui.postMessage({
      type: 'error',
      message: `Analysis failed: ${error.message}. Check console for details.`
    });
  }
}

// Removed timeout system - analysis runs without time limits

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

// Helper function to estimate analysis time
function estimateAnalysisTime(elementCount) {
  // Rough estimate: ~50 elements per second
  return Math.ceil(elementCount / 50);
}

// Analyze a frame and extract components, fonts, and colors
async function analyzeFrame(frame) {
  // Clear processed nodes set for fresh analysis
  processedNodes.clear();

  const components = new Map(); // Use Map to store unique components with details
  const icons = new Map(); // Separate map for icons
  const fonts = new Map(); // Change to Map to store font with associated style
  const colors = new Map(); // Change to Map to store color with associated style
  const colorStyles = new Set();
  const textStyles = new Map(); // Change to Map to store text style with font info
  const effectStyles = new Set();

  // Find all nodes within the frame (optimized to exclude very small/hidden nodes)
  const allNodes = frame.findAll(node => {
    // Skip invisible nodes and very small nodes for performance
    return node.visible !== false && (node.width >= 1 || node.height >= 1);
  });

  // Send progress update
  figma.ui.postMessage({
    type: 'progress',
    message: `Analyzing ${allNodes.length} elements...`,
    details: `Found ${allNodes.length} elements to analyze`
  });

  // First, analyze the selected frame itself
  await analyzeNode(frame, components, fonts, colors, colorStyles, textStyles, effectStyles);

  // Then analyze all child nodes within the frame (sequential to avoid memory issues)
  const batchSize = 50; // Smaller batches to reduce memory pressure
  for (let i = 0; i < allNodes.length; i += batchSize) {
    const batch = allNodes.slice(i, i + batchSize);

    // Process batch sequentially to avoid null pointer issues
    for (const node of batch) {
      try {
        // Validate node still exists before processing
        if (node && node.type && node.removed !== true) {
          await analyzeNode(node, components, icons, fonts, colors, colorStyles, textStyles, effectStyles);
        }
      } catch (error) {
        // Silently handle node processing errors
        console.warn('Node processing error:', error.message);
      }
    }

    // Update progress less frequently (every 200 elements or at end)
    const processed = Math.min(i + batchSize, allNodes.length);
    if (processed % 200 === 0 || processed === allNodes.length) {
      figma.ui.postMessage({
        type: 'progress',
        message: `Processed ${processed}/${allNodes.length} elements...`
      });
    }
  }

  // Convert colors Map to array with hex, RGB565, opacity, and style info
  const colorArray = Array.from(colors.entries()).map(([, info]) => ({
    hex: info.hex,
    rgb565: hexToRgb565(info.hex),
    opacity: info.opacity,
    displayHex: info.opacity < 1 ? `${info.hex} (${Math.round(info.opacity * 100)}%)` : info.hex,
    styleName: info.styleName,
    type: info.type
  })).sort((a, b) => a.hex.localeCompare(b.hex));

  // Log colors with opacity and RGB565 for debugging
  console.log('Colors with opacity:', colorArray.filter(c => c.opacity < 1).map(c => c.displayHex));
  console.log('Sample RGB565 conversions:', colorArray.slice(0, 3).map(c => `${c.hex} -> ${c.rgb565}`));

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
    icons: Array.from(icons.values()),
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

// Helper function to determine if a component is an icon
function isComponentAnIcon(mainComponent) {
  try {
    const compName = (mainComponent.name || '').trim();
    const compNameLower = compName.toLowerCase();
    const setName = (mainComponent.parent && mainComponent.parent.type === 'COMPONENT_SET') ? (mainComponent.parent.name || '') : '';
    const setNameLower = setName.toLowerCase();

    // Heuristic: treat as icon only when the naming clearly indicates it
    const iconNameRegex = /(^|\b|[_\-\s])(ic|icon)([_\-\s]|\b|$)/i;
    const looksLikeIconByName = iconNameRegex.test(compName) || iconNameRegex.test(setName);

    // Heuristic 2: variant properties sometimes include "Icon" keys or values
    let looksLikeIconByVariant = false;
    try {
      const vp = mainComponent.variantProperties;
      if (vp) {
        for (const k in vp) {
          if (/icon/i.test(k) || /icon/i.test(String(vp[k]))) {
            looksLikeIconByVariant = true;
            break;
          }
        }
      }
    } catch (_) {}

    // Optional size hint: many icons are within 12–128 px on at least one edge
    // Do NOT rely only on size to avoid false positives; use as a weak hint.
    const w = Math.round(mainComponent.width || 0);
    const h = Math.round(mainComponent.height || 0);
    const looksIconBySize = (w > 0 && h > 0 && Math.max(w, h) <= 128);

    // Final decision: require explicit icon naming or variant prop; size is only supportive
    if (looksLikeIconByName || looksLikeIconByVariant) {
      return true;
    }

    return false; // default to component unless clearly an icon
  } catch (e) {
    // If unsure, err on the side of component
    return false;
  }
}

// Track processed nodes to avoid duplicates
const processedNodes = new Set();

// Analyze a single node for components, fonts, colors, and styles (optimized)
async function analyzeNode(node, components, icons, fonts, colors, colorStyles, textStyles, effectStyles) {
  try {
    // Validate node exists and is accessible
    if (!node || !node.type || node.removed === true) {
      return;
    }

    // Skip if we've already processed this node (prevent duplicates)
    if (processedNodes.has(node.id)) {
      return;
    }
    processedNodes.add(node.id);

    // Early exit for invisible or very small nodes (performance optimization)
    if (node.visible === false || (node.width < 1 && node.height < 1)) {
      return;
    }

    // Extract components (with defensive programming)
    if (node.type === 'INSTANCE') {
      try {
        // Validate instance node is still accessible
        if (!node.mainComponent) {
          return; // Skip if main component reference is broken
        }

        const mainComponent = await node.getMainComponentAsync();
        if (mainComponent && mainComponent.name && (mainComponent.key || mainComponent.id)) {
          // Get the master component (parent of variants) with validation
          const masterComponent = (mainComponent.parent && mainComponent.parent.type === 'COMPONENT_SET')
            ? mainComponent.parent
            : mainComponent;

          // Validate master component exists and has a name
          if (!masterComponent || !masterComponent.name) {
            return;
          }

          // Create a unique key for this specific variant
          const variantKey = mainComponent.key || mainComponent.id;

          // Determine if this is an icon based on naming patterns and size
          const isIcon = isComponentAnIcon(mainComponent);
          const targetMap = isIcon ? icons : components;

          if (!targetMap.has(variantKey)) {
            // Determine if this is a variant or standalone component
            const isVariant = mainComponent.parent && mainComponent.parent.type === 'COMPONENT_SET';

            targetMap.set(variantKey, {
              masterName: isVariant ? masterComponent.name : mainComponent.name,
              variantName: isVariant ? mainComponent.name : null,
              fullName: mainComponent.name,
              key: mainComponent.key,
              id: mainComponent.id,
              isVariant: isVariant,
              instanceCount: 1,
              isIcon: isIcon
            });
          } else {
            const existing = targetMap.get(variantKey);
            if (existing) {
              existing.instanceCount++;
            }
          }
        }
      } catch (error) {
        // Silently handle inaccessible components to prevent crashes
        console.warn('Component analysis error:', error.message);
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

          // Font detection progress removed for performance

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
          const opacity = fill.opacity !== undefined ? fill.opacity : 1; // Default to 1 if undefined

          // Color detection progress removed for performance

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

          // Create unique key that includes opacity for different opacity values of same color
          const colorKey = opacity < 1 ? `${hex}@${Math.round(opacity * 100)}%` : hex;

          // Store color with its associated style and opacity
          if (!colors.has(colorKey)) {
            colors.set(colorKey, {
              hex: hex,
              opacity: opacity,
              styleName: styleName,
              type: 'fill'
            });
          } else if (styleName && !colors.get(colorKey).styleName) {
            // Update with style name if we didn't have one before
            colors.get(colorKey).styleName = styleName;
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
          const opacity = stroke.opacity !== undefined ? stroke.opacity : 1; // Default to 1 if undefined

          // Stroke color detection progress removed for performance

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

          // Create unique key that includes opacity for different opacity values of same color
          const colorKey = opacity < 1 ? `${hex}@${Math.round(opacity * 100)}%` : hex;

          // Store color with its associated style and opacity
          if (!colors.has(colorKey)) {
            colors.set(colorKey, {
              hex: hex,
              opacity: opacity,
              styleName: styleName,
              type: 'stroke'
            });
          } else if (styleName && !colors.get(colorKey).styleName) {
            // Update with style name if we didn't have one before
            colors.get(colorKey).styleName = styleName;
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

// Get the best available font for analysis output (generic, not project-specific)
async function getBestAvailableFont(preferredStyle = "Regular") {
  const availableFonts = await getAvailableFonts();

  // Look for a font with the preferred style
  const fontWithStyle = availableFonts.find(font =>
    font.style.toLowerCase().includes(preferredStyle.toLowerCase())
  );

  if (fontWithStyle) {
    return fontWithStyle;
  }

  // Fallback to first available font
  return availableFonts[0] || { family: "Arial", style: "Regular" };
}

// Helper functions for common font styles (completely generic)
async function getAnalysisTitleFont() {
  try {
    const availableFonts = await getAvailableFonts();
    // Look for any Bold font in the document
    const boldFont = availableFonts.find(font =>
      font.style.toLowerCase().includes('bold')
    );

    if (boldFont) {
      return await loadFontCached(boldFont);
    }

    // Fallback to first available font
    return await loadFontCached(availableFonts[0]);
  } catch (error) {
    // Ultimate fallback to system fonts
    const systemFonts = [
      { family: "Arial", style: "Regular" },
      { family: "Helvetica", style: "Regular" },
      { family: "Times", style: "Regular" }
    ];

    for (const font of systemFonts) {
      try {
        await figma.loadFontAsync(font);
        return font;
      } catch (e) {
        continue;
      }
    }

    // If everything fails, return Arial
    return { family: "Arial", style: "Regular" };
  }
}

async function getAnalysisBodyFont() {
  try {
    const availableFonts = await getAvailableFonts();
    // Look for any Regular font in the document
    const regularFont = availableFonts.find(font =>
      font.style.toLowerCase().includes('regular') ||
      font.style.toLowerCase().includes('normal') ||
      font.style.toLowerCase() === 'medium'
    );

    if (regularFont) {
      return await loadFontCached(regularFont);
    }

    // Fallback to first available font
    return await loadFontCached(availableFonts[0]);
  } catch (error) {
    // Ultimate fallback to system fonts
    const systemFonts = [
      { family: "Arial", style: "Regular" },
      { family: "Helvetica", style: "Regular" },
      { family: "Times", style: "Regular" }
    ];

    for (const font of systemFonts) {
      try {
        await figma.loadFontAsync(font);
        return font;
      } catch (e) {
        continue;
      }
    }

    // If everything fails, return Arial
    return { family: "Arial", style: "Regular" };
  }
}

// Safe font loading with fallbacks (now uses document fonts, not project-specific)
async function loadFontSafely(requestedFont = null) {
  try {
    // If a specific font is requested, try it first
    if (requestedFont) {
      const font = await loadFontCached(requestedFont);
      if (font) return font;
    }

    // Otherwise, get the best available font from the document
    const preferredStyle = (requestedFont && requestedFont.style) ? requestedFont.style : "Regular";
    const bestFont = await getBestAvailableFont(preferredStyle);
    return await loadFontCached(bestFont);
  } catch (error) {
    console.warn(`Font loading failed, using system fallback`);
    // Final fallback to system fonts
    const systemFallbacks = [
      { family: "Arial", style: "Regular" },
      { family: "Helvetica", style: "Regular" },
      { family: "Times", style: "Regular" }
    ];

    for (const fallback of systemFallbacks) {
      try {
        await figma.loadFontAsync(fallback);
        return fallback;
      } catch (fallbackError) {
        continue;
      }
    }

    // If everything fails, return Arial Regular
    return { family: "Arial", style: "Regular" };
  }
}

// Create the analysis frame with extracted information
async function createAnalysisFrame(originalFrame, analysisData) {
  try {
    // Ensure we have valid analysis data
    if (!analysisData) {
      throw new Error('Analysis data is missing');
    }
    // Check if an analysis frame already exists for this original frame
    const existingAnalysisFrame = findExistingAnalysisFrame(originalFrame);

    let analysisFrame;
    let wasUpdated = false;

    if (existingAnalysisFrame) {
      // Replace existing analysis frame
      analysisFrame = existingAnalysisFrame;
      // Clear existing content
      analysisFrame.children.forEach(child => child.remove());

      // Update the name with new timestamp
      const timestamp = new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      analysisFrame.name = `Analysis: ${analysisData.frameInfo.name} (${timestamp})`;

      wasUpdated = true;

      figma.ui.postMessage({
        type: 'progress',
        message: 'Updating existing analysis...'
      });
    } else {
      // Create new analysis frame with unique name
      analysisFrame = figma.createFrame();
      const timestamp = new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      analysisFrame.name = `Analysis: ${analysisData.frameInfo.name} (${timestamp})`;

      // Get or create the analysis page
      const analysisPage = findOrCreateAnalysisPage();

      // Find the best position for the new analysis frame on the analysis page
      const position = findBestAnalysisPosition(analysisPage);
      analysisFrame.x = position.x;
      analysisFrame.y = position.y;

      figma.ui.postMessage({
        type: 'progress',
        message: 'Creating new analysis...'
      });
    }

    // Configure analysis frame as auto layout with content hugging
    analysisFrame.layoutMode = 'VERTICAL';
    analysisFrame.primaryAxisSizingMode = 'AUTO'; // Hug contents vertically
    analysisFrame.counterAxisSizingMode = 'AUTO'; // Hug contents horizontally
    analysisFrame.paddingTop = 60;
    analysisFrame.paddingBottom = 60;
    analysisFrame.paddingLeft = 60;
    analysisFrame.paddingRight = 60;
    analysisFrame.itemSpacing = 32; // Space between sections

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

  // Auto layout padding is now set on frames; no manual padding var needed
  const sectionSpacing = 32; // This is now handled by itemSpacing

    // Add frame name as the first item (32px Bold #000000)
    const frameName = figma.createText();
    const frameNameFont = await loadFontSafely(await getBestAvailableFont("Bold"));
    frameName.fontName = frameNameFont;
    frameName.fontSize = 32;
    frameName.characters = analysisData.frameInfo.name;
    frameName.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }]; // #000000
    analysisFrame.appendChild(frameName);

    // Add element count subtitle
    const subtitle = figma.createText();
    const subtitleFont = await loadFontSafely(await getBestAvailableFont("Regular"));
    subtitle.fontName = subtitleFont;
    subtitle.fontSize = 14;
    subtitle.characters = `${analysisData.frameInfo.elementCount} elements`;
    subtitle.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    analysisFrame.appendChild(subtitle);

    // Add visual reference of the analyzed frame
    await addFrameReference(analysisFrame, originalFrame);

  // Add components section
  if (analysisData.components.length > 0) {
    figma.ui.postMessage({
      type: 'progress',
      message: 'Building analysis frame...',
      details: `Adding ${analysisData.components.length} components`
    });
    await addComponentSection(analysisFrame, "Components Used", analysisData.components);
  }

  // Add icons section
  if (analysisData.icons && analysisData.icons.length > 0) {
    figma.ui.postMessage({
      type: 'progress',
      message: 'Building analysis frame...',
      details: `Adding ${analysisData.icons.length} icons`
    });
    await addComponentSection(analysisFrame, "Icons Used", analysisData.icons);
  }

  // Add combined fonts and text styles section
  if (analysisData.fonts.length > 0 || analysisData.textStyles.length > 0) {
    await addCombinedFontSection(analysisFrame, "Fonts & Text Styles", analysisData.fonts, analysisData.textStyles);
  }

  // Add combined colors and color styles section
  if (analysisData.colors.length > 0 || analysisData.colorStyles.length > 0) {
    await addCombinedColorSection(analysisFrame, "Colors & Styles", analysisData.colors);
  }

  // Add effect styles section
  if (analysisData.effectStyles.length > 0) {
    await addSection(analysisFrame, "Effect Styles", analysisData.effectStyles);
  }

  // Add summary section
  await addSummarySection(analysisFrame, analysisData);

    // Auto layout will handle sizing automatically based on content and padding

    // Add to analysis page if it's a new frame
    if (!wasUpdated) {
      const analysisPage = findOrCreateAnalysisPage();
      analysisPage.appendChild(analysisFrame);
    }

    // Switch to the analysis page and select the analysis frame
    const analysisPage = findOrCreateAnalysisPage();
    figma.currentPage = analysisPage;
    figma.currentPage.selection = [analysisFrame];
    figma.viewport.scrollAndZoomIntoView([analysisFrame]);

    return analysisFrame; // Return the analysis frame for frame history tracking

  } catch (error) {
    console.error('Error creating analysis frame:', error);
    throw new Error(`Failed to create analysis frame: ${error.message}`);
  }
}

// Find existing analysis frame for the given original frame on the analysis page
function findExistingAnalysisFrame(originalFrame) {
  const expectedAnalysisName = `Analysis: ${originalFrame.name}`;

  // Get or create the analysis page
  const analysisPage = findOrCreateAnalysisPage();

  // Search through all frames on the analysis page
  const allFrames = analysisPage.findAll(node => node.type === 'FRAME');

  for (const frame of allFrames) {
    // Check if frame name starts with the expected analysis name (ignoring timestamp)
    if (frame.name.startsWith(expectedAnalysisName)) {
      // Found a matching analysis frame - return it for replacement
      return frame;
    }
  }

  return null;
}

// Find or create the "Frames Analysed" page
function findOrCreateAnalysisPage() {
  // Look for existing "Frames Analysed" page
  const existingPage = figma.root.children.find(page => page.name === "Frames Analysed");

  if (existingPage) {
    return existingPage;
  }

  // Create new "Frames Analysed" page
  const analysisPage = figma.createPage();
  analysisPage.name = "Frames Analysed";

  // Set a light background color for the analysis page
  analysisPage.backgrounds = [{
    type: 'SOLID',
    color: { r: 0.98, g: 0.98, b: 0.98 },
    visible: true
  }];

  return analysisPage;
}

// Find the best position for a new analysis frame on the analysis page
function findBestAnalysisPosition(analysisPage) {
  // Get all existing analysis frames on the analysis page (excluding summary)
  const analysisFrames = analysisPage.findAll(node =>
    node.type === 'FRAME' &&
    node.name.startsWith('Analysis: ') &&
    node.name !== 'Summary Analysis'
  );

  // Reserve space for summary on the left (400px width + 100px gap)
  const summaryReservedWidth = 500;
  const startX = summaryReservedWidth + 100; // Start analysis frames after summary space
  const startY = 100;

  if (analysisFrames.length === 0) {
    // First analysis frame - position after summary space
    return {
      x: startX,
      y: startY
    };
  }

  // Find the rightmost analysis frame
  let rightmostFrame = analysisFrames[0];
  for (const frame of analysisFrames) {
    if (frame.x + frame.width > rightmostFrame.x + rightmostFrame.width) {
      rightmostFrame = frame;
    }
  }

  // Position to the right of the rightmost frame
  return {
    x: rightmostFrame.x + rightmostFrame.width + 100, // 100px gap between frames
    y: startY // Keep all analysis frames at the same Y level
  };
}

// Add a visual reference of the analyzed frame
async function addFrameReference(analysisFrame, originalFrame) {
  // Create a container frame for the visual reference section
  const referenceContainer = figma.createFrame();
  referenceContainer.name = "Visual Reference";
  referenceContainer.layoutMode = 'VERTICAL';
  referenceContainer.primaryAxisSizingMode = 'AUTO';
  referenceContainer.counterAxisSizingMode = 'AUTO';
  referenceContainer.itemSpacing = 8;
  referenceContainer.fills = []; // Transparent background

  // Create a label for the reference
  const referenceLabel = figma.createText();
  const labelFont = await loadFontSafely(await getBestAvailableFont("Bold"));
  referenceLabel.fontName = labelFont;
  referenceLabel.fontSize = 14;
  referenceLabel.characters = "Visual Reference:";
  referenceLabel.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];
  referenceContainer.appendChild(referenceLabel);

  // Snapshot the original frame to a fixed-size image to preserve exact dimensions
  const targetWidth = Math.round(originalFrame.width);
  const targetHeight = Math.round(originalFrame.height);
  const pngBytes = await originalFrame.exportAsync({ format: 'PNG' });
  const image = figma.createImage(pngBytes);

  // Use a rectangle with the exact original size and place the image as a fill
  const refRect = figma.createRectangle();
  refRect.resize(targetWidth, targetHeight);
  refRect.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FIT' }];

  // Keep the reference from stretching in parent auto layout
  if ('layoutAlign' in refRect) refRect.layoutAlign = 'INHERIT';
  if ('layoutGrow' in refRect) refRect.layoutGrow = 0;
  if ('layoutSizingHorizontal' in refRect) refRect.layoutSizingHorizontal = 'FIXED';
  if ('layoutSizingVertical' in refRect) refRect.layoutSizingVertical = 'FIXED';

  // Add a subtle border around the reference
  refRect.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
  refRect.strokeWeight = 1;
  refRect.cornerRadius = 4;

  // Add to the reference container
  referenceContainer.appendChild(refRect);

  // Add a size indicator
  const sizeLabel = figma.createText();
  const sizeLabelFont = await loadFontSafely(await getBestAvailableFont("Regular"));
  sizeLabel.fontName = sizeLabelFont;
  sizeLabel.fontSize = 10;
  sizeLabel.characters = `Displayed at ${targetWidth} x ${targetHeight}px`;
  sizeLabel.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
  referenceContainer.appendChild(sizeLabel);

  // Add the reference container to the analysis frame
  analysisFrame.appendChild(referenceContainer);
}

// Create or update the summary analysis frame
async function createOrUpdateSummaryAnalysis() {
  // Get or create the analysis page
  const analysisPage = findOrCreateAnalysisPage();

  // Find existing summary frame on the analysis page
  const allFrames = analysisPage.findAll(node => node.type === 'FRAME');
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

    // Position at the top-left of the analysis page
    const position = findSummaryPosition(analysisPage);
    summaryFrame.x = position.x;
    summaryFrame.y = position.y;

    // Add to analysis page
    analysisPage.appendChild(summaryFrame);
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

// Frame history management (document-based storage - works across computers)
async function getAnalyzedFramesList() {
  try {
    // Try to get from document storage first (works across computers)
    const docData = figma.root.getPluginData('analyzedFrames');
    if (docData) {
      return JSON.parse(docData);
    }

    // Fallback to client storage for backward compatibility
    const framesList = await figma.clientStorage.getAsync('analyzedFrames') || {};

    // Migrate to document storage if we have data
    if (Object.keys(framesList).length > 0) {
      figma.root.setPluginData('analyzedFrames', JSON.stringify(framesList));
      console.log('Migrated frame history to document storage');
    }

    return framesList;
  } catch (error) {
    console.warn('Failed to load analyzed frames list:', error);
    return {};
  }
}

async function saveAnalyzedFrame(frameId, frameData) {
  try {
    const framesList = await getAnalyzedFramesList();
    framesList[frameId] = {
      id: frameId,
      name: frameData.name,
      lastAnalyzed: new Date().toISOString(),
      elementCount: frameData.elementCount,
      analysisFrameId: frameData.analysisFrameId,
      exists: true
    };

    // Save to document storage (works across computers)
    figma.root.setPluginData('analyzedFrames', JSON.stringify(framesList));

    // Also save to client storage for backward compatibility
    await figma.clientStorage.setAsync('analyzedFrames', framesList);

    // Send updated, filtered list to UI (only frames with live analysis on Frames Analysed)
    const filtered = await getFilteredAnalyzedFramesList();
    figma.ui.postMessage({
      type: 'framesListUpdated',
      framesList: Object.values(filtered)
    });
  } catch (error) {
    console.warn('Failed to save analyzed frame:', error);
  }
}

async function cleanupAnalyzedFrames() {
  try {
    const framesList = await getAnalyzedFramesList();
    const updatedFramesList = {};
    let hasChanges = false;

    // Check if each frame still exists
    for (const [frameId, frameData] of Object.entries(framesList)) {
      try {
        const frame = figma.getNodeById(frameId);
        if (frame && (frame.type === 'FRAME' || frame.type === 'COMPONENT')) {
          updatedFramesList[frameId] = Object.assign({}, frameData, { exists: true });
        } else {
          hasChanges = true; // Frame no longer exists, remove it
        }
      } catch (error) {
        hasChanges = true; // Frame no longer accessible, remove it
      }
    }

    if (hasChanges) {
      // Save to document storage (works across computers)
      figma.root.setPluginData('analyzedFrames', JSON.stringify(updatedFramesList));

      // Also save to client storage for backward compatibility
      await figma.clientStorage.setAsync('analyzedFrames', updatedFramesList);

      // Send updated, filtered list to UI
      const filtered = await getFilteredAnalyzedFramesList();
      figma.ui.postMessage({
        type: 'framesListUpdated',
        framesList: Object.values(filtered)
      });
    }

    return updatedFramesList;
  } catch (error) {
    console.warn('Failed to cleanup analyzed frames:', error);
    return {};
  }
}


// Determine the page for a given node
function getNodePage(node) {
  let parent = node.parent;
  while (parent && parent.type !== 'PAGE' && parent.type !== 'DOCUMENT') {
    parent = parent.parent;
  }
  return (parent && parent.type === 'PAGE') ? parent : null;
}

// Return only analyzed frames that currently have an analysis frame on the "Frames Analysed" page
async function getFilteredAnalyzedFramesList() {
  const framesList = await getAnalyzedFramesList();
  const filtered = {};
  try {
    for (const [frameId, data] of Object.entries(framesList)) {
      if (!data || !data.analysisFrameId) continue;
      try {
        const analysisNode = figma.getNodeById(data.analysisFrameId);
        if (!analysisNode || analysisNode.type !== 'FRAME') continue;
        if (!analysisNode.name || !analysisNode.name.startsWith('Analysis:')) continue;
        const page = getNodePage(analysisNode);
        if (!page || page.name !== 'Frames Analysed') continue;
        filtered[frameId] = data;
      } catch (_e) {
        // Skip invalid entries
      }
    }
  } catch (_err) {
    // If anything goes wrong, fall back to returning the unfiltered list
    return framesList;
  }
  return filtered;
}

// Font cache to avoid repeated font loading (major performance improvement)
const fontCache = new Map();
let availableFonts = null;
let fontScanPromise = null; // Prevent multiple concurrent scans

// Get available fonts in the document (optimized with caching)
async function getAvailableFonts() {
  if (availableFonts) return availableFonts;

  // Prevent multiple concurrent font scans
  if (fontScanPromise) return fontScanPromise;

  fontScanPromise = (async () => {
    const foundFonts = new Set();

    // Quick scan: Check only text nodes in the current selection area first
    const selection = figma.currentPage.selection;
    if (selection.length > 0) {
      for (const selectedNode of selection) {
        try {
          if (selectedNode && selectedNode.findAll) {
            const textNodes = selectedNode.findAll(node => node && node.type === 'TEXT');
            for (const textNode of textNodes.slice(0, 10)) { // Quick sample
              if (textNode && textNode.fontName && typeof textNode.fontName === 'object' &&
                  textNode.fontName.family && textNode.fontName.style) {
                foundFonts.add(`${textNode.fontName.family}-${textNode.fontName.style}`);
              }
            }
          }
        } catch (error) {
          // Skip problematic nodes
          console.warn('Font scan error:', error.message);
        }
      }
    }

    // If we found fonts in selection, use those. Otherwise, do a broader scan
    if (foundFonts.size === 0) {
      try {
        const allTextNodes = figma.currentPage.findAll(node => node && node.type === 'TEXT');
        for (const textNode of allTextNodes.slice(0, 20)) { // Reduced from 50 to 20
          if (textNode && textNode.fontName && typeof textNode.fontName === 'object' &&
              textNode.fontName.family && textNode.fontName.style) {
            foundFonts.add(`${textNode.fontName.family}-${textNode.fontName.style}`);
          }
        }
      } catch (error) {
        // Skip if page scan fails
        console.warn('Page font scan error:', error.message);
      }
    }

    // Convert to array of font objects
    const fonts = Array.from(foundFonts).map(fontKey => {
      const [family, style] = fontKey.split('-');
      return { family, style };
    });

    // If no fonts found, use universal system fonts (guaranteed to exist)
    availableFonts = fonts.length > 0 ? fonts : [
      { family: "Arial", style: "Regular" },
      { family: "Helvetica", style: "Regular" },
      { family: "Times", style: "Regular" }
    ];

    return availableFonts;
  })();

  return fontScanPromise;
}

async function loadFontCached(fontName) {
  const key = `${fontName.family}-${fontName.style}`;
  if (!fontCache.has(key)) {
    try {
      await figma.loadFontAsync(fontName);
      fontCache.set(key, fontName);
      return fontName;
    } catch (error) {
      // Try fonts available in the document first
      const availableFonts = await getAvailableFonts();

      for (const availableFont of availableFonts) {
        try {
          await figma.loadFontAsync(availableFont);
          fontCache.set(key, availableFont);
          return availableFont;
        } catch (fallbackError) {
          continue;
        }
      }

      // If all available fonts fail, try common system fonts
      const systemFallbacks = [
        { family: "Inter", style: "Regular" },
        { family: "Roboto", style: "Regular" },
        { family: "Arial", style: "Regular" },
        { family: "Helvetica", style: "Regular" }
      ];

      for (const fallback of systemFallbacks) {
        try {
          await figma.loadFontAsync(fallback);
          fontCache.set(key, fallback);
          return fallback;
        } catch (fallbackError) {
          continue;
        }
      }

      // If all fallbacks fail, cache and return the original font
      fontCache.set(key, fontName);
      return fontName;
    }
  }
  return fontCache.get(key);
}

// Store analysis data for summary

// Ensure components/icons arrays reflect icon heuristic consistently
function normalizeComponentIconClassification(analysisData) {
  if (!analysisData) return analysisData;
  const reclassComponents = [];
  const reclassIcons = [];

  const pushComp = (c) => { if (c) { c.isIcon = false; reclassComponents.push(c); } };
  const pushIcon = (c) => { if (c) { c.isIcon = true; reclassIcons.push(c); } };

  if (Array.isArray(analysisData.components)) {
    for (const comp of analysisData.components) {
      try {
        // If any were mislabelled as component but name indicates icon, move to icons
        const name = (comp.masterName || comp.fullName || comp.name || '').toLowerCase();
        const setName = (comp.setName || '').toLowerCase();
        const looksIcon = /(^|\b|[_\-\s])(ic|icon)([_\-\s]|\b|$)/i.test(name) || /icon/i.test(setName) || comp.isIcon === true;
        if (looksIcon) pushIcon(comp); else pushComp(comp);
      } catch (_) { pushComp(comp); }
    }
  }

  if (Array.isArray(analysisData.icons)) {
    for (const icon of analysisData.icons) {
      try {
        // If any were mislabelled as icon but naming doesn't indicate icon, move to components
        const name = (icon.masterName || icon.fullName || icon.name || '').toLowerCase();
        const setName = (icon.setName || '').toLowerCase();
        const looksIcon = /(^|\b|[_\-\s])(ic|icon)([_\-\s]|\b|$)/i.test(name) || /icon/i.test(setName) || icon.isIcon === true;
        if (looksIcon) pushIcon(icon); else pushComp(icon);
      } catch (_) { pushIcon(icon); }
    }
  }

  analysisData.components = reclassComponents;
  analysisData.icons = reclassIcons;
  return analysisData;
}

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
  // Skip cache population - use direct aggregation from analysis frames instead

  // Get analysis frames from the analysis page
  const analysisPage = findOrCreateAnalysisPage();
  const allFrames = analysisPage.findAll(node => node.type === 'FRAME');
  const analysisFrames = allFrames.filter(frame => frame.name.startsWith('Analysis: '));

  const aggregatedComponents = new Map();
  const aggregatedIcons = new Map();
  const aggregatedFonts = new Map();
  const aggregatedColors = new Map();
  const frameCount = analysisFrames.length;

  console.log(`Collecting summary data from ${globalAnalysisData.size} stored analyses`);
  console.log(`Found ${frameCount} analysis frames on analysis page`);
  console.log(`Performance optimization: Using cached data instead of re-analyzing all frames`);

  // Use existing cached data only (no re-analysis or extraction needed!)
  console.log('Using existing cached analysis data for summary generation...');
  console.log(`Available cached data for ${globalAnalysisData.size} frames`);

  // Summary of data usage
  console.log(`Summary generation complete: Using data from ${globalAnalysisData.size} frames`);

  // Aggregate data from stored analysis results
  for (const [frameName, analysisData] of globalAnalysisData.entries()) {
    const normalized = normalizeComponentIconClassification({
      components: analysisData.components || [],
      icons: analysisData.icons || []
    });

    // Aggregate components (unique by master name + variant name)
    if (normalized.components) {
      normalized.components.forEach(comp => {
        const key = comp.isVariant ? `${comp.masterName}:${comp.variantName}` : comp.masterName;
        if (!aggregatedComponents.has(key)) {
          aggregatedComponents.set(key, comp);
        }
      });
    }

    // Aggregate icons (unique by master name + variant name)
    if (normalized.icons) {
      normalized.icons.forEach(icon => {
        const key = icon.isVariant ? `${icon.masterName}:${icon.variantName}` : icon.masterName;
        if (!aggregatedIcons.has(key)) {
          aggregatedIcons.set(key, icon);
        }
      });
    }

    // Fonts
    if (analysisData.fonts) {
      for (const f of analysisData.fonts) {
        const key = f.displayString || f.fontString || `${f.fontFamily} ${f.fontStyle} ${f.fontSize}`;
        if (!aggregatedFonts.has(key)) aggregatedFonts.set(key, f);
      }
    }

    // Colors
    if (analysisData.colors) {
      for (const c of analysisData.colors) {
        const hex = c.hex || c;
        if (!aggregatedColors.has(hex)) aggregatedColors.set(hex, c);
      }
    }
  }

  const result = {
    frameCount: frameCount,
    totalComponents: aggregatedComponents.size,
    totalIcons: aggregatedIcons.size,
    totalFonts: aggregatedFonts.size,
    totalColors: aggregatedColors.size,
    components: Array.from(aggregatedComponents.values()),
    icons: Array.from(aggregatedIcons.values()),
    fonts: Array.from(aggregatedFonts.values()),
    colors: Array.from(aggregatedColors.values())
  };

  console.log(`Summary result: ${result.totalComponents} components, ${result.totalIcons} icons, ${result.totalFonts} fonts, ${result.totalColors} colors`);
  console.log('Summary colors:', result.colors.map(c => c.hex || c).join(', '));

  return result;
}


// Find the best position for the summary frame on the analysis page
function findSummaryPosition(analysisPage) {
  // Position summary on the left side, aligned with analysis frames
  return {
    x: 100, // Left margin
    y: 100  // Same Y position as analysis frames
  };
}

// Populate the summary frame with content using auto layout
async function populateSummaryContent(summaryFrame, summaryData) {
  // Ensure the summary frame uses auto layout and hugs content
  summaryFrame.layoutMode = 'VERTICAL';
  summaryFrame.primaryAxisSizingMode = 'AUTO';
  summaryFrame.counterAxisSizingMode = 'AUTO';
  summaryFrame.itemSpacing = 12;
  summaryFrame.paddingTop = 60;
  summaryFrame.paddingBottom = 60;
  summaryFrame.paddingLeft = 60;
  summaryFrame.paddingRight = 60;

  // Title
  const title = figma.createText();
  const titleFont = await loadFontSafely(await getBestAvailableFont("Bold"));
  title.fontName = titleFont;
  title.fontSize = 32;
  title.characters = 'Summary Analysis';
  title.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
  summaryFrame.appendChild(title);

  // Subtitle
  const subtitle = figma.createText();
  const subtitleFont = await loadFontSafely(await getBestAvailableFont("Regular"));
  subtitle.fontName = subtitleFont;
  subtitle.fontSize = 14;
  subtitle.characters = `${summaryData.frameCount} frames analyzed`;
  subtitle.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
  summaryFrame.appendChild(subtitle);

  // Components
  if (summaryData.totalComponents > 0) {
    await addSummaryComponentsSection(summaryFrame, summaryData.components);
  }

  // Icons
  if (summaryData.totalIcons > 0) {
    await addSummaryIconsSection(summaryFrame, summaryData.icons);
  }

  // Fonts
  if (summaryData.totalFonts > 0) {
    await addSummaryFontsSection(summaryFrame, summaryData.fonts);
  }

  // Colors
  if (summaryData.totalColors > 0) {
    await addSummaryColorsSection(summaryFrame, summaryData.colors);
  }

  // Stats
  const statsText = figma.createText();
  const statsFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  statsText.fontName = statsFont;
  statsText.fontSize = 16;
  statsText.characters = `Total: ${summaryData.totalComponents} Components • ${summaryData.totalFonts} Fonts • ${summaryData.totalColors} Colors`;
  statsText.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  summaryFrame.appendChild(statsText);

  const noteText = figma.createText();
  const noteFont = await loadFontSafely({ family: "Inter", style: "Regular" });
  noteText.fontName = noteFont;
  noteText.fontSize = 12;
  noteText.characters = 'This summary updates automatically when you analyze new frames.\nDetailed breakdowns are available in individual frame analyses.';
  noteText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
  summaryFrame.appendChild(noteText);
}

// Add a summary section with items
async function addSummarySection(frame, title, items) {
  // Create container
  const sectionContainer = figma.createFrame();
  sectionContainer.name = `${title} Section`;
  sectionContainer.layoutMode = 'VERTICAL';
  sectionContainer.primaryAxisSizingMode = 'AUTO';
  sectionContainer.counterAxisSizingMode = 'AUTO';
  sectionContainer.itemSpacing = 6;
  sectionContainer.fills = [];

  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await getAnalysisTitleFont();
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = title;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  sectionContainer.appendChild(sectionTitle);

  // List items (max 10 to keep summary concise)
  const displayItems = items.slice(0, 10);
  for (const item of displayItems) {
    const itemText = figma.createText();
    const itemFont = await getAnalysisBodyFont();
    itemText.fontName = itemFont;
    itemText.fontSize = 12;
    itemText.characters = `• ${item}`;
    itemText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    sectionContainer.appendChild(itemText);
  }

  // Show "and X more" if there are more items
  if (items.length > 10) {
    const moreText = figma.createText();
    const moreFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    moreText.fontName = moreFont;
    moreText.fontSize = 12;
    moreText.characters = `• and ${items.length - 10} more...`;
    moreText.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
    sectionContainer.appendChild(moreText);
  }

  frame.appendChild(sectionContainer);
  return;
}

// Add summary components section
async function addSummaryComponentsSection(frame, components) {
  // Container
  const container = figma.createFrame();
  container.name = `Components Used (${components.length})`;
  container.layoutMode = 'VERTICAL';
  container.primaryAxisSizingMode = 'AUTO';
  container.counterAxisSizingMode = 'AUTO';
  container.itemSpacing = 6;
  container.fills = [];

  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = `Components Used (${components.length})`;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  container.appendChild(sectionTitle);

  // List components
  for (const comp of components) {
    const compText = figma.createText();
    const compFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    compText.fontName = compFont;
    compText.fontSize = 12;
    compText.characters = `• ${comp.masterName}${comp.isVariant ? ` (${comp.variantName})` : ''}`;
    compText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    container.appendChild(compText);
  }

  frame.appendChild(container);
  return;
}

// Add summary icons section
async function addSummaryIconsSection(frame, icons) {
  // Container
  const container = figma.createFrame();
  container.name = `Icons Used (${icons.length})`;
  container.layoutMode = 'VERTICAL';
  container.primaryAxisSizingMode = 'AUTO';
  container.counterAxisSizingMode = 'AUTO';
  container.itemSpacing = 6;
  container.fills = [];

  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = `Icons Used (${icons.length})`;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  container.appendChild(sectionTitle);

  // List icons
  for (const icon of icons) {
    const iconText = figma.createText();
    const iconFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    iconText.fontName = iconFont;
    iconText.fontSize = 12;
    const displayName = icon.isVariant ? `${icon.masterName} (${icon.variantName})` : icon.masterName;
    iconText.characters = `• ${displayName}`;
    iconText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    container.appendChild(iconText);
  }

  frame.appendChild(container);
  return;
}

// Add summary fonts section
async function addSummaryFontsSection(frame, fonts) {
  // Container
  const container = figma.createFrame();
  container.name = `Fonts & Text Styles (${fonts.length})`;
  container.layoutMode = 'VERTICAL';
  container.primaryAxisSizingMode = 'AUTO';
  container.counterAxisSizingMode = 'AUTO';
  container.itemSpacing = 6;
  container.fills = [];

  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = `Fonts & Text Styles (${fonts.length})`;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  container.appendChild(sectionTitle);

  // Separate fonts with styles from fonts without styles
  const fontsWithStyles = [];
  const fontsWithoutStyles = [];

  for (const font of fonts) {
    const hasStyle = font.hasStyle || font.styleName;
    if (hasStyle) {
      fontsWithStyles.push(font);
    } else {
      fontsWithoutStyles.push(font);
    }
  }

  // Display fonts with styles first (black text)
  for (const font of fontsWithStyles) {
    const fontText = figma.createText();
    const fontFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    fontText.fontName = fontFont;
    fontText.fontSize = 12;

    // Clean display format
    let displayString;
    if (font.fontFamily && font.fontStyle && font.fontSize) {
      displayString = `${font.fontFamily} ${font.fontStyle} ${font.fontSize}px (${font.styleName})`;
    } else {
      displayString = (font.displayString || font.fontString || font).replace(/px.*$/, 'px');
    }

    fontText.characters = `• ${displayString}`;
    fontText.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }]; // Black
    container.appendChild(fontText);
  }

  // Display fonts without styles at the end (red text)
  for (const font of fontsWithoutStyles) {
    const fontText = figma.createText();
    const fontFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    fontText.fontName = fontFont;
    fontText.fontSize = 12;

    // Clean display format
    let displayString;
    if (font.fontFamily && font.fontStyle && font.fontSize) {
      displayString = `${font.fontFamily} ${font.fontStyle} ${font.fontSize}px`;
    } else {
      displayString = (font.displayString || font.fontString || font).replace(/px.*$/, 'px');
    }

    fontText.characters = `• ${displayString}`;
    fontText.fills = [{ type: 'SOLID', color: { r: 0.8, g: 0.2, b: 0.2 } }]; // Red
    container.appendChild(fontText);
  }

  frame.appendChild(container);
  return;
}

// Add summary colors section
async function addSummaryColorsSection(frame, colors) {
  // Container
  const container = figma.createFrame();
  container.name = `Colors & Styles (${colors.length})`;
  container.layoutMode = 'VERTICAL';
  container.primaryAxisSizingMode = 'AUTO';
  container.counterAxisSizingMode = 'AUTO';
  container.itemSpacing = 6;
  container.fills = [];

  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = `Colors & Styles (${colors.length})`;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  container.appendChild(sectionTitle);

  // List colors with swatches
  for (const color of colors) {
    const colorHex = color.hex || color;
    const displayText = color.displayHex || colorHex; // Use displayHex if available (includes opacity)
    const rgb = hexToRgb(colorHex);

    // Row
    const row = figma.createFrame();
    row.layoutMode = 'HORIZONTAL';
    row.primaryAxisSizingMode = 'AUTO';
    row.counterAxisSizingMode = 'AUTO';
    row.itemSpacing = 8;
    row.fills = [];

    // Color swatch
    const swatch = figma.createRectangle();
    swatch.resize(16, 16);
    const swatchFill = { type: 'SOLID', color: rgb };
    if (color.opacity !== undefined && color.opacity < 1) {
      swatchFill.opacity = color.opacity;
    }
    swatch.fills = [swatchFill];
    swatch.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
    swatch.strokeWeight = 1;

    // Color text with hex and RGB565
    const colorText = figma.createText();
    const colorFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    colorText.fontName = colorFont;
    colorText.fontSize = 12;
    const styleName = color.styleName ? ` (${color.styleName})` : '';
    const rgb565 = color.rgb565 || hexToRgb565(colorHex);
    colorText.characters = `${displayText} | ${rgb565}${styleName}`;
    colorText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];

    row.appendChild(swatch);
    row.appendChild(colorText);
    container.appendChild(row);
  }

  frame.appendChild(container);
  return;
}

// Add a component section with instance counts
async function addComponentSection(frame, title, components) {
  // Create a container frame for the component section
  const componentContainer = figma.createFrame();
  componentContainer.name = `${title} Section`;
  componentContainer.layoutMode = 'VERTICAL';
  componentContainer.primaryAxisSizingMode = 'AUTO';
  componentContainer.counterAxisSizingMode = 'AUTO';
  componentContainer.itemSpacing = 8;
  componentContainer.fills = []; // Transparent background

  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = title;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  componentContainer.appendChild(sectionTitle);

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
    componentContainer.appendChild(masterText);

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
      componentContainer.appendChild(variantText);
    }

  }

  // Add the component container to the main frame
  frame.appendChild(componentContainer);
}

// Add a text section to the analysis frame
async function addSection(frame, title, items) {
  // Create a container frame for the section
  const sectionContainer = figma.createFrame();
  sectionContainer.name = `${title} Section`;
  sectionContainer.layoutMode = 'VERTICAL';
  sectionContainer.primaryAxisSizingMode = 'AUTO';
  sectionContainer.counterAxisSizingMode = 'AUTO';
  sectionContainer.itemSpacing = 6;
  sectionContainer.fills = []; // Transparent background

  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = title;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  sectionContainer.appendChild(sectionTitle);

  // Section items
  for (const item of items) {
    const itemText = figma.createText();
    const itemFont = await loadFontSafely({ family: "Inter", style: "Regular" });
    itemText.fontName = itemFont;
    itemText.fontSize = 12;
    itemText.characters = `• ${item}`;
    itemText.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];
    sectionContainer.appendChild(itemText);
  }

  // Add the section container to the main frame
  frame.appendChild(sectionContainer);
}

// Add a combined font section with font variations and text styles
async function addCombinedFontSection(frame, title, fonts, textStyles) {
  // Create a container frame for the font section
  const fontContainer = figma.createFrame();
  fontContainer.name = `${title} Section`;
  fontContainer.layoutMode = 'VERTICAL';
  fontContainer.primaryAxisSizingMode = 'AUTO';
  fontContainer.counterAxisSizingMode = 'AUTO';
  fontContainer.itemSpacing = 8;
  fontContainer.fills = []; // Transparent background
  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = title;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  fontContainer.appendChild(sectionTitle);

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

    for (const [, fontInfo] of allFonts) {
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
      fontContainer.appendChild(fontText);
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
      fontContainer.appendChild(fontText);
    }
  }

  // Add the font container to the main frame
  frame.appendChild(fontContainer);
}

// Add a combined color section with color swatches and styles
async function addCombinedColorSection(frame, title, colors) {
  // Create a container frame for the color section
  const colorContainer = figma.createFrame();
  colorContainer.name = `${title} Section`;
  colorContainer.layoutMode = 'VERTICAL';
  colorContainer.primaryAxisSizingMode = 'AUTO';
  colorContainer.counterAxisSizingMode = 'AUTO';
  colorContainer.itemSpacing = 8;
  colorContainer.fills = []; // Transparent background
  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = title;
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  colorContainer.appendChild(sectionTitle);

  // Display colors with swatches, hex values, and style names - colors with styles first, then colors without styles
  if (colors.length > 0) {
    // Separate colors with and without color styles
    const colorsWithStyles = [];
    const colorsWithoutStyles = [];

    for (const colorInfo of colors) {
      const hex = colorInfo.hex || colorInfo; // Handle both old and new format
      const displayHex = colorInfo.displayHex || hex; // Use displayHex if available (includes opacity)
      const rgb565 = colorInfo.rgb565 || hexToRgb565(hex); // Calculate RGB565 if not available
      const styleName = colorInfo.styleName;
      const opacity = colorInfo.opacity;

      if (styleName) {
        colorsWithStyles.push({ hex, displayHex, rgb565, styleName, opacity });
      } else {
        colorsWithoutStyles.push({ hex, displayHex, rgb565, styleName: null, opacity });
      }
    }

    // Sort each group alphabetically by hex value
    colorsWithStyles.sort((a, b) => a.hex.localeCompare(b.hex));
    colorsWithoutStyles.sort((a, b) => a.hex.localeCompare(b.hex));

    // Display colors with color styles first
    for (const colorInfo of colorsWithStyles) {
      const rgb = hexToRgb(colorInfo.hex);

      // Row container for swatch + text
      const row = figma.createFrame();
      row.layoutMode = 'HORIZONTAL';
      row.primaryAxisSizingMode = 'AUTO';
      row.counterAxisSizingMode = 'AUTO';
      row.itemSpacing = 8;
      row.fills = [];

      // Color swatch with border
      const swatch = figma.createRectangle();
      swatch.resize(20, 20);

      // Apply opacity to swatch if available
      const swatchFill = { type: 'SOLID', color: rgb };
      if (colorInfo.opacity !== undefined && colorInfo.opacity < 1) {
        swatchFill.opacity = colorInfo.opacity;
      }
      swatch.fills = [swatchFill];
      swatch.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
      swatch.strokeWeight = 1;
      swatch.cornerRadius = 3;

      // Color text with hex, RGB565, and style name
      const colorText = figma.createText();
      const colorFont = await loadFontSafely({ family: "Inter", style: "Regular" });
      colorText.fontName = colorFont;
      colorText.fontSize = 12;

      const rgb565 = colorInfo.rgb565 || hexToRgb565(colorInfo.hex);
      const displayText = `${colorInfo.displayHex} | ${rgb565} - ${colorInfo.styleName}`;
      colorText.characters = displayText;
      colorText.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];

      row.appendChild(swatch);
      row.appendChild(colorText);
      colorContainer.appendChild(row);
    }

    // Display colors without color styles at the end
    for (const colorInfo of colorsWithoutStyles) {
      const rgb = hexToRgb(colorInfo.hex);

      // Row container for swatch + text
      const row = figma.createFrame();
      row.layoutMode = 'HORIZONTAL';
      row.primaryAxisSizingMode = 'AUTO';
      row.counterAxisSizingMode = 'AUTO';
      row.itemSpacing = 8;
      row.fills = [];

      // Color swatch with border
      const swatch = figma.createRectangle();
      swatch.resize(20, 20);

      // Apply opacity to swatch if available
      const swatchFill = { type: 'SOLID', color: rgb };
      if (colorInfo.opacity !== undefined && colorInfo.opacity < 1) {
        swatchFill.opacity = colorInfo.opacity;
      }
      swatch.fills = [swatchFill];
      swatch.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
      swatch.strokeWeight = 1;
      swatch.cornerRadius = 3;

      // Color text with hex and RGB565 values (including opacity)
      const colorText = figma.createText();
      const colorFont = await loadFontSafely({ family: "Inter", style: "Regular" });
      colorText.fontName = colorFont;
      colorText.fontSize = 12;

      const rgb565 = colorInfo.rgb565 || hexToRgb565(colorInfo.hex);
      colorText.characters = `${colorInfo.displayHex} | ${rgb565}`;
      colorText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }]; // Slightly lighter color

      row.appendChild(swatch);
      row.appendChild(colorText);
      colorContainer.appendChild(row);
    }
  }

  // Add color container to main frame
  frame.appendChild(colorContainer);
  return;
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
async function addSummarySection(frame, analysisData) {
  // Create a container frame for the summary section
  const summaryContainer = figma.createFrame();
  summaryContainer.name = "Summary Section";
  summaryContainer.layoutMode = 'VERTICAL';
  summaryContainer.primaryAxisSizingMode = 'AUTO';
  summaryContainer.counterAxisSizingMode = 'AUTO';
  summaryContainer.itemSpacing = 8;
  summaryContainer.fills = []; // Transparent background

  // Section title
  const sectionTitle = figma.createText();
  const titleFont = await loadFontSafely({ family: "Inter", style: "Bold" });
  sectionTitle.fontName = titleFont;
  sectionTitle.fontSize = 16;
  sectionTitle.characters = "Summary";
  sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  summaryContainer.appendChild(sectionTitle);

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
    summaryContainer.appendChild(itemText);
  }

  // Add the summary container to the main frame
  frame.appendChild(summaryContainer);
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

// Convert hex to RGB565 format (commonly used in embedded displays)
function hexToRgb565(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0x0000';

  // Convert hex to 8-bit RGB values
  const r8 = parseInt(result[1], 16);
  const g8 = parseInt(result[2], 16);
  const b8 = parseInt(result[3], 16);

  // Convert to RGB565 format
  // Red: 5 bits (0-31), Green: 6 bits (0-63), Blue: 5 bits (0-31)
  const r5 = Math.round(r8 * 31 / 255);
  const g6 = Math.round(g8 * 63 / 255);
  const b5 = Math.round(b8 * 31 / 255);

  // Combine into 16-bit value: RRRRRGGGGGBBBBBB
  const rgb565 = (r5 << 11) | (g6 << 5) | b5;

  // Return as hex string (4 digits)
  return '0x' + rgb565.toString(16).toUpperCase().padStart(4, '0');
}

// Generate simplified JSON export for LVGL stylesheet
function generateLVGLJson() {
  const jsonData = {
    colors: {},
    typography: {}
  };

  // Process all cached analysis data
  for (const [, analysisData] of globalAnalysisData.entries()) {
    // Process typography
    if (analysisData.fonts) {
      analysisData.fonts.forEach(font => {
        const fontFamily = font.fontFamily || 'unknown';
        const fontStyle = font.fontStyle || 'regular';
        const fontSize = font.fontSize || 12;

        // Prioritize Figma style name, fallback to constructed name
        let styleKey;
        if (font.styleName) {
          // Use the actual Figma style name
          styleKey = font.styleName;
        } else {
          // Fallback to constructed name
          styleKey = `${fontFamily}_${fontStyle}_${fontSize}`;
        }

        // Convert to valid LVGL identifier while preserving readability
        const lvglName = styleKey
          .replace(/[^a-zA-Z0-9_\s-]/g, '') // Remove special chars except spaces and hyphens
          .replace(/[\s-]+/g, '_')          // Replace spaces and hyphens with underscores
          .toLowerCase();

        if (!jsonData.typography[lvglName]) {
          jsonData.typography[lvglName] = {
            figma_style_name: font.styleName || null,
            font_family: fontFamily,
            font_size: fontSize,
            font_weight: fontStyle,
            lvgl_font: `&${lvglName}`,
            lvgl_declaration: `LV_FONT_DECLARE(${lvglName});`
          };
        }
      });
    }

    // Process colors
    if (analysisData.colors) {
      analysisData.colors.forEach(color => {
        const hex = color.hex || '#000000';
        const rgb565 = color.rgb565 || hexToRgb565(hex);

        // Prioritize Figma style name, fallback to hex-based name
        let colorKey;
        if (color.styleName) {
          // Use the actual Figma style name
          colorKey = color.styleName;
        } else {
          // Fallback to hex-based name
          colorKey = hex.replace('#', 'color_');
        }

        // Convert to valid LVGL identifier while preserving readability
        const lvglName = colorKey
          .replace(/[^a-zA-Z0-9_\s-]/g, '') // Remove special chars except spaces and hyphens
          .replace(/[\s-]+/g, '_')          // Replace spaces and hyphens with underscores
          .toLowerCase();

        if (!jsonData.colors[lvglName]) {
          jsonData.colors[lvglName] = {
            figma_style_name: color.styleName || null,
            hex: hex,
            rgb565: rgb565,
            lvgl_color: `lv_color_hex(${hex.replace('#', '0x')})`,
            lvgl_macro: `#define ${lvglName.toUpperCase()} ${rgb565}`
          };
        }
      });
    }

  }

  return jsonData;
}

// Plugin is ready - waiting for user interaction
