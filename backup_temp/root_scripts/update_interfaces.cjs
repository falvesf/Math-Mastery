const fs = require('fs');
const glob = require('glob');
const files = glob.sync('src/**/*.{ts,tsx}');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('interface UserItem {') && !content.includes('forgeLevel?: number;')) {
    content = content.replace(/interface UserItem \{([\s\S]*?)\n\}/g, (match, p1) => {
      return `interface UserItem {${p1}\n  forgeLevel?: number;\n}`;
    });
    fs.writeFileSync(file, content);
    console.log('Updated UserItem in', file);
  }
  
  if (content.includes('interface StoreItem {') && !content.includes('isForgeable?: boolean;')) {
    content = content.replace(/interface StoreItem \{([\s\S]*?)\n\}/g, (match, p1) => {
      return `interface StoreItem {${p1}\n  isForgeable?: boolean;\n  forgeConfig?: any;\n  isTransmutable?: boolean;\n  transmuteConfig?: any;\n}`;
    });
    fs.writeFileSync(file, content);
    console.log('Updated StoreItem in', file);
  }
  
  if (content.includes('interface StoreItemData {') && !content.includes('isForgeable?: boolean;')) {
    content = content.replace(/interface StoreItemData \{([\s\S]*?)\n\}/g, (match, p1) => {
      return `interface StoreItemData {${p1}\n  isForgeable?: boolean;\n  forgeConfig?: any;\n  isTransmutable?: boolean;\n  transmuteConfig?: any;\n}`;
    });
    fs.writeFileSync(file, content);
    console.log('Updated StoreItemData in', file);
  }
});
