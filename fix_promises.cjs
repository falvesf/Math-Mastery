const fs = require('fs');

// LiveQuestAdmin.tsx
let admin = fs.readFileSync('src/pages/LiveQuestAdmin.tsx', 'utf-8');
// To fix the promises array typing we can just change the type of promises from Promise<any>[] to any[]
admin = admin.replace(/const promises: Promise<any>\[\] = \[\];/g, "const promises: any[] = [];");
fs.writeFileSync('src/pages/LiveQuestAdmin.tsx', admin, 'utf-8');

// LiveQuestStudent.tsx
let student = fs.readFileSync('src/pages/LiveQuestStudent.tsx', 'utf-8');
// Just remove the unused variable warning
student = student.replace(/const totalDefense = totalEquippedStats\.defense;\n/g, "");
fs.writeFileSync('src/pages/LiveQuestStudent.tsx', student, 'utf-8');

console.log('done');
