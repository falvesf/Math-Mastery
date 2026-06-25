const xlsx = require('xlsx');

try {
  console.log('Lendo o arquivo...');
  const workbook = xlsx.readFile('Math Mastery.xlsx', { sheetRows: 50 }); // limit rows to save memory
  
  console.log('Planilhas encontradas:');
  console.log(workbook.SheetNames);
  
  // Vamos ler a primeira planilha ou a que se chama "Patentes" se existir
  workbook.SheetNames.forEach(sheetName => {
      console.log(`\n--- Dados da Planilha: ${sheetName} ---`);
      const sheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      
      // Mostrar apenas as primeiras 5 linhas para não poluir
      data.slice(0, 5).forEach((row, i) => {
          console.log(`Linha ${i+1}:`, row.filter(cell => cell !== undefined && cell !== null && cell !== ''));
      });
  });
} catch (e) {
  console.error("Erro ao ler:", e);
}
