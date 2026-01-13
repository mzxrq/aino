#!/usr/bin/env node
/**
 * Post-process Lingui compiled messages to convert from CommonJS to ES modules
 * Run after `npm run compile`
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Go up one level from scripts/ to project root
const localesDir = path.join(__dirname, '..', 'src', 'locales');

// Process each locale directory
const locales = fs.readdirSync(localesDir);

locales.forEach(locale => {
  const messagesPath = path.join(localesDir, locale, 'messages.js');
  
  if (fs.existsSync(messagesPath)) {
    let content = fs.readFileSync(messagesPath, 'utf-8');
    
    // Convert CommonJS to ES module
    // Replace: /*eslint-disable*/module.exports={messages:...};
    // With: export const messages = ...;
    
    const match = content.match(/\/\*eslint-disable\*\/module\.exports=\{messages:(.*)\};/);
    if (match) {
      const messagesData = match[1];
      const esContent = `/*eslint-disable*/\nexport const messages = ${messagesData};\n`;
      fs.writeFileSync(messagesPath, esContent, 'utf-8');
      console.log(`✓ Converted ${locale}/messages.js to ES module`);
    }
  }
});

console.log('✓ All message files converted to ES modules');
